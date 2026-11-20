-- ============================================================
-- Regras por reta (plano mestre 3.1 e 3.3). Idempotente.
--
-- Antes: só "não promover com MK" e "jogador vê ranking" eram por unidade. ABI, stop loss, sites e modalidades valiam
-- pro time inteiro (a configuração única do time), e não havia reserva por sala.
-- Agora, por unidade, herdadas pra baixo e com data de vigência (a unidade mais funda com a regra, a mais nova até a data):
--   abi_max          ABI máximo de quem joga ali, quando a reta não tem grade (número > 0)
--   stop_dia_buyins  stop loss diário, em buy-ins do ABI máximo (número ≥ 0)
--   stop_semana_pct  stop loss semanal, fração da banca (0 a 1)
--   sites            sites permitidos (lista de nomes)
--   modalidades      modalidades permitidas (lista de nomes)
--   reserva_por_sala o que fica em cada sala no saque, pra não voltar ao MK (número ≥ 0)
-- Sem regra em nenhuma unidade, vale a configuração do time (e reserva 0).
-- limpar_regra devolve a herança: apaga a regra da unidade (ou o contrato da unidade, com a chave 'contrato').
-- sugerir_saque: o servidor sugere o saque deixando a reserva em cada sala (plano 3.3: "o sistema sugere o valor do
-- saque já descontando a reserva"): primeiro o capital do time, depois o lucro; em MK não sugere nada.
-- ============================================================

alter table public.regra_unidade drop constraint if exists regra_unidade_chave_check;
alter table public.regra_unidade add constraint regra_unidade_chave_check check (chave in (
  'bloquear_promocao_com_mk', 'jogador_ve_ranking', 'abi_max', 'stop_dia_buyins', 'stop_semana_pct', 'sites', 'modalidades', 'reserva_por_sala'));

create or replace function public.definir_regra(p_unidade uuid, p_chave text, p_valor jsonb, p_desde date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare u record; n numeric; x jsonb;
begin
  select * into u from public.unidade where id = p_unidade;
  if u.id is null then raise exception 'unidade não existe'; end if;
  if not public.pode('configurar_regras', p_unidade) then
    raise exception 'precisa de "configurar_regras" nesta unidade' using errcode = 'insufficient_privilege'; end if;
  if p_valor is null or p_valor = 'null'::jsonb then raise exception 'pra voltar a herdar, use limpar_regra'; end if;
  case
    when p_chave in ('bloquear_promocao_com_mk', 'jogador_ve_ranking') then
      if jsonb_typeof(p_valor) <> 'boolean' then raise exception 'essa regra é ligada ou desligada (true/false)'; end if;
    when p_chave in ('abi_max', 'stop_dia_buyins', 'stop_semana_pct', 'reserva_por_sala') then
      if jsonb_typeof(p_valor) <> 'number' then raise exception 'essa regra é um número'; end if;
      n := (p_valor #>> '{}')::numeric;
      if p_chave = 'abi_max' and n <= 0 then raise exception 'o ABI máximo precisa ser maior que zero'; end if;
      if p_chave in ('stop_dia_buyins', 'reserva_por_sala') and n < 0 then raise exception 'o valor não pode ser negativo'; end if;
      if p_chave = 'stop_semana_pct' and (n < 0 or n > 1) then raise exception 'o stop semanal é uma fração da banca, de 0 a 1 (15%% = 0.15)'; end if;
    when p_chave in ('sites', 'modalidades') then
      if jsonb_typeof(p_valor) <> 'array' or jsonb_array_length(p_valor) = 0 or jsonb_array_length(p_valor) > 30 then
        raise exception 'informe de 1 a 30 nomes'; end if;
      for x in select e from jsonb_array_elements(p_valor) e loop
        if jsonb_typeof(x) <> 'string' or length(btrim(x #>> '{}')) = 0 or length(x #>> '{}') > 40 then
          raise exception 'cada nome precisa ter de 1 a 40 letras'; end if;
      end loop;
    else raise exception 'regra desconhecida: %', p_chave;
  end case;
  insert into public.regra_unidade(workspace_id, unidade_id, chave, valor, vigente_desde, criado_por)
  values (u.workspace_id, p_unidade, p_chave, p_valor, coalesce(p_desde, current_date), auth.uid())
  on conflict (unidade_id, chave, vigente_desde) do update set valor = excluded.valor, criado_por = excluded.criado_por, criado_em = now();
end $$;

-- a unidade volta a herdar (a regra de cima, ou a configuração do time)
create or replace function public.limpar_regra(p_unidade uuid, p_chave text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.unidade where id = p_unidade) then raise exception 'unidade não existe'; end if;
  if not public.pode('configurar_regras', p_unidade) then
    raise exception 'precisa de "configurar_regras" nesta unidade' using errcode = 'insufficient_privilege'; end if;
  if p_chave = 'contrato' then
    delete from public.contrato where unidade_id = p_unidade and pessoa_id is null;
  else
    delete from public.regra_unidade where unidade_id = p_unidade and chave = p_chave;
  end if;
end $$;

-- ---------- sugestão de saque: deixa a reserva em cada sala ----------
create or replace function public.sugerir_saque(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pe record; u uuid; banca numeric; m record; reserva numeric; salas int; total_reserva numeric; disponivel numeric;
        devolucao numeric := 0; cashout numeric := 0;
begin
  select * into pe from public.pessoa where id = p_pessoa;
  select unidade_id into u from public.vinculo where pessoa_id = p_pessoa and fim is null;
  if pe.id is null or u is null then raise exception 'essa pessoa não está jogando no time'; end if;
  if not (pe.user_id = auth.uid() or public.pode('ver_financeiro', u)) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  banca := (public.banca_de(p_pessoa)->>'banca')::numeric;
  select x.mu, x.lifetime into m from public.mu_de(p_pessoa) x;
  reserva := coalesce((public.regra_efetiva(u, 'reserva_por_sala') #>> '{}')::numeric, 0);
  select count(*) into salas from public.player_wallets w where w.pessoa_id = p_pessoa;
  total_reserva := round(reserva * greatest(salas, 1), 2);
  if banca >= m.mu then                                    -- em MK não tem saque
    disponivel := greatest(banca - total_reserva, 0);
    devolucao := least(greatest(m.mu, 0), disponivel);      -- primeiro o capital do time
    cashout := least(greatest(banca - greatest(m.mu, 0), 0), disponivel - devolucao);
  end if;
  return jsonb_build_object('banca', round(banca, 2), 'mu', round(m.mu, 2), 'em_mk', banca < m.mu,
    'reserva_por_sala', reserva, 'salas', salas, 'reserva_total', total_reserva,
    'devolucao', round(devolucao, 2), 'cashout', round(cashout, 2), 'banca_depois', round(banca - devolucao - cashout, 2));
end $$;

do $$
declare f text;
begin
  foreach f in array array['definir_regra(uuid,text,jsonb,date)','limpar_regra(uuid,text)','sugerir_saque(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
