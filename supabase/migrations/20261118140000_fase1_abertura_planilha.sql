-- ============================================================
-- Fase 1: abertura do jogador pela planilha pessoal do Samba. Idempotente.
-- Quem entra no time (ou migra) sobe a planilha; o app lê MakeUp, Cashout, saldos por sala, contrato e grade.
-- O jogador ENVIA, mas só vale depois que quem aprova saques CONFERE (pode corrigir MU e cashout).
-- A abertura conferida é a "foto inicial": dali em diante MU e lifetime somam só o que acontecer DEPOIS dela.
--   MU       = abertura.mu      + aportes depois  − devoluções pagas depois
--   lifetime = abertura.cashout + cashouts pagos depois   (é o lucro já sacado; a faixa do contrato usa este)
-- ============================================================

create table if not exists public.abertura (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pessoa_id uuid not null unique references public.pessoa(id) on delete cascade,
  unidade_id uuid references public.unidade(id),
  status text not null default 'enviada' check (status in ('enviada','confirmada')),
  mu numeric(12,2) not null check (mu >= 0),
  cashout numeric(12,2) not null check (cashout >= 0),
  planilha jsonb not null,                       -- leitura completa (saldos, banca, contrato, faixa, grade, avisos)
  enviado_por uuid default auth.uid(),
  enviado_em timestamptz not null default now(),
  confirmado_por uuid,
  confirmado_em timestamptz
);
create index if not exists abertura_workspace on public.abertura (workspace_id);
create index if not exists abertura_unidade on public.abertura (unidade_id);
alter table public.abertura enable row level security;
revoke all on public.abertura from anon, authenticated;
grant select on public.abertura to authenticated;
drop policy if exists abertura_ler on public.abertura;
create policy abertura_ler on public.abertura for select to authenticated
  using (pessoa_id in (select public.minhas_pessoas()) or unidade_id in (select public.unidades_com('ver_financeiro')));

-- o jogador envia a própria planilha (enquanto não foi conferida)
create or replace function public.enviar_planilha(p_planilha jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p uuid; ws uuid; u uuid; mu numeric; co numeric; novo uuid;
begin
  select pe.id, pe.workspace_id into p, ws from public.pessoa pe
   where pe.user_id = auth.uid() and pe.status = 'ativo'
     and exists (select 1 from public.vinculo v where v.pessoa_id = pe.id and v.fim is null) limit 1;
  if p is null then raise exception 'só quem joga no time envia planilha' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.abertura where pessoa_id = p and status = 'confirmada') then
    raise exception 'sua planilha já foi conferida pelo time; pra mudar, fale com quem aprova os saques'; end if;
  if jsonb_typeof(p_planilha) <> 'object' or length(p_planilha::text) > 200000 then raise exception 'planilha inválida'; end if;
  mu := round(coalesce((p_planilha->>'makeup')::numeric, -1), 2);
  co := round(coalesce((p_planilha->>'cashout')::numeric, -1), 2);
  if mu < 0 or co < 0 or mu > 10000000 or co > 10000000 then raise exception 'MakeUp e Cashout precisam ser números de 0 pra cima'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p and fim is null;
  insert into public.abertura(workspace_id, pessoa_id, unidade_id, status, mu, cashout, planilha)
  values (ws, p, u, 'enviada', mu, co, p_planilha)
  on conflict (pessoa_id) do update set unidade_id = excluded.unidade_id, mu = excluded.mu, cashout = excluded.cashout,
    planilha = excluded.planilha, enviado_por = auth.uid(), enviado_em = now()
  returning id into novo;
  return novo;
end $$;

-- quem aprova saques confere (e pode corrigir) os valores; ninguém confere a própria
create or replace function public.conferir_abertura(p_pessoa uuid, p_mu numeric, p_cashout numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare a record;
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
end $$;

-- situação do jogador: agora a partir da abertura conferida
create or replace function public.situacao_jogador(p_pessoa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pes record; u uuid; ab record; desde timestamptz; mu numeric; lt numeric;
begin
  select * into pes from public.pessoa where id = p_pessoa;
  if pes.id is null then raise exception 'pessoa não existe'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p_pessoa and fim is null;
  if not (pes.user_id = auth.uid() or (u is not null and public.pode('ver_financeiro', u))) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select a.mu, a.cashout, a.confirmado_em, a.status into ab from public.abertura a where a.pessoa_id = p_pessoa;
  desde := case when ab.status = 'confirmada' then ab.confirmado_em else '-infinity'::timestamptz end;
  select coalesce(sum(valor), 0) into mu from public.aporte where pessoa_id = p_pessoa and criado_em > desde;
  select mu - coalesce(sum(devolucao), 0), coalesce(sum(cashout), 0) into mu, lt
    from public.saque where pessoa_id = p_pessoa and status = 'pago' and pago_em > desde;
  if ab.status = 'confirmada' then mu := mu + ab.mu; lt := lt + ab.cashout; end if;
  return jsonb_build_object('mu', mu, 'lifetime', lt, 'contrato', public.contrato_de(p_pessoa), 'unidade_id', u,
                            'abertura', coalesce(ab.status, 'sem'));
end $$;

revoke all on function public.enviar_planilha(jsonb) from public, anon;
revoke all on function public.conferir_abertura(uuid,numeric,numeric) from public, anon;
grant execute on function public.enviar_planilha(jsonb) to authenticated;
grant execute on function public.conferir_abertura(uuid,numeric,numeric) to authenticated;
