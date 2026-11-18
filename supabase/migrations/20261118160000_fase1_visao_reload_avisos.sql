-- ============================================================
-- Fase 1: visão do time, pedido de reload e avisos (sininho). Idempotente.
--
-- resumo_time(desde): uma linha por aluno que a pessoa pode ver, com a unidade dele.
--   desempenho (torneios, investido, lucro, ROI, ABI, último lançamento): só com 'ver_desempenho' (ou o próprio)
--   dinheiro (banca, MU, lucro sacado, planilha): só com 'ver_financeiro' (ou o próprio); sem a permissão vem null
--   banca = salas + lucro de todos os torneios + movimentos − saques pagos do time (a mesma conta da tela do aluno)
-- reload: o aluno pede capital; quem aprova saques aprova/recusa e confirma o envio, que vira aporte (MU sobe).
-- aviso: notificação por conta, gerada no servidor quando algo pede atenção; cada um apaga os seus.
-- ============================================================

-- ---------- visão do time ----------
create or replace function public.resumo_time(p_desde date default null)
returns table(pessoa_id uuid, nome text, unidade_id uuid, unidade text, caminho text, status text,
              torneios int, investido numeric, lucro numeric, roi numeric, abi numeric, ultimo_lancamento date,
              banca numeric, mu numeric, lucro_sacado numeric, planilha text)
language plpgsql stable security definer set search_path = '' as $$
declare r record; perf boolean; din boolean; s jsonb;
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
    torneios := null; investido := null; lucro := null; roi := null; abi := null; ultimo_lancamento := null;
    banca := null; mu := null; lucro_sacado := null; planilha := null;
    if perf then
      select count(*)::int,
             round(coalesce(sum(case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end), 0), 2),
             round(coalesce(sum(t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end), 0), 2),
             round(avg(t.buyin), 2), max(t.entry_date)
        into torneios, investido, lucro, abi, ultimo_lancamento
        from public.tournaments t where t.pessoa_id = r.id and (p_desde is null or t.entry_date >= p_desde);
      roi := case when investido > 0 then round(lucro / investido * 100, 1) end;
      if p_desde is not null then
        select max(t.entry_date) into ultimo_lancamento from public.tournaments t where t.pessoa_id = r.id;
      end if;
    end if;
    if din then
      s := public.situacao_jogador(r.id);
      mu := (s->>'mu')::numeric; lucro_sacado := (s->>'lifetime')::numeric; planilha := s->>'abertura';
      select round(
          coalesce((select sum(w.saldo_inicial) from public.player_wallets w where w.pessoa_id = r.id), 0)
        + coalesce((select sum(t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end)
                      from public.tournaments t where t.pessoa_id = r.id), 0)
        + coalesce((select sum(l.entrada - l.saida) from public.bankroll_ledger l where l.pessoa_id = r.id), 0)
        - coalesce((select sum(q.devolucao + q.cashout) from public.saque q where q.pessoa_id = r.id and q.status = 'pago'), 0), 2)
        into banca;
    end if;
    return next;
  end loop;
end $$;
revoke all on function public.resumo_time(date) from public, anon;
grant execute on function public.resumo_time(date) to authenticated;

-- dinheiro no formato do app (US$ 1.234,56), sem depender do idioma do servidor
create or replace function public.fmt_usd(v numeric) returns text
language sql immutable set search_path = '' as $$
  select 'US$ ' || translate(to_char(round(coalesce(v, 0), 2), 'FM999,999,999,990.00'), ',.', '.,');
$$;
revoke all on function public.fmt_usd(numeric) from public, anon;
grant execute on function public.fmt_usd(numeric) to authenticated;

-- ---------- avisos (sininho) ----------
create table if not exists public.aviso (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  texto text,
  ref_id uuid,
  criado_em timestamptz not null default now(),
  lido_em timestamptz
);
create index if not exists aviso_user on public.aviso (user_id, criado_em desc);
create index if not exists aviso_workspace on public.aviso (workspace_id);
alter table public.aviso enable row level security;
revoke all on public.aviso from anon, authenticated;
grant select on public.aviso to authenticated;
drop policy if exists aviso_ler on public.aviso;
create policy aviso_ler on public.aviso for select to authenticated using (user_id = (select auth.uid()));
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aviso') then
    execute 'alter publication supabase_realtime add table public.aviso';
  end if;
end $$;

