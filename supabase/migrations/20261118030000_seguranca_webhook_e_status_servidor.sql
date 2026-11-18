-- ============================================================
-- Segurança (plano mestre F0.5 e F0.6). Idempotente.
--
-- F0.5 · troca de e-mail do perfil
--   Antes: player_profiles.email era editável pelo próprio usuário e os RPCs do webhook achavam o
--   cliente por esse campo. Quem trocasse o próprio e-mail pelo de um comprador recebia o plano dele
--   (e o reembolso dele derrubava a conta do outro).
--   Agora: o e-mail do perfil é SEMPRE o do auth (trigger), o papel não muda pelo cliente, e os RPCs
--   do webhook acham o cliente por auth.users.email confirmado.
--
-- F0.6 · contrato/plano decididos no servidor
--   Antes: teste vencido só bloqueava na TELA (relógio do aparelho); a API gravava normalmente.
--   Agora: policies RESTRITIVAS em toda tabela com workspace_id barram gravação de workspace com teste
--   vencido (relógio do servidor): INSERT e UPDATE retornam 403; DELETE não apaga nada (0 linhas).
--   Stats exigem plano com stats. Funções SECURITY DEFINER (ex.: excluir_minha_conta) não são afetadas.
--   A tela lê o mesmo status por meu_status().
-- ============================================================

-- ---------- F0.5: e-mail do perfil vem do auth; papel não muda pelo cliente ----------
create or replace function public.perfil_protegido()
returns trigger language plpgsql security definer set search_path = '' as $$
declare em text;
begin
  select u.email into em from auth.users u where u.id = new.user_id;
  if em is null then raise exception 'perfil sem usuário no auth'; end if;
  new.email := em;
  -- só o servidor (service_role / migrations) define papel diferente de 'solo' ou troca o papel
  if coalesce(auth.role(), '') = 'authenticated' then
    if tg_op = 'INSERT' then new.role := 'solo';
    else new.role := old.role; new.user_id := old.user_id; new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.perfil_protegido() from public, anon, authenticated;

drop trigger if exists perfil_protegido on public.player_profiles;
create trigger perfil_protegido before insert or update on public.player_profiles
  for each row execute function public.perfil_protegido();

-- e-mail trocado no auth (painel ou fluxo de troca) atualiza o espelho no perfil
create or replace function public.perfil_sync_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.player_profiles set email = new.email where user_id = new.id and email is distinct from new.email;
  return new;
end $$;
revoke all on function public.perfil_sync_email() from public, anon, authenticated;
drop trigger if exists perfil_sync_email on auth.users;
create trigger perfil_sync_email after update of email on auth.users
  for each row execute function public.perfil_sync_email();

create unique index if not exists player_profiles_email_key on public.player_profiles (lower(email));

-- webhook: acha o cliente pelo e-mail CONFIRMADO do auth, nunca pelo perfil
create or replace function public.webhook_ativar_plano(p_email text, p_plan text, p_source text, p_order_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare wid uuid; uid uuid;
begin
  if p_plan not in ('gestao','pro','founder','team') then raise exception 'plano inválido: %', p_plan; end if;
  insert into public.plan_activations(email,plan,status,source,order_id)
    values(lower(p_email),p_plan,'pending',coalesce(p_source,'kiwify'),p_order_id);
  select u.id into uid from auth.users u
   where lower(u.email) = lower(p_email) and u.email_confirmed_at is not null limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id = uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan = p_plan, trial_ends_at = null where id = wid;
      update public.plan_activations set status='used', used_at=now(), used_by=uid
        where lower(email) = lower(p_email) and status = 'pending' and plan = p_plan;
    end if;
  end if;
  return 'ok';
end $$;

create or replace function public.webhook_revogar_plano(p_email text, p_order_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare wid uuid; uid uuid;
begin
  update public.plan_activations set status='revoked' where lower(email) = lower(p_email) and status = 'pending';
  select u.id into uid from auth.users u
   where lower(u.email) = lower(p_email) and u.email_confirmed_at is not null limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id = uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan='free', trial_ends_at=now() where id = wid and plan not in ('team','founder');
    end if;
  end if;
  return 'ok';
end $$;
revoke all on function public.webhook_ativar_plano(text,text,text,text) from public, anon, authenticated;
revoke all on function public.webhook_revogar_plano(text,text) from public, anon, authenticated;

-- ---------- F0.6: status do workspace calculado no servidor ----------
-- ativo: sem teste (null = pool, fundador, assinatura) ou teste ainda dentro do prazo, pelo relógio do servidor
create or replace function public.ws_ativo(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspaces w
                 where w.id = ws and (w.trial_ends_at is null or w.trial_ends_at > now()));
$$;
-- stats (hand history): time sempre; conta solo só nos planos com stats (mesma regra da tela)
create or replace function public.ws_pode_stats(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspaces w
                 where w.id = ws and (w.kind <> 'solo' or w.plan in ('pro','founder','team')));
$$;
revoke all on function public.ws_ativo(uuid) from public, anon;
revoke all on function public.ws_pode_stats(uuid) from public, anon;
grant execute on function public.ws_ativo(uuid) to authenticated;
grant execute on function public.ws_pode_stats(uuid) to authenticated;

-- o que a tela usa (em vez do relógio do aparelho)
create or replace function public.meu_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'agora', now(),
    'workspace_id', w.id,
    'plano', w.plan,
    'trial_ends_at', w.trial_ends_at,
    'ativo', (w.trial_ends_at is null or w.trial_ends_at > now()),
    'pode_stats', (w.kind <> 'solo' or w.plan in ('pro','founder','team')))
  from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid() order by m.created_at limit 1;
$$;
revoke all on function public.meu_status() from public, anon;
grant execute on function public.meu_status() to authenticated;

-- policies RESTRITIVAS (somam às existentes com AND): toda tabela de dados com workspace_id
do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'workspace_id' and tb.table_type = 'BASE TABLE'
             and c.table_name not in ('workspace_members')
  loop
    execute format('drop policy if exists ws_ativo_ins on public.%I', t);
    execute format('drop policy if exists ws_ativo_upd on public.%I', t);
    execute format('drop policy if exists ws_ativo_del on public.%I', t);
    execute format('create policy ws_ativo_ins on public.%I as restrictive for insert to authenticated with check (public.ws_ativo(workspace_id))', t);
    -- UPDATE: USING(true) de propósito. Com USING restritivo o Postgres só FILTRA (0 linhas, sem erro);
    -- assim a linha continua visível pela policy de membro e o WITH CHECK estoura 403 (aceite do F0.6).
    execute format('create policy ws_ativo_upd on public.%I as restrictive for update to authenticated using (true) with check (public.ws_ativo(workspace_id))', t);
    execute format('create policy ws_ativo_del on public.%I as restrictive for delete to authenticated using (public.ws_ativo(workspace_id))', t);
  end loop;
end $$;

drop policy if exists ws_stats_ins on public.hh_tournament_stats;
drop policy if exists ws_stats_upd on public.hh_tournament_stats;
create policy ws_stats_ins on public.hh_tournament_stats as restrictive for insert to authenticated with check (public.ws_pode_stats(workspace_id));
create policy ws_stats_upd on public.hh_tournament_stats as restrictive for update to authenticated using (true) with check (public.ws_pode_stats(workspace_id));
