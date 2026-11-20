-- ============================================================
-- Saída do jogador: opção B do plano mestre (seção 6, decidida). Idempotente.
--
-- Antes (opção A): o vínculo fechava, a conta saía do time e TODO o histórico ficava com o time.
-- Agora:
--   · o ACERTO de saída fica registrado: banca final (a do sistema ou a que quem aprova saques confirma), MU,
--     profit, lucro já sacado e a divisão pelo contrato. Fora de MK, o time recolhe o capital (MU) e a parte dele no
--     lucro; o jogador fica com a parte dele. Em MK, o time recolhe a banca que sobrou e o MK fica CONGELADO no acerto;
--   · o time guarda o financeiro do período: o acerto (com o resultado do período, no total e por mês), os saques,
--     os aportes (MU), os reloads e a planilha;
--   · o histórico detalhado (torneios, mãos, diário, imports, movimentos e salas) sai do time e vai pra uma conta
--     individual NOVA do jogador, com 15 dias de teste. Se ele tinha conta individual antes de entrar, a configuração
--     dela volta;
--   · jogador sem conta (convite nunca aceito): só fecha o vínculo; não há o que levar;
--   · saída com saque, reload ou planilha pendente é recusada (o acerto sairia errado); o dono do time e a própria
--     pessoa não registram a saída por aqui;
--   · quem gere pessoas registra a saída; se há dinheiro do time com o jogador, precisa também aprovar saques.
-- ============================================================

create table if not exists public.acerto_saida (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pessoa_id uuid not null references public.pessoa(id),
  unidade_id uuid references public.unidade(id),            -- a reta em que ele estava
  jogador_user_id uuid,                                      -- a conta dele: vê o próprio acerto na conta individual
  time_nome text,                                            -- ele não lê mais o workspace do time: guarda o nome aqui
  conta_nova uuid,                                           -- a conta individual pra onde foi o histórico
  entrada date,
  saida date not null default current_date,
  banca_sistema numeric(12,2) not null,
  banca numeric(12,2) not null,                              -- banca final do acerto
  mu numeric(12,2) not null,
  lifetime_antes numeric(12,2) not null,                     -- lucro já sacado no time
  profit numeric(12,2) not null,                             -- banca − MU
  mk_congelado numeric(12,2) not null default 0,             -- MU − banca, quando saiu em MK
  devolucao numeric(12,2) not null default 0,                -- capital que volta pro time
  cashout numeric(12,2) not null default 0,                  -- lucro dividido no acerto
  parte_jogador numeric(12,2),                               -- divisão pelo contrato (sem contrato: em branco)
  parte_time numeric(12,2),
  total_time numeric(12,2),                                  -- o que o time tem a receber
  divisao jsonb,
  resultado jsonb not null,                                  -- desempenho do período no time (total e por mês)
  status text not null default 'a_receber' check (status in ('a_receber','recebido')),
  recebido numeric(12,2),
  diferenca numeric(12,2),
  recebido_em timestamptz,
  obs text,
  registrado_por uuid default auth.uid(),
  registrado_em timestamptz not null default now()
);
create index if not exists acerto_saida_ws on public.acerto_saida (workspace_id);
create index if not exists acerto_saida_pessoa on public.acerto_saida (pessoa_id);
create index if not exists acerto_saida_unidade on public.acerto_saida (unidade_id);
create index if not exists acerto_saida_jogador on public.acerto_saida (jogador_user_id);
alter table public.acerto_saida enable row level security;
revoke all on public.acerto_saida from anon, authenticated;
grant select on public.acerto_saida to authenticated;
drop policy if exists acerto_ler on public.acerto_saida;
create policy acerto_ler on public.acerto_saida for select to authenticated
  using (jogador_user_id = (select auth.uid()) or unidade_id in (select public.unidades_com('ver_financeiro')));

-- ---------- resultado do período no time (interna): só o que é de dentro do time ----------
create or replace function public.resultado_no_time(p_pessoa uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (
    select to_char(x.entry_date, 'YYYY-MM') mes, 1 + coalesce(x.reentries, 0) ent,
           case when x.ticket then 0 else x.buyin * (1 + coalesce(x.reentries, 0)) end inv,
           x.buyin * (1 + coalesce(x.reentries, 0)) nominal,
           x.prize + coalesce(x.bounty, 0) - case when x.ticket then 0 else x.buyin * (1 + coalesce(x.reentries, 0)) end res
      from public.tournaments x where x.pessoa_id = p_pessoa and x.unidade_id is not null)
  select jsonb_build_object(
    'torneios', (select count(*) from t), 'entradas', (select coalesce(sum(ent), 0) from t),
    'investido', (select round(coalesce(sum(inv), 0), 2) from t), 'lucro', (select round(coalesce(sum(res), 0), 2) from t),
    'abi', (select round(sum(nominal) / nullif(sum(ent), 0), 2) from t),
    'meses', coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'torneios', n, 'investido', inv, 'lucro', res) order by mes)
                         from (select mes, count(*) n, round(sum(inv), 2) inv, round(sum(res), 2) res from t group by mes) m), '[]'::jsonb));
