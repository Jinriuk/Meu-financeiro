-- Recorte do schema de PRODUÇÃO (lido em 17/11/2026) necessário pra testar F0.5/F0.6 num Postgres local.
-- Inclui um "auth" mínimo no lugar do Supabase: auth.users, auth.uid(), auth.role(), auth.jwt()
-- lendo os claims de request.jwt.claims, como o PostgREST faz.
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, email_confirmed_at timestamptz);
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create table public.workspaces (id uuid primary key default gen_random_uuid(), name text, kind text default 'solo', plan text default 'free', created_at timestamptz default now(), trial_ends_at timestamptz);
create table public.workspace_members (workspace_id uuid references public.workspaces(id), user_id uuid references auth.users(id), created_at timestamptz default now(), role text not null default 'owner', primary key (workspace_id,user_id));
create table public.player_profiles (user_id uuid primary key references auth.users(id) on delete cascade, email text not null, nickname text, cpf text, whatsapp text,
  password_changed boolean not null default false, role text, created_at timestamptz not null default now());
create table public.tournaments (id uuid primary key default gen_random_uuid(), workspace_id uuid references public.workspaces(id), entry_date date not null, player text not null, buyin numeric not null default 0, prize numeric not null default 0);
create table public.hh_tournament_stats (id uuid primary key default gen_random_uuid(), workspace_id uuid references public.workspaces(id), player text not null, site text not null, site_tournament_id text not null, hands int not null default 0);
create table public.plan_activations (id uuid primary key default gen_random_uuid(), email text, plan text, status text, source text, order_id text, created_at timestamptz default now(), used_at timestamptz, used_by uuid);

create or replace function public.my_workspaces() returns setof uuid language sql stable security definer set search_path to '' as $$ select workspace_id from public.workspace_members where user_id = auth.uid() $$;
create or replace function public.set_workspace_id() returns trigger language plpgsql security definer set search_path to '' as $$ begin
  if new.workspace_id is null then select workspace_id into new.workspace_id from public.workspace_members where user_id=auth.uid() order by created_at limit 1; end if; return new; end $$;
create trigger set_ws before insert on public.tournaments for each row execute function public.set_workspace_id();
create trigger set_ws before insert on public.hh_tournament_stats for each row execute function public.set_workspace_id();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.player_profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.hh_tournament_stats enable row level security;
alter table public.plan_activations enable row level security;
create policy ws_self on public.workspaces for all using (id in (select public.my_workspaces())) with check (id in (select public.my_workspaces()));
create policy wm_self on public.workspace_members for select using (user_id = auth.uid());
create policy profile_self_or_teammates on public.player_profiles for all using ((user_id = (select auth.uid())) or exists (select 1 from public.workspace_members m where m.user_id = player_profiles.user_id and m.workspace_id in (select public.my_workspaces()))) with check (user_id = (select auth.uid()));
create policy ws_members on public.tournaments for all using (workspace_id in (select public.my_workspaces())) with check (workspace_id in (select public.my_workspaces()));
create policy ws_members on public.hh_tournament_stats for all using (workspace_id in (select public.my_workspaces())) with check (workspace_id in (select public.my_workspaces()));

-- grants como em produção: workspaces só leitura pro cliente; perfil com UPDATE em todas as colunas (inclusive email e role)
grant usage on schema public to anon, authenticated, service_role;
grant select on public.workspaces, public.workspace_members to authenticated;
grant select, insert, update, delete on public.player_profiles, public.tournaments, public.hh_tournament_stats to authenticated;
grant all on all tables in schema public to service_role;

-- (F0.17) segredos e um net.http_post falso que só anota a chamada
create table public.app_secrets (name text primary key, value text not null default '', updated_at timestamptz not null default now());
alter table public.app_secrets enable row level security;
create schema net;
create table net.chamadas (id serial, url text, body jsonb);
create or replace function net.http_post(url text, body jsonb, headers jsonb default null) returns bigint language sql as $$ insert into net.chamadas(url, body) values (url, body) returning id::bigint $$;
