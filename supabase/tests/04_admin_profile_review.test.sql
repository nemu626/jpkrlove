begin;

select plan(23);

do $$
begin
  perform tests.create_supabase_user('review_operator');
  perform tests.create_supabase_user('review_support');
  perform tests.create_supabase_user('review_aal1');
  perform tests.create_supabase_user('review_subject');
  perform tests.create_supabase_user('review_unverified');
end
$$;

insert into private.operator_roles (user_id, role)
values
  (tests.get_supabase_uid('review_operator'), 'profile_reviewer'),
  (tests.get_supabase_uid('review_support'), 'support'),
  (tests.get_supabase_uid('review_aal1'), 'profile_reviewer');

insert into app.members (
  user_id,
  locale,
  self_identified_gender,
  member_state
)
values
  (tests.get_supabase_uid('review_subject'), 'ja', 'woman', 'profile_in_review'),
  (tests.get_supabase_uid('review_unverified'), 'ko', 'man', 'profile_in_review');

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
  review_status
)
values
  (
    tests.get_supabase_uid('review_subject'),
    'Review Subject',
    'JP',
    'JP-13',
    'A profile introduction long enough for the review contract.',
    'within_2_years',
    'JP',
    true,
    'open_to_discuss',
    'non_smoker',
    'native',
    'intermediate',
    true,
    'submitted'
  ),
  (
    tests.get_supabase_uid('review_unverified'),
    'Unverified Subject',
    'KR',
    'KR-11',
    'An unverified profile that must never be approved by operations.',
    'within_3_years',
    'KR',
    false,
    'want_children',
    'non_smoker',
    'basic',
    'native',
    true,
    'submitted'
  );

insert into private.identity_cases (
  user_id,
  provider_case_id,
  verified_birth_date,
  verified_nationality,
  document_status,
  face_match_status,
  liveness_status,
  status,
  verified_at,
  result_observed_at,
  retention_until,
  invitation_cohort
)
values
  (
    tests.get_supabase_uid('review_subject'),
    'review-subject-case',
    date '1990-01-02',
    'JP',
    'verified',
    'verified',
    'verified',
    'verified',
    now(),
    now(),
    now() + interval '1 year',
    'jp_women'
  ),
  (
    tests.get_supabase_uid('review_unverified'),
    'review-unverified-case',
    null,
    null,
    'pending',
    'pending',
    'pending',
    'pending',
    null,
    null,
    null,
    'kr_men'
  );

insert into storage.objects (id, bucket_id, name, owner_id)
values
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('review_subject')::text || '/one.jpg',
    tests.get_supabase_uid('review_subject')
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('review_subject')::text || '/two.jpg',
    tests.get_supabase_uid('review_subject')
  );

insert into app.profile_media (user_id, object_path, position)
values
  (
    tests.get_supabase_uid('review_subject'),
    tests.get_supabase_uid('review_subject')::text || '/one.jpg',
    1
  ),
  (
    tests.get_supabase_uid('review_subject'),
    tests.get_supabase_uid('review_subject')::text || '/two.jpg',
    2
  );

insert into private.profile_reviews (id, user_id, status, notes)
values
  (
    '20000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('review_subject'),
    'submitted',
    null
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    tests.get_supabase_uid('review_unverified'),
    'submitted',
    null
  );