$$;
revoke all on function public.resultado_no_time(uuid) from public, anon, authenticated;

-- ---------- a conta do acerto (interna): a mesma pra prévia e pro registro ----------
create or replace function public.conta_acerto(p_pessoa uuid, p_banca numeric default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b numeric; banca numeric; m record; mu0 numeric; profit numeric; devolucao numeric; cashout numeric; mk numeric;
        c jsonb; d jsonb; pj numeric; pt numeric; tt numeric;
begin
  b := (public.banca_de(p_pessoa)->>'banca')::numeric;
  banca := round(coalesce(p_banca, b), 2);
  select x.mu, x.lifetime into m from public.mu_de(p_pessoa) x;
  mu0 := greatest(m.mu, 0);
  profit := banca - m.mu;
  devolucao := least(banca, mu0);
  cashout := greatest(banca - mu0, 0);
  mk := greatest(m.mu - banca, 0);
  c := public.contrato_de(p_pessoa);
  if cashout = 0 then
    pj := 0; pt := 0;
  elsif c is not null and c <> 'null'::jsonb then
    d := public.dividir_cashout(c, m.lifetime + profit, cashout);   -- a faixa sai do lifetime do dia (já sacado + profit)
    pj := (d->>'jogador')::numeric; pt := (d->>'time')::numeric;
  end if;
  tt := case when pt is not null then devolucao + pt end;
  return jsonb_build_object('banca_sistema', round(b, 2), 'banca', banca, 'mu', round(m.mu, 2), 'lifetime', round(m.lifetime, 2),
    'profit', round(profit, 2), 'mk_congelado', round(mk, 2), 'devolucao', round(devolucao, 2), 'cashout', round(cashout, 2),
    'parte_jogador', pj, 'parte_time', pt, 'total_time', tt, 'contrato', c, 'divisao', d);
end $$;
revoke all on function public.conta_acerto(uuid, numeric) from public, anon, authenticated;

-- ---------- o que impede a saída agora (interna) ----------
create or replace function public.pendencias_saida(p_pessoa uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when exists (select 1 from public.saque where pessoa_id = p_pessoa and status in ('solicitado','aprovado')) then 'saque pendente' end,
    case when exists (select 1 from public.reload where pessoa_id = p_pessoa and status in ('solicitado','aprovado')) then 'reload pendente' end,
    case when exists (select 1 from public.abertura where pessoa_id = p_pessoa and status = 'enviada') then 'planilha enviada e não conferida' end
  ], null);
$$;
revoke all on function public.pendencias_saida(uuid) from public, anon, authenticated;

