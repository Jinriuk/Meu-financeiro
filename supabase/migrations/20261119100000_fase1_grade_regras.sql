-- ============================================================
-- Fase 1: grade da reta e regras por unidade (herdadas para baixo, com data de vigência). Idempotente.
-- grade: o mesmo quadro da planilha do time (sala × linha × Regular / Prog KO / Hyper), com o TEXTO que o
--   professor escreve ("até $2,50 + $3 2k+"). Quem lê e classifica cada torneio é o app (dentro / atenção / fora).
--   Vale a grade da unidade do torneio ou, se ela não tem, a da unidade mais próxima acima; a vigente na data.
--   "simulada" = grade montada sem a planilha oficial da reta: o app mostra o aviso até alguém gravar a real.
-- regra_unidade: chave/valor herdado do mesmo jeito (a unidade mais funda com a regra, a mais nova até a data).
--   Hoje: bloquear_promocao_com_mk (o servidor recusa promover quem está em MK) e jogador_ve_ranking.
-- Gravar grade avisa no sininho os jogadores das unidades que ela cobre.
-- ============================================================

create table if not exists public.grade (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  unidade_id uuid not null references public.unidade(id) on delete cascade,
  vigente_desde date not null default current_date,
  simulada boolean not null default false,
  celulas jsonb not null default '[]'::jsonb check (jsonb_typeof(celulas) = 'array'),
  observacao text check (observacao is null or length(observacao) <= 500),
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (unidade_id, vigente_desde)
);
create index if not exists grade_ws on public.grade (workspace_id);
alter table public.grade enable row level security;
revoke all on public.grade from anon, authenticated;
grant select on public.grade to authenticated;
drop policy if exists grade_ler on public.grade;
create policy grade_ler on public.grade for select to authenticated
  using (workspace_id in (select public.my_workspaces()));       -- regra do time: todo mundo do time enxerga

create table if not exists public.regra_unidade (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  unidade_id uuid not null references public.unidade(id) on delete cascade,
  chave text not null check (chave in ('bloquear_promocao_com_mk', 'jogador_ve_ranking')),
  valor jsonb not null,
  vigente_desde date not null default current_date,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (unidade_id, chave, vigente_desde)
);
create index if not exists regra_unidade_ws on public.regra_unidade (workspace_id);
alter table public.regra_unidade enable row level security;
revoke all on public.regra_unidade from anon, authenticated;
grant select on public.regra_unidade to authenticated;
drop policy if exists regra_unidade_ler on public.regra_unidade;
create policy regra_unidade_ler on public.regra_unidade for select to authenticated
  using (workspace_id in (select public.my_workspaces()));

