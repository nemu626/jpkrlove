begin;

select plan(39);

do $$
begin
  perform tests.create_supabase_user('storage_owner');
  perform tests.create_supabase_user('storage_viewer');
  perform tests.create_supabase_user('retry_user');
  perform tests.create_supabase_user('state_active');
  perform tests.create_supabase_user('state_paused');
  perform tests.create_supabase_user('state_restricted');
  perform tests.create_supabase_user('state_waiting');
end
$$;

insert into app.members (
  user_id,
  locale,
  self_identified_gender,
  member_state
)
values
  (tests.get_supabase_uid('storage_owner'), 'ja', 'woman', 'active'),
  (tests.get_supabase_uid('storage_viewer'), 'ko', 'man', 'active'),
  (tests.get_supabase_uid('state_active'), 'ja', 'woman', 'active'),
  (tests.get_supabase_uid('state_paused'), 'ko', 'man', 'paused'),
  (tests.get_supabase_uid('state_restricted'), 'ja', 'woman', 'restricted'),
  (tests.get_supabase_uid('state_waiting'), 'ko', 'man', 'waiting');

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
values (
  tests.get_supabase_uid('storage_owner'),
  'Storage Owner',
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
);

insert into private.invitation_codes (
  code_hash,
  cohort,
  capacity,
  expires_at
)
values
  (
    extensions.digest(convert_to('RETRY-01', 'UTF8'), 'sha256'),
    'jp_women',
    5,
    now() + interval '1 day'
  ),
  (
    extensions.digest(convert_to('OTHER-02', 'UTF8'), 'sha256'),
    'kr_men',
    5,
    now() + interval '1 day'
  ),
  (
    extensions.digest(convert_to('ACTIVE-01', 'UTF8'), 'sha256'),
    'jp_women',
    1,
    now() + interval '1 day'
  ),
  (
    extensions.digest(convert_to('PAUSED-01', 'UTF8'), 'sha256'),
    'kr_men',
    1,
    now() + interval '1 day'
  ),
  (
    extensions.digest(convert_to('RESTRICTED-01', 'UTF8'), 'sha256'),
    'jp_women',
    1,
    now() + interval '1 day'
  ),
  (
    extensions.digest(convert_to('WAITING-01', 'UTF8'), 'sha256'),
    'kr_men',
    1,
    now() + interval '1 day'
  );

insert into storage.objects (id, bucket_id, name, owner_id)
values
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('storage_owner')::text || '/approved.jpg',
    tests.get_supabase_uid('storage_owner')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('storage_owner')::text || '/pending-replacement.jpg',
    tests.get_supabase_uid('storage_owner')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('storage_viewer')::text || '/private.jpg',
    tests.get_supabase_uid('storage_viewer')::text
  );

select tests.authenticate_as('storage_viewer');

select is_empty(
  $$
    select name
    from storage.objects
    where bucket_id = 'profile-media'
      and name like tests.get_supabase_uid('storage_owner')::text || '/%'
  $$,
  'active member cannot list another member profile media'
);
select is_empty(
  $$
    select name
    from storage.objects
    where bucket_id = 'profile-media'
      and name = tests.get_supabase_uid('storage_owner')::text
        || '/pending-replacement.jpg'
  $$,
  'unregistered pending replacement is not exposed to another member'
);

select tests.authenticate_as('storage_owner');

