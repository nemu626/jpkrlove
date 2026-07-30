create schema if not exists app;
create schema if not exists private;
create schema if not exists audit;

create type app.member_state as enum (
  'waiting',
  'identity_pending',
  'identity_failed',
  'identity_expired',
  'profile_draft',
  'profile_in_review',
  'changes_requested',
  'active',
  'paused',
  'restricted'
);

create type private.operator_role as enum (
  'support',
  'profile_reviewer',
  'identity_reviewer',
  'recommender',
  'moderator',
  'admin'
);

create table app.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text not null check (locale in ('ja', 'ko')),
  self_identified_gender text not null check (
    self_identified_gender in ('woman', 'man')
  ),
  member_state app.member_state not null default 'waiting',
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.profiles (
  user_id uuid primary key references app.members (user_id) on delete cascade,
  display_name text not null check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 100
  ),
  nationality text not null check (nationality in ('JP', 'KR')),
  region_code text not null check (
    region_code = btrim(region_code)
    and char_length(region_code) between 1 and 32
  ),
  introduction text not null check (
    introduction = btrim(introduction)
    and char_length(introduction) between 40 and 1000
  ),
  marriage_timing text not null check (
    marriage_timing in (
      'within_1_year',
      'within_2_years',
      'within_3_years',
      'not_sure'
    )
  ),
  residence_country text not null check (residence_country in ('JP', 'KR')),
  willing_to_relocate boolean not null,
  children_preference text not null check (
    children_preference in (
      'want_children',
      'do_not_want_children',
      'open_to_discuss'
    )
  ),
  smoking_status text not null check (
    smoking_status in ('non_smoker', 'smoker', 'trying_to_quit')
  ),
  ja_level text not null check (
    ja_level in ('basic', 'intermediate', 'advanced', 'native')
  ),
  ko_level text not null check (
    ko_level in ('basic', 'intermediate', 'advanced', 'native')
  ),
  willing_to_learn_partner_language boolean not null,
  occupation_category text,
  review_status text not null default 'draft' check (
    review_status in (
      'draft',
      'submitted',
      'changes_requested',
      'approved',
      'rejected'
    )
  ),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table app.profile_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles (user_id) on delete cascade,
  object_path text not null unique,
  position smallint not null check (position between 1 and 6),
  moderation_status text not null default 'pending' check (
    moderation_status in ('pending', 'approved', 'rejected')
  ),
  created_at timestamptz not null default now(),
  unique (user_id, position)
);

create table app.profile_preferences (
  user_id uuid primary key references app.profiles (user_id) on delete cascade,
  min_age smallint not null check (min_age between 18 and 100),
  max_age smallint not null check (max_age between 18 and 100),
  allowed_residence_countries text[] not null check (
    cardinality(allowed_residence_countries) > 0
    and allowed_residence_countries <@ array['JP', 'KR']::text[]
  ),
  marriage_timing_is_required boolean not null default false,
  children_preference_is_required boolean not null default false,
  smoking_status_is_required boolean not null default false,
  residence_country_is_required boolean not null default false,
  updated_at timestamptz not null default now(),
  check (min_age <= max_age)
);

create table private.invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique,
  cohort text not null check (cohort in ('jp_women', 'kr_men')),
  capacity integer not null check (capacity > 0),
  used_count integer not null default 0 check (
    used_count >= 0
    and used_count <= capacity
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table private.invitation_redemptions (
  id uuid primary key default gen_random_uuid(),
  invitation_code_id uuid not null references private.invitation_codes (id),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (invitation_code_id, user_id)
);

create table private.identity_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  provider_case_id text not null unique,
  verified_birth_date date,
  verified_nationality text check (verified_nationality in ('JP', 'KR')),
  document_status text not null,
  face_match_status text not null,
  liveness_status text not null,
  status text not null,
  verified_at timestamptz,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.profile_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles (user_id) on delete cascade,
  reviewer_user_id uuid references auth.users (id) on delete set null,
  status text not null check (
    status in ('submitted', 'changes_requested', 'approved', 'rejected')
  ),
  notes text,
  created_at timestamptz not null default now()
);

