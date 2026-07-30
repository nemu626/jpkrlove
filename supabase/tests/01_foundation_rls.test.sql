begin;

select plan(47);

do $$
begin
  perform tests.create_supabase_user('member_a');
  perform tests.create_supabase_user('member_b');
  perform tests.create_supabase_user('member_c');
  perform tests.create_supabase_user('member_d');
  perform tests.create_supabase_user('invitee');
  perform tests.create_supabase_user('capacity_waiter');
end
$$;

insert into app.members (
  user_id,
  locale,
  self_identified_gender,
  member_state
)
values
  (tests.get_supabase_uid('member_a'), 'ja', 'woman', 'active'),
  (tests.get_supabase_uid('member_b'), 'ko', 'man', 'profile_draft'),
  (tests.get_supabase_uid('member_c'), 'ko', 'man', 'active'),
  (tests.get_supabase_uid('member_d'), 'ja', 'woman', 'profile_draft');

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
  willing_to_learn_partner_language,
  review_status,
  published_at
)
values
  (
    tests.get_supabase_uid('member_a'),
    'Member A',
    'JP',
    'JP-13',
    'A profile introduction long enough for the database contract.',
    'within_2_years',
    'JP',
    true,
    'open_to_discuss',
    'non_smoker',
    'native',
    'intermediate',
    true,
    'approved',
    now()
  ),
  (
    tests.get_supabase_uid('member_b'),
    'Member B',
    'KR',
    'KR-11',
    'B profile introduction long enough for the database contract.',
    'within_3_years',
    'KR',
    false,
    'want_children',
    'non_smoker',
    'basic',
    'native',
    true,
    'draft',
    null
  ),
  (
    tests.get_supabase_uid('member_c'),
    'Member C',
    'KR',
    'KR-11',
    'C profile introduction long enough for the database contract.',
    'within_1_year',
    'JP',
    true,
    'open_to_discuss',
    'trying_to_quit',
    'intermediate',
    'native',
    true,
    'approved',
    now()
  ),
  (
    tests.get_supabase_uid('member_d'),
    'Member D',
    'JP',
    'JP-13',
    'D profile introduction long enough for the database contract.',
    'not_sure',
    'JP',
    false,
    'do_not_want_children',
    'non_smoker',
    'native',
    'basic',
    false,
    'draft',
    null
  );

insert into private.invitation_codes (
  code_hash,
  cohort,
  capacity,
  expires_at
)
values (
  extensions.digest(convert_to('BETA-01', 'UTF8'), 'sha256'),
  'jp_women',
  1,
  now() + interval '1 day'
);

insert into private.identity_cases (
  user_id,
  provider_case_id,
  document_status,
  face_match_status,
  liveness_status,
  status,
  invitation_cohort
)
values (
  tests.get_supabase_uid('member_b'),
  'provider-case-member-b',
  'pending',
  'pending',
  'pending',
  'pending',
  'kr_men'
);

insert into storage.objects (id, bucket_id, name, owner_id)
values
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('member_a')::text || '/' || gen_random_uuid()::text,
    tests.get_supabase_uid('member_a')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('member_b')::text || '/' || gen_random_uuid()::text,
    tests.get_supabase_uid('member_b')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('member_c')::text || '/' || gen_random_uuid()::text,
    tests.get_supabase_uid('member_c')::text
  ),
  (
    gen_random_uuid(),
    'identity-documents',
    tests.get_supabase_uid('member_a')::text || '/' || gen_random_uuid()::text,
    tests.get_supabase_uid('member_a')::text
  );

select has_schema('app', 'app schema exists');
select has_schema('private', 'private schema exists');
select has_schema('audit', 'audit schema exists');
select has_table('app', 'members', 'members table exists');
select has_table('app', 'profiles', 'profiles table exists');
select has_table('app', 'profile_media', 'profile media table exists');
select has_table('app', 'profile_preferences', 'profile preferences table exists');
select has_table('private', 'invitation_codes', 'invitation codes table exists');
select has_table(
  'private',
  'invitation_redemptions',
  'invitation redemptions table exists'
);
select has_table('private', 'identity_cases', 'identity cases table exists');
select has_table('private', 'profile_reviews', 'profile reviews table exists');
select has_table('private', 'operator_roles', 'operator roles table exists');
select has_table('audit', 'events', 'audit events table exists');

select results_eq(
  $$
    select enumlabel::text collate "default"
    from pg_enum
    where enumtypid = 'app.member_state'::regtype
    order by enumsortorder
  $$,
  array[
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
  ]::text[],
  'member states match the domain contract'
);

select results_eq(
  $$
    select enumlabel::text collate "default"
    from pg_enum
    where enumtypid = 'private.operator_role'::regtype
    order by enumsortorder
  $$,
  array[
    'support',
    'profile_reviewer',
    'identity_reviewer',
    'recommender',
    'moderator',
    'admin'
  ]::text[],
  'operator roles are limited to approved roles'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'app'
      and table_name = 'profiles'
      and column_name = any (
        array[
          'marriage_timing',
          'residence_country',
          'willing_to_relocate',
          'children_preference',
          'smoking_status',
          'ja_level',
          'ko_level',
          'willing_to_learn_partner_language',
          'occupation_category'
        ]
      )
  ),
  9,
  'profile contract columns exist'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'app'
      and table_name = 'profile_preferences'
      and column_name = any (
        array[
          'min_age',
          'max_age',
          'allowed_residence_countries',
          'marriage_timing_is_required',
          'children_preference_is_required',
          'smoking_status_is_required',
          'residence_country_is_required'
        ]
      )
  ),
  7,
  'matching-only preference columns exist'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'identity_cases'
      and column_name = any (
        array[
          'provider_case_id',
          'verified_birth_date',
          'verified_nationality',
          'document_status',
          'face_match_status',
          'liveness_status',
          'status',
          'verified_at',
          'retention_until',
          'failure_reason',
          'result_observed_at',
          'invitation_cohort'
        ]
      )
  ),
  12,
  'identity case stores only derived verification fields'
);

