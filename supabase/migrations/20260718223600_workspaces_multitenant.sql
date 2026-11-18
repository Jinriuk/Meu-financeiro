-- ============================================================
-- GrinderBank Fase 1.1: multi-tenant em BANCO ÚNICO.
-- Cada conta = um "workspace". A pool Gabriel & Breno vira o único
-- workspace tipo 'team' (2 membros); Lucas vira workspace 'solo'.
-- Isolamento por RLS de associação: cada um só vê o próprio workspace.
-- ============================================================

-- 1) Estrutura
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'solo' check (kind in ('team','solo')),
  plan text not null default 'founder',    -- futuro: free / gestao / pro / team
  created_at timestamptz not null default now()
);
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',      -- owner / member
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- workspaces do usuário logado (security definer: consulta membros sem recursão de RLS)
create or replace function public.my_workspaces() returns setof uuid
language sql stable security definer set search_path=''
as $$ select workspace_id from public.workspace_members where user_id = auth.uid() $$;
revoke all on function public.my_workspaces() from public;
grant execute on function public.my_workspaces() to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
drop policy if exists ws_self on public.workspaces;
create policy ws_self on public.workspaces for all to authenticated
  using (id in (select public.my_workspaces())) with check (id in (select public.my_workspaces()));
drop policy if exists wsm_self on public.workspace_members;
create policy wsm_self on public.workspace_members for select to authenticated
  using (user_id = auth.uid());

-- 2) Sementes: pool (team) + Lucas (solo)
do $$
declare ws_pool uuid; ws_lucas uuid;
  uid_gabriel uuid; uid_breno uuid; uid_lucas uuid;
begin
  select id into uid_gabriel from auth.users where email='<email-socio-1>';
  select id into uid_breno   from auth.users where email='<email-socio-2>';
  select id into uid_lucas   from auth.users where email='<email-convidado>';
  -- [repo] e-mails reais trocados por marcadores; num banco novo (homologação) as sementes são puladas
  if uid_gabriel is not null and uid_breno is not null and uid_lucas is not null then
  select w.id into ws_pool from public.workspaces w join public.workspace_members m on m.workspace_id=w.id
    where w.kind='team' and m.user_id=uid_gabriel limit 1;
  if ws_pool is null then
    insert into public.workspaces (name,kind,plan) values ('Pool Gabriel & Breno','team','team') returning id into ws_pool;
    insert into public.workspace_members (workspace_id,user_id,role) values (ws_pool,uid_gabriel,'owner'),(ws_pool,uid_breno,'owner');
  end if;
  select w.id into ws_lucas from public.workspaces w join public.workspace_members m on m.workspace_id=w.id
    where w.kind='solo' and m.user_id=uid_lucas limit 1;
  if ws_lucas is null then
    insert into public.workspaces (name,kind,plan) values ('Lucas','solo','founder') returning id into ws_lucas;
    insert into public.workspace_members (workspace_id,user_id,role) values (ws_lucas,uid_lucas,'owner');
  end if;
  end if;

  -- 3) workspace_id em todas as tabelas de dados + backfill
  perform 1;
  execute 'alter table public.pool_config         add column if not exists workspace_id uuid references public.workspaces(id)';
  execute 'alter table public.daily_entries       add column if not exists workspace_id uuid references public.workspaces(id)';
  execute 'alter table public.tournaments         add column if not exists workspace_id uuid references public.workspaces(id)';
  execute 'alter table public.bankroll_ledger     add column if not exists workspace_id uuid references public.workspaces(id)';
  execute 'alter table public.player_wallets      add column if not exists workspace_id uuid references public.workspaces(id)';
  execute 'alter table public.withdrawals         add column if not exists workspace_id uuid references public.workspaces(id)';
  execute 'alter table public.hh_tournament_stats add column if not exists workspace_id uuid references public.workspaces(id)';
  execute 'alter table public.hh_import_log       add column if not exists workspace_id uuid references public.workspaces(id)';
  execute 'alter table public.config_changes      add column if not exists workspace_id uuid references public.workspaces(id)';

  -- tudo é da pool, EXCETO o que o Lucas criou (stats e diagnósticos dele)
  update public.pool_config         set workspace_id=ws_pool  where workspace_id is null;
  update public.daily_entries       set workspace_id=ws_pool  where workspace_id is null;
  update public.tournaments         set workspace_id=ws_pool  where workspace_id is null;
  update public.bankroll_ledger     set workspace_id=ws_pool  where workspace_id is null;
  update public.player_wallets      set workspace_id=ws_pool  where workspace_id is null;
  update public.withdrawals         set workspace_id=ws_pool  where workspace_id is null;
  update public.config_changes      set workspace_id=ws_pool  where workspace_id is null;
  update public.hh_tournament_stats set workspace_id=case when created_by=uid_lucas then ws_lucas else ws_pool end where workspace_id is null;
  update public.hh_import_log       set workspace_id=case when created_by=uid_lucas then ws_lucas else ws_pool end where workspace_id is null;