select results_eq(
  $$
    select count(*)::integer
    from storage.objects
    where bucket_id = 'profile-media'
      and name like tests.get_supabase_uid('storage_owner')::text || '/%'
  $$,
  array[2],
  'owner can read exactly their own profile media objects'
);
select throws_ok(
  $$
    insert into app.profile_media (
      user_id,
      object_path,
      position,
      moderation_status
    )
    values (
      tests.get_supabase_uid('storage_owner'),
      tests.get_supabase_uid('storage_owner')::text || '/self-approved.jpg',
      1,
      'approved'
    )
  $$,
  '42501',
  null,
  'member cannot insert self-approved profile media'
);
select lives_ok(
  $$
    insert into app.profile_media (
      user_id,
      object_path,
      position
    )
    values (
      tests.get_supabase_uid('storage_owner'),
      tests.get_supabase_uid('storage_owner')::text || '/pending-replacement.jpg',
      2
    )
  $$,
  'member can insert profile media with default pending moderation'
);
select throws_ok(
  $$
    insert into app.profile_media (
      user_id,
      object_path,
      position
    )
    values (
      tests.get_supabase_uid('storage_owner'),
      tests.get_supabase_uid('storage_viewer')::text || '/private.jpg',
      3
    )
  $$,
  '42501',
  null,
  'member cannot reference another member storage media in a direct insert'
);
select throws_ok(
  $$
    update app.profile_media
    set moderation_status = 'approved'
    where user_id = tests.get_supabase_uid('storage_owner')
      and position = 2
  $$,
  '42501',
  null,
  'member cannot self-approve existing profile media'
);
select lives_ok(
  $$
    update app.profile_media
    set position = 3
    where user_id = tests.get_supabase_uid('storage_owner')
      and position = 2
  $$,
  'member can update an editable profile media column'
);
select throws_ok(
  $$
    update app.profile_media
    set object_path = tests.get_supabase_uid('storage_viewer')::text || '/private.jpg'
    where user_id = tests.get_supabase_uid('storage_owner')
      and position = 3
  $$,
  '42501',
  null,
  'member cannot replace own media row with another member storage media'
);
select throws_ok(
  $$
    update app.profiles
    set marriage_timing = 'bad_value'
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects an invalid marriage timing'
);
select throws_ok(
  $$
    update app.profiles
    set children_preference = 'bad_value'
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects an invalid children preference'
);
select throws_ok(
  $$
    update app.profiles
    set smoking_status = 'bad_value'
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects an invalid smoking status'
);
select throws_ok(
  $$
    update app.profiles
    set ja_level = 'bad_value'
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects an invalid Japanese level'
);
select throws_ok(
  $$
    update app.profiles
    set ko_level = 'bad_value'
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects an invalid Korean level'
);
select throws_ok(
  $$
    update app.profiles
    set display_name = '   '
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects a whitespace display name'
);
select throws_ok(
  $$
    update app.profiles
    set region_code = '   '
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects a whitespace region code'
);
select lives_ok(
  $$
    update app.profiles
    set display_name = repeat('D', 80)
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  'profile accepts an 80 character display name'
);
select lives_ok(
  $$
    update app.profiles
    set display_name = repeat('D', 81)
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  'profile accepts an 81 character display name'
);
select lives_ok(
  $$
    update app.profiles
    set display_name = repeat('D', 100)
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  'profile accepts a 100 character display name'
);
select throws_ok(
  $$
    update app.profiles
    set display_name = repeat('D', 101)
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects a 101 character display name'
);
select lives_ok(
  $$
    update app.profiles
    set region_code = repeat('R', 32)
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  'profile accepts a 32 character region code'
);
select throws_ok(
  $$
    update app.profiles
    set region_code = repeat('R', 33)
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects a 33 character region code'
);
select throws_ok(
  $$
    update app.profiles
    set introduction = repeat(' ', 40)
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects a whitespace introduction'
);
select throws_ok(
  $$
    update app.profiles
    set introduction = ' ' || repeat('I', 39) || ' '
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile validates introduction length after trimming'
);
select lives_ok(
  $$
    update app.profiles
    set introduction = repeat('I', 40)
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  'profile accepts a 40 character introduction'
);
select lives_ok(
  $$
    update app.profiles
    set introduction = repeat('I', 1000)
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  'profile accepts a 1000 character introduction'
);
select throws_ok(
  $$
    update app.profiles
    set introduction = repeat('I', 1001)
    where user_id = tests.get_supabase_uid('storage_owner')
  $$,
  '23514',
  null,
  'profile rejects a 1001 character introduction'
);

select tests.authenticate_as('retry_user');
select is(
  app.redeem_invitation('RETRY-01'),
  true,
  'first invitation redemption succeeds'
);
select throws_ok(
  $$ select app.redeem_invitation('OTHER-02') $$,
  'P0001',
  'invitation already redeemed with another code',
  'different invitation code after redemption has a stable error'
);

select tests.authenticate_as('state_active');
select is(
  app.redeem_invitation('ACTIVE-01'),
  true,
  'active member redemption completes without an RPC error'
);
select is(
  (
    select member_state::text
    from app.members
    where user_id = tests.get_supabase_uid('state_active')
  ),
  'active',
  'invitation redemption does not regress an active member'
);

select tests.authenticate_as('state_paused');
select is(
  app.redeem_invitation('PAUSED-01'),
  true,
  'paused member redemption completes without an RPC error'
);
select is(
  (
    select member_state::text
    from app.members
    where user_id = tests.get_supabase_uid('state_paused')
  ),
  'paused',
  'invitation redemption does not regress a paused member'
);

select tests.authenticate_as('state_restricted');
select is(
  app.redeem_invitation('RESTRICTED-01'),
  true,
  'restricted member redemption completes without an RPC error'
);
select is(
  (
    select member_state::text
    from app.members
    where user_id = tests.get_supabase_uid('state_restricted')
  ),
  'restricted',
  'invitation redemption does not regress a restricted member'
);

select tests.authenticate_as('state_waiting');
select is(
  app.redeem_invitation('WAITING-01'),
  true,
  'waiting member invitation redemption succeeds'
);
select is(
  (
    select member_state::text
    from app.members
    where user_id = tests.get_supabase_uid('state_waiting')
  ),
  'identity_pending',
  'invitation redemption advances a waiting member'
);

select tests.authenticate_as('retry_user');
select is(
  app.redeem_invitation(' retry-01 '),
  true,
  'same invitation retry is an idempotent success'
);

reset role;

select is(
  (
    select used_count
    from private.invitation_codes
    where code_hash = extensions.digest(
      convert_to('RETRY-01', 'UTF8'),
      'sha256'
    )
  ),
  1,
  'same invitation retry does not increment usage'
);

select * from finish();
rollback;