-- ---------- prévia: o que a saída vai fazer (quem gere pessoas na reta dele vê antes de confirmar) ----------
-- p_banca: a banca final que quem confere digitou (a conta é refeita aqui, a mesma do registro)
create or replace function public.previa_saida(p_pessoa uuid, p_banca numeric default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pe record; u uuid; dono boolean;
begin
  select * into pe from public.pessoa where id = p_pessoa;
  if pe.id is null or pe.status = 'saiu' then raise exception 'essa pessoa não está no time'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p_pessoa and fim is null;
  if u is null or not public.pode('gerir_pessoas', u) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  dono := exists (select 1 from public.workspace_members m where m.workspace_id = pe.workspace_id and m.user_id = pe.user_id and m.role = 'owner');
  return jsonb_build_object('nome', pe.nome, 'unidade_id', u, 'tem_conta', pe.user_id is not null, 'dono', dono,
    'eu', pe.user_id = auth.uid(), 'pendencias', to_jsonb(public.pendencias_saida(p_pessoa)),
    'entrada', (select min(v.inicio) from public.vinculo v where v.pessoa_id = p_pessoa),
    'acerto', public.conta_acerto(p_pessoa, case when p_banca >= 0 then p_banca end), 'resultado', public.resultado_no_time(p_pessoa),
    'precisa_aprovar_saques', not public.pode('aprovar_saques', u),
    'leva', jsonb_build_object(
      'torneios', (select count(*) from public.tournaments where pessoa_id = p_pessoa),
      'maos', (select count(*) from public.hh_tournament_stats where pessoa_id = p_pessoa),
      'movimentos', (select count(*) from public.bankroll_ledger where pessoa_id = p_pessoa),
      'salas', (select count(*) from public.player_wallets where pessoa_id = p_pessoa)));
end $$;

-- ---------- o histórico detalhado vai pra uma conta individual nova (interna) ----------
create or replace function public.levar_historico_pra_conta(p_pessoa uuid, p_uid uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pe record; arq jsonb; v_nome text; novo uuid; cfg public.pool_config; plano text;
begin
  select * into pe from public.pessoa where id = p_pessoa;
  if exists (select 1 from public.workspace_members where user_id = p_uid) then
    raise exception 'a conta dessa pessoa ainda está em outro lugar: fale com o suporte' using errcode = 'check_violation'; end if;
  -- a conta individual que ele tinha antes de entrar (guardada na entrada), se tinha
  select dados into arq from public.conta_individual_arquivada where user_id = p_uid order by arquivado_em desc limit 1;
  v_nome := left(coalesce(nullif(btrim(arq->'config'->0->>'player1_name'), ''), pe.nome), 60);
  plano := case when arq->'conta'->>'plan' in ('gestao','pro') then arq->'conta'->>'plan' else 'pro' end;
  insert into public.workspaces(name, kind, plan, trial_ends_at)
  values (coalesce(nullif(btrim(arq->'conta'->>'name'), ''), v_nome), 'solo', plano, now() + interval '15 days') returning id into novo;
  insert into public.workspace_members(workspace_id, user_id, role) values (novo, p_uid, 'owner');
  -- configuração: a da conta antiga (se havia), no nome dele, só pra ele
  insert into public.pool_config(workspace_id, player1_name, player2_name, player_pct) values (novo, v_nome, '', 1) returning * into cfg;
  if jsonb_typeof(arq->'config'->0) = 'object' then
    cfg := jsonb_populate_record(cfg, (arq->'config'->0) - 'id' - 'workspace_id' - 'created_at'
                                      || jsonb_build_object('player1_name', v_nome, 'player2_name', '', 'player_pct', 1));
    delete from public.pool_config where id = cfg.id;
    insert into public.pool_config values (cfg.*);
  end if;
  -- o mesmo torneio (ou mão) gravado com variações do nome não pode colidir quando todos ganham o mesmo nome
  delete from public.tournaments a using public.tournaments b
   where a.pessoa_id = p_pessoa and b.pessoa_id = p_pessoa and a.site_tournament_id is not null and a.site = b.site
     and a.site_tournament_id = b.site_tournament_id and a.id < b.id;
  delete from public.hh_tournament_stats a using public.hh_tournament_stats b
   where a.pessoa_id = p_pessoa and b.pessoa_id = p_pessoa and a.site = b.site and a.site_tournament_id = b.site_tournament_id and a.id < b.id;
  delete from public.player_wallets a using public.player_wallets b
   where a.pessoa_id = p_pessoa and b.pessoa_id = p_pessoa and lower(btrim(a.wallet)) = lower(btrim(b.wallet)) and a.id < b.id;
  -- leva (o gatilho tira pessoa e unidade: a conta nova não tem estrutura de time)
  update public.tournaments set workspace_id = novo, player = v_nome where pessoa_id = p_pessoa;
  update public.hh_tournament_stats set workspace_id = novo, player = v_nome where pessoa_id = p_pessoa;
  update public.hh_import_log set workspace_id = novo, player = v_nome where pessoa_id = p_pessoa;
  update public.daily_entries set workspace_id = novo, player = v_nome where pessoa_id = p_pessoa;
  update public.bankroll_ledger set workspace_id = novo, player = v_nome where pessoa_id = p_pessoa;
  update public.player_wallets set workspace_id = novo, player = v_nome where pessoa_id = p_pessoa;
  return novo;
end $$;
revoke all on function public.levar_historico_pra_conta(uuid, uuid) from public, anon, authenticated;

-- ---------- registrar a saída: acerto + fecha o vínculo + o histórico vai com ele ----------
drop function if exists public.registrar_saida(uuid);
create or replace function public.registrar_saida(p_alvo uuid, p_banca numeric default null, p_recebido numeric default null, p_obs text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pe record; u uuid; a jsonb; pend text[]; novo uuid; ac uuid; tem_dinheiro boolean;
begin
  select * into pe from public.pessoa where id = p_alvo for update;
  if pe.id is null or pe.status = 'saiu' then raise exception 'essa pessoa não está no time'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p_alvo and fim is null;
  if u is null or not public.pode('gerir_pessoas', u) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if pe.user_id = auth.uid() then raise exception 'ninguém registra a própria saída' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.workspace_members m where m.workspace_id = pe.workspace_id and m.user_id = pe.user_id and m.role = 'owner') then
    raise exception 'o dono do time não sai por aqui: fale com o suporte' using errcode = 'check_violation'; end if;
  if p_banca is not null and p_banca < 0 then raise exception 'a banca final não pode ser negativa'; end if;
  if p_recebido is not null and p_recebido < 0 then raise exception 'o valor recebido não pode ser negativo'; end if;
  a := public.conta_acerto(p_alvo, p_banca);
  tem_dinheiro := (a->>'banca')::numeric <> 0 or (a->>'mu')::numeric <> 0 or (a->>'lifetime')::numeric <> 0 or p_recebido is not null;
  if tem_dinheiro and not public.pode('aprovar_saques', u) then
    raise exception 'tem dinheiro do time com o jogador: o acerto precisa de "aprovar saques" na reta dele' using errcode = 'insufficient_privilege'; end if;
  pend := public.pendencias_saida(p_alvo);
  if cardinality(pend) > 0 then
    raise exception 'resolva antes da saída: %', array_to_string(pend, ', ') using errcode = 'check_violation'; end if;
  insert into public.acerto_saida(workspace_id, pessoa_id, unidade_id, jogador_user_id, time_nome, entrada, banca_sistema, banca, mu,
                                  lifetime_antes, profit, mk_congelado, devolucao, cashout, parte_jogador, parte_time, total_time, divisao,
                                  resultado, status, recebido, diferenca, recebido_em, obs)
  values (pe.workspace_id, p_alvo, u, pe.user_id, (select w.name from public.workspaces w where w.id = pe.workspace_id),
          (select min(v.inicio) from public.vinculo v where v.pessoa_id = p_alvo),
          (a->>'banca_sistema')::numeric, (a->>'banca')::numeric, (a->>'mu')::numeric, (a->>'lifetime')::numeric, (a->>'profit')::numeric,
          (a->>'mk_congelado')::numeric, (a->>'devolucao')::numeric, (a->>'cashout')::numeric,
          (a->>'parte_jogador')::numeric, (a->>'parte_time')::numeric, (a->>'total_time')::numeric, a->'divisao',
          public.resultado_no_time(p_alvo),
          case when p_recebido is null then 'a_receber' else 'recebido' end, round(p_recebido, 2),
          case when p_recebido is not null and a->>'total_time' is not null then round(p_recebido - (a->>'total_time')::numeric, 2) end,
          case when p_recebido is not null then now() end, nullif(btrim(p_obs), ''))
  returning id into ac;
  -- fecha o vínculo e tira a conta do time
  update public.vinculo set fim = greatest(current_date, inicio) where pessoa_id = p_alvo and fim is null;
  update public.pessoa set status = 'saiu' where id = p_alvo;
  delete from public.acesso where pessoa_id = p_alvo;
  if pe.user_id is not null then
    delete from public.workspace_members where workspace_id = pe.workspace_id and user_id = pe.user_id;
    novo := public.levar_historico_pra_conta(p_alvo, pe.user_id);
    update public.acerto_saida set conta_nova = novo where id = ac;
  end if;
  perform public.avisar_gestores(pe.workspace_id, u, 'aprovar_saques', 'saida', pe.nome || ' saiu do time',
    case when (a->>'mk_congelado')::numeric > 0 then 'Saiu em MK: ' || public.fmt_usd((a->>'mk_congelado')::numeric) || ' congelado no acerto.'
         when a->>'total_time' is not null then 'Time recebe ' || public.fmt_usd((a->>'total_time')::numeric) || ' no acerto.'
         else 'Sem contrato: divida o lucro e confirme o recebido no acerto.' end, ac);
  return ac;
end $$;

-- ---------- quem aprova saques confirma o que o time recebeu do acerto ----------
create or replace function public.confirmar_acerto(p_id uuid, p_recebido numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from public.acerto_saida where id = p_id for update;
  if a.id is null then raise exception 'acerto não encontrado'; end if;
  if not public.pode('aprovar_saques', a.unidade_id) then
    raise exception 'precisa de "aprovar saques" na reta do jogador' using errcode = 'insufficient_privilege'; end if;
  if p_recebido is null or p_recebido < 0 then raise exception 'informe quanto o time recebeu'; end if;
  update public.acerto_saida set status = 'recebido', recebido = round(p_recebido, 2), recebido_em = now(),
         diferenca = case when total_time is not null then round(p_recebido - total_time, 2) end
   where id = p_id returning * into a;
  return jsonb_build_object('recebido', a.recebido, 'total_time', a.total_time, 'diferenca', a.diferenca);
end $$;

do $$
declare f text;
begin
  foreach f in array array['previa_saida(uuid,numeric)','registrar_saida(uuid,numeric,numeric,text)','confirmar_acerto(uuid,numeric)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
