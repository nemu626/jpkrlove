begin;

select plan(22);

do $$
begin
  perform tests.create_supabase_user('mobile_profile');
  perform tests.create_supabase_user('mobile_profile_boundary');
  perform tests.create_supabase_user('mobile_profile_submit_boundary');
  perform tests.create_supabase_user('mobile_profile_other');
  perform tests.create_supabase_user('mobile_profile_delete');
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
),
(
  tests.get_supabase_uid('mobile_profile_boundary'),
  'ja',
  'woman',
  'profile_draft'
),
(
  tests.get_supabase_uid('mobile_profile_submit_boundary'),
  'ja',
  'woman',
  'profile_draft'
),
(
  tests.get_supabase_uid('mobile_profile_other'),
  'ja',
  'woman',
  'profile_draft'
),
(
  tests.get_supabase_uid('mobile_profile_delete'),
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
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile')::text || '/photo-three',
    tests.get_supabase_uid('mobile_profile')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile')::text || '/photo-four',
    tests.get_supabase_uid('mobile_profile')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile')::text || '/photo-five',
    tests.get_supabase_uid('mobile_profile')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile')::text || '/photo-six',
    tests.get_supabase_uid('mobile_profile')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile')::text || '/photo-seven',
    tests.get_supabase_uid('mobile_profile')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile_other')::text || '/photo-one',
    tests.get_supabase_uid('mobile_profile_other')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile_delete')::text || '/photo-one',
    tests.get_supabase_uid('mobile_profile_delete')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile_delete')::text || '/photo-two',
    tests.get_supabase_uid('mobile_profile_delete')::text
  ),
  (
    gen_random_uuid(),
    'profile-media',
    tests.get_supabase_uid('mobile_profile_delete')::text || '/photo-three',
    tests.get_supabase_uid('mobile_profile_delete')::text
  );

select tests.authenticate_as('mobile_profile_boundary');

select throws_ok(
  $$
    select app.save_profile_draft(
      'ja', 'woman', 'Boundary', 'JP', '13',
      '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
      'within_3_years', 'JP', true, 'open_to_discuss', 'non_smoker',
      'native', 'intermediate', true, null
    )
  $$,
  '22023',
  'profile media is invalid',
  'draft rejects null media paths'
);

select throws_ok(
  $$
    select app.save_profile_draft(
      'ja', 'woman', 'Boundary', 'JP', '13',
      '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
      'within_3_years', 'JP', true, 'open_to_discuss', 'non_smoker',
      'native', 'intermediate', true, array[]::text[]
    )
  $$,
  '22023',
  'profile media is invalid',
  'draft rejects empty media paths'
);

select tests.authenticate_as('mobile_profile_submit_boundary');

select throws_ok(
  $$
    select app.submit_profile(
      'ja', 'woman', 'Boundary', 'JP', '13',
      '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
      'within_3_years', 'JP', true, 'open_to_discuss', 'non_smoker',
      'native', 'intermediate', true, null
    )
  $$,
  '22023',
  'profile media is invalid',
  'submit rejects null media paths'
);

select throws_ok(
  $$
    select app.submit_profile(
      'ja', 'woman', 'Boundary', 'JP', '13',
      '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
      'within_3_years', 'JP', true, 'open_to_discuss', 'non_smoker',
      'native', 'intermediate', true, array[]::text[]
    )
  $$,
  '22023',
  'profile media is invalid',
  'submit rejects empty media paths'
);

reset role;

select results_eq(
  $$
    select
      member_state::text,
      (
        select count(*)::integer
        from app.profiles
        where user_id = tests.get_supabase_uid('mobile_profile_submit_boundary')
      ),
      (
        select count(*)::integer
        from private.profile_reviews
        where user_id = tests.get_supabase_uid('mobile_profile_submit_boundary')
      )
    from app.members
    where user_id = tests.get_supabase_uid('mobile_profile_submit_boundary')
  $$,
  $$ values ('profile_draft'::text, 0::integer, 0::integer) $$,
  'invalid submit leaves member profile and review unchanged'
);

select tests.authenticate_as('mobile_profile_delete');

