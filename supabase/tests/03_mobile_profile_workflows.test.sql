begin;

select plan(9);

do $$
begin
  perform tests.create_supabase_user('mobile_profile');
end
$$;

insert into app.members (
  user_id,
  locale,
  self_identified_gender,
  member_state
)
values (
  tests.get_supabase_uid('mobile_profile'),
  'ja',
  'woman',
  'profile_draft'
);

insert into storage.objects (id, bucket_id, name, owner_id)
values
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile')::text || '/photo-one',
    tests.get_supabase_uid('mobile_profile')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile')::text || '/photo-two',
    tests.get_supabase_uid('mobile_profile')::text
  );

select tests.authenticate_as('mobile_profile');

select lives_ok(
  $$
    select app.save_profile_draft(
      'ja',
      'woman',
      'Aiko',
      'JP',
      '13',
      '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
      'within_3_years',
      'JP',
      true,
      'open_to_discuss',
      'non_smoker',
      'native',
      'intermediate',
      true,
      array[
        tests.get_supabase_uid('mobile_profile')::text || '/photo-one',
        tests.get_supabase_uid('mobile_profile')::text || '/photo-two'
      ]
    )
  $$,
  'member saves profile and media in one RPC'
);

select results_eq(
  $$
    select display_name
    from app.profiles
    where user_id = tests.get_supabase_uid('mobile_profile')
  $$,
  array['Aiko'::text],
  'draft profile is persisted'
);

select results_eq(
  $$
    select object_path
    from app.profile_media
    where user_id = tests.get_supabase_uid('mobile_profile')
    order by position
  $$,
  array[
    tests.get_supabase_uid('mobile_profile')::text || '/photo-one',
    tests.get_supabase_uid('mobile_profile')::text || '/photo-two'
  ],
  'media positions follow draft order'
);

select lives_ok(
  $$
    select app.reorder_profile_media(
      (
        select array_agg(id order by position desc)
        from app.profile_media
        where user_id = tests.get_supabase_uid('mobile_profile')
      )
    )
  $$,
  'member atomically swaps media positions'
);

select results_eq(
  $$
    select object_path
    from app.profile_media
    where user_id = tests.get_supabase_uid('mobile_profile')
    order by position
  $$,
  array[
    tests.get_supabase_uid('mobile_profile')::text || '/photo-two',
    tests.get_supabase_uid('mobile_profile')::text || '/photo-one'
  ],
  'reordered positions are committed'
);

select throws_ok(
  $$
    select app.delete_profile_media(
      (
        select id
        from app.profile_media
        where user_id = tests.get_supabase_uid('mobile_profile')
        limit 1
      )
    )
  $$,
  'P0001',
  'at least two profile media items are required',
  'member cannot delete below the photo minimum'
);

select lives_ok(
  $$
    select app.submit_profile(
      'ja',
      'woman',
      'Aiko',
      'JP',
      '13',
      '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
      'within_3_years',
      'JP',
      true,
      'open_to_discuss',
      'non_smoker',
      'native',
      'intermediate',
      true,
      array[
        tests.get_supabase_uid('mobile_profile')::text || '/photo-two',
        tests.get_supabase_uid('mobile_profile')::text || '/photo-one'
      ]
    )
  $$,
  'member submits a complete profile atomically'
);

select results_eq(
  $$
    select member_state::text, review_status
    from app.members
    join app.profiles using (user_id)
    where user_id = tests.get_supabase_uid('mobile_profile')
  $$,
  $$ values ('profile_in_review'::text, 'submitted'::text) $$,
  'submission transitions member and review states together'
);

reset role;

select results_eq(
  $$
    select count(*)::integer
    from private.profile_reviews
    where user_id = tests.get_supabase_uid('mobile_profile')
      and status = 'submitted'
  $$,
  array[1],
  'submission creates one private review record'
);

select * from finish();
rollback;
