alter table private.identity_cases
add column failure_reason text,
add column result_observed_at timestamptz,
add constraint identity_cases_provider_case_id_check check (
  provider_case_id = btrim(provider_case_id)
  and char_length(provider_case_id) between 1 and 255
),
add constraint identity_cases_status_check check (
  status in ('pending', 'verified', 'failed', 'expired')
),
add constraint identity_cases_document_status_check check (
  document_status in ('pending', 'verified', 'failed', 'expired')
),
add constraint identity_cases_face_match_status_check check (
  face_match_status in ('pending', 'verified', 'failed', 'expired')
),
add constraint identity_cases_liveness_status_check check (
  liveness_status in ('pending', 'verified', 'failed', 'expired')
),
add constraint identity_cases_failure_reason_check check (
  failure_reason is null
  or failure_reason in (
    'PROVIDER_FAILED',
    'UNDERAGE',
    'NATIONALITY_MISMATCH'
  )
),
add constraint identity_cases_result_shape_check check (
  (
    status = 'pending'
    and failure_reason is null
    and result_observed_at is null
    and verified_at is null
  )
  or (
    status = 'verified'
    and failure_reason is null
    and result_observed_at is not null
    and verified_at is not null
    and verified_birth_date is not null
    and verified_nationality is not null
  )
  or (
    status = 'failed'
    and failure_reason is not null
    and result_observed_at is not null
    and verified_at is null
  )
  or status = 'expired'
);

comment on column private.identity_cases.verified_birth_date is
  'Private derived identity attribute; never expose through the Data API.';
comment on column private.identity_cases.verified_nationality is
  'Private derived identity attribute; never expose through the Data API.';
comment on column private.identity_cases.provider_case_id is
  'Opaque provider reference only; legal names and identity documents are not stored.';

create or replace function app.internal_create_identity_case(
  target_user_id uuid,
  new_provider_case_id text
)
returns table (
  provider_case_id text,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, app, private, audit
as $$
declare
  existing_case private.identity_cases%rowtype;
begin
  if target_user_id is null
    or new_provider_case_id is null
    or new_provider_case_id <> btrim(new_provider_case_id)
    or char_length(new_provider_case_id) not between 1 and 255
  then
    raise exception using
      errcode = '22023',
      message = 'invalid identity case';
  end if;

  perform 1
  from auth.users
  where id = target_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'identity user not found';
  end if;

  if not exists (
    select 1
    from private.invitation_redemptions
    where user_id = target_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'accepted invitation required';
  end if;

  select identity_case.*
  into existing_case
  from private.identity_cases as identity_case
  where identity_case.user_id = target_user_id
  for update;

  if found then
    return query
    select existing_case.provider_case_id, existing_case.status;
    return;
  end if;

  insert into private.identity_cases (
    user_id,
    provider_case_id,
    document_status,
    face_match_status,
    liveness_status,
    status
  )
  values (
    target_user_id,
    new_provider_case_id,
    'pending',
    'pending',
    'pending',
    'pending'
  )
  returning
    identity_cases.provider_case_id,
    identity_cases.status
  into provider_case_id, status;

  update app.members
  set member_state = 'identity_pending',
      updated_at = now()
  where user_id = target_user_id
    and member_state = 'waiting';

  return next;
end
$$;

create or replace function app.internal_apply_identity_result(
  target_provider_case_id text,
  provider_status text,
  provider_birth_date date,
  provider_nationality text,
  observed_at timestamptz
)
returns table (
  applied boolean,
  status text,
  failure_reason text
)
language plpgsql
security definer
set search_path = pg_catalog, app, private, audit
as $$
declare
  identity_case private.identity_cases%rowtype;
  invitation_cohort text;
  final_status text;
  final_failure_reason text;
  observation_date date;
begin
  if target_provider_case_id is null
    or target_provider_case_id <> btrim(target_provider_case_id)
    or char_length(target_provider_case_id) not between 1 and 255
    or provider_status not in ('verified', 'failed')
    or observed_at is null
    or (
      provider_status = 'verified'
      and (
        provider_birth_date is null
        or provider_nationality not in ('JP', 'KR')
      )
    )
    or (
      provider_status = 'failed'
      and (
        provider_birth_date is not null
        or provider_nationality is not null
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'invalid provider identity result';
  end if;

  select identity_cases.*
  into identity_case
  from private.identity_cases as identity_cases
  where identity_cases.provider_case_id = target_provider_case_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'identity case not found';
  end if;

  select invitation_codes.cohort
  into invitation_cohort
  from private.invitation_redemptions as redemptions
  join private.invitation_codes as invitation_codes
    on invitation_codes.id = redemptions.invitation_code_id
  where redemptions.user_id = identity_case.user_id;

  if identity_case.status <> 'pending' then
    return query
    select
      false,
      identity_case.status,
      identity_case.failure_reason;
    return;
  end if;

  observation_date := (observed_at at time zone 'UTC')::date;

  if provider_status = 'failed' then
    final_status := 'failed';
    final_failure_reason := 'PROVIDER_FAILED';
  elsif provider_birth_date > (observation_date - interval '18 years')::date then
    final_status := 'failed';
    final_failure_reason := 'UNDERAGE';
  elsif (
    invitation_cohort = 'jp_women'
    and provider_nationality <> 'JP'
  ) or (
    invitation_cohort = 'kr_men'
    and provider_nationality <> 'KR'
  ) then
    final_status := 'failed';
    final_failure_reason := 'NATIONALITY_MISMATCH';
  else
    final_status := 'verified';
    final_failure_reason := null;
  end if;

  update private.identity_cases
  set verified_birth_date = case
        when provider_status = 'verified' then provider_birth_date
        else null
      end,
      verified_nationality = case
        when provider_status = 'verified' then provider_nationality
        else null
      end,
      document_status = final_status,
      face_match_status = final_status,
      liveness_status = final_status,
      status = final_status,
      failure_reason = final_failure_reason,
      verified_at = case
        when final_status = 'verified' then observed_at
        else null
      end,
      result_observed_at = observed_at,
      retention_until = case
        when final_status = 'verified' then observed_at + interval '1 year'
        else observed_at + interval '30 days'
      end,
      updated_at = now()
  where id = identity_case.id;

  update app.members
  set member_state = case final_status
        when 'verified' then 'profile_draft'::app.member_state
        else 'identity_failed'::app.member_state
      end,
      updated_at = now()
  where user_id = identity_case.user_id
    and member_state = 'identity_pending';

  insert into audit.events (
    event_type,
    subject_type,
    subject_id,
    payload
  )
  values (
    case final_status
      when 'verified' then 'identity.verified'
      else 'identity.failed'
    end,
    'identity_case',
    identity_case.id::text,
    jsonb_build_object('failureReason', final_failure_reason)
  );

  return query
  select true, final_status, final_failure_reason;
end
$$;

revoke all on function app.internal_create_identity_case(uuid, text)
from public, anon, authenticated;
revoke all on function app.internal_apply_identity_result(
  text,
  text,
  date,
  text,
  timestamptz
)
from public, anon, authenticated;

grant execute on function app.internal_create_identity_case(uuid, text)
to service_role;
grant execute on function app.internal_apply_identity_result(
  text,
  text,
  date,
  text,
  timestamptz
)
to service_role;
