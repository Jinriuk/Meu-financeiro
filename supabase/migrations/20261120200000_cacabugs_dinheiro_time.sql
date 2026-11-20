-- ============================================================
-- Caça-bugs (BUG-1, BUG-2, BUG-4 e a decisão do saque): a conta do dinheiro do aluno do time é UMA, no servidor,
-- e parte de uma FOTO. Idempotente.
--
-- BUG-1 reload/capital mandado subia o MU e não subia a banca: o lucro caía e o aluno aparecia em MK sem estar
--       (reload de 200: lucro de +55 para −145). Agora o aporte entra na banca junto com o MU.
-- BUG-2 a banca não tinha data de corte: saldo inicial + torneio antigo importado contavam duas vezes.
--       A banca parte da FOTO:
--         · com planilha conferida: os saldos da planilha valem ATÉ a data dela (inclusive); conta o que é depois.
--           Quem confere pode mudar a data (padrão: o "atualizado em" da planilha; sem ele, o dia do envio).
--           As salas do aluno passam a ser os saldos da planilha.
--         · sem planilha: o saldo das salas vale desde a entrada no time; conta o que é dessa data em diante (o que é
--           de antes do time fica de fora da banca, como já ficava fora da vista da reta).
--       Dinheiro com hora (aporte e saque pago) conta depois da conferência da planilha, igual ao MU.
-- BUG-4 ABI do gestor (média por torneio) diferente do ABI do aluno (por entrada): agora por entrada, com o buy-in
--       cheio (reentry conta como entrada; bilhete conta o valor do torneio), igual ao app. resumo_time também devolve
--       as entradas, pra média por reta pesar certo.
-- BUG-9 corrigir a planilha depois de conferida regravava a hora da conferência: todo reload e saque feitos entre a
--       primeira conferência e a correção sumiam do MU e do lucro sacado (MU 1.000 + reload 500, corrigido pra 1.100:
--       ficava 1.100 em vez de 1.600). A correção agora muda os valores e mantém o momento da foto.
-- BUG-10 o aluno podia mudar o saldo inicial das salas a qualquer hora. Com o hábito da planilha ("o time mandou 50 de
--       reload, boto 50 de banca na GG"), o reload contava duas vezes (banca 100 com MU 50: profit falso de 50, sacável).
--       O saldo inicial é a foto: depois da planilha conferida, ou do primeiro reload ou saque, o aluno não muda mais
--       (pode criar sala nova com 0); quem aprova saques corrige.
-- Saque: guarda a banca do sistema na hora do pedido, ao lado da banca que o aluno digitou (o gestor vê as duas).
--
--   banca  = salas + resultados e movimentos depois do corte + aportes depois da conferência − saques pagos depois dela
--   MU     = MU da planilha + aportes depois da conferência − devoluções pagas depois dela
--   profit = banca − MU    (reload entra nos dois: o profit não muda)
-- ============================================================

alter table public.abertura add column if not exists data_corte date;
alter table public.saque add column if not exists banca_sistema numeric(12,2);

-- ---------- a foto (interna: não confere quem pergunta) ----------
-- corte: fato com data DEPOIS dele entra na conta · desde: aporte/saque com hora DEPOIS dele entra na conta
create or replace function public.foto_de(p_pessoa uuid, out corte date, out desde timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare ab record;
begin
  select a.status, a.confirmado_em, a.data_corte, a.enviado_em, a.planilha into ab from public.abertura a where a.pessoa_id = p_pessoa;
  if ab.status = 'confirmada' then
    desde := ab.confirmado_em;
    corte := coalesce(ab.data_corte,
                      case when coalesce(ab.planilha->>'atualizado_em', '') ~ '^\d{4}-\d{2}-\d{2}$' then (ab.planilha->>'atualizado_em')::date end,
                      ab.enviado_em::date);
  else
    desde := '-infinity';
    corte := coalesce((select min(v.inicio) from public.vinculo v where v.pessoa_id = p_pessoa) - 1, '-infinity'::date);
  end if;
end $$;

-- MU e lucro já sacado (lifetime) a partir da foto (interna)
create or replace function public.mu_de(p_pessoa uuid, out mu numeric, out lifetime numeric)
language plpgsql stable security definer set search_path = '' as $$
declare ab record; f record;
begin
  select * into f from public.foto_de(p_pessoa);
  select a.mu as mu_planilha, a.cashout as cashout_planilha, a.status into ab from public.abertura a where a.pessoa_id = p_pessoa;
  select coalesce(sum(x.valor), 0) into mu from public.aporte x where x.pessoa_id = p_pessoa and x.criado_em > f.desde;
  select mu - coalesce(sum(q.devolucao), 0), coalesce(sum(q.cashout), 0) into mu, lifetime
    from public.saque q where q.pessoa_id = p_pessoa and q.status = 'pago' and q.pago_em > f.desde;
  if ab.status = 'confirmada' then mu := mu + ab.mu_planilha; lifetime := lifetime + ab.cashout_planilha; end if;
end $$;

-- banca a partir da foto, com as partes (a tela mostra de onde vem cada centavo) (interna)
create or replace function public.banca_de(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f record; salas numeric; res numeric; mov numeric; apo numeric; saq numeric;
begin
  select * into f from public.foto_de(p_pessoa);
  select coalesce(sum(w.saldo_inicial), 0) into salas from public.player_wallets w where w.pessoa_id = p_pessoa;
  select coalesce(sum(t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end), 0)
    into res from public.tournaments t where t.pessoa_id = p_pessoa and t.entry_date > f.corte;
  select coalesce(sum(l.entrada - l.saida), 0) into mov from public.bankroll_ledger l where l.pessoa_id = p_pessoa and l.entry_date > f.corte;
  select coalesce(sum(a.valor), 0) into apo from public.aporte a where a.pessoa_id = p_pessoa and a.criado_em > f.desde;
  select coalesce(sum(q.devolucao + q.cashout), 0) into saq from public.saque q where q.pessoa_id = p_pessoa and q.status = 'pago' and q.pago_em > f.desde;
  return jsonb_build_object('salas', round(salas, 2), 'resultados', round(res, 2), 'movimentos', round(mov, 2),
    'aportes', round(apo, 2), 'saques', round(saq, 2), 'banca', round(salas + res + mov + apo - saq, 2),
    'corte', case when f.corte = '-infinity'::date then null else f.corte end);
end $$;
revoke all on function public.foto_de(uuid) from public, anon, authenticated;
revoke all on function public.mu_de(uuid) from public, anon, authenticated;
revoke all on function public.banca_de(uuid) from public, anon, authenticated;

-- ---------- situação do jogador: MU, lucro sacado, contrato e agora a BANCA (a mesma conta pra todo mundo) ----------
create or replace function public.situacao_jogador(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pes record; u uuid; m record; b jsonb; st text;
begin
  select * into pes from public.pessoa where id = p_pessoa;
  if pes.id is null then raise exception 'pessoa não existe'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p_pessoa and fim is null;
  if not (pes.user_id = auth.uid() or (u is not null and public.pode('ver_financeiro', u))) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select * into m from public.mu_de(p_pessoa);
  b := public.banca_de(p_pessoa);
  select a.status into st from public.abertura a where a.pessoa_id = p_pessoa;
  return jsonb_build_object('mu', m.mu, 'lifetime', m.lifetime, 'contrato', public.contrato_de(p_pessoa), 'unidade_id', u,
                            'abertura', coalesce(st, 'sem'), 'banca', (b->>'banca')::numeric, 'banca_partes', b);
end $$;

-- ---------- MK: banca abaixo do MU, pela mesma conta (interna) ----------
create or replace function public.em_mk(p_pessoa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select round((public.banca_de(p_pessoa)->>'banca')::numeric, 2) < round((select m.mu from public.mu_de(p_pessoa) m), 2);
$$;
revoke all on function public.em_mk(uuid) from public, anon, authenticated;

-- ---------- visão do time: ABI por entrada, entradas, e banca/MU pela mesma conta ----------
drop function if exists public.resumo_time(date);
create function public.resumo_time(p_desde date default null)
returns table(pessoa_id uuid, nome text, unidade_id uuid, unidade text, caminho text, status text,
              torneios int, entradas int, investido numeric, lucro numeric, roi numeric, abi numeric, ultimo_lancamento date,
              banca numeric, mu numeric, lucro_sacado numeric, planilha text)
language plpgsql stable security definer set search_path = '' as $$
declare r record; perf boolean; din boolean; m record;
begin
  for r in
    select p.id, p.nome, p.status, p.user_id, v.unidade_id, u.nome as unome, u.caminho
      from public.pessoa p
      join public.vinculo v on v.pessoa_id = p.id and v.fim is null
      join public.unidade u on u.id = v.unidade_id
     where p.status <> 'saiu' and p.workspace_id in (select public.my_workspaces())
  loop
    perf := r.user_id = auth.uid() or public.pode('ver_desempenho', r.unidade_id);
    din  := r.user_id = auth.uid() or public.pode('ver_financeiro', r.unidade_id);
    continue when not (perf or din);
    pessoa_id := r.id; nome := r.nome; unidade_id := r.unidade_id; unidade := r.unome; caminho := r.caminho; status := r.status;
    torneios := null; entradas := null; investido := null; lucro := null; roi := null; abi := null; ultimo_lancamento := null;
    banca := null; mu := null; lucro_sacado := null; planilha := null;
    if perf then
      -- ABI = buy-in cheio / entradas (reentry conta como entrada; bilhete conta o valor do torneio): o mesmo do app
      select count(*)::int, coalesce(sum(1 + coalesce(t.reentries, 0)), 0)::int,
             round(coalesce(sum(case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end), 0), 2),
             round(coalesce(sum(t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end), 0), 2),
             round(sum(t.buyin * (1 + coalesce(t.reentries, 0))) / nullif(sum(1 + coalesce(t.reentries, 0)), 0), 2),
             max(t.entry_date)
        into torneios, entradas, investido, lucro, abi, ultimo_lancamento
        from public.tournaments t where t.pessoa_id = r.id and (p_desde is null or t.entry_date >= p_desde);
      roi := case when investido > 0 then round(lucro / investido * 100, 1) end;
      if p_desde is not null then
        select max(t.entry_date) into ultimo_lancamento from public.tournaments t where t.pessoa_id = r.id;
      end if;
    end if;
    if din then
      select x.mu, x.lifetime into m from public.mu_de(r.id) x;
      mu := m.mu; lucro_sacado := m.lifetime;
      banca := (public.banca_de(r.id)->>'banca')::numeric;
      planilha := coalesce((select a.status from public.abertura a where a.pessoa_id = r.id), 'sem');
    end if;
    return next;
  end loop;
end $$;
revoke all on function public.resumo_time(date) from public, anon;
grant execute on function public.resumo_time(date) to authenticated;

-- ---------- conferência da planilha: com a data dos saldos; as salas do aluno viram os saldos da planilha ----------
drop function if exists public.conferir_abertura(uuid, numeric, numeric);
create or replace function public.conferir_abertura(p_pessoa uuid, p_mu numeric, p_cashout numeric, p_corte date default null) returns void
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
  if p_corte is not null and p_corte > current_date then raise exception 'a data dos saldos não pode ser no futuro'; end if;
  update public.abertura set status = 'confirmada', mu = round(p_mu, 2), cashout = round(p_cashout, 2),
         data_corte = coalesce(p_corte,
                               case when coalesce(planilha->>'atualizado_em', '') ~ '^\d{4}-\d{2}-\d{2}$' then (planilha->>'atualizado_em')::date end,
                               enviado_em::date),
         -- corrigir não muda o momento da foto: o que entrou e saiu depois da 1ª conferência continua contando (BUG-9)
         confirmado_por = case when a.status = 'confirmada' then a.confirmado_por else auth.uid() end,
         confirmado_em = case when a.status = 'confirmada' then a.confirmado_em else now() end where id = a.id;
  -- salas do aluno = os saldos da planilha (a foto): atualiza as que ele já tem, cria as que faltam
  select pe.nome into nome from public.pessoa pe where pe.id = p_pessoa;
  if jsonb_typeof(a.planilha->'saldos') = 'array' then
    for s in select x from jsonb_array_elements(a.planilha->'saldos') x loop
      continue when coalesce(btrim(s->>'sala'), '') = '';
      update public.player_wallets w set saldo_inicial = round(coalesce((s->>'saldo')::numeric, 0), 2)
       where w.workspace_id = a.workspace_id and lower(btrim(w.player)) = lower(btrim(nome)) and lower(btrim(w.wallet)) = lower(btrim(s->>'sala'));
      if not found and coalesce((s->>'saldo')::numeric, 0) > 0 then
        insert into public.player_wallets(workspace_id, player, wallet, saldo_inicial)
        values (a.workspace_id, nome, btrim(s->>'sala'), round((s->>'saldo')::numeric, 2));
      end if;
    end loop;
  end if;
end $$;
revoke all on function public.conferir_abertura(uuid,numeric,numeric,date) from public, anon;
grant execute on function public.conferir_abertura(uuid,numeric,numeric,date) to authenticated;

-- ---------- pedido de saque: guarda também a banca do sistema na hora ----------
create or replace function public.solicitar_saque(p_banca numeric, p_devolucao numeric, p_cashout numeric, p_carteiras jsonb default null, p_obs text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p uuid; ws uuid; u uuid; sim jsonb; novo uuid;
begin
  select pe.id, pe.workspace_id into p, ws from public.pessoa pe
   where pe.user_id = auth.uid() and pe.status = 'ativo'
     and exists (select 1 from public.vinculo v where v.pessoa_id = pe.id and v.fim is null) limit 1;
  if p is null then raise exception 'só quem joga no time pede saque' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.saque where pessoa_id = p and status in ('solicitado','aprovado')) then
    raise exception 'já existe um saque em aberto'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p and fim is null;
  sim := public.simular_saque(p, p_banca, p_devolucao, p_cashout);
  insert into public.saque(workspace_id, pessoa_id, unidade_id, banca, banca_sistema, carteiras, mu_antes, lifetime_antes, devolucao, cashout,
                           parte_jogador, parte_time, total_time, divisao, banca_depois, observacao)
  values (ws, p, u, p_banca, (public.banca_de(p)->>'banca')::numeric, p_carteiras, (sim->>'mu_antes')::numeric, (sim->>'lifetime_antes')::numeric,
          (sim->>'devolucao')::numeric, (sim->>'cashout')::numeric, (sim->>'parte_jogador')::numeric, (sim->>'parte_time')::numeric,
          (sim->>'total_time')::numeric, sim->'divisao', (sim->>'banca_depois')::numeric, p_obs)
  returning id into novo;
  return novo;
end $$;
revoke all on function public.solicitar_saque(numeric,numeric,numeric,jsonb,text) from public, anon;
grant execute on function public.solicitar_saque(numeric,numeric,numeric,jsonb,text) to authenticated;

-- ---------- salas: o saldo inicial é a foto; depois do 1º dinheiro do time, o aluno não mexe (BUG-10) ----------
-- Roda depois do zz_fato_pessoa (ordem alfabética dos gatilhos BEFORE), quando a pessoa da linha já está resolvida.
create or replace function public.trava_sala() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p uuid := case when tg_op = 'DELETE' then old.pessoa_id else new.pessoa_id end;
begin
  if p is null or not exists (select 1 from public.pessoa x where x.id = p and x.user_id = auth.uid()) then
    return case when tg_op = 'DELETE' then old else new end;          -- quem não é o próprio aluno segue as regras de sempre
  end if;
  if exists (select 1 from public.abertura a where a.pessoa_id = p and a.status = 'confirmada')
     or exists (select 1 from public.aporte a where a.pessoa_id = p)
     or exists (select 1 from public.saque q where q.pessoa_id = p and q.status = 'pago') then
    if (tg_op = 'INSERT' and coalesce(new.saldo_inicial, 0) <> 0)
       or (tg_op = 'UPDATE' and new.saldo_inicial is distinct from old.saldo_inicial)
       or (tg_op = 'DELETE' and coalesce(old.saldo_inicial, 0) <> 0) then
      raise exception 'o saldo inicial das salas é a foto (planilha conferida ou o que você tinha ao entrar no time) e não muda depois que o time mandou ou recebeu dinheiro: reload entra sozinho na banca. Pra corrigir, fale com quem aprova os saques.'
        using errcode = 'check_violation';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.trava_sala() from public, anon, authenticated;
drop trigger if exists zzz_trava_sala on public.player_wallets;
create trigger zzz_trava_sala before insert or update or delete on public.player_wallets for each row execute function public.trava_sala();