select hasnt_column(
  'private',
  'identity_cases',
  'legal_name',
  'legal name is not persisted'
);
select hasnt_column(
  'private',
  'identity_cases',
  'document_data',
  'raw identity document data is not persisted'
);
select hasnt_column(
  'private',
  'invitation_codes',
  'code',
  'raw invitation code is not persisted'
);

select has_function(
  'app',
  'redeem_invitation',
  array['text'],
  'redeem invitation RPC exists'
);
select has_function(
  'app',
  'has_active_access',
  array['uuid'],
  'active access stable interface exists'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'app.redeem_invitation(text)'::regprocedure
  ),
  'redeem invitation is security definer'
);
select is(
  (
    select proconfig[1]
    from pg_proc
    where oid = 'app.redeem_invitation(text)'::regprocedure
  ),
  'search_path=pg_catalog, app, private',
  'redeem invitation fixes its search path'
);

select is(
  (
    select count(*)::integer
    from pg_class
    where oid = any (
      array[
        'app.members'::regclass,
        'app.profiles'::regclass,
        'app.profile_media'::regclass,
        'app.profile_preferences'::regclass
      ]
    )
      and relrowsecurity
  ),
  4,
  'all Data API app tables enable RLS'
);

select is(
  (select public from storage.buckets where id = 'profile-media'),
  false,
  'profile media bucket is private'
);
select is(
  (select public from storage.buckets where id = 'identity-documents'),
  false,
  'identity document bucket is private'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'identity_documents_member_%'
  ),
  0,
  'identity documents have no member policy'
);

select tests.authenticate_as('member_a');

select is_empty(
  $$
    select *
    from app.profiles
    where user_id = tests.get_supabase_uid('member_b')
  $$,
  'unapproved profile is not readable'
);
select results_eq(
  $$
    select user_id
    from app.profiles
    where user_id = tests.get_supabase_uid('member_c')
  $$,
  array[tests.get_supabase_uid('member_c')],
  'active members can read another active profile'
);
select throws_ok(
  $$ select * from private.identity_cases $$,
  '42501',
  null,
  'member cannot read identity cases'
);
select throws_ok(
  $$ select * from audit.events $$,
  '42501',
  null,
  'member cannot read audit events'
);
select results_eq(
  $$
    select count(*)::integer
    from storage.objects
    where bucket_id = 'profile-media'
      and name like tests.get_supabase_uid('member_a')::text || '/%'
  $$,
  array[1],
  'member can read exactly their own private profile media object'
);
select is_empty(
  $$
    select *
    from storage.objects
    where bucket_id = 'profile-media'
      and name like tests.get_supabase_uid('member_b')::text || '/%'
  $$,
  'draft profile media is not readable by another member'
);
select is_empty(
  $$
    select *
    from storage.objects
    where bucket_id = 'profile-media'
      and name like tests.get_supabase_uid('member_c')::text || '/%'
  $$,
  'cross-member profile media requires a short signed URL'
);
select throws_ok(
  format(
    $$
      insert into storage.objects (bucket_id, name)
      values ('profile-media', %L)
    $$,
    tests.get_supabase_uid('member_b')::text || '/' || gen_random_uuid()::text
  ),
  '42501',
  null,
  'member cannot write outside own profile media path'
);
select is_empty(
  $$ select * from storage.objects where bucket_id = 'identity-documents' $$,
  'members cannot read identity documents'
);

select tests.authenticate_as('member_d');
select lives_ok(
  $$
    select *
    from app.profiles
    where user_id = tests.get_supabase_uid('member_d')
  $$,
  'member can read own profile draft'
);
select throws_ok(
  $$
    update app.members
    set member_state = 'active'
    where user_id = tests.get_supabase_uid('member_d')
  $$,
  '42501',
  null,
  'member cannot promote their own member state'
);
select throws_ok(
  $$
    update app.profiles
    set review_status = 'approved',
        published_at = now()
    where user_id = tests.get_supabase_uid('member_d')
  $$,
  '42501',
  null,
  'member cannot approve and publish their own profile'
);

select tests.authenticate_as('invitee');
select is(
  app.has_active_access(tests.get_supabase_uid('invitee')),
  false,
  'uninvited member has no beta access'
);
select is(
  app.redeem_invitation(' beta-01 '),
  true,
  'authenticated member redeems a normalized invitation code'
);
select is(
  app.has_active_access(tests.get_supabase_uid('invitee')),
  true,
  'redeemed invitation grants beta access'
);
select is(
  (
    select member_state::text
    from app.members
    where user_id = tests.get_supabase_uid('invitee')
  ),
  'identity_pending',
  'redemption advances the member to identity pending'
);

reset role;

select is(
  (
    select used_count
    from private.invitation_codes
    where code_hash = extensions.digest(
      convert_to('BETA-01', 'UTF8'),
      'sha256'
    )
  ),
  1,
  'redemption increments invitation usage once'
);

select tests.authenticate_as('capacity_waiter');
select throws_ok(
  $$ select app.redeem_invitation('BETA-01') $$,
  'P0001',
  null,
  'invitation capacity is enforced'
);

select * from finish();
rollback;
