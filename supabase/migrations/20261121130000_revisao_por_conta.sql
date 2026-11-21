-- ============================================================
-- Ajustes da revisão por conta (Samba Demo, 21/11). Idempotente. Não apaga dado do time (só avisos que já foram
-- resolvidos ou repetidos).
--   · A-006: o time renomeia só quem ainda é convidado (sem conta). O nome de quem já tem conta é dele (regra do dono:
--     só o aluno mexe na conta dele): ele mesmo muda;
--   · A-014/A-055: situacao_jogador traz o saque e o reload em aberto (o Início mostra "aguardando aprovação");
--   · A-051/A-052: …e quando a planilha foi enviada e a banca que ela declara (o Início mostra "aguardando conferir");
--   · A-050: …e, quando pedida, a banca no começo da semana: a base do stop loss semanal (antes era a banca de agora,
--     que cai depois de um saque e fazia o stop "estourar" sem ser verdade);
--   · A-022/A-013: aviso de saque com a divisão (jogador e time) e "MU" no aviso da planilha;
--   · A-046/A-021: o aviso de um pedido (planilha, saque, reload) some quando o pedido é resolvido; mandar a planilha de
--     novo troca o aviso em vez de repetir;
--   · A-062: o jogador recebe aviso quando o time registra capital pra ele.
-- ============================================================

-- ---------- A-006: renomear só convidado ----------
create or replace function public.renomear_pessoa(p_alvo uuid, p_nome text) returns void
language plpgsql security definer set search_path = '' as $$
declare pes record; v_nome text := left(btrim(coalesce(p_nome, '')), 60); u uuid; t text;
begin
  select * into pes from public.pessoa where id = p_alvo;
  if pes.id is null or pes.status = 'saiu' then raise exception 'pessoa não está no time'; end if;
  if v_nome = '' then raise exception 'nome vazio'; end if;
  if pes.user_id is null or pes.user_id is distinct from auth.uid() then   -- a própria pessoa muda o nome dela sem pedir
    select unidade_id into u from public.vinculo where pessoa_id = p_alvo and fim is null;
    if not (public.pode('administrar', public.raiz_do_ws(pes.workspace_id)) or (u is not null and public.pode('gerir_pessoas', u))) then
      raise exception 'sem permissão pra renomear' using errcode = 'insufficient_privilege'; end if;
    if pes.user_id is not null then
      raise exception 'o nome de quem já tem conta é dele: só ele muda. O time renomeia só quem ainda é convidado' using errcode = 'insufficient_privilege'; end if;
  end if;
  if v_nome = pes.nome then return; end if;
  begin
    update public.pessoa set nome = v_nome where id = p_alvo;
  exception when unique_violation then
    raise exception 'já tem alguém com o nome "%" no time', v_nome;
  end;
  -- os lançamentos se ligam à pessoa pelo nome: acompanham a troca (o gatilho religa à mesma pessoa)
  for t in select c.table_name::text from information_schema.columns c
            where c.table_schema = 'public' and c.column_name = 'player'
              and c.table_name in ('tournaments','hh_tournament_stats','daily_entries','hh_import_log','bankroll_ledger','withdrawals','player_wallets')
              and exists (select 1 from information_schema.columns c2 where c2.table_schema = 'public'
                           and c2.table_name = c.table_name and c2.column_name = 'pessoa_id') loop
    execute format('update public.%I set player = $1 where pessoa_id = $2 and player is distinct from $1', t) using v_nome, p_alvo;
  end loop;
end $$;

-- ---------- A-050: a banca de um jogador no começo de um dia (fatos de antes dele), respeitando a foto ----------
create or replace function public.banca_na_data(p_pessoa uuid, p_data date) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare f record; salas numeric; res numeric; mov numeric; apo numeric; saq numeric;
begin
  select * into f from public.foto_de(p_pessoa);
  select coalesce(sum(w.saldo_inicial), 0) into salas from public.player_wallets w where w.pessoa_id = p_pessoa;
  if f.corte <> '-infinity'::date and p_data <= f.corte + 1 then return round(salas, 2); end if;   -- começou antes da foto: a base é a foto
  select coalesce(sum(t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end), 0)
    into res from public.tournaments t where t.pessoa_id = p_pessoa and t.entry_date > f.corte and t.entry_date < p_data;
  select coalesce(sum(l.entrada - l.saida), 0) into mov from public.bankroll_ledger l
   where l.pessoa_id = p_pessoa and l.entry_date > f.corte and l.entry_date < p_data;
  select coalesce(sum(a.valor), 0) into apo from public.aporte a where a.pessoa_id = p_pessoa and a.criado_em > f.desde and a.data < p_data;
  select coalesce(sum(q.devolucao + q.cashout), 0) into saq from public.saque q
   where q.pessoa_id = p_pessoa and q.status = 'pago' and q.pago_em > f.desde and q.pago_em < p_data::timestamptz;
  return round(salas + res + mov + apo - saq, 2);