create table private.operator_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role private.operator_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table audit.events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  subject_type text not null,
  subject_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function app.is_active_member(candidate_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app
as $$
  select exists (
    select 1
    from app.members
    where user_id = candidate_user_id
      and member_state = 'active'
  )
$$;

create or replace function app.has_active_access(candidate_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1
    from private.invitation_redemptions
    where user_id = candidate_user_id
  )
$$;

create or replace function app.redeem_invitation(code text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app, private
as $$
declare
  caller_user_id uuid := auth.uid();
  requested_code_hash bytea;
  redeemed_code_hash bytea;
  invitation private.invitation_codes%rowtype;
begin
  if caller_user_id is null then
    raise exception 'authentication required';
  end if;

  requested_code_hash := extensions.digest(
    convert_to(upper(btrim(code)), 'UTF8'),
    'sha256'
  );

  perform 1
  from auth.users
  where id = caller_user_id
  for update;

  select invitation_codes.code_hash
  into redeemed_code_hash
  from private.invitation_redemptions
  join private.invitation_codes as invitation_codes
    on invitation_codes.id = invitation_redemptions.invitation_code_id
  where invitation_redemptions.user_id = caller_user_id;

  if found then
    if redeemed_code_hash = requested_code_hash then
      return true;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'invitation already redeemed with another code';
  end if;

  select *
  into invitation
  from private.invitation_codes
  where code_hash = requested_code_hash
  for update;

  if not found
    or invitation.expires_at <= now()
    or invitation.used_count >= invitation.capacity
  then
    raise exception 'invitation is invalid, expired, or at capacity';
  end if;

  insert into private.invitation_redemptions (
    invitation_code_id,
    user_id
  )
  values (
    invitation.id,
    caller_user_id
  );

  update private.invitation_codes
  set used_count = used_count + 1
  where id = invitation.id;

  insert into app.members (
    user_id,
    locale,
    self_identified_gender,
    member_state
  )
  values (
    caller_user_id,
    case invitation.cohort when 'jp_women' then 'ja' else 'ko' end,
    case invitation.cohort when 'jp_women' then 'woman' else 'man' end,
    'identity_pending'
  )
  on conflict (user_id) do update
  set member_state = 'identity_pending',
      updated_at = now()
  where members.member_state = 'waiting';

  return true;
end
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on schema audit from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all tables in schema audit from public, anon, authenticated;

grant usage on schema app to authenticated, service_role;
grant select on all tables in schema app to authenticated;
grant update (
  locale,
  self_identified_gender,
  updated_at
) on app.members to authenticated;
grant insert (
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
  willing_to_learn_partner_language,
  occupation_category
) on app.profiles to authenticated;
grant update (
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
  occupation_category,
  updated_at
) on app.profiles to authenticated;
grant insert (
  user_id,
  object_path,
  position
) on app.profile_media to authenticated;
grant update (
  user_id,
  object_path,
  position
) on app.profile_media to authenticated;
grant delete on app.profile_media to authenticated;
grant insert, update, delete on app.profile_preferences to authenticated;
grant all on all tables in schema app to service_role;

revoke all on function app.is_active_member(uuid) from public;
revoke all on function app.has_active_access(uuid) from public;
revoke all on function app.redeem_invitation(text) from public;
grant execute on function app.is_active_member(uuid) to authenticated, service_role;
grant execute on function app.has_active_access(uuid) to authenticated, service_role;
grant execute on function app.redeem_invitation(text) to authenticated, service_role;

alter table app.members enable row level security;
alter table app.profiles enable row level security;
alter table app.profile_media enable row level security;
alter table app.profile_preferences enable row level security;

create policy members_select_own
on app.members
for select
to authenticated
using (user_id = auth.uid());

create policy members_update_own
on app.members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy profiles_select_own_or_active
on app.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    app.is_active_member(auth.uid())
    and app.is_active_member(user_id)
    and review_status = 'approved'
    and published_at is not null
  )
);

create policy profiles_insert_own
on app.profiles
for insert
to authenticated
with check (user_id = auth.uid());

create policy profiles_update_own
on app.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy profile_media_select_own
on app.profile_media
for select
to authenticated
using (user_id = auth.uid());

create policy profile_media_insert_own
on app.profile_media
for insert
to authenticated
with check (user_id = auth.uid());

create policy profile_media_update_own
on app.profile_media
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy profile_media_delete_own
on app.profile_media
for delete
to authenticated
using (user_id = auth.uid());

create policy profile_preferences_select_own
on app.profile_preferences
for select
to authenticated
using (user_id = auth.uid());

create policy profile_preferences_insert_own
on app.profile_preferences
for insert
to authenticated
with check (user_id = auth.uid());

create policy profile_preferences_update_own
on app.profile_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values
  ('profile-media', 'profile-media', false),
  ('identity-documents', 'identity-documents', false)
on conflict (id) do update
set public = excluded.public;

create policy profile_media_member_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy profile_media_member_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-media'
  and name ~ (
    '^'
    || auth.uid()::text
    || '/[^/]+$'
  )
);

create policy profile_media_member_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'profile-media'
  and name ~ (
    '^'
    || auth.uid()::text
    || '/[^/]+$'
  )
);

create policy profile_media_member_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
);