-- avisa quem tem a capacidade na unidade (ou acima), menos quem fez a ação
create or replace function public.avisar_gestores(p_ws uuid, p_unidade uuid, p_cap text, p_tipo text, p_titulo text, p_texto text, p_ref uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.aviso(workspace_id, user_id, tipo, titulo, texto, ref_id)
  select distinct p_ws, p.user_id, p_tipo, p_titulo, p_texto, p_ref
    from public.acesso a
    join public.pessoa p on p.id = a.pessoa_id
    join public.unidade u on u.id = a.unidade_id
    join public.unidade t on t.id = p_unidade
   where p.user_id is not null and p.status = 'ativo' and p.workspace_id = p_ws
     and t.caminho like u.caminho || '%'
     and (p_cap = any(a.capacidades) or 'administrar' = any(a.capacidades))
     and p.user_id is distinct from auth.uid();
$$;
create or replace function public.avisar_pessoa(p_pessoa uuid, p_tipo text, p_titulo text, p_texto text, p_ref uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.aviso(workspace_id, user_id, tipo, titulo, texto, ref_id)
  select p.workspace_id, p.user_id, p_tipo, p_titulo, p_texto, p_ref from public.pessoa p
   where p.id = p_pessoa and p.user_id is not null and p.user_id is distinct from auth.uid();
$$;
revoke all on function public.avisar_gestores(uuid,uuid,text,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.avisar_pessoa(uuid,text,text,text,uuid) from public, anon, authenticated;

create or replace function public.apagar_aviso(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.aviso where id = p_id and user_id = auth.uid();
$$;
create or replace function public.apagar_avisos() returns void
language sql security definer set search_path = '' as $$
  delete from public.aviso where user_id = auth.uid();
$$;
create or replace function public.marcar_avisos_lidos() returns void
language sql security definer set search_path = '' as $$
  update public.aviso set lido_em = now() where user_id = auth.uid() and lido_em is null;
$$;
revoke all on function public.apagar_aviso(uuid) from public, anon;
revoke all on function public.apagar_avisos() from public, anon;
revoke all on function public.marcar_avisos_lidos() from public, anon;
grant execute on function public.apagar_aviso(uuid) to authenticated;
grant execute on function public.apagar_avisos() to authenticated;
grant execute on function public.marcar_avisos_lidos() to authenticated;

-- ---------- reload ----------
create table if not exists public.reload (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pessoa_id uuid not null references public.pessoa(id) on delete cascade,
  unidade_id uuid references public.unidade(id),
  valor numeric(12,2) not null check (valor > 0),
  sala text,
  motivo text,
  status text not null default 'solicitado' check (status in ('solicitado','aprovado','recusado','cancelado','enviado')),
  solicitado_em timestamptz not null default now(),
  decidido_por uuid, decidido_em timestamptz, motivo_recusa text,
  enviado_valor numeric(12,2), enviado_em timestamptz, aporte_id uuid references public.aporte(id)
);
create index if not exists reload_pessoa on public.reload (pessoa_id);
create index if not exists reload_workspace on public.reload (workspace_id);
create index if not exists reload_unidade on public.reload (unidade_id);
create index if not exists reload_aporte on public.reload (aporte_id);
create unique index if not exists reload_um_aberto on public.reload (pessoa_id) where status in ('solicitado','aprovado');
alter table public.reload enable row level security;
revoke all on public.reload from anon, authenticated;
grant select on public.reload to authenticated;
drop policy if exists reload_ler on public.reload;
create policy reload_ler on public.reload for select to authenticated
  using (pessoa_id in (select public.minhas_pessoas()) or unidade_id in (select public.unidades_com('ver_financeiro')));

create or replace function public.pedir_reload(p_valor numeric, p_sala text default null, p_motivo text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p uuid; ws uuid; u uuid; nome text; novo uuid;
begin
  select pe.id, pe.workspace_id, pe.nome into p, ws, nome from public.pessoa pe
   where pe.user_id = auth.uid() and pe.status = 'ativo'
     and exists (select 1 from public.vinculo v where v.pessoa_id = pe.id and v.fim is null) limit 1;
  if p is null then raise exception 'só quem joga no time pede reload' using errcode = 'insufficient_privilege'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 1000000 then raise exception 'valor do reload'; end if;
  if exists (select 1 from public.reload where pessoa_id = p and status in ('solicitado','aprovado')) then
    raise exception 'já existe um reload em aberto'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p and fim is null;
  insert into public.reload(workspace_id, pessoa_id, unidade_id, valor, sala, motivo)
  values (ws, p, u, round(p_valor, 2), nullif(btrim(p_sala), ''), nullif(btrim(p_motivo), '')) returning id into novo;
  perform public.avisar_gestores(ws, u, 'aprovar_saques', 'reload', nome || ' pediu reload de ' || public.fmt_usd(round(p_valor, 2)),
                                 concat_ws(' · ', nullif(btrim(p_sala), ''), nullif(btrim(p_motivo), '')), novo);
  return novo;
end $$;

create or replace function public.cancelar_reload(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.reload r set status = 'cancelado', decidido_em = now(), decidido_por = auth.uid()
   where r.id = p_id and r.status = 'solicitado' and r.pessoa_id in (select x.id from public.pessoa x where x.user_id = auth.uid());
  if not found then raise exception 'só o próprio jogador cancela, e só enquanto está solicitado'; end if;
end $$;

create or replace function public.decidir_reload(p_id uuid, p_aprovar boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.reload where id = p_id for update;
  if r.id is null or not public.pode('aprovar_saques', r.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = r.pessoa_id and user_id = auth.uid()) then
    raise exception 'ninguém aprova o próprio reload' using errcode = 'insufficient_privilege'; end if;
  if r.status <> 'solicitado' then raise exception 'reload não está aguardando decisão (está %)', r.status; end if;
  if not p_aprovar and coalesce(btrim(p_motivo), '') = '' then raise exception 'diga o motivo da recusa'; end if;
  update public.reload set status = case when p_aprovar then 'aprovado' else 'recusado' end,
         decidido_por = auth.uid(), decidido_em = now(), motivo_recusa = case when p_aprovar then null else p_motivo end where id = p_id;
  perform public.avisar_pessoa(r.pessoa_id, 'reload', case when p_aprovar then 'Reload aprovado' else 'Reload recusado' end,
                               case when p_aprovar then 'O time vai mandar ' || public.fmt_usd(r.valor) || '.' else p_motivo end, p_id);
end $$;

-- o time mandou o dinheiro: vira aporte (MU sobe) e o reload fecha
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
  insert into public.aporte(workspace_id, pessoa_id, unidade_id, valor, data, observacao)
  values (r.workspace_id, r.pessoa_id, r.unidade_id, round(p_valor, 2), current_date, 'reload' || coalesce(' · ' || r.sala, '')) returning id into ap;
  update public.reload set status = 'enviado', enviado_valor = round(p_valor, 2), enviado_em = now(), aporte_id = ap where id = p_id;
  perform public.avisar_pessoa(r.pessoa_id, 'reload', 'Reload enviado', public.fmt_usd(round(p_valor, 2)) || ' entrou no seu MU.', p_id);
  return ap;
end $$;

do $$
declare f text;
begin
  foreach f in array array['pedir_reload(numeric,text,text)','cancelar_reload(uuid)','decidir_reload(uuid,boolean,text)','confirmar_envio_reload(uuid,numeric)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- avisos dos fluxos que já existem (gatilhos: não muda as funções de saque, planilha e convite) ----------
create or replace function public.aviso_saque() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nome text;
begin
  select pe.nome into nome from public.pessoa pe where pe.id = new.pessoa_id;
  if tg_op = 'INSERT' then
    perform public.avisar_gestores(new.workspace_id, new.unidade_id, 'aprovar_saques', 'saque', nome || ' pediu saque',
      'Time recebe ' || public.fmt_usd(new.total_time) || ' (MU ' || public.fmt_usd(new.devolucao) || ' + cashout ' || public.fmt_usd(new.cashout) || ')', new.id);
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
drop trigger if exists aviso_saque on public.saque;
create trigger aviso_saque after insert or update of status on public.saque for each row execute function public.aviso_saque();

create or replace function public.aviso_abertura() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nome text;
begin
  select pe.nome into nome from public.pessoa pe where pe.id = new.pessoa_id;
  if new.status = 'enviada' and (tg_op = 'INSERT' or new.enviado_em is distinct from old.enviado_em) then
    perform public.avisar_gestores(new.workspace_id, new.unidade_id, 'aprovar_saques', 'planilha', nome || ' enviou a planilha pra conferir',
      'MakeUp ' || public.fmt_usd(new.mu) || ' · cashout ' || public.fmt_usd(new.cashout), new.id);
  elsif tg_op = 'UPDATE' and new.status = 'confirmada' and old.status <> 'confirmada' then
    perform public.avisar_pessoa(new.pessoa_id, 'planilha', 'Planilha conferida pelo time', null, new.id);
  end if;
  return null;
end $$;
drop trigger if exists aviso_abertura on public.abertura;
create trigger aviso_abertura after insert or update on public.abertura for each row execute function public.aviso_abertura();

-- alguém entrou no time pelo convite (pessoa ganhou conta)
create or replace function public.aviso_entrada() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  if new.user_id is not null and new.status = 'ativo' and old.user_id is null then
    select v.unidade_id into u from public.vinculo v where v.pessoa_id = new.id and v.fim is null;
    if u is null then select a.unidade_id into u from public.acesso a where a.pessoa_id = new.id limit 1; end if;
    if u is not null then
      perform public.avisar_gestores(new.workspace_id, u, 'gerir_pessoas', 'entrada', new.nome || ' entrou no time', null, new.id);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists aviso_entrada on public.pessoa;
create trigger aviso_entrada after update of user_id on public.pessoa for each row execute function public.aviso_entrada();
-- link da reta: a pessoa nasce com a conta e o vínculo vem logo depois; avisa no vínculo de entrada
create or replace function public.aviso_entrada_vinculo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pe record;
begin
  select * into pe from public.pessoa where id = new.pessoa_id;
  if new.motivo = 'entrada' and pe.user_id is not null and pe.status = 'ativo' then
    perform public.avisar_gestores(pe.workspace_id, new.unidade_id, 'gerir_pessoas', 'entrada', pe.nome || ' entrou no time', null, pe.id);
  end if;
  return null;
end $$;
drop trigger if exists aviso_entrada_vinculo on public.vinculo;
create trigger aviso_entrada_vinculo after insert on public.vinculo for each row execute function public.aviso_entrada_vinculo();
revoke all on function public.aviso_entrada_vinculo() from public, anon, authenticated;
revoke all on function public.aviso_saque() from public, anon, authenticated;
revoke all on function public.aviso_abertura() from public, anon, authenticated;
revoke all on function public.aviso_entrada() from public, anon, authenticated;
