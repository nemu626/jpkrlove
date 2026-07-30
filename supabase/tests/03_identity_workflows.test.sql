begin;

select plan(40);

do $$
begin
  perform tests.create_supabase_user('identity_no_invite');
  perform tests.create_supabase_user('identity_adult_jp');
  perform tests.create_supabase_user('identity_adult_boundary');
  perform tests.create_supabase_user('identity_underage');
  perform tests.create_supabase_user('identity_mismatch');
  perform tests.create_supabase_user('identity_provider_failed');
  perform tests.create_supabase_user('identity_deleted_redemption');
end
$$;

insert into private.invitation_codes (
  id,
  code_hash,
  cohort,
  capacity,
  used_count,
  expires_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    extensions.digest(convert_to('IDENTITY-JP', 'UTF8'), 'sha256'),
    'jp_women',
    10,
    4,
    now() + interval '1 day'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    extensions.digest(convert_to('IDENTITY-KR', 'UTF8'), 'sha256'),
    'kr_men',
    10,
    1,
    now() + interval '1 day'
  );

insert into private.invitation_redemptions (
  invitation_code_id,
  user_id
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('identity_adult_jp')
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('identity_adult_boundary')
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('identity_underage')
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('identity_mismatch')
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    tests.get_supabase_uid('identity_provider_failed')
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    tests.get_supabase_uid('identity_deleted_redemption')
  );

insert into app.members (
  user_id,
  locale,
  self_identified_gender,
  member_state
)
values
  (
    tests.get_supabase_uid('identity_adult_jp'),
    'ja',
    'woman',
    'identity_pending'
  ),
  (
    tests.get_supabase_uid('identity_deleted_redemption'),
    'ja',
    'woman',
    'identity_pending'
  ),
  (
    tests.get_supabase_uid('identity_adult_boundary'),
    'ja',
    'woman',
    'identity_pending'
  ),
  (
    tests.get_supabase_uid('identity_underage'),
    'ja',
    'woman',
    'identity_pending'
  ),
  (
    tests.get_supabase_uid('identity_mismatch'),
    'ja',
    'woman',
    'identity_pending'
  ),
  (
    tests.get_supabase_uid('identity_provider_failed'),
    'ko',
    'man',
    'identity_pending'
  );

select has_function(
  'app',
  'internal_create_identity_case',
  array['uuid', 'text'],
  'internal identity case creation RPC exists'
);
select has_function(
  'app',
  'internal_apply_identity_result',
  array['text', 'text', 'date', 'text', 'timestamp with time zone'],
  'internal identity result RPC exists'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'app.internal_create_identity_case(uuid,text)'::regprocedure
  ),
  'identity case creation is security definer'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid =
      'app.internal_apply_identity_result(text,text,date,text,timestamptz)'::regprocedure
  ),
  'identity result application is security definer'
);
select is(
  (
    select proconfig[1]
    from pg_proc
    where oid = 'app.internal_create_identity_case(uuid,text)'::regprocedure
  ),
  'search_path=pg_catalog, app, private, audit',
  'identity case creation fixes its search path'
);
select is(
  (
    select proconfig[1]
    from pg_proc
    where oid =
      'app.internal_apply_identity_result(text,text,date,text,timestamptz)'::regprocedure
  ),
  'search_path=pg_catalog, app, private, audit',
  'identity result application fixes its search path'
);
select ok(
  not has_function_privilege(
    'public',
    'app.internal_create_identity_case(uuid,text)',
    'EXECUTE'
  ),
  'PUBLIC cannot create identity cases'
);
select ok(
  not has_function_privilege(
    'anon',
    'app.internal_create_identity_case(uuid,text)',
    'EXECUTE'
  ),
  'anon cannot create identity cases'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app.internal_create_identity_case(uuid,text)',
    'EXECUTE'
  ),
  'authenticated cannot create identity cases'
);
select ok(
  has_function_privilege(
    'service_role',
    'app.internal_create_identity_case(uuid,text)',
    'EXECUTE'
  ),
  'service role can create identity cases'
);
select ok(
  not has_function_privilege(
    'public',
    'app.internal_apply_identity_result(text,text,date,text,timestamptz)',
    'EXECUTE'
  ),
  'PUBLIC cannot apply identity results'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app.internal_apply_identity_result(text,text,date,text,timestamptz)',
    'EXECUTE'
  ),
  'authenticated cannot apply identity results'
);
select ok(
  has_function_privilege(
    'service_role',
    'app.internal_apply_identity_result(text,text,date,text,timestamptz)',
    'EXECUTE'
  ),
  'service role can apply identity results'
);

