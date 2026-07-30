insert into private.invitation_codes (
  code_hash,
  cohort,
  capacity,
  expires_at
)
values
  (
    extensions.digest(convert_to('LOCAL-JP-WOMEN', 'UTF8'), 'sha256'),
    'jp_women',
    100,
    now() + interval '90 days'
  ),
  (
    extensions.digest(convert_to('LOCAL-KR-MEN', 'UTF8'), 'sha256'),
    'kr_men',
    100,
    now() + interval '90 days'
  )
on conflict (code_hash) do nothing;