select has_function(
  'app',
  'admin_current_operator',
  array[]::text[],
  'current operator RPC exists'
);
select has_function(
  'app',
  'admin_profile_review_cases',
  array[]::text[],
  'review case list RPC exists'
);
select has_function(
  'app',
  'admin_profile_review_case',
  array['uuid'],
  'review case detail RPC exists'
);
select has_function(
  'app',
  'admin_review_profile',
  array['uuid', 'text', 'text'],
  'review mutation RPC exists'
);
select ok(
  (
    select count(*) = 4
    from pg_proc
    where oid in (
      'app.admin_current_operator()'::regprocedure,
      'app.admin_profile_review_cases()'::regprocedure,
      'app.admin_profile_review_case(uuid)'::regprocedure,
      'app.admin_review_profile(uuid,text,text)'::regprocedure
    )
      and prosecdef
  ),
  'all admin RPCs are security definer functions'
);
select is(
  (
    select proconfig[1]
    from pg_proc
    where oid = 'app.admin_review_profile(uuid,text,text)'::regprocedure
  ),
  'search_path=pg_catalog, app, private, audit',
  'review mutation fixes its search path'
);
select ok(
  not has_function_privilege(
    'anon',
    'app.admin_review_profile(uuid,text,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute review mutation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'app.admin_review_profile(uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated role can reach the role-checked review mutation'
);

select tests.authenticate_as('review_aal1');
select results_eq(
  $$ select aal, roles::text from app.admin_current_operator() $$,
  $$ values ('aal1'::text, '{profile_reviewer}'::text) $$,
  'operator context reports AAL1 and role'
);
select throws_ok(
  format(
    'select * from app.admin_profile_review_cases()'
  ),
  '42501',
  'aal2 required',
  'AAL1 profile reviewer cannot list review cases'
);

select tests.authenticate_as('review_support');
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', tests.get_supabase_uid('review_support'),
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
select throws_ok(
  $$ select * from app.admin_profile_review_cases() $$,
  '42501',
  'profile reviewer role required',
  'support operator cannot list profile review cases'
);

select tests.authenticate_as('review_operator');
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', tests.get_supabase_uid('review_operator'),
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
select results_eq(
  $$
    select case_id, display_name, photo_count, identity_status
    from app.admin_profile_review_cases()
  $$,
  format(
    $$ values (%L::uuid, 'Review Subject'::text, 2::bigint, 'verified'::text) $$,
    '20000000-0000-4000-8000-000000000001'
  ),
  'AAL2 profile reviewer sees only verified submitted cases'
);
select results_eq(
  format(
    $$
      select case_id, jsonb_array_length(photos), photos->0->>'object_path'
      from app.admin_profile_review_case(%L)
    $$,
    '20000000-0000-4000-8000-000000000001'
  ),
  format(
    $$ values (%L::uuid, 2, %L::text) $$,
    '20000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('review_subject')::text || '/one.jpg'
  ),
  'case detail returns derived profile data and ordered private media paths'
);
select is_empty(
  format(
    $$
      select name
      from storage.objects
      where bucket_id = 'profile-media'
        and name like %L || '/%%'
    $$,
    tests.get_supabase_uid('review_subject')::text
  ),
  'reviewer JWT cannot directly read another member media; signing stays server-only'
);
select hasnt_column(
  'app',
  'profiles',
  'birth_date',
  'review case profile data has no birth date column'
);

reset role;
insert into private.profile_reviews (id, user_id, status, notes, created_at)
values (
  '20000000-0000-4000-8000-000000000003',
  tests.get_supabase_uid('review_subject'),
  'submitted',
  null,
  now() + interval '1 second'
);

select tests.authenticate_as('review_operator');
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', tests.get_supabase_uid('review_operator'),
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);

select throws_ok(
  format(
    $$ select * from app.admin_review_profile(%L, 'approved', null) $$,
    '20000000-0000-4000-8000-000000000001'
  ),
  'P0001',
  'review case is not current',
  'a stale submitted review case cannot mutate the latest submission'
);

select throws_ok(
  format(
    $$ select * from app.admin_review_profile(%L, 'changes_requested', null) $$,
    '20000000-0000-4000-8000-000000000003'
  ),
  '22023',
  'review reason required',
  'changes requested requires a reason at the database boundary'
);
select results_eq(
  format(
    $$ select status from app.admin_review_profile(%L, 'approved', null) $$,
    '20000000-0000-4000-8000-000000000003'
  ),
  $$ values ('approved'::text) $$,
  'approved review returns the applied decision'
);

reset role;
select results_eq(
  $$
    select member_state::text, profiles.review_status, profiles.published_at is not null
    from app.members
    join app.profiles using (user_id)
    where user_id = tests.get_supabase_uid('review_subject')
  $$,
  $$ values ('active'::text, 'approved'::text, true) $$,
  'approval atomically publishes the profile and activates the member'
);
select results_eq(
  $$
    select status, reviewer_user_id, notes
    from private.profile_reviews
    where user_id = tests.get_supabase_uid('review_subject')
      and status = 'approved'
    order by created_at desc
    limit 1
  $$,
  $$ values ('approved'::text, tests.get_supabase_uid('review_operator'), null::text) $$,
  'approval records a private review audit row'
);
select results_eq(
  $$
    select event_type, payload->>'decision'
    from audit.events
    where subject_id = '20000000-0000-4000-8000-000000000003'
    order by created_at desc
    limit 1
  $$,
  $$ values ('profile.reviewed'::text, 'approved'::text) $$,
  'approval records an audit event without private identity attributes'
);
select tests.authenticate_as('review_operator');
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', tests.get_supabase_uid('review_operator'),
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);
select throws_ok(
  format(
    $$ select * from app.admin_review_profile(%L, 'approved', null) $$,
    '20000000-0000-4000-8000-000000000003'
  ),
  'P0001',
  'identity or profile state is not reviewable',
  'a completed review cannot be applied twice'
);
select throws_ok(
  format(
    $$ select * from app.admin_review_profile(%L, 'approved', null) $$,
    '20000000-0000-4000-8000-000000000002'
  ),
  'P0001',
  'identity or profile state is not reviewable',
  'unverified identity cannot be approved'
);

reset role;
select * from finish();
rollback;
