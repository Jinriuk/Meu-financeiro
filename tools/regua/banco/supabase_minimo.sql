-- O mínimo do Supabase que as migrations do GrinderBank usam, num Postgres puro.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create schema if not exists auth;
create table auth.users (instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
  confirmation_token text, recovery_token text, email_change text, email_change_token_new text, email_change_token_current text);
create table auth.identities (id uuid primary key, provider_id text, user_id uuid references auth.users(id) on delete cascade, identity_data jsonb, provider text,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
grant usage on schema auth, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create publication supabase_realtime;
-- privilégios padrão do Supabase em public
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
