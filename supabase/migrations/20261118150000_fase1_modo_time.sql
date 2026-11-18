-- ============================================================
-- Fase 1: workspace do tipo 'time' (staking com N jogadores). Idempotente.
-- 'solo' = conta individual · 'team' = pool de 2 (como o Pool Gabriel & Breno) · 'time' = time de staking:
-- cada aluno vê só os próprios dados com o layout de um jogador; o gestor escolhe o aluno.
-- criar_time: só pelo servidor (SQL Editor), na venda pra um time. Cria o workspace, a raiz, o dono como
--   administrador e a config do time.
-- conferir_abertura: além de conferir, cria as salas do aluno com os saldos da planilha (só as que ainda
--   não existem), pra banca dele começar certa.
-- ============================================================

alter table public.workspaces drop constraint if exists workspaces_kind_check;
alter table public.workspaces add constraint workspaces_kind_check check (kind in ('team','solo','time'));

create or replace function public.criar_time(p_nome text, p_dono uuid, p_nome_dono text default null, p_assentos int default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ws uuid; raiz uuid; p uuid; nick text;
begin
  if coalesce(btrim(p_nome), '') = '' then raise exception 'nome do time'; end if;
  if not exists (select 1 from auth.users where id = p_dono) then raise exception 'conta do dono não existe'; end if;
  if exists (select 1 from public.workspace_members where user_id = p_dono) then
    raise exception 'essa conta já está em outro workspace (uma conta, um lugar até a fase 2): use outra conta pro dono do time'; end if;
  insert into public.workspaces(name, kind, plan, trial_ends_at, assentos) values (btrim(p_nome), 'time', 'team', null, p_assentos) returning id into ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, p_dono, 'owner');
  insert into public.unidade(workspace_id, nome, rotulo) values (ws, btrim(p_nome), 'Time') returning id into raiz;
  select nickname into nick from public.player_profiles where user_id = p_dono;
  insert into public.pessoa(workspace_id, user_id, nome, status)
  values (ws, p_dono, left(coalesce(nullif(btrim(p_nome_dono), ''), nullif(btrim(nick), ''), 'Gestor'), 60), 'ativo') returning id into p;
  insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p, raiz, array['administrar']);
  insert into public.pool_config(workspace_id, player1_name, player2_name, player_pct, banca_inicial, piso_minimo, makeup_max_recomendado,
                                 abi_max, abi_max_player1, abi_max_player2, week_start_date)
  values (ws, '', '', 1, 0, 0, 0, 2, 2, 0, current_date);
  return ws;
end $$;
revoke all on function public.criar_time(text, uuid, text, int) from public, anon, authenticated;

create or replace function public.conferir_abertura(p_pessoa uuid, p_mu numeric, p_cashout numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare a record; nome text; s jsonb;
begin
  select * into a from public.abertura where pessoa_id = p_pessoa for update;
  if a.id is null then raise exception 'esse jogador não enviou planilha'; end if;
  if not public.pode('aprovar_saques', a.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = p_pessoa and user_id = auth.uid()) then
    raise exception 'ninguém confere a própria planilha' using errcode = 'insufficient_privilege'; end if;
  if p_mu is null or p_cashout is null or p_mu < 0 or p_cashout < 0 then raise exception 'MU e cashout precisam ser de 0 pra cima'; end if;
  update public.abertura set status = 'confirmada', mu = round(p_mu, 2), cashout = round(p_cashout, 2),
         confirmado_por = auth.uid(), confirmado_em = now() where id = a.id;
  -- salas do aluno com o saldo da planilha (só as que ele ainda não tem)
  select pe.nome into nome from public.pessoa pe where pe.id = p_pessoa;
  if jsonb_typeof(a.planilha->'saldos') = 'array' then
    for s in select x from jsonb_array_elements(a.planilha->'saldos') x loop
      continue when coalesce((s->>'saldo')::numeric, 0) <= 0 or coalesce(btrim(s->>'sala'), '') = '';
      if not exists (select 1 from public.player_wallets w where w.workspace_id = a.workspace_id
                       and lower(btrim(w.player)) = lower(btrim(nome)) and lower(w.wallet) = lower(btrim(s->>'sala'))) then
        insert into public.player_wallets(workspace_id, player, wallet, saldo_inicial)
        values (a.workspace_id, nome, btrim(s->>'sala'), round((s->>'saldo')::numeric, 2));
      end if;
    end loop;
  end if;
end $$;
revoke all on function public.conferir_abertura(uuid,numeric,numeric) from public, anon;
grant execute on function public.conferir_abertura(uuid,numeric,numeric) to authenticated;
