-- ============================================================
-- Fase 1: dinheiro do time (staking). Idempotente. Só em workspace com estrutura.
--
-- MU (makeup)  = capital do time que está com o jogador e ainda não voltou = aportes − devoluções pagas
-- Lucro        = banca atual − MU (negativo = jogador está em makeup)
-- Saque        = devolução de capital (abate o MU) + cashout (sai do lucro)
--                só o cashout é dividido pelo contrato; o resto da banca fica como reserva
-- Contrato     = faixas pela soma dos cashouts já pagos (lifetime realizado), divisão marginal:
--                [{"ate":10000,"jogador":0.35},{"ate":null,"jogador":0.40}]
--                um cashout que cruza a faixa é dividido nas duas partes
-- Fluxo        = solicitado (jogador) → aprovado/recusado (aprovar_saques) → pago (quem aprovou confirma
--                quanto o time recebeu; diferença fica registrada) · o jogador pode cancelar enquanto solicitado
-- Exemplo do Samba (out/2026): banca 625, MU 310, devolução 310, cashout 165 a 35% →
--   jogador 57,75 · time 107,25 · total ao time 417,25 · banca depois 150 (reserva) · MU depois 0
-- ============================================================

create table if not exists public.contrato (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  unidade_id uuid references public.unidade(id) on delete cascade,   -- vale pra unidade e as de baixo
  pessoa_id uuid references public.pessoa(id) on delete cascade,     -- ou só pra uma pessoa
  faixas jsonb not null,
  inicio date not null default current_date,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  check (unidade_id is not null or pessoa_id is not null)
);
create index if not exists contrato_unidade on public.contrato (unidade_id);
create index if not exists contrato_pessoa on public.contrato (pessoa_id);
create index if not exists contrato_workspace on public.contrato (workspace_id);