end $$;
revoke all on function public.banca_na_data(uuid, date) from public, anon, authenticated;

-- ---------- A-014/A-051/A-052/A-055/A-050: o que o Início do jogador precisa ----------
drop function if exists public.situacao_jogador(uuid);
create or replace function public.situacao_jogador(p_pessoa uuid, p_inicio_semana date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pes record; u uuid; m record; b jsonb; ab record; saq jsonb; rel jsonb;
begin
  select * into pes from public.pessoa where id = p_pessoa;
  if pes.id is null then raise exception 'pessoa não existe'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p_pessoa and fim is null;
  if not (pes.user_id = auth.uid() or (u is not null and public.pode('ver_financeiro', u))) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select * into m from public.mu_de(p_pessoa);
  b := public.banca_de(p_pessoa);
  select a.status, a.enviado_em, a.planilha into ab from public.abertura a where a.pessoa_id = p_pessoa;
  select jsonb_build_object('status', q.status, 'cashout', q.cashout, 'devolucao', q.devolucao, 'total_time', q.total_time,
                            'parte_jogador', q.parte_jogador, 'solicitado_em', q.solicitado_em)
    into saq from public.saque q where q.pessoa_id = p_pessoa and q.status in ('solicitado', 'aprovado') order by q.solicitado_em desc limit 1;
  select jsonb_build_object('status', r.status, 'valor', r.valor, 'sala', r.sala, 'solicitado_em', r.solicitado_em)
    into rel from public.reload r where r.pessoa_id = p_pessoa and r.status in ('solicitado', 'aprovado') order by r.solicitado_em desc limit 1;
  return jsonb_build_object('mu', m.mu, 'lifetime', m.lifetime, 'contrato', public.contrato_de(p_pessoa), 'unidade_id', u,
                            'abertura', coalesce(ab.status, 'sem'), 'banca', (b->>'banca')::numeric, 'banca_partes', b,
                            'abertura_enviada_em', case when ab.status = 'enviada' then ab.enviado_em end,
                            'abertura_banca', case when ab.status = 'enviada' and jsonb_typeof(ab.planilha->'banca') = 'number' then ab.planilha->'banca' end,
                            'saque_aberto', saq, 'reload_aberto', rel,
                            'banca_inicio_semana', case when p_inicio_semana is not null then public.banca_na_data(p_pessoa, p_inicio_semana) end);
end $$;
revoke all on function public.situacao_jogador(uuid, date) from public, anon;
grant execute on function public.situacao_jogador(uuid, date) to authenticated;

-- ---------- A-022/A-013/A-046: avisos de saque e de planilha ----------
create or replace function public.aviso_saque() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nome text;
begin
  select pe.nome into nome from public.pessoa pe where pe.id = new.pessoa_id;
  if tg_op = 'INSERT' then
    perform public.avisar_gestores(new.workspace_id, new.unidade_id, 'aprovar_saques', 'saque', nome || ' pediu saque',
      case when coalesce(new.devolucao, 0) > 0 then 'Devolve ' || public.fmt_usd(new.devolucao) || ' de MU. ' else '' end
      || 'Cashout ' || public.fmt_usd(new.cashout) || ': jogador ' || public.fmt_usd(new.parte_jogador)
      || ' · time ' || public.fmt_usd(new.parte_time)
      || '. O time recebe ' || public.fmt_usd(new.total_time) || '.', new.id);
  elsif new.status is distinct from old.status and new.status in ('aprovado','recusado','pago') then
    perform public.avisar_pessoa(new.pessoa_id, 'saque',
      case new.status when 'aprovado' then 'Saque aprovado' when 'recusado' then 'Saque recusado' else 'Saque confirmado pelo time' end,
      case new.status when 'aprovado' then 'Pode mandar ' || public.fmt_usd(new.total_time) || ' pro time.'
                      when 'recusado' then new.motivo
                      else case when coalesce(new.diferenca, 0) = 0 then 'Recebido certinho.' else 'Recebido com diferença de ' || public.fmt_usd(new.diferenca) || '.' end end,
      new.id);
  end if;
  return null;
end $$;

create or replace function public.aviso_abertura() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nome text;
begin
  select pe.nome into nome from public.pessoa pe where pe.id = new.pessoa_id;
  if new.status = 'enviada' and (tg_op = 'INSERT' or new.enviado_em is distinct from old.enviado_em or new.planilha is distinct from old.planilha) then
    -- mandou de novo: o aviso anterior sai (fica só o da versão nova)
    delete from public.aviso where ref_id = new.id and tipo = 'planilha' and titulo like '% enviou a planilha%';
    perform public.avisar_gestores(new.workspace_id, new.unidade_id, 'aprovar_saques', 'planilha', nome || ' enviou a planilha pra conferir',
      'MU ' || public.fmt_usd(new.mu) || ' · cashout ' || public.fmt_usd(new.cashout), new.id);
  elsif tg_op = 'UPDATE' and new.status = 'confirmada' and old.status <> 'confirmada' then
    delete from public.aviso where ref_id = new.id and tipo = 'planilha' and titulo like '% enviou a planilha%';   -- resolvido
    perform public.avisar_pessoa(new.pessoa_id, 'planilha', 'Planilha conferida pelo time', null, new.id);
  end if;
  return null;
end $$;

-- pedido de saque ou reload decidido: o aviso "fulano pediu" sai do sininho de quem decide
create or replace function public.limpa_aviso_pedido() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'solicitado' and new.status is distinct from 'solicitado' then
    delete from public.aviso where ref_id = new.id and tipo = tg_argv[0] and titulo like '% pediu ' || tg_argv[0] || '%';
  end if;
  return null;
end $$;
revoke all on function public.limpa_aviso_pedido() from public, anon, authenticated;
drop trigger if exists limpa_aviso_pedido on public.saque;
create trigger limpa_aviso_pedido after update of status on public.saque for each row execute function public.limpa_aviso_pedido('saque');
drop trigger if exists limpa_aviso_pedido on public.reload;
create trigger limpa_aviso_pedido after update of status on public.reload for each row execute function public.limpa_aviso_pedido('reload');

-- ---------- A-062: capital mandado avisa o jogador ----------
create or replace function public.registrar_aporte(p_pessoa uuid, p_valor numeric, p_data date default current_date, p_obs text default null, p_sala text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid; ws uuid; novo uuid;
begin
  select v.unidade_id, p.workspace_id into u, ws from public.vinculo v join public.pessoa p on p.id = v.pessoa_id
   where v.pessoa_id = p_pessoa and v.fim is null;
  if u is null or not public.pode('aprovar_saques', u) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if p_valor is null or p_valor = 0 then raise exception 'valor do aporte'; end if;
  insert into public.aporte(workspace_id, pessoa_id, unidade_id, valor, data, observacao, sala)
  values (ws, p_pessoa, u, round(p_valor, 2), coalesce(p_data, current_date), p_obs, nullif(btrim(p_sala), '')) returning id into novo;
  perform public.avisar_pessoa(p_pessoa, 'capital', case when p_valor > 0 then 'Capital recebido do time' else 'Capital recolhido pelo time' end,
    public.fmt_usd(abs(round(p_valor, 2))) || coalesce(case when p_valor > 0 then ' na ' else ' da ' end || nullif(btrim(p_sala), ''), '')
    || case when p_valor > 0 then ' · entra no seu MU.' else ' · sai do seu MU.' end, novo);
  return novo;
end $$;

-- ---------- limpeza única: avisos de pedidos já resolvidos e repetidos ----------
delete from public.aviso a using public.abertura ab
 where a.ref_id = ab.id and a.tipo = 'planilha' and a.titulo like '% enviou a planilha%' and ab.status = 'confirmada';
delete from public.aviso a using public.saque q
 where a.ref_id = q.id and a.tipo = 'saque' and a.titulo like '% pediu saque%' and q.status <> 'solicitado';
delete from public.aviso a using public.reload r
 where a.ref_id = r.id and a.tipo = 'reload' and a.titulo like '% pediu reload%' and r.status <> 'solicitado';
delete from public.aviso a using public.aviso b
 where a.ref_id is not null and a.ref_id = b.ref_id and a.user_id = b.user_id and a.tipo = b.tipo and a.titulo = b.titulo
   and (a.criado_em, a.id::text) < (b.criado_em, b.id::text);