end $$;

-- 4) NOT NULL + trigger que preenche o workspace do usuário (quem tem 1 workspace nunca precisa mandar)
alter table public.pool_config         alter column workspace_id set not null;
alter table public.daily_entries       alter column workspace_id set not null;
alter table public.tournaments         alter column workspace_id set not null;
alter table public.bankroll_ledger     alter column workspace_id set not null;
alter table public.player_wallets      alter column workspace_id set not null;
alter table public.withdrawals         alter column workspace_id set not null;
alter table public.hh_tournament_stats alter column workspace_id set not null;
alter table public.hh_import_log       alter column workspace_id set not null;
alter table public.config_changes      alter column workspace_id set not null;

create or replace function public.set_workspace_id() returns trigger
language plpgsql security definer set search_path=''
as $$ begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from public.workspace_members where user_id=auth.uid() order by created_at limit 1;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['pool_config','daily_entries','tournaments','bankroll_ledger','player_wallets','withdrawals','hh_tournament_stats','hh_import_log','config_changes'] loop
    execute format('drop trigger if exists set_ws on public.%I;', t);
    execute format('create trigger set_ws before insert on public.%I for each row execute function public.set_workspace_id();', t);
  end loop;
end $$;

-- 5) Únicos por workspace (dois clientes podem ter o mesmo nome/torneio sem conflitar)
drop index if exists pool_config_single_row;
create unique index if not exists pool_config_one_per_ws on public.pool_config (workspace_id);
alter table public.hh_tournament_stats drop constraint if exists hh_tournament_stats_player_site_site_tournament_id_key;
create unique index if not exists hh_stats_ws_key on public.hh_tournament_stats (workspace_id, player, site, site_tournament_id);
alter table public.player_wallets drop constraint if exists player_wallets_player_wallet_key;
create unique index if not exists player_wallets_ws_key on public.player_wallets (workspace_id, player, wallet);

-- 6) RLS: TODA tabela de dados passa a ser "membros do workspace" — nada de papel global
do $$
declare t text;
begin
  foreach t in array array['pool_config','daily_entries','tournaments','bankroll_ledger','player_wallets','withdrawals','hh_tournament_stats','hh_import_log','config_changes'] loop
    execute format('drop policy if exists pool_shared on public.%I;', t);
    execute format('drop policy if exists ws_members on public.%I;', t);
    execute format(
      'create policy ws_members on public.%I for all to authenticated
         using (workspace_id in (select public.my_workspaces()))
         with check (workspace_id in (select public.my_workspaces()));', t);
  end loop;
end $$;

-- perfis: o próprio + colegas de workspace (pro time ver nomes)
drop policy if exists pool_shared on public.player_profiles;
drop policy if exists profile_self_or_teammates on public.player_profiles;
create policy profile_self_or_teammates on public.player_profiles for all to authenticated
  using (user_id=auth.uid() or exists (
    select 1 from public.workspace_members m where m.user_id=player_profiles.user_id and m.workspace_id in (select public.my_workspaces())))
  with check (user_id=auth.uid());
