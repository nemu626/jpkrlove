create schema if not exists tests;

create or replace function tests.get_supabase_uid(identifier text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select id
  from auth.users
  where raw_user_meta_data ->> 'identifier' = identifier
$$;

create or replace function tests.create_supabase_user(identifier text)
returns uuid
language plpgsql
set search_path = pg_catalog, auth
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (
    new_id,
    'authenticated',
    'authenticated',
    identifier || '@example.test',
    jsonb_build_object('identifier', identifier)
  );

  return new_id;
end
$$;

create or replace function tests.authenticate_as(identifier text)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', tests.get_supabase_uid(identifier),
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    tests.get_supabase_uid(identifier)::text,
    true
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);
end
$$;

revoke all on function tests.get_supabase_uid(text) from public;
revoke all on function tests.create_supabase_user(text) from public;
revoke all on function tests.authenticate_as(text) from public;

grant usage on schema tests to authenticated;
grant execute on function tests.get_supabase_uid(text) to authenticated;
grant execute on function tests.authenticate_as(text) to authenticated;