-- ---------- grade ----------
create or replace function public.salvar_grade(p_unidade uuid, p_desde date, p_simulada boolean, p_celulas jsonb, p_obs text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u record; limpas jsonb := '[]'::jsonb; c jsonb; k text; linha jsonb; gid uuid; pes record; rot text;
begin
  select * into u from public.unidade where id = p_unidade;
  if u.id is null then raise exception 'unidade não existe'; end if;
  if not public.pode('configurar_regras', p_unidade) then
    raise exception 'precisa de "configurar_regras" nesta unidade' using errcode = 'insufficient_privilege'; end if;
  if p_celulas is null or jsonb_typeof(p_celulas) <> 'array' then raise exception 'grade inválida'; end if;
  if jsonb_array_length(p_celulas) = 0 then raise exception 'grade vazia'; end if;
  if jsonb_array_length(p_celulas) > 300 then raise exception 'grade grande demais (máximo 300 linhas)'; end if;
  -- só as 5 colunas do quadro, como texto curto
  for c in select x from jsonb_array_elements(p_celulas) x loop
    if jsonb_typeof(c) <> 'object' then raise exception 'linha da grade inválida'; end if;
    linha := '{}'::jsonb;
    foreach k in array array['site','tipo','regular','prog_ko','hyper'] loop
      if c ? k and jsonb_typeof(c->k) not in ('string','number','null') then raise exception 'célula inválida em %', k; end if;
      if length(coalesce(c->>k, '')) > 300 then raise exception 'texto grande demais em %', k; end if;
      linha := linha || jsonb_build_object(k, btrim(coalesce(c->>k, '')));
    end loop;
    if linha->>'site' = '' or linha->>'tipo' = '' then raise exception 'toda linha precisa de sala e linha (Semanal, Sunday…)'; end if;
    limpas := limpas || jsonb_build_array(linha);
  end loop;
  insert into public.grade(workspace_id, unidade_id, vigente_desde, simulada, celulas, observacao, criado_por)
  values (u.workspace_id, p_unidade, coalesce(p_desde, current_date), coalesce(p_simulada, false), limpas,
          nullif(btrim(coalesce(p_obs, '')), ''), auth.uid())
  on conflict (unidade_id, vigente_desde) do update
     set simulada = excluded.simulada, celulas = excluded.celulas, observacao = excluded.observacao,
         criado_por = excluded.criado_por, criado_em = now()
  returning id into gid;
  -- avisa os jogadores que a grade cobre (vínculo ativo na unidade ou abaixo)
  rot := case when coalesce(p_simulada, false) then 'Grade simulada na ' else 'Grade nova na ' end || u.nome;
  for pes in select distinct v.pessoa_id from public.vinculo v join public.unidade t on t.id = v.unidade_id
              where v.fim is null and t.caminho like u.caminho || '%' loop
    perform public.avisar_pessoa(pes.pessoa_id, 'grade', rot,
      'Vale desde ' || to_char(coalesce(p_desde, current_date), 'DD/MM/YYYY') ||
      case when coalesce(p_simulada, false) then '. Montada sem a planilha oficial: confirme com o professor.' else '.' end, gid);
  end loop;
  return gid;
end $$;

create or replace function public.apagar_grade(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g record;
begin
  select * into g from public.grade where id = p_id;
  if g.id is null then raise exception 'grade não existe'; end if;
  if not public.pode('configurar_regras', g.unidade_id) then
    raise exception 'precisa de "configurar_regras" nesta unidade' using errcode = 'insufficient_privilege'; end if;
  delete from public.grade where id = p_id;
end $$;

-- ---------- regras herdadas ----------
create or replace function public.regra_efetiva(p_unidade uuid, p_chave text, p_data date default current_date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select r.valor
    from public.regra_unidade r
    join public.unidade u on u.id = r.unidade_id
    join public.unidade alvo on alvo.id = p_unidade and alvo.workspace_id = u.workspace_id
                            and alvo.workspace_id in (select public.my_workspaces())
   where r.chave = p_chave and r.vigente_desde <= coalesce(p_data, current_date)
     and alvo.caminho like u.caminho || '%'
   order by length(u.caminho) desc, r.vigente_desde desc
   limit 1;
$$;

create or replace function public.definir_regra(p_unidade uuid, p_chave text, p_valor jsonb, p_desde date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare u record;
begin
  select * into u from public.unidade where id = p_unidade;
  if u.id is null then raise exception 'unidade não existe'; end if;
  if not public.pode('configurar_regras', p_unidade) then
    raise exception 'precisa de "configurar_regras" nesta unidade' using errcode = 'insufficient_privilege'; end if;
  if p_chave not in ('bloquear_promocao_com_mk', 'jogador_ve_ranking') then raise exception 'regra desconhecida: %', p_chave; end if;
  if jsonb_typeof(p_valor) <> 'boolean' then raise exception 'essa regra é ligada ou desligada (true/false)'; end if;
  insert into public.regra_unidade(workspace_id, unidade_id, chave, valor, vigente_desde, criado_por)
  values (u.workspace_id, p_unidade, p_chave, p_valor, coalesce(p_desde, current_date), auth.uid())
  on conflict (unidade_id, chave, vigente_desde) do update set valor = excluded.valor, criado_por = excluded.criado_por, criado_em = now();
end $$;

-- ---------- MK: banca (salas + resultados + movimentos − saques pagos) abaixo do MU ----------
-- mesma conta do resumo_time e da situacao_jogador; interna (sem checagem de quem pergunta)
create or replace function public.em_mk(p_pessoa uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare ab record; desde timestamptz; mu numeric; banca numeric;
begin
  select a.mu, a.confirmado_em, a.status into ab from public.abertura a where a.pessoa_id = p_pessoa;
  desde := case when ab.status = 'confirmada' then ab.confirmado_em else '-infinity'::timestamptz end;
  select coalesce(sum(valor), 0) into mu from public.aporte where pessoa_id = p_pessoa and criado_em > desde;
  select mu - coalesce(sum(devolucao), 0) into mu from public.saque where pessoa_id = p_pessoa and status = 'pago' and pago_em > desde;
  if ab.status = 'confirmada' then mu := mu + ab.mu; end if;
  select coalesce((select sum(w.saldo_inicial) from public.player_wallets w where w.pessoa_id = p_pessoa), 0)
       + coalesce((select sum(t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end)
                     from public.tournaments t where t.pessoa_id = p_pessoa), 0)
       + coalesce((select sum(l.entrada - l.saida) from public.bankroll_ledger l where l.pessoa_id = p_pessoa), 0)
       - coalesce((select sum(q.devolucao + q.cashout) from public.saque q where q.pessoa_id = p_pessoa and q.status = 'pago'), 0)
    into banca;
  return round(banca, 2) < round(mu, 2);
end $$;

-- mover_jogador: igual ao anterior + "bloquear promoção com MK" (regra da unidade de origem) recusado no servidor
create or replace function public.mover_jogador(p_alvo uuid, p_destino uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare atual record; cap text;
begin
  if p_motivo not in ('promocao','rebaixamento','transferencia') then raise exception 'motivo inválido'; end if;
  cap := case when p_motivo = 'transferencia' then 'gerir_pessoas' else 'promover' end;
  select * into atual from public.vinculo where pessoa_id = p_alvo and fim is null;
  if atual is null then raise exception 'jogador sem vínculo ativo'; end if;
  if atual.unidade_id = p_destino then raise exception 'jogador já está nesta unidade'; end if;
  if not (public.pode(cap, atual.unidade_id) and public.pode(cap, p_destino)) then
    raise exception 'precisa de "%" na unidade de origem e na de destino', cap using errcode = 'insufficient_privilege'; end if;
  if (select arquivada from public.unidade where id = p_destino) then raise exception 'unidade de destino arquivada'; end if;
  if p_motivo = 'promocao' and coalesce((public.regra_efetiva(atual.unidade_id, 'bloquear_promocao_com_mk'))::boolean, false)
     and public.em_mk(p_alvo) then
    raise exception 'jogador em MK: este time não promove com MK' using errcode = 'check_violation'; end if;
  update public.vinculo set fim = greatest(current_date, inicio) where id = atual.id;
  insert into public.vinculo(pessoa_id, unidade_id, inicio, motivo) values (p_alvo, p_destino, current_date, p_motivo);
  perform public.recalcular_fatos(p_alvo);
end $$;

revoke all on function public.salvar_grade(uuid,date,boolean,jsonb,text) from public, anon;
revoke all on function public.apagar_grade(uuid) from public, anon;
revoke all on function public.regra_efetiva(uuid,text,date) from public, anon;
revoke all on function public.definir_regra(uuid,text,jsonb,date) from public, anon;
revoke all on function public.em_mk(uuid) from public, anon, authenticated;
revoke all on function public.mover_jogador(uuid,uuid,text) from public, anon;
grant execute on function public.salvar_grade(uuid,date,boolean,jsonb,text) to authenticated;
grant execute on function public.apagar_grade(uuid) to authenticated;
grant execute on function public.regra_efetiva(uuid,text,date) to authenticated;
grant execute on function public.definir_regra(uuid,text,jsonb,date) to authenticated;
grant execute on function public.mover_jogador(uuid,uuid,text) to authenticated;