create table if not exists public.aporte (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pessoa_id uuid not null references public.pessoa(id) on delete cascade,
  unidade_id uuid references public.unidade(id),
  valor numeric(12,2) not null check (valor <> 0),          -- positivo = time manda capital; negativo = ajuste
  data date not null default current_date,
  observacao text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists aporte_pessoa on public.aporte (pessoa_id);
create index if not exists aporte_workspace on public.aporte (workspace_id);
create index if not exists aporte_unidade on public.aporte (unidade_id);

create table if not exists public.saque (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pessoa_id uuid not null references public.pessoa(id) on delete cascade,
  unidade_id uuid references public.unidade(id),
  status text not null default 'solicitado' check (status in ('solicitado','aprovado','recusado','cancelado','pago')),
  banca numeric(12,2) not null check (banca >= 0),           -- banca total declarada no pedido
  carteiras jsonb,                                            -- {"GG":525,"PS":100} (informativo)
  mu_antes numeric(12,2) not null,
  lifetime_antes numeric(12,2) not null,
  devolucao numeric(12,2) not null default 0 check (devolucao >= 0),
  cashout numeric(12,2) not null default 0 check (cashout >= 0),
  parte_jogador numeric(12,2) not null,
  parte_time numeric(12,2) not null,
  total_time numeric(12,2) not null,
  divisao jsonb not null,                                     -- faixas aplicadas (auditoria)
  banca_depois numeric(12,2) not null,
  observacao text,
  solicitado_por uuid default auth.uid(),
  solicitado_em timestamptz not null default now(),
  decidido_por uuid, decidido_em timestamptz, motivo text,
  recebido numeric(12,2), diferenca numeric(12,2), pago_em timestamptz,
  check (devolucao + cashout > 0)
);
create index if not exists saque_pessoa on public.saque (pessoa_id);
create index if not exists saque_workspace on public.saque (workspace_id);
create index if not exists saque_unidade on public.saque (unidade_id);
create unique index if not exists saque_um_aberto on public.saque (pessoa_id) where status in ('solicitado','aprovado');

-- ---------- leitura: o próprio jogador, ou quem vê o financeiro da unidade ----------
alter table public.contrato enable row level security;
alter table public.aporte enable row level security;
alter table public.saque enable row level security;
revoke all on public.contrato, public.aporte, public.saque from anon, authenticated;
grant select on public.contrato, public.aporte, public.saque to authenticated;
drop policy if exists contrato_ler on public.contrato;
create policy contrato_ler on public.contrato for select to authenticated
  using (pessoa_id in (select public.minhas_pessoas())
         or unidade_id in (select public.unidades_com('ver_financeiro'))
         or unidade_id in (select public.unidades_com('configurar_regras'))
         or (pessoa_id is not null and exists (select 1 from public.vinculo v where v.pessoa_id = contrato.pessoa_id and v.fim is null
                                               and v.unidade_id in (select public.unidades_com('ver_financeiro'))))
         -- o jogador vê o contrato que vale pra ele (da unidade dele ou de cima)
         or exists (select 1 from public.vinculo v join public.unidade u on u.id = v.unidade_id join public.unidade c on c.id = contrato.unidade_id
                     where v.fim is null and v.pessoa_id in (select public.minhas_pessoas()) and u.caminho like c.caminho || '%'));
drop policy if exists aporte_ler on public.aporte;
create policy aporte_ler on public.aporte for select to authenticated
  using (pessoa_id in (select public.minhas_pessoas()) or unidade_id in (select public.unidades_com('ver_financeiro')));
drop policy if exists saque_ler on public.saque;
create policy saque_ler on public.saque for select to authenticated
  using (pessoa_id in (select public.minhas_pessoas()) or unidade_id in (select public.unidades_com('ver_financeiro')));

-- ---------- cálculo ----------
-- divisão marginal do cashout pelas faixas, a partir do lifetime realizado
create or replace function public.dividir_cashout(p_faixas jsonb, p_lifetime numeric, p_cashout numeric)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare f jsonb; ini numeric := 0; fim numeric; a numeric; b numeric; parte numeric; jog numeric := 0; det jsonb := '[]'::jsonb;
begin
  if p_cashout is null or p_cashout <= 0 then return jsonb_build_object('jogador', 0, 'time', 0, 'faixas', det); end if;
  for f in select x from jsonb_array_elements(p_faixas) x order by coalesce((x->>'ate')::numeric, 1e15) loop
    fim := coalesce((f->>'ate')::numeric, 1e15);
    a := greatest(ini, p_lifetime); b := least(fim, p_lifetime + p_cashout);
    if b > a then
      parte := b - a;
      jog := jog + parte * (f->>'jogador')::numeric;
      det := det || jsonb_build_object('de', a, 'ate', b, 'valor', parte, 'jogador_pct', (f->>'jogador')::numeric);
    end if;
    ini := fim;
  end loop;
  jog := round(jog, 2);
  return jsonb_build_object('jogador', jog, 'time', round(p_cashout - jog, 2), 'faixas', det);
end $$;

create or replace function public.validar_faixas(p_faixas jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare f jsonb; n int := 0; abertas int := 0; ant numeric := 0;
begin
  if jsonb_typeof(p_faixas) <> 'array' or jsonb_array_length(p_faixas) = 0 then raise exception 'contrato sem faixas'; end if;
  for f in select x from jsonb_array_elements(p_faixas) x order by coalesce((x->>'ate')::numeric, 1e15) loop
    n := n + 1;
    if (f->>'jogador') is null or (f->>'jogador')::numeric < 0 or (f->>'jogador')::numeric > 1 then
      raise exception 'percentual do jogador tem que estar entre 0 e 1 (ex.: 0.35)'; end if;
    if f->>'ate' is null then abertas := abertas + 1;
    elsif (f->>'ate')::numeric <= ant then raise exception 'faixas com limite repetido ou fora de ordem';
    else ant := (f->>'ate')::numeric; end if;
  end loop;
  if abertas <> 1 then raise exception 'a última faixa precisa ser sem limite ("ate": null)'; end if;
end $$;

-- contrato que vale pra pessoa hoje: o dela; senão o da unidade mais próxima acima (inclusive a dela)
create or replace function public.contrato_de(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.faixas from public.contrato c where c.pessoa_id = p and c.inicio <= current_date order by c.inicio desc, c.criado_em desc limit 1),
    (select c.faixas from public.contrato c
       join public.unidade cu on cu.id = c.unidade_id
       join public.vinculo v on v.pessoa_id = p and v.fim is null
       join public.unidade pu on pu.id = v.unidade_id
      where c.pessoa_id is null and c.inicio <= current_date and pu.caminho like cu.caminho || '%'
      order by length(cu.caminho) desc, c.inicio desc, c.criado_em desc limit 1));
$$;

-- situação do jogador: MU, lifetime realizado e contrato
create or replace function public.situacao_jogador(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pes record; u uuid; mu numeric; lt numeric;
begin
  select * into pes from public.pessoa where id = p_pessoa;
  if pes.id is null then raise exception 'pessoa não existe'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p_pessoa and fim is null;
  if not (pes.user_id = auth.uid() or (u is not null and public.pode('ver_financeiro', u))) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select coalesce(sum(valor), 0) into mu from public.aporte where pessoa_id = p_pessoa;
  select mu - coalesce(sum(devolucao), 0), coalesce(sum(cashout), 0) into mu, lt from public.saque where pessoa_id = p_pessoa and status = 'pago';
  return jsonb_build_object('mu', mu, 'lifetime', lt, 'contrato', public.contrato_de(p_pessoa), 'unidade_id', u);
end $$;

-- prévia do saque (o mesmo cálculo que o pedido grava)
create or replace function public.simular_saque(p_pessoa uuid, p_banca numeric, p_devolucao numeric, p_cashout numeric)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s jsonb; mu numeric; lt numeric; lucro numeric; d jsonb;
begin
  s := public.situacao_jogador(p_pessoa);
  if s->'contrato' is null or s->'contrato' = 'null'::jsonb then raise exception 'jogador sem contrato definido'; end if;
  mu := (s->>'mu')::numeric; lt := (s->>'lifetime')::numeric;
  p_devolucao := coalesce(p_devolucao, 0); p_cashout := coalesce(p_cashout, 0);
  if p_banca is null or p_banca < 0 then raise exception 'informe a banca atual'; end if;
  if p_devolucao < 0 or p_cashout < 0 or p_devolucao + p_cashout <= 0 then raise exception 'informe a devolução e/ou o cashout'; end if;
  lucro := p_banca - mu;
  if p_devolucao > mu then raise exception 'devolução (%) maior que o MU (%)', p_devolucao, mu; end if;
  if p_cashout > greatest(lucro, 0) then raise exception 'cashout (%) maior que o lucro (%): banca % − MU %', p_cashout, greatest(lucro, 0), p_banca, mu; end if;
  if p_devolucao + p_cashout > p_banca then raise exception 'saque maior que a banca'; end if;
  d := public.dividir_cashout(s->'contrato', lt, p_cashout);
  return jsonb_build_object(
    'banca', p_banca, 'mu_antes', mu, 'lucro_antes', lucro, 'lifetime_antes', lt,
    'devolucao', p_devolucao, 'cashout', p_cashout,
    'parte_jogador', (d->>'jogador')::numeric, 'parte_time', (d->>'time')::numeric,
    'total_time', p_devolucao + (d->>'time')::numeric,
    'banca_depois', p_banca - p_devolucao - p_cashout, 'mu_depois', mu - p_devolucao,
    'divisao', d);
end $$;

-- ---------- gravação ----------
create or replace function public.definir_contrato(p_unidade uuid, p_pessoa uuid, p_faixas jsonb, p_inicio date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ws uuid; alvo uuid; novo uuid;
begin
  perform public.validar_faixas(p_faixas);
  if p_pessoa is not null then
    select unidade_id into alvo from public.vinculo where pessoa_id = p_pessoa and fim is null;
    if alvo is null then raise exception 'pessoa sem vínculo ativo'; end if;
  else alvo := p_unidade; end if;
  if alvo is null or not public.pode('configurar_regras', alvo) then
    raise exception 'precisa de "configurar_regras" na unidade' using errcode = 'insufficient_privilege'; end if;
  select workspace_id into ws from public.unidade where id = alvo;
  insert into public.contrato(workspace_id, unidade_id, pessoa_id, faixas, inicio)
  values (ws, case when p_pessoa is null then p_unidade end, p_pessoa, p_faixas, coalesce(p_inicio, current_date)) returning id into novo;
  return novo;
end $$;

create or replace function public.registrar_aporte(p_pessoa uuid, p_valor numeric, p_data date default current_date, p_obs text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid; ws uuid; novo uuid;
begin
  select v.unidade_id, p.workspace_id into u, ws from public.vinculo v join public.pessoa p on p.id = v.pessoa_id
   where v.pessoa_id = p_pessoa and v.fim is null;
  if u is null or not public.pode('aprovar_saques', u) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if p_valor is null or p_valor = 0 then raise exception 'valor do aporte'; end if;
  insert into public.aporte(workspace_id, pessoa_id, unidade_id, valor, data, observacao)
  values (ws, p_pessoa, u, round(p_valor, 2), coalesce(p_data, current_date), p_obs) returning id into novo;
  return novo;
end $$;

-- o jogador pede (só pra si)
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
  insert into public.saque(workspace_id, pessoa_id, unidade_id, banca, carteiras, mu_antes, lifetime_antes, devolucao, cashout,
                           parte_jogador, parte_time, total_time, divisao, banca_depois, observacao)
  values (ws, p, u, p_banca, p_carteiras, (sim->>'mu_antes')::numeric, (sim->>'lifetime_antes')::numeric,
          (sim->>'devolucao')::numeric, (sim->>'cashout')::numeric, (sim->>'parte_jogador')::numeric, (sim->>'parte_time')::numeric,
          (sim->>'total_time')::numeric, sim->'divisao', (sim->>'banca_depois')::numeric, p_obs)
  returning id into novo;
  return novo;
end $$;

create or replace function public.cancelar_saque(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.saque s set status = 'cancelado', decidido_em = now(), decidido_por = auth.uid()
   where s.id = p_id and s.status = 'solicitado'
     and s.pessoa_id in (select x.id from public.pessoa x where x.user_id = auth.uid());
  if not found then raise exception 'só o próprio jogador cancela, e só enquanto está solicitado'; end if;
end $$;

-- quem aprova saques decide; ninguém aprova o próprio
create or replace function public.decidir_saque(p_id uuid, p_aprovar boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select * into s from public.saque where id = p_id for update;
  if s.id is null or not public.pode('aprovar_saques', s.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = s.pessoa_id and user_id = auth.uid()) then
    raise exception 'ninguém aprova o próprio saque' using errcode = 'insufficient_privilege'; end if;
  if s.status <> 'solicitado' then raise exception 'saque não está aguardando decisão (está %)', s.status; end if;
  if not p_aprovar and coalesce(btrim(p_motivo), '') = '' then raise exception 'diga o motivo da recusa'; end if;
  update public.saque set status = case when p_aprovar then 'aprovado' else 'recusado' end,
         decidido_por = auth.uid(), decidido_em = now(), motivo = p_motivo where id = p_id;
end $$;

-- confirma quanto o time recebeu: o saque entra no MU e no lifetime; diferença fica registrada
create or replace function public.confirmar_recebimento(p_id uuid, p_recebido numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s record; dif numeric;
begin
  select * into s from public.saque where id = p_id for update;
  if s.id is null or not public.pode('aprovar_saques', s.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = s.pessoa_id and user_id = auth.uid()) then
    raise exception 'ninguém confirma o próprio saque' using errcode = 'insufficient_privilege'; end if;
  if s.status <> 'aprovado' then raise exception 'só saque aprovado é confirmado (está %)', s.status; end if;
  if p_recebido is null or p_recebido < 0 then raise exception 'informe quanto o time recebeu'; end if;
  dif := round(p_recebido - s.total_time, 2);
  update public.saque set status = 'pago', recebido = round(p_recebido, 2), diferenca = dif, pago_em = now() where id = p_id;
  return jsonb_build_object('total_time', s.total_time, 'recebido', round(p_recebido, 2), 'diferenca', dif);
end $$;

do $$
declare f text;
begin
  foreach f in array array['situacao_jogador(uuid)','simular_saque(uuid,numeric,numeric,numeric)','definir_contrato(uuid,uuid,jsonb,date)',
    'registrar_aporte(uuid,numeric,date,text)','solicitar_saque(numeric,numeric,numeric,jsonb,text)','cancelar_saque(uuid)',
    'decidir_saque(uuid,boolean,text)','confirmar_recebimento(uuid,numeric)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['dividir_cashout(jsonb,numeric,numeric)','validar_faixas(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.contrato_de(uuid) from public, anon, authenticated';
end $$;
