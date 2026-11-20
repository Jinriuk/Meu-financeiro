-- ============================================================
-- O histórico de antes do time fica só com o jogador (decisão do dono, 20/11). Idempotente.
--
-- Antes: torneio, mão, movimento e saque de quem ainda não estava no time (conta individual que virou do time, ou
-- arquivo antigo importado depois de entrar) ficava na RAIZ, e o admin e quem tem permissão no time inteiro viam.
-- Agora:
--   · fato de uma pessoa numa data em que ela não tinha vínculo com o time fica SEM unidade: só o próprio jogador vê.
--     Continua fora da banca do time e sai também das contas da gestão (resumo_time);
--   · fato sem pessoa (ex.: movimento "Pool / Reserva") continua na raiz: só a gestão do time inteiro vê;
--   · a entrada no time é o dia do aceite do convite. Antes era o dia em que o gestor criou o convite, e o que o
--     jogador fez na conta individual nesse meio-tempo contava como do time (na banca, inclusive);
--   · planilha conferida com saldos de ANTES da entrada: a planilha mostra que o jogador já jogava com o dinheiro do
--     time, então a entrada recua pro dia seguinte ao dos saldos e o que ele jogou depois disso passa a ser do time (a
--     banca já contava; agora a gestão também vê). O recuo vai no máximo até a data da própria planilha: quem confere
--     não puxa histórico mais antigo do que o jogador mandou;
--   · fato de dentro do time que ficou na raiz (quem esperou a reta na raiz) passa a ser visto por quem cuida do aluno
--     hoje, como o resto do histórico dele no time (BUG-7).
-- ============================================================

