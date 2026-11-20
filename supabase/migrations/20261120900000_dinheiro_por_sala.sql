-- ============================================================
-- Dinheiro por sala (pedido do dono, 20/11: "a gente solicita por sala, pois cada um tem uma maneira de depósito e de
-- saque"; e um cálculo total também). Idempotente.
--   · o nome da sala vira uma chave só (sala_chave): "GG" = "GG Poker", "PS" = "PokerStars", "PS.es", "WPN" = "ACR"
--     (o ACR sai da conta WPN), "Party", "888";
--   · capital mandado (aporte) guarda a sala; o reload enviado leva a sala dele pro capital;
--   · saque por sala: quanto tem em cada sala agora e quanto sai de cada uma. O servidor confere que a soma das salas é a
--     banca e que o que sai fecha com devolução + cashout, e guarda o saldo do sistema de cada sala na hora;
--   · saldo por sala do sistema (salas_jogador): foto + torneios da sala + movimentos da sala + capital da sala − saques
--     pagos da sala. O que não tem sala (capital antigo, saque sem divisão, torneio sem sala) fica no "sem sala". A soma de
--     tudo é a banca de sempre;
--   · conferência de saldos (plano 3.3): o jogador lança o saldo de cada sala, o sistema compara e avisa quem vê o
--     dinheiro do time se alguma sala (ou o total) diverge mais de US$ 1;
--   · sugestão de saque por sala: deixa a reserva em cada sala (com dinheiro sem sala, usa a conta do total).
-- ============================================================

alter table public.aporte add column if not exists sala text;

-- ---------- a chave da sala (a mesma no app) ----------
create or replace function public.sala_chave(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare k text := regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g');
begin
  if k = '' then return null; end if;
  if k ~ '^gg' or k in ('natural8', 'n8') then return 'gg'; end if;
  if k in ('pses', 'pokerstarses', 'starses') then return 'pses'; end if;
  if k = 'ps' or k ~ 'stars' then return 'ps'; end if;
  if k ~ '^(acr|americas|winning|wpn)' then return 'wpn'; end if;
  if k ~ 'party' then return 'party'; end if;
  if k ~ '^888' then return '888'; end if;
  return k;
end $$;
create or replace function public.sala_nome(p_chave text) returns text
language sql immutable set search_path = '' as $$
  select case p_chave when 'gg' then 'GG Poker' when 'ps' then 'PokerStars' when 'pses' then 'PokerStars.es' when 'wpn' then 'WPN/ACR'
                      when 'party' then 'Party' when '888' then '888poker' else p_chave end;
$$;

-- ---------- saldo de cada sala pelo sistema (interna) ----------
create or replace function public.salas_de(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f record; r jsonb;
begin
  select * into f from public.foto_de(p_pessoa);
  with partes as (
    select public.sala_chave(w.wallet) chave, w.wallet nome, 1 prio, w.saldo_inicial ini, 0::numeric res, 0::numeric mov, 0::numeric apo, 0::numeric saq
      from public.player_wallets w where w.pessoa_id = p_pessoa
    union all
    select public.sala_chave(t.site), t.site, 2, 0, t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end, 0, 0, 0
      from public.tournaments t where t.pessoa_id = p_pessoa and t.entry_date > f.corte
    union all
    select public.sala_chave(l.wallet), l.wallet, 3, 0, 0, l.entrada - l.saida, 0, 0
      from public.bankroll_ledger l where l.pessoa_id = p_pessoa and l.entry_date > f.corte
    union all
    select public.sala_chave(a.sala), a.sala, 4, 0, 0, 0, a.valor, 0
      from public.aporte a where a.pessoa_id = p_pessoa and a.criado_em > f.desde
    union all   -- saque pago dividido por sala
    select public.sala_chave(c->>'sala'), c->>'sala', 5, 0, 0, 0, 0, coalesce((c->>'valor')::numeric, 0)
      from public.saque q cross join lateral jsonb_array_elements(case when jsonb_typeof(q.carteiras) = 'array' then q.carteiras else '[]'::jsonb end) c
     where q.pessoa_id = p_pessoa and q.status = 'pago' and q.pago_em > f.desde
    union all   -- saque pago sem a divisão (os antigos): fica sem sala
    select null, null, 6, 0, 0, 0, 0, q.devolucao + q.cashout
      from public.saque q where q.pessoa_id = p_pessoa and q.status = 'pago' and q.pago_em > f.desde
       and (q.carteiras is null or jsonb_typeof(q.carteiras) <> 'array')
  ), por as (
    select chave, (array_agg(btrim(nome) order by prio) filter (where coalesce(btrim(nome), '') <> ''))[1] nome,
           sum(ini) ini, sum(res) res, sum(mov) mov, sum(apo) apo, sum(saq) saq
      from partes group by chave)
  select coalesce(jsonb_agg(jsonb_build_object('chave', chave, 'sala', case when chave is null then 'sem sala' else coalesce(nome, public.sala_nome(chave)) end,
           'saldo_inicial', round(ini, 2), 'resultados', round(res, 2), 'movimentos', round(mov, 2), 'aportes', round(apo, 2), 'saques', round(saq, 2),
           'saldo', round(ini + res + mov + apo - saq, 2))
         order by (chave is null), lower(coalesce(nome, chave))), '[]'::jsonb)
    into r from por where chave is not null or round(ini + res + mov + apo - saq, 2) <> 0;
  return r;
end $$;
revoke all on function public.salas_de(uuid) from public, anon, authenticated;

-- ---------- o que a tela mostra: as salas, o total e a banca (a soma bate) ----------
create or replace function public.salas_jogador(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pe record; u uuid; s jsonb;
begin
  select * into pe from public.pessoa where id = p_pessoa;
  select unidade_id into u from public.vinculo where pessoa_id = p_pessoa and fim is null;
  if pe.id is null or not (pe.user_id = auth.uid() or (u is not null and public.pode('ver_financeiro', u))) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  s := public.salas_de(p_pessoa);
  return jsonb_build_object('salas', s,
    'total', coalesce((select round(sum((x->>'saldo')::numeric), 2) from jsonb_array_elements(s) x), 0),
    'sem_sala', coalesce((select (x->>'saldo')::numeric from jsonb_array_elements(s) x where x->>'chave' is null), 0),
    'banca', (public.banca_de(p_pessoa)->>'banca')::numeric,
    'ultima_conferencia', (select to_jsonb(c) - 'workspace_id' from public.conferencia_saldo c where c.pessoa_id = p_pessoa order by c.criado_em desc limit 1));
end $$;

-- ---------- capital mandado: com a sala ----------
drop function if exists public.registrar_aporte(uuid, numeric, date, text);
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
  return novo;
end $$;

-- ---------- reload enviado: o capital vai pra sala do reload ----------
create or replace function public.confirmar_envio_reload(p_id uuid, p_valor numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r record; ap uuid;
begin
  select * into r from public.reload where id = p_id for update;
  if r.id is null or not public.pode('aprovar_saques', r.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = r.pessoa_id and user_id = auth.uid()) then
    raise exception 'ninguém confirma o próprio reload' using errcode = 'insufficient_privilege'; end if;
  if r.status <> 'aprovado' then raise exception 'só reload aprovado é enviado (está %)', r.status; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'informe quanto foi enviado'; end if;
  insert into public.aporte(workspace_id, pessoa_id, unidade_id, valor, data, observacao, sala)
  values (r.workspace_id, r.pessoa_id, r.unidade_id, round(p_valor, 2), current_date, 'reload' || coalesce(' · ' || r.sala, ''), r.sala) returning id into ap;
  update public.reload set status = 'enviado', enviado_valor = round(p_valor, 2), enviado_em = now(), aporte_id = ap where id = p_id;
  perform public.avisar_pessoa(r.pessoa_id, 'reload', 'Reload enviado', public.fmt_usd(round(p_valor, 2)) || ' entrou no seu MU' || coalesce(' (' || r.sala || ')', '') || '.', p_id);
  return ap;
end $$;

-- ---------- pedido de saque por sala ----------
create or replace function public.solicitar_saque(p_banca numeric, p_devolucao numeric, p_cashout numeric, p_carteiras jsonb default null, p_obs text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p uuid; ws uuid; u uuid; sim jsonb; novo uuid; car jsonb := p_carteiras; sis jsonb; soma_saldo numeric; soma_valor numeric;
begin
  select pe.id, pe.workspace_id into p, ws from public.pessoa pe
   where pe.user_id = auth.uid() and pe.status = 'ativo'
     and exists (select 1 from public.vinculo v where v.pessoa_id = pe.id and v.fim is null) limit 1;
  if p is null then raise exception 'só quem joga no time pede saque' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.saque where pessoa_id = p and status in ('solicitado','aprovado')) then
    raise exception 'já existe um saque em aberto'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p and fim is null;
  if jsonb_typeof(p_carteiras) = 'array' then
    if jsonb_array_length(p_carteiras) = 0 then raise exception 'informe as salas'; end if;
    if exists (select 1 from jsonb_array_elements(p_carteiras) c
                where coalesce(btrim(c->>'sala'), '') = '' or jsonb_typeof(c->'saldo') <> 'number' or (c->>'saldo')::numeric < 0
                   or coalesce(jsonb_typeof(c->'valor'), 'number') <> 'number' or coalesce((c->>'valor')::numeric, 0) < 0) then
      raise exception 'cada sala precisa do nome, do saldo agora (0 pra cima) e de quanto sai dela (0 pra cima)'; end if;
    if exists (select 1 from jsonb_array_elements(p_carteiras) c where coalesce((c->>'valor')::numeric, 0) > (c->>'saldo')::numeric + 0.001) then
      raise exception 'não dá pra sacar de uma sala mais do que ela tem'; end if;
    if (select count(distinct public.sala_chave(c->>'sala')) from jsonb_array_elements(p_carteiras) c) <> jsonb_array_length(p_carteiras) then
      raise exception 'sala repetida no pedido'; end if;
    select round(sum((c->>'saldo')::numeric), 2), round(sum(coalesce((c->>'valor')::numeric, 0)), 2) into soma_saldo, soma_valor from jsonb_array_elements(p_carteiras) c;
    if abs(soma_saldo - coalesce(p_banca, 0)) > 0.01 then raise exception 'a banca (%) tem que ser a soma das salas (%)', p_banca, soma_saldo; end if;
    if abs(soma_valor - (coalesce(p_devolucao, 0) + coalesce(p_cashout, 0))) > 0.01 then
      raise exception 'o que sai das salas (%) tem que fechar com devolução + cashout (%)', soma_valor, coalesce(p_devolucao, 0) + coalesce(p_cashout, 0); end if;
    -- guarda com a chave e o saldo que o sistema tinha em cada sala na hora (quem aprova compara)
    sis := public.salas_de(p);
    select jsonb_agg(jsonb_build_object('sala', btrim(c->>'sala'), 'chave', public.sala_chave(c->>'sala'),
             'saldo', round((c->>'saldo')::numeric, 2), 'valor', round(coalesce((c->>'valor')::numeric, 0), 2),
             'sistema', coalesce((select (s->>'saldo')::numeric from jsonb_array_elements(sis) s where s->>'chave' = public.sala_chave(c->>'sala')), 0)))
      into car from jsonb_array_elements(p_carteiras) c;
  end if;
  sim := public.simular_saque(p, p_banca, p_devolucao, p_cashout);
  insert into public.saque(workspace_id, pessoa_id, unidade_id, banca, banca_sistema, carteiras, mu_antes, lifetime_antes, devolucao, cashout,
                           parte_jogador, parte_time, total_time, divisao, banca_depois, observacao)
  values (ws, p, u, p_banca, (public.banca_de(p)->>'banca')::numeric, car, (sim->>'mu_antes')::numeric, (sim->>'lifetime_antes')::numeric,
          (sim->>'devolucao')::numeric, (sim->>'cashout')::numeric, (sim->>'parte_jogador')::numeric, (sim->>'parte_time')::numeric,
          (sim->>'total_time')::numeric, sim->'divisao', (sim->>'banca_depois')::numeric, p_obs)
  returning id into novo;
  return novo;
end $$;

-- ---------- conferência de saldos: o jogador lança, o sistema compara ----------
create table if not exists public.conferencia_saldo (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pessoa_id uuid not null references public.pessoa(id) on delete cascade,
  unidade_id uuid references public.unidade(id),
  salas jsonb not null,                 -- [{sala, chave, informado, sistema, diferenca}]
  total_informado numeric(12,2) not null,
  total_sistema numeric(12,2) not null,
  diferenca numeric(12,2) not null,
  diverge boolean not null,
  criado_em timestamptz not null default now()
);
create index if not exists conferencia_saldo_pessoa on public.conferencia_saldo (pessoa_id, criado_em desc);
create index if not exists conferencia_saldo_ws on public.conferencia_saldo (workspace_id);
create index if not exists conferencia_saldo_unidade on public.conferencia_saldo (unidade_id);
alter table public.conferencia_saldo enable row level security;
revoke all on public.conferencia_saldo from anon, authenticated;
grant select on public.conferencia_saldo to authenticated;
drop policy if exists conferencia_ler on public.conferencia_saldo;
create policy conferencia_ler on public.conferencia_saldo for select to authenticated
  using (pessoa_id in (select public.minhas_pessoas()) or unidade_id in (select public.unidades_com('ver_financeiro'))
         or pessoa_id in (select public.pessoas_com('ver_financeiro')));

create or replace function public.conferir_saldos(p_saldos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid; ws uuid; u uuid; nome text; sis jsonb; linhas jsonb; ti numeric; ts numeric; dif numeric; novo uuid; diverge boolean;
begin
  select pe.id, pe.workspace_id, pe.nome into p, ws, nome from public.pessoa pe
   where pe.user_id = auth.uid() and pe.status = 'ativo'
     and exists (select 1 from public.vinculo v where v.pessoa_id = pe.id and v.fim is null) limit 1;
  if p is null then raise exception 'só quem joga no time confere os saldos' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(p_saldos) <> 'array' or jsonb_array_length(p_saldos) = 0 then raise exception 'informe o saldo de cada sala'; end if;
  if exists (select 1 from jsonb_array_elements(p_saldos) x
              where coalesce(btrim(x->>'sala'), '') = '' or jsonb_typeof(x->'saldo') <> 'number' or (x->>'saldo')::numeric < 0) then
    raise exception 'cada sala precisa do nome e do saldo (0 pra cima)'; end if;
  if (select count(distinct public.sala_chave(x->>'sala')) from jsonb_array_elements(p_saldos) x) <> jsonb_array_length(p_saldos) then
    raise exception 'sala repetida'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p and fim is null;
  sis := public.salas_de(p);
  with inf as (select public.sala_chave(x->>'sala') chave, btrim(x->>'sala') sala, round((x->>'saldo')::numeric, 2) informado from jsonb_array_elements(p_saldos) x),
       si as (select s->>'chave' chave, s->>'sala' sala, (s->>'saldo')::numeric sistema from jsonb_array_elements(sis) s where s->>'chave' is not null),
       j as (select coalesce(inf.chave, si.chave) chave, coalesce(si.sala, inf.sala) sala, inf.informado, coalesce(si.sistema, 0) sistema
               from inf full join si on si.chave = inf.chave)
  select jsonb_agg(jsonb_build_object('chave', chave, 'sala', sala, 'informado', informado, 'sistema', sistema,
                                      'diferenca', case when informado is null then null else round(informado - sistema, 2) end) order by lower(sala)),
         coalesce(sum(informado), 0), coalesce(sum(sistema), 0)
    into linhas, ti, ts from j;
  ts := ts + coalesce((select (s->>'saldo')::numeric from jsonb_array_elements(sis) s where s->>'chave' is null), 0);   -- o sem sala conta no total
  dif := round(ti - ts, 2);
  diverge := abs(dif) > 1
          or exists (select 1 from jsonb_array_elements(linhas) l where jsonb_typeof(l->'diferenca') = 'number' and abs((l->>'diferenca')::numeric) > 1)
          or exists (select 1 from jsonb_array_elements(linhas) l where jsonb_typeof(l->'informado') = 'null' and abs((l->>'sistema')::numeric) > 1);
  insert into public.conferencia_saldo(workspace_id, pessoa_id, unidade_id, salas, total_informado, total_sistema, diferenca, diverge)
  values (ws, p, u, coalesce(linhas, '[]'::jsonb), round(ti, 2), round(ts, 2), dif, diverge) returning id into novo;
  if diverge then
    perform public.avisar_gestores(ws, u, 'ver_financeiro', 'saldo', nome || ': saldo das salas diferente do sistema',
      'Lançado ' || public.fmt_usd(round(ti, 2)) || ' · sistema ' || public.fmt_usd(round(ts, 2)) || '.', novo);
  end if;
  return jsonb_build_object('id', novo, 'salas', coalesce(linhas, '[]'::jsonb), 'total_informado', round(ti, 2), 'total_sistema', round(ts, 2),
                            'diferenca', dif, 'diverge', diverge);
end $$;

-- ---------- sugestão de saque por sala ----------
create or replace function public.sugerir_saque(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pe record; u uuid; banca numeric; m record; reserva numeric; salas int; total_reserva numeric; disponivel numeric;
        devolucao numeric := 0; cashout numeric := 0; sis jsonb; sem_sala numeric; por_sala boolean; resto numeric; lista jsonb := '[]'::jsonb; rs record; tira numeric;
begin
  select * into pe from public.pessoa where id = p_pessoa;
  select unidade_id into u from public.vinculo where pessoa_id = p_pessoa and fim is null;
  if pe.id is null or u is null then raise exception 'essa pessoa não está jogando no time'; end if;
  if not (pe.user_id = auth.uid() or public.pode('ver_financeiro', u)) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  banca := (public.banca_de(p_pessoa)->>'banca')::numeric;
  select x.mu, x.lifetime into m from public.mu_de(p_pessoa) x;
  reserva := coalesce((public.regra_efetiva(u, 'reserva_por_sala') #>> '{}')::numeric, 0);
  select count(*) into salas from public.player_wallets w where w.pessoa_id = p_pessoa;
  sis := public.salas_de(p_pessoa);
  sem_sala := coalesce((select (s->>'saldo')::numeric from jsonb_array_elements(sis) s where s->>'chave' is null), 0);
  por_sala := sem_sala = 0 and exists (select 1 from jsonb_array_elements(sis) s where s->>'chave' is not null);
  if por_sala then
    -- cada sala deixa a reserva (ou o que tiver, se tiver menos)
    total_reserva := coalesce((select round(sum(least(greatest((s->>'saldo')::numeric, 0), reserva)), 2) from jsonb_array_elements(sis) s), 0);
    disponivel := coalesce((select round(sum(greatest((s->>'saldo')::numeric - reserva, 0)), 2) from jsonb_array_elements(sis) s), 0);
  else
    total_reserva := round(reserva * greatest(salas, 1), 2);
    disponivel := greatest(banca - total_reserva, 0);
  end if;
  if banca >= m.mu then                                    -- em MK não tem saque
    disponivel := least(disponivel, greatest(banca, 0));
    devolucao := least(greatest(m.mu, 0), disponivel);      -- primeiro o capital do time
    cashout := least(greatest(banca - greatest(m.mu, 0), 0), disponivel - devolucao);
  end if;
  -- de onde sai: das salas com mais folga primeiro
  resto := devolucao + cashout;
  for rs in select s->>'sala' sala, (s->>'saldo')::numeric saldo, greatest((s->>'saldo')::numeric - reserva, 0) folga
             from jsonb_array_elements(sis) s where s->>'chave' is not null order by greatest((s->>'saldo')::numeric - reserva, 0) desc, s->>'sala' loop
    tira := case when por_sala then least(rs.folga, resto) else 0 end;
    resto := resto - tira;
    lista := lista || jsonb_build_object('sala', rs.sala, 'saldo', rs.saldo, 'sacar', round(tira, 2));
  end loop;
  return jsonb_build_object('banca', round(banca, 2), 'mu', round(m.mu, 2), 'em_mk', banca < m.mu,
    'reserva_por_sala', reserva, 'salas', salas, 'reserva_total', total_reserva, 'por_sala', por_sala, 'sem_sala', round(sem_sala, 2),
    'devolucao', round(devolucao, 2), 'cashout', round(cashout, 2), 'banca_depois', round(banca - devolucao - cashout, 2), 'de_onde', lista);
end $$;

do $$
declare f text;
begin
  foreach f in array array['sala_chave(text)','sala_nome(text)','salas_jogador(uuid)','registrar_aporte(uuid,numeric,date,text,text)',
                           'confirmar_envio_reload(uuid,numeric)','solicitar_saque(numeric,numeric,numeric,jsonb,text)','conferir_saldos(jsonb)','sugerir_saque(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
