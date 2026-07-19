-- ============================================================
-- Auditoria pré-produção — endurecimento (P0/P1/P2). Idempotente.
-- Consolida as migrations aplicadas em 2026-07-19:
--   harden_aplicar_ativacao_anon, entitlement_server_side_p0,
--   perf_fk_indexes_and_rls_initplan, excluir_minha_conta_lgpd,
--   webhook_billing_rpcs, retire_email_for_login_anon, drop_dead_my_role.
-- Fonte da verdade: supabase_migrations.schema_migrations (ver README).
-- ============================================================

-- #1 (P0) entitlement no servidor: cliente não escreve workspaces; plano só via RPC definer
revoke insert, update, delete, truncate on public.workspaces from anon, authenticated;
revoke insert, update, delete, truncate on public.workspace_members from anon, authenticated;
revoke all on public.plan_activations from anon, authenticated;
revoke insert, update, delete, truncate on public.player_profiles from anon;

-- #10 (P0/P2) fail-closed: plano nasce 'free' e só aceita valores conhecidos
alter table public.workspaces alter column plan set default 'free';
alter table public.workspaces drop constraint if exists workspaces_plan_check;
alter table public.workspaces add constraint workspaces_plan_check
  check (plan in ('free','gestao','pro','founder','team'));

-- aplicar_ativacao usa o e-mail do JWT: anon não tem e-mail, não deve chamar
revoke execute on function public.aplicar_ativacao() from anon;

-- #11 (P2) índice em cada FK (RLS filtra por workspace_id em toda query)
do $$ declare t text;
begin
  foreach t in array array['bankroll_ledger','config_changes','daily_entries','hh_import_log',
    'hh_tournament_stats','player_wallets','pool_config','tournaments','withdrawals'] loop
    execute format('create index if not exists idx_%s_ws on public.%I(workspace_id);', t, t);
    execute format('create index if not exists idx_%s_cb on public.%I(created_by);', t, t);
  end loop;
  create index if not exists idx_plan_activations_usedby on public.plan_activations(used_by);
  create index if not exists idx_wsm_ws on public.workspace_members(workspace_id);
  create index if not exists idx_wsm_user on public.workspace_members(user_id);
end $$;

-- #11 (P2) initplan: avalia auth.uid() uma vez por query (não por linha)
drop policy if exists wsm_self on public.workspace_members;
create policy wsm_self on public.workspace_members for select using (user_id = (select auth.uid()));
drop policy if exists profile_self_or_teammates on public.player_profiles;
create policy profile_self_or_teammates on public.player_profiles for all
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.workspace_members m
    where m.user_id = player_profiles.user_id and m.workspace_id in (select my_workspaces())))
  with check (user_id = (select auth.uid()));

-- #6 (P1/LGPD) exclusão definitiva: apaga tudo do usuário; pool compartilhada só perde o membro
create or replace function public.excluir_minha_conta() returns void
language plpgsql security definer set search_path to '' as $$
declare uid uuid := auth.uid(); wsid uuid; membros int;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  for wsid in select workspace_id from public.workspace_members where user_id=uid loop
    select count(*) into membros from public.workspace_members where workspace_id=wsid;
    if membros<=1 then
      delete from public.bankroll_ledger where workspace_id=wsid;
      delete from public.config_changes where workspace_id=wsid;
      delete from public.daily_entries where workspace_id=wsid;
      delete from public.hh_import_log where workspace_id=wsid;
      delete from public.hh_tournament_stats where workspace_id=wsid;
      delete from public.player_wallets where workspace_id=wsid;
      delete from public.tournaments where workspace_id=wsid;
      delete from public.withdrawals where workspace_id=wsid;
      delete from public.pool_config where workspace_id=wsid;
      delete from public.workspace_members where workspace_id=wsid;
      delete from public.workspaces where id=wsid;
    else
      delete from public.workspace_members where workspace_id=wsid and user_id=uid;
    end if;
  end loop;
  update public.plan_activations set used_by=null where used_by=uid;
  delete from public.player_profiles where user_id=uid;
  delete from auth.users where id=uid;
end $$;
revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;

-- #2 (P0) cobrança: idempotência + ativar/revogar plano (chamadas pelo webhook via service role)
create table if not exists public.webhook_events(
  provider text not null, event_id text not null,
  received_at timestamptz not null default now(), primary key(provider,event_id));
alter table public.webhook_events enable row level security;  -- sem policy: só service role/admin
alter table public.plan_activations add column if not exists order_id text;

create or replace function public.webhook_ativar_plano(p_email text, p_plan text, p_source text, p_order_id text)
returns text language plpgsql security definer set search_path to '' as $$
declare wid uuid; uid uuid;
begin
  if p_plan not in ('gestao','pro','founder','team') then raise exception 'plano inválido: %', p_plan; end if;
  insert into public.plan_activations(email,plan,status,source,order_id)
    values(lower(p_email),p_plan,'pending',coalesce(p_source,'kiwify'),p_order_id);
  select pp.user_id into uid from public.player_profiles pp where lower(pp.email)=lower(p_email) limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id=uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan=p_plan where id=wid;
      update public.plan_activations set status='used', used_at=now(), used_by=uid
        where lower(email)=lower(p_email) and status='pending' and plan=p_plan;
    end if;
  end if;
  return 'ok';
end $$;

create or replace function public.webhook_revogar_plano(p_email text, p_order_id text)
returns text language plpgsql security definer set search_path to '' as $$
declare wid uuid; uid uuid;
begin
  update public.plan_activations set status='revoked' where lower(email)=lower(p_email) and status='pending';
  select pp.user_id into uid from public.player_profiles pp where lower(pp.email)=lower(p_email) limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id=uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan='free' where id=wid and plan not in ('team','founder');
    end if;
  end if;
  return 'ok';
end $$;
revoke all on function public.webhook_ativar_plano(text,text,text,text) from public, anon, authenticated;
revoke all on function public.webhook_revogar_plano(text,text) from public, anon, authenticated;

-- #4 (P1) email_for_login sai do alcance de anon/authenticated (login por apelido é via Edge Function)
revoke execute on function public.email_for_login(text) from anon, authenticated, public;

-- #14 (higiene) my_role() era do modelo antigo de papéis globais — removida
drop function if exists public.my_role();
