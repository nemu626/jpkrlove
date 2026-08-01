begin;

alter table app.profile_media
drop constraint profile_media_user_id_position_key;

alter table app.profile_media
add constraint profile_media_user_id_position_key
unique (user_id, position)
deferrable initially deferred;

create or replace function app.save_profile_draft(
  profile_locale text,
  self_identified_gender text,
  display_name text,
  nationality text,
  region_code text,
  introduction text,
  marriage_timing text,
  residence_country text,
  willing_to_relocate boolean,
  children_preference text,
  smoking_status text,
  ja_level text,
  ko_level text,
  willing_to_learn_partner_language boolean,
  media_paths text[]
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app, storage
as $$
declare
  caller_user_id uuid := auth.uid();
  current_member_state app.member_state;
begin
  if caller_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  select member_state
  into current_member_state
  from app.members
  where user_id = caller_user_id
  for update;

  if not found or current_member_state not in (
    'profile_draft',
    'changes_requested'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile is not editable';
  end if;

  if media_paths is null
    or cardinality(media_paths) not between 2 and 6
    or cardinality(media_paths) <> (
      select count(distinct path)
      from unnest(media_paths) as path
    )
    or exists (
      select 1
      from unnest(media_paths) as path
      where path !~ (
        '^'
        || caller_user_id::text
        || '/[^/]+$'
      )
    )
    or exists (
      select 1
      from unnest(media_paths) as path
      where not exists (
        select 1
        from storage.objects
        where bucket_id = 'profile-media'
          and name = path
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'profile media is invalid';
  end if;

  update app.members
  set locale = profile_locale,
      self_identified_gender = save_profile_draft.self_identified_gender,
      updated_at = now()
  where user_id = caller_user_id;

  insert into app.profiles (
    user_id,
    display_name,
    nationality,
    region_code,
    introduction,
    marriage_timing,
    residence_country,
    willing_to_relocate,
    children_preference,
    smoking_status,
    ja_level,
    ko_level,
    willing_to_learn_partner_language
  )
  values (
    caller_user_id,
    btrim(display_name),
    nationality,
    btrim(region_code),
    btrim(introduction),
    marriage_timing,
    residence_country,
    willing_to_relocate,
    children_preference,
    smoking_status,
    ja_level,
    ko_level,
    willing_to_learn_partner_language
  )
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      nationality = excluded.nationality,
      region_code = excluded.region_code,
      introduction = excluded.introduction,
      marriage_timing = excluded.marriage_timing,
      residence_country = excluded.residence_country,
      willing_to_relocate = excluded.willing_to_relocate,
      children_preference = excluded.children_preference,
      smoking_status = excluded.smoking_status,
      ja_level = excluded.ja_level,
      ko_level = excluded.ko_level,
      willing_to_learn_partner_language =
        excluded.willing_to_learn_partner_language,
      updated_at = now();

  set constraints profile_media_user_id_position_key deferred;

  delete from app.profile_media
  where user_id = caller_user_id
    and object_path <> all (media_paths);

  insert into app.profile_media (
    user_id,
    object_path,
    position
  )
  select caller_user_id, ordered.path, ordered.position
  from unnest(media_paths) with ordinality as ordered(path, position)
  on conflict (object_path) do update
  set position = excluded.position
  where profile_media.user_id = caller_user_id;

  return true;
end
$$;

create or replace function app.reorder_profile_media(
  ordered_media_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  caller_user_id uuid := auth.uid();
begin
  if caller_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  perform 1
  from app.profiles
  where user_id = caller_user_id
    and review_status in ('draft', 'changes_requested')
  for update;

  if not found
    or ordered_media_ids is null
    or cardinality(ordered_media_ids) not between 2 and 6
    or cardinality(ordered_media_ids) <> (
      select count(distinct media_id)
      from unnest(ordered_media_ids) as media_id
    )
    or (
      select count(*)
      from app.profile_media
      where user_id = caller_user_id
        and id = any (ordered_media_ids)
    ) <> cardinality(ordered_media_ids)
    or (
      select count(*)
      from app.profile_media
      where user_id = caller_user_id
    ) <> cardinality(ordered_media_ids)
  then
    raise exception using
      errcode = '22023',
      message = 'profile media order is invalid';
  end if;

  set constraints profile_media_user_id_position_key deferred;

  update app.profile_media as media
  set position = ordered.position
  from unnest(ordered_media_ids) with ordinality
    as ordered(media_id, position)
  where media.id = ordered.media_id
    and media.user_id = caller_user_id;

  return true;
end
$$;

create or replace function app.delete_profile_media(
  target_media_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  caller_user_id uuid := auth.uid();
  deleted_object_path text;
begin
  if caller_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  perform 1
  from app.profiles
  where user_id = caller_user_id
    and review_status in ('draft', 'changes_requested')
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'profile is not editable';
  end if;

  select object_path
  into deleted_object_path
  from app.profile_media
  where id = target_media_id
    and user_id = caller_user_id
  for update;

  if not found then
    return null;
  end if;

  perform 1
  from app.profile_media
  where user_id = caller_user_id
  for update;

  if (
    select count(*)
    from app.profile_media
    where user_id = caller_user_id
  ) <= 2 then
    raise exception using
      errcode = 'P0001',
      message = 'at least two profile media items are required';
  end if;

  delete from app.profile_media
  where id = target_media_id
    and user_id = caller_user_id;

  set constraints profile_media_user_id_position_key deferred;

  with positions as (
    select
      id,
      row_number() over (order by position, created_at, id)::smallint
        as new_position
    from app.profile_media
    where user_id = caller_user_id
  )
  update app.profile_media as media
  set position = positions.new_position
  from positions
  where media.id = positions.id;

  return deleted_object_path;
end
$$;

create or replace function app.submit_profile(
  profile_locale text,
  self_identified_gender text,
  display_name text,
  nationality text,
  region_code text,
  introduction text,
  marriage_timing text,
  residence_country text,
  willing_to_relocate boolean,
  children_preference text,
  smoking_status text,
  ja_level text,
  ko_level text,
  willing_to_learn_partner_language boolean,
  media_paths text[]
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app, private
as $$
declare
  caller_user_id uuid := auth.uid();
begin
  if media_paths is null
    or cardinality(media_paths) not between 2 and 6
  then
    raise exception using
      errcode = '22023',
      message = 'profile media is invalid';
  end if;

  perform app.save_profile_draft(
    profile_locale,
    self_identified_gender,
    display_name,
    nationality,
    region_code,
    introduction,
    marriage_timing,
    residence_country,
    willing_to_relocate,
    children_preference,
    smoking_status,
    ja_level,
    ko_level,
    willing_to_learn_partner_language,
    media_paths
  );

  update app.profiles
  set review_status = 'submitted',
      updated_at = now()
  where user_id = caller_user_id;

  update app.members
  set member_state = 'profile_in_review',
      updated_at = now()
  where user_id = caller_user_id
    and member_state in ('profile_draft', 'changes_requested');

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'profile is not submittable';
  end if;

  insert into private.profile_reviews (
    user_id,
    status
  )
  values (
    caller_user_id,
    'submitted'
  );

  return true;
end
$$;

revoke all on function app.save_profile_draft(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  boolean,
  text[]
) from public, anon;
revoke all on function app.reorder_profile_media(uuid[]) from public, anon;
revoke all on function app.delete_profile_media(uuid) from public, anon;
revoke all on function app.submit_profile(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  boolean,
  text[]
) from public, anon;

grant execute on function app.save_profile_draft(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  boolean,
  text[]
) to authenticated, service_role;
grant execute on function app.reorder_profile_media(uuid[])
to authenticated, service_role;
grant execute on function app.delete_profile_media(uuid)
to authenticated, service_role;
grant execute on function app.submit_profile(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  boolean,
  text[]
) to authenticated, service_role;

commit;