-- ---------- a unidade do fato: a do vínculo na data; pessoa sem vínculo na data → nenhuma; fato sem pessoa → raiz ----------
create or replace function public.unidade_na_data(p uuid, d date, ws uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when p is null
    then (select u.id from public.unidade u where u.workspace_id = ws and u.mae_id is null order by u.criado_em limit 1)
    else (select v.unidade_id from public.vinculo v
           where v.pessoa_id = p and v.inicio <= d and (v.fim is null or v.fim >= d)
           order by v.inicio desc, v.criado_em desc limit 1)
  end;
$$;
revoke all on function public.unidade_na_data(uuid, date, uuid) from public, anon, authenticated;

-- ---------- fatos que já estão na raiz sem vínculo na data: recalcula (o gatilho tira a unidade) ----------
do $$
declare p uuid;
begin
  for p in
    select distinct x.pessoa_id from (
      select pessoa_id, unidade_id, entry_date::date d from public.tournaments
      union all select pessoa_id, unidade_id, entry_date::date from public.hh_tournament_stats
      union all select pessoa_id, unidade_id, entry_date::date from public.daily_entries
      union all select pessoa_id, unidade_id, created_at::date from public.hh_import_log
      union all select pessoa_id, unidade_id, entry_date::date from public.bankroll_ledger
      union all select pessoa_id, unidade_id, week_ending_date::date from public.withdrawals
      union all select pessoa_id, unidade_id, current_date from public.player_wallets
    ) x
    where x.pessoa_id is not null and x.unidade_id is not null
      and not exists (select 1 from public.vinculo v where v.pessoa_id = x.pessoa_id and v.inicio <= x.d and (v.fim is null or v.fim >= x.d))
  loop
    perform public.recalcular_fatos(p);
  end loop;
end $$;

-- ---------- policies dos fatos: o histórico do aluno no time é o que tem unidade (o de antes do time não tem) ----------
do $$
declare r record; ler text; gravar text;
begin
  for r in select * from (values
      ('tournaments','ver_desempenho','administrar'),
      ('hh_tournament_stats','ver_desempenho','administrar'),
      ('daily_entries','ver_desempenho','administrar'),
      ('hh_import_log','ver_desempenho','administrar'),
      ('bankroll_ledger','ver_financeiro','aprovar_saques'),
      ('withdrawals','ver_financeiro','aprovar_saques'),
      ('player_wallets','ver_financeiro','aprovar_saques')
    ) as t(tabela, cap_ler, cap_gravar)
  loop
    continue when to_regclass('public.' || r.tabela) is null;
    ler := format($c$workspace_id in (select public.my_workspaces())
      and (workspace_id not in (select public.ws_estruturados())
           or pessoa_id in (select public.minhas_pessoas())
           or unidade_id in (select public.unidades_com(%1$L))
           or (unidade_id is not null and pessoa_id in (select public.pessoas_com(%1$L))))$c$, r.cap_ler);
    gravar := format($c$workspace_id in (select public.my_workspaces())
      and (workspace_id not in (select public.ws_estruturados())
           or pessoa_id in (select public.minhas_pessoas())
           or unidade_id in (select public.unidades_com(%1$L))
           or (unidade_id is not null and pessoa_id in (select public.pessoas_com(%1$L))))$c$, r.cap_gravar);
    execute format('drop policy if exists fato_ler on public.%I', r.tabela);
    execute format('drop policy if exists fato_inserir on public.%I', r.tabela);
    execute format('drop policy if exists fato_editar on public.%I', r.tabela);
    execute format('drop policy if exists fato_apagar on public.%I', r.tabela);
    execute format('create policy fato_ler on public.%I for select to authenticated using (%s)', r.tabela, ler);
    execute format('create policy fato_inserir on public.%I for insert to authenticated with check (%s)', r.tabela, gravar);
    execute format('create policy fato_editar on public.%I for update to authenticated using (%s) with check (%s)', r.tabela, ler, gravar);
    execute format('create policy fato_apagar on public.%I for delete to authenticated using (%s)', r.tabela, gravar);
  end loop;
end $$;
-- a raiz deixou de guardar o histórico de antes do time: o filtro "fora da raiz" não é mais usado
drop function if exists public.unidades_internas();

-- ---------- visão do time: desempenho só do que é de dentro do time ----------
create or replace function public.resumo_time(p_desde date default null)
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
      -- ABI = buy-in cheio / entradas (reentry conta como entrada; bilhete conta o valor do torneio): o mesmo do app.
      -- Só o que é de dentro do time (tem unidade): o histórico de antes da entrada é só do jogador.
      select count(*)::int, coalesce(sum(1 + coalesce(t.reentries, 0)), 0)::int,
             round(coalesce(sum(case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end), 0), 2),
             round(coalesce(sum(t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end), 0), 2),
             round(sum(t.buyin * (1 + coalesce(t.reentries, 0))) / nullif(sum(1 + coalesce(t.reentries, 0)), 0), 2),
             max(t.entry_date)
        into torneios, entradas, investido, lucro, abi, ultimo_lancamento
        from public.tournaments t
       where t.pessoa_id = r.id and t.unidade_id is not null and (p_desde is null or t.entry_date >= p_desde);
      roi := case when investido > 0 then round(lucro / investido * 100, 1) end;
      if p_desde is not null then
        select max(t.entry_date) into ultimo_lancamento from public.tournaments t where t.pessoa_id = r.id and t.unidade_id is not null;
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

-- ---------- conferência da planilha: saldos de antes da entrada antecipam a entrada (até a data da planilha) ----------
create or replace function public.conferir_abertura(p_pessoa uuid, p_mu numeric, p_cashout numeric, p_corte date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a record; nome text; s jsonb; declarada date; c date; entrada date; primeiro uuid;
begin
  select * into a from public.abertura where pessoa_id = p_pessoa for update;
  if a.id is null then raise exception 'esse jogador não enviou planilha'; end if;
  if not public.pode('aprovar_saques', a.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = p_pessoa and user_id = auth.uid()) then
    raise exception 'ninguém confere a própria planilha' using errcode = 'insufficient_privilege'; end if;
  if p_mu is null or p_cashout is null or p_mu < 0 or p_cashout < 0 then raise exception 'MU e cashout precisam ser de 0 pra cima'; end if;
  if p_corte is not null and p_corte > current_date then raise exception 'a data dos saldos não pode ser no futuro'; end if;
  -- a data que o jogador mandou: o "atualizado em" da planilha; sem ele, o dia do envio
  declarada := coalesce(case when coalesce(a.planilha->>'atualizado_em', '') ~ '^\d{4}-\d{2}-\d{2}$' then (a.planilha->>'atualizado_em')::date end,
                        a.enviado_em::date);
  c := coalesce(p_corte, declarada);
  select v.id, v.inicio into primeiro, entrada from public.vinculo v where v.pessoa_id = p_pessoa order by v.inicio, v.criado_em limit 1;
  if entrada is not null and c < entrada - 1 and c < declarada then
    raise exception 'a data dos saldos não pode ser antes de % (a data da planilha que o jogador mandou)', to_char(least(declarada, entrada - 1), 'DD/MM/YYYY')
      using errcode = 'check_violation'; end if;
  update public.abertura set status = 'confirmada', mu = round(p_mu, 2), cashout = round(p_cashout, 2), data_corte = c,
         -- corrigir não muda o momento da foto: o que entrou e saiu depois da 1ª conferência continua contando (BUG-9)
         confirmado_por = case when a.status = 'confirmada' then a.confirmado_por else auth.uid() end,
         confirmado_em = case when a.status = 'confirmada' then a.confirmado_em else now() end where id = a.id;
  -- saldos de antes da entrada: ele já jogava pelo time desde o dia seguinte ao dos saldos
  if entrada is not null and c < entrada - 1 then
    update public.vinculo set inicio = c + 1 where id = primeiro;
    perform public.recalcular_fatos(p_pessoa);
  end if;
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

-- ---------- convite: a entrada no time é o dia do aceite ----------
create or replace function public.aceitar_convite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c record; uid uuid := auth.uid(); p uuid; v_nome text;
begin
  if uid is null then raise exception 'entre na sua conta pra aceitar o convite' using errcode = 'insufficient_privilege'; end if;
  select cv.*, u.arquivada into c from public.convite cv join public.unidade u on u.id = cv.unidade_id
   where cv.token_hash = public.convite_hash(p_token) for update of cv;
  if c.id is null or c.revogado or c.arquivada or c.expira_em <= now() or (c.usos_max is not null and c.usos >= c.usos_max) then
    raise exception 'Convite inválido, vencido ou já usado. Peça um link novo pro gestor.'; end if;
  if exists (select 1 from public.pessoa where workspace_id = c.workspace_id and user_id = uid and status <> 'saiu') then
    raise exception 'Você já faz parte deste time.'; end if;
  -- quem já passou pelo time e volta: o registro antigo fica com o histórico, sem a conta
  update public.pessoa set user_id = null where workspace_id = c.workspace_id and user_id = uid and status = 'saiu';
  if c.pessoa_id is not null then
    update public.pessoa set user_id = uid, status = 'ativo'
     where id = c.pessoa_id and user_id is null and status = 'convidado' returning id into p;
    if p is null then raise exception 'Esse convite não vale mais. Peça um link novo pro gestor.'; end if;
    -- o vínculo nasceu com o convite; a entrada de fato é hoje (o que ele fez antes, na conta dele, é só dele)
    update public.vinculo v set inicio = current_date
     where v.pessoa_id = p and v.fim is null and v.inicio < current_date
       and not exists (select 1 from public.vinculo o where o.pessoa_id = p and o.id <> v.id);
    if found then perform public.recalcular_fatos(p); end if;
  else
    v_nome := left(coalesce(nullif(btrim((select nickname from public.player_profiles where user_id = uid)), ''), 'Jogador'), 50);
    if exists (select 1 from public.pessoa where workspace_id = c.workspace_id and status <> 'saiu' and lower(btrim(nome)) = lower(v_nome)) then
      v_nome := v_nome || ' #' || left(replace(uid::text, '-', ''), 4);
    end if;
    insert into public.pessoa(workspace_id, user_id, nome, status) values (c.workspace_id, uid, v_nome, 'ativo') returning id into p;
    insert into public.vinculo(pessoa_id, unidade_id, motivo) values (p, c.unidade_id, 'entrada');
  end if;
  perform public.levar_conta_pro_time(uid, c.workspace_id, p);   -- conta individual vira do time (ou recusa, explicando)
  insert into public.workspace_members(workspace_id, user_id, role) values (c.workspace_id, uid, 'member') on conflict do nothing;
  update public.convite set usos = usos + 1 where id = c.id;
  update public.pedido_entrada set status = 'cancelado', decidido_em = now() where user_id = uid and status = 'pendente';
  return p;
end $$;
revoke all on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;

-- ---------- conta individual que vira do time: o comentário passa a dizer o que acontece com o histórico ----------
create or replace function public.levar_conta_pro_time(p_uid uuid, p_ws uuid, p_pessoa uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare w record; v_nome text;
begin
  select nome into v_nome from public.pessoa where id = p_pessoa and workspace_id = p_ws;
  if v_nome is null then raise exception 'pessoa do time não encontrada'; end if;
  for w in select x.* from public.workspaces x join public.workspace_members m on m.workspace_id = x.id
            where m.user_id = p_uid and x.id <> p_ws loop
    if w.kind <> 'solo' or exists (select 1 from public.workspace_members m2 where m2.workspace_id = w.id and m2.user_id <> p_uid) then
      raise exception 'Tua conta já está em outro time. Por enquanto uma conta fica em um time só: saia do outro time ou entre com outro e-mail.'
        using errcode = 'check_violation'; end if;
    if w.trial_ends_at is null then
      raise exception 'Tua conta individual tem plano pago ativo. Fale com o suporte antes de entrar no time, pra não perder o que você pagou.'
        using errcode = 'check_violation'; end if;
    insert into public.conta_individual_arquivada(user_id, workspace_id, time_id, dados)
    values (p_uid, w.id, p_ws, jsonb_build_object('conta', to_jsonb(w),
      'config', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.pool_config c where c.workspace_id = w.id),
      'salas', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.player_wallets s where s.workspace_id = w.id),
      'ajustes', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.config_changes a where a.workspace_id = w.id)));
    -- mãos/torneio repetidos (mesma sala e id) não podem colidir na chave única quando ganham o mesmo nome
    delete from public.hh_tournament_stats a using public.hh_tournament_stats b
     where a.workspace_id = w.id and b.workspace_id = w.id and a.site = b.site and a.site_tournament_id = b.site_tournament_id and a.id < b.id;
    delete from public.hh_tournament_stats a where a.workspace_id = w.id and exists (select 1 from public.hh_tournament_stats b
      where b.workspace_id = p_ws and b.player = v_nome and b.site = a.site and b.site_tournament_id = a.site_tournament_id);
    delete from public.tournaments a using public.tournaments b
     where a.workspace_id = w.id and b.workspace_id = w.id and a.site_tournament_id is not null and a.site = b.site
       and a.site_tournament_id = b.site_tournament_id and a.id < b.id;
    delete from public.tournaments a where a.workspace_id = w.id and a.site_tournament_id is not null and exists (select 1 from public.tournaments b
      where b.workspace_id = p_ws and b.player = v_nome and b.site = a.site and b.site_tournament_id = a.site_tournament_id);
    -- o histórico vai pro time; o gatilho liga cada linha à pessoa e à unidade da data (antes da entrada: sem unidade, só o jogador vê)
    update public.tournaments set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    update public.hh_tournament_stats set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    update public.hh_import_log set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    update public.daily_entries set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    update public.bankroll_ledger set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    update public.withdrawals set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    -- o resto era da conta individual: guardado acima, sai daqui
    delete from public.player_wallets where workspace_id = w.id;
    delete from public.config_changes where workspace_id = w.id;
    delete from public.pool_config where workspace_id = w.id;
    delete from public.workspace_members where workspace_id = w.id;
    delete from public.workspaces where id = w.id;
  end loop;
end $$;
revoke all on function public.levar_conta_pro_time(uuid,uuid,uuid) from public, anon, authenticated;