set local role authenticated;
select throws_ok(
  format(
    'select * from app.internal_create_identity_case(%L, %L)',
    tests.get_supabase_uid('identity_adult_jp'),
    'case-forbidden'
  ),
  '42501',
  null,
  'authenticated callers cannot invoke the internal creation RPC'
);
reset role;

set local role service_role;

select throws_ok(
  format(
    'select * from app.internal_create_identity_case(%L, %L)',
    tests.get_supabase_uid('identity_no_invite'),
    'case-no-invite'
  ),
  'P0001',
  'accepted invitation required',
  'identity case creation atomically requires an accepted invitation'
);

select results_eq(
  format(
    'select provider_case_id, status from app.internal_create_identity_case(%L, %L)',
    tests.get_supabase_uid('identity_adult_jp'),
    'case-adult-jp'
  ),
  $$ values ('case-adult-jp'::text, 'pending'::text) $$,
  'accepted invitation creates a pending identity case'
);
select results_eq(
  format(
    'select provider_case_id, status from app.internal_create_identity_case(%L, %L)',
    tests.get_supabase_uid('identity_adult_jp'),
    'case-adult-jp'
  ),
  $$ values ('case-adult-jp'::text, 'pending'::text) $$,
  'same provider case retry is idempotent'
);
select results_eq(
  format(
    'select provider_case_id, status from app.internal_create_identity_case(%L, %L)',
    tests.get_supabase_uid('identity_adult_jp'),
    'case-different'
  ),
  $$ values ('case-adult-jp'::text, 'pending'::text) $$,
  'a retry cannot replace an existing provider case'
);

select throws_ok(
  $$
    select *
    from app.internal_apply_identity_result(
      'case-missing',
      'verified',
      date '1990-01-01',
      'JP',
      timestamptz '2026-07-30 00:00:00+00'
    )
  $$,
  'P0001',
  'identity case not found',
  'unknown provider cases are rejected'
);

select results_eq(
  $$
    select applied, status, failure_reason
    from app.internal_apply_identity_result(
      'case-adult-jp',
      'verified',
      date '1990-01-01',
      'JP',
      timestamptz '2026-07-30 00:00:00+00'
    )
  $$,
  $$ values (true, 'verified'::text, null::text) $$,
  'matching adult identity result verifies once'
);
select is(
  (
    select member_state::text
    from app.members
    where user_id = tests.get_supabase_uid('identity_adult_jp')
  ),
  'profile_draft',
  'verified identity advances the member to profile draft'
);
select results_eq(
  $$
    select applied, status, failure_reason
    from app.internal_apply_identity_result(
      'case-adult-jp',
      'verified',
      date '1990-01-01',
      'JP',
      timestamptz '2026-07-30 00:01:00+00'
    )
  $$,
  $$ values (false, 'verified'::text, null::text) $$,
  'replayed verified webhook is an idempotent no-op'
);
select results_eq(
  $$
    select applied, status, failure_reason
    from app.internal_apply_identity_result(
      'case-adult-jp',
      'failed',
      null,
      null,
      timestamptz '2026-07-29 23:59:00+00'
    )
  $$,
  $$ values (false, 'verified'::text, null::text) $$,
  'out-of-order failure cannot overwrite a terminal verified result'
);

select results_eq(
  format(
    'select provider_case_id, status from app.internal_create_identity_case(%L, %L)',
    tests.get_supabase_uid('identity_adult_boundary'),
    'case-adult-boundary'
  ),
  $$ values ('case-adult-boundary'::text, 'pending'::text) $$,
  'exact-age boundary case is created'
);
select results_eq(
  $$
    select applied, status, failure_reason
    from app.internal_apply_identity_result(
      'case-adult-boundary',
      'verified',
      date '2008-07-30',
      'JP',
      timestamptz '2026-07-30 23:59:59+00'
    )
  $$,
  $$ values (true, 'verified'::text, null::text) $$,
  'a member exactly 18 years old is verified'
);

select results_eq(
  format(
    'select provider_case_id, status from app.internal_create_identity_case(%L, %L)',
    tests.get_supabase_uid('identity_underage'),
    'case-underage'
  ),
  $$ values ('case-underage'::text, 'pending'::text) $$,
  'underage case is created pending'
);
select results_eq(
  $$
    select applied, status, failure_reason
    from app.internal_apply_identity_result(
      'case-underage',
      'verified',
      date '2008-07-31',
      'JP',
      timestamptz '2026-07-30 23:59:59+00'
    )
  $$,
  $$ values (true, 'failed'::text, 'UNDERAGE'::text) $$,
  'a member one day under 18 fails verification'
);
select is(
  (
    select member_state::text
    from app.members
    where user_id = tests.get_supabase_uid('identity_underage')
  ),
  'identity_failed',
  'underage failure updates member state'
);

