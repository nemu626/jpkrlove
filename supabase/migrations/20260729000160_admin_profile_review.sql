create or replace function private.current_auth_aal()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    'aal1'
  )
$$;

create or replace function private.require_profile_reviewer()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if private.current_auth_aal() <> 'aal2' then
    raise exception using errcode = '42501', message = 'aal2 required';
  end if;

  if not exists (
    select 1
    from private.operator_roles
    where user_id = auth.uid()
      and role = 'profile_reviewer'::private.operator_role
  ) then
    raise exception using errcode = '42501', message = 'profile reviewer role required';
  end if;
end
$$;

create or replace function app.admin_current_operator()
returns table (
  user_id uuid,
  aal text,
  roles private.operator_role[]
)
language sql
stable
security definer
set search_path = pg_catalog, app, private
as $$
  select
    auth.uid(),
    private.current_auth_aal(),
    coalesce(
      array_agg(operator_roles.role order by operator_roles.role)
        filter (where operator_roles.role is not null),
      '{}'::private.operator_role[]
    )
  from private.operator_roles
  where operator_roles.user_id = auth.uid()
$$;

create or replace function app.admin_profile_review_cases()
returns table (
  case_id uuid,
  display_name text,
  nationality text,
  region_code text,
  introduction text,
  photo_count bigint,
  identity_status text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, app, private
as $$
begin
  perform private.require_profile_reviewer();

  return query
  select
    reviews.id,
    profiles.display_name,
    profiles.nationality,
    profiles.region_code,
    profiles.introduction,
    count(profile_media.id),
    identity_cases.status,
    reviews.created_at
  from private.profile_reviews as reviews
  join app.profiles as profiles on profiles.user_id = reviews.user_id
  join app.members as members on members.user_id = reviews.user_id
  join private.identity_cases as identity_cases
    on identity_cases.user_id = reviews.user_id
  left join app.profile_media as profile_media
    on profile_media.user_id = reviews.user_id
  where reviews.status = 'submitted'
    and profiles.review_status = 'submitted'
    and members.member_state = 'profile_in_review'
    and identity_cases.status = 'verified'
    and reviews.created_at = (
      select max(latest.created_at)
      from private.profile_reviews as latest
      where latest.user_id = reviews.user_id
        and latest.status = 'submitted'
    )
  group by
    reviews.id,
    profiles.display_name,
    profiles.nationality,
    profiles.region_code,
    profiles.introduction,
    identity_cases.status,
    reviews.created_at
  order by reviews.created_at asc;
end
$$;

create or replace function app.admin_profile_review_case(p_case_id uuid)
returns table (
  case_id uuid,
  display_name text,
  nationality text,
  region_code text,
  introduction text,
  photo_count bigint,
  identity_status text,
  submitted_at timestamptz,
  photos jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, app, private
as $$
begin
  perform private.require_profile_reviewer();

  return query
  select
    cases.case_id,
    cases.display_name,
    cases.nationality,
    cases.region_code,
    cases.introduction,
    cases.photo_count,
    cases.identity_status,
    cases.submitted_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', media.id,
            'position', media.position,
            'object_path', media.object_path
          ) order by media.position
        )
        from app.profile_media as media
        join private.profile_reviews as review_media
          on review_media.user_id = media.user_id
        where review_media.id = cases.case_id
      ),
      '[]'::jsonb
    )
  from app.admin_profile_review_cases() as cases
  where cases.case_id = p_case_id;
end
$$;

create or replace function app.admin_review_profile(
  p_case_id uuid,
  p_decision text,
  p_reason text default null
)
returns table (status text)
language plpgsql
security definer
set search_path = pg_catalog, app, private, audit
as $$
declare
  target_user_id uuid;
  current_review_status text;
  current_member_state app.member_state;
  identity_status text;
  normalized_reason text := nullif(btrim(p_reason), '');
begin
  perform private.require_profile_reviewer();

  if p_decision not in ('approved', 'changes_requested', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid review decision';
  end if;

  if p_decision in ('changes_requested', 'rejected') and normalized_reason is null then
    raise exception using errcode = '22023', message = 'review reason required';
  end if;

  select reviews.user_id
  into target_user_id
  from private.profile_reviews as reviews
  where reviews.id = p_case_id
    and reviews.status = 'submitted'
  for update;

  if target_user_id is null then
    raise exception using errcode = 'P0001', message = 'review case is not pending';
  end if;

  if target_user_id = auth.uid() then
    raise exception using errcode = '42501', message = 'self review is not allowed';
  end if;

  select profiles.review_status
  into current_review_status
  from app.profiles as profiles
  where profiles.user_id = target_user_id
  for update;

  select members.member_state
  into current_member_state
  from app.members as members
  where members.user_id = target_user_id
  for update;

  select identity_cases.status
  into identity_status
  from private.identity_cases as identity_cases
  where identity_cases.user_id = target_user_id
  for share;

  if current_review_status <> 'submitted'
    or current_member_state <> 'profile_in_review'
    or identity_status <> 'verified'
  then
    raise exception using
      errcode = 'P0001',
      message = 'identity or profile state is not reviewable';
  end if;

  if p_decision = 'approved' then
    update app.profiles
    set review_status = 'approved',
        published_at = now(),
        updated_at = now()
    where user_id = target_user_id;

    update app.members
    set member_state = 'active',
        updated_at = now()
    where user_id = target_user_id;
  elsif p_decision = 'changes_requested' then
    update app.profiles
    set review_status = 'changes_requested',
        published_at = null,
        updated_at = now()
    where user_id = target_user_id;

    update app.members
    set member_state = 'changes_requested',
        updated_at = now()
    where user_id = target_user_id;
  else
    update app.profiles
    set review_status = 'rejected',
        published_at = null,
        updated_at = now()
    where user_id = target_user_id;

    update app.members
    set member_state = 'restricted',
        updated_at = now()
    where user_id = target_user_id;
  end if;

  insert into private.profile_reviews (
    user_id,
    reviewer_user_id,
    status,
    notes
  )
  values (
    target_user_id,
    auth.uid(),
    p_decision,
    normalized_reason
  );

  insert into audit.events (
    actor_user_id,
    event_type,
    subject_type,
    subject_id,
    payload
  )
  values (
    auth.uid(),
    'profile.reviewed',
    'profile_review',
    p_case_id::text,
    jsonb_build_object('decision', p_decision, 'reason', normalized_reason)
  );

  return query select p_decision;
end
$$;

revoke all on function private.current_auth_aal() from public;
revoke all on function private.require_profile_reviewer() from public;
revoke all on function app.admin_current_operator() from public;
revoke all on function app.admin_profile_review_cases() from public;
revoke all on function app.admin_profile_review_case(uuid) from public;
revoke all on function app.admin_review_profile(uuid, text, text) from public;

grant execute on function app.admin_current_operator() to authenticated;
grant execute on function app.admin_profile_review_cases() to authenticated;
grant execute on function app.admin_profile_review_case(uuid) to authenticated;
grant execute on function app.admin_review_profile(uuid, text, text) to authenticated;