do $$
begin
  perform app.save_profile_draft(
    'ja', 'woman', 'Delete Retry', 'JP', '13',
    '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
    'within_3_years', 'JP', true, 'open_to_discuss', 'non_smoker',
    'native', 'intermediate', true,
    array[
      tests.get_supabase_uid('mobile_profile_delete')::text || '/photo-one',
      tests.get_supabase_uid('mobile_profile_delete')::text || '/photo-two',
      tests.get_supabase_uid('mobile_profile_delete')::text || '/photo-three'
    ]
  );
end
$$;

select set_config(
  'tests.mobile_deleted_media_id',
  (
    select id::text
    from app.profile_media
    where user_id = tests.get_supabase_uid('mobile_profile_delete')
      and object_path =
        tests.get_supabase_uid('mobile_profile_delete')::text || '/photo-three'
  ),
  true
);

select lives_ok(
  $$
    select app.delete_profile_media(
      current_setting('tests.mobile_deleted_media_id')::uuid
    )
  $$,
  'member deletes a persisted media row'
);

select lives_ok(
  $$
    select app.delete_profile_media(
      current_setting('tests.mobile_deleted_media_id')::uuid
    )
  $$,
  'retrying an already deleted media row is idempotent'
);

select tests.authenticate_as('mobile_profile');

select throws_ok(
  $$
    select app.save_profile_draft(
      'ja', 'woman', 'Aiko', 'JP', '13',
      '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
      'within_3_years', 'JP', true, 'open_to_discuss', 'non_smoker',
      'native', 'intermediate', true,
      array[tests.get_supabase_uid('mobile_profile')::text || '/photo-one']
    )
  $$,
  '22023',
  'profile media is invalid',
  'draft rejects one media path'
);

select throws_ok(
  $$
    select app.save_profile_draft(
      'ja', 'woman', 'Aiko', 'JP', '13',
      '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
      'within_3_years', 'JP', true, 'open_to_discuss', 'non_smoker',
      'native', 'intermediate', true,
      array[
        tests.get_supabase_uid('mobile_profile')::text || '/photo-one',
        tests.get_supabase_uid('mobile_profile')::text || '/photo-two',
        tests.get_supabase_uid('mobile_profile')::text || '/photo-three',
        tests.get_supabase_uid('mobile_profile')::text || '/photo-four',
        tests.get_supabase_uid('mobile_profile')::text || '/photo-five',
        tests.get_supabase_uid('mobile_profile')::text || '/photo-six',
        tests.get_supabase_uid('mobile_profile')::text || '/photo-seven'
      ]
    )
  $$,
  '22023',
  'profile media is invalid',
  'draft rejects seven media paths'
);

select throws_ok(
  $$
    select app.save_profile_draft(
      'ja', 'woman', 'Aiko', 'JP', '13',
      '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
      'within_3_years', 'JP', true, 'open_to_discuss', 'non_smoker',
      'native', 'intermediate', true,
      array[
        tests.get_supabase_uid('mobile_profile')::text || '/photo-one',
        tests.get_supabase_uid('mobile_profile')::text || '/photo-one'
      ]
    )
  $$,
  '22023',
  'profile media is invalid',
  'draft rejects duplicate media paths'
);

select throws_ok(
  $$
    select app.save_profile_draft(
      'ja', 'woman', 'Aiko', 'JP', '13',
      '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
      'within_3_years', 'JP', true, 'open_to_discuss', 'non_smoker',
      'native', 'intermediate', true,
      array[
        tests.get_supabase_uid('mobile_profile')::text || '/photo-one',
        tests.get_supabase_uid('mobile_profile_other')::text || '/photo-one'
      ]
    )
  $$,
  '22023',
  'profile media is invalid',
  'draft rejects another member media path'
);

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

select throws_ok(
  $$ select app.reorder_profile_media(null) $$,
  '22023',
  'profile media order is invalid',
  'reorder rejects a null media id array'
);

select throws_ok(
  $$ select app.reorder_profile_media(array[]::uuid[]) $$,
  '22023',
  'profile media order is invalid',
  'reorder rejects an empty media id array'
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