select results_eq(
  format(
    'select provider_case_id, status from app.internal_create_identity_case(%L, %L)',
    tests.get_supabase_uid('identity_mismatch'),
    'case-mismatch'
  ),
  $$ values ('case-mismatch'::text, 'pending'::text) $$,
  'nationality mismatch case is created pending'
);
select results_eq(
  $$
    select applied, status, failure_reason
    from app.internal_apply_identity_result(
      'case-mismatch',
      'verified',
      date '1990-01-01',
      'KR',
      timestamptz '2026-07-30 00:00:00+00'
    )
  $$,
  $$ values (true, 'failed'::text, 'NATIONALITY_MISMATCH'::text) $$,
  'nationality outside the invitation cohort fails verification'
);

select results_eq(
  format(
    'select provider_case_id, status from app.internal_create_identity_case(%L, %L)',
    tests.get_supabase_uid('identity_deleted_redemption'),
    'case-deleted-redemption'
  ),
  $$ values ('case-deleted-redemption'::text, 'pending'::text) $$,
  'identity case snapshots an accepted invitation before later retention'
);

reset role;

delete from private.invitation_redemptions
where user_id = tests.get_supabase_uid('identity_deleted_redemption');

set local role service_role;

select results_eq(
  $$
    select applied, status, failure_reason
    from app.internal_apply_identity_result(
      'case-deleted-redemption',
      'verified',
      date '1990-01-01',
      'KR',
      timestamptz '2026-07-30 00:00:00+00'
    )
  $$,
  $$ values (true, 'failed'::text, 'NATIONALITY_MISMATCH'::text) $$,
  'deleted redemption cannot erase the snapshotted nationality rule'
);

reset role;

select is(
  (
    select invitation_cohort
    from private.identity_cases
    where provider_case_id = 'case-deleted-redemption'
  ),
  'jp_women',
  'identity case retains its immutable invitation cohort snapshot'
);
select results_eq(
  $$
    select status, failure_reason, verified_nationality
    from private.identity_cases
    where provider_case_id = 'case-deleted-redemption'
  $$,
  $$ values ('failed'::text, 'NATIONALITY_MISMATCH'::text, 'KR'::text) $$,
  'deleted-redemption result remains a failed mismatch case'
);
select is(
  (
    select member_state::text
    from app.members
    where user_id = tests.get_supabase_uid('identity_deleted_redemption')
  ),
  'identity_failed',
  'deleted-redemption mismatch fails the member'
);

select tests.authenticate_as('identity_deleted_redemption');
select throws_ok(
  $$
    update private.identity_cases
    set invitation_cohort = 'kr_men'
    where provider_case_id = 'case-deleted-redemption'
  $$,
  '42501',
  null,
  'member cannot mutate the private invitation cohort snapshot'
);
reset role;

set local role service_role;

select results_eq(
  format(
    'select provider_case_id, status from app.internal_create_identity_case(%L, %L)',
    tests.get_supabase_uid('identity_provider_failed'),
    'case-provider-failed'
  ),
  $$ values ('case-provider-failed'::text, 'pending'::text) $$,
  'provider failure case is created pending'
);
select results_eq(
  $$
    select applied, status, failure_reason
    from app.internal_apply_identity_result(
      'case-provider-failed',
      'failed',
      null,
      null,
      timestamptz '2026-07-30 00:00:00+00'
    )
  $$,
  $$ values (true, 'failed'::text, 'PROVIDER_FAILED'::text) $$,
  'provider failure records only a derived failure state'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.identity_cases
    where status in ('verified', 'failed')
      and (
        provider_case_id = 'case-provider-failed'
        and (
          verified_birth_date is not null
          or verified_nationality is not null
        )
      )
  ),
  0,
  'provider failure does not invent identity attributes'
);

set local role service_role;

select throws_ok(
  $$
    select *
    from app.internal_apply_identity_result(
      'case-underage',
      'unknown',
      null,
      null,
      timestamptz '2026-07-30 00:00:00+00'
    )
  $$,
  '22023',
  'invalid provider identity result',
  'unknown provider statuses are rejected'
);

reset role;

select * from finish();
rollback;
