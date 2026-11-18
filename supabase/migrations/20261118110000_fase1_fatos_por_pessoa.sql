-- ============================================================
-- Fase 1 · passo 2: fatos ligados à PESSOA e à UNIDADE em que ela estava na data. Idempotente.
--
-- Fatos de desempenho : tournaments, hh_tournament_stats, daily_entries, hh_import_log  → ler: 'ver_desempenho'
-- Fatos de dinheiro    : bankroll_ledger, withdrawals, player_wallets                    → ler: 'ver_financeiro'
-- Configuração do time : pool_config, config_changes                                     → gravar: 'configurar_regras' na raiz
--
-- Workspace SEM estrutura (solo, ou time ainda não estruturado): nada muda, membro vê e grava tudo.
-- Workspace COM estrutura (tem unidades):
--   ler    : o próprio fato, ou quem tem a capacidade de leitura na unidade do fato (ou acima dela)
--   gravar : o próprio fato, ou quem administra a unidade ('aprovar_saques' também grava dinheiro)
-- A pessoa vem do nome do jogador (o app manda `player`); a unidade é a do vínculo ativo na data do fato.
-- Fato sem pessoa (ex.: movimento "Pool / Reserva") fica na unidade raiz: só a gestão do time inteiro vê.
-- As policies usam conjuntos calculados uma vez por consulta (não uma função por linha).
-- ============================================================

-- o fato acha a pessoa pelo nome: dois ativos com o mesmo nome no mesmo time seriam ambíguos
create unique index if not exists pessoa_nome_unico on public.pessoa (workspace_id, lower(btrim(nome))) where status <> 'saiu';

-- ---------- conjuntos do usuário logado ----------
create or replace function public.ws_estruturados() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct u.workspace_id from public.unidade u where u.workspace_id in (select public.my_workspaces());
$$;
create or replace function public.minhas_pessoas() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.pessoa p where p.user_id = auth.uid() and p.status = 'ativo';
$$;
-- unidades (com as de baixo) em que tenho a capacidade; 'administrar' vale por todas (mesma regra do pode())
create or replace function public.unidades_com(cap text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct t.id
    from public.acesso a
    join public.pessoa p on p.id = a.pessoa_id
    join public.unidade u on u.id = a.unidade_id
    join public.unidade t on t.workspace_id = u.workspace_id and t.caminho like u.caminho || '%'
   where p.user_id = auth.uid() and p.status = 'ativo'
     and (cap = any(a.capacidades) or 'administrar' = any(a.capacidades));
$$;
-- workspaces em que tenho a capacidade na RAIZ (regras do time inteiro)
create or replace function public.ws_com(cap text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.workspace_id from public.unidade u where u.mae_id is null and u.id in (select public.unidades_com(cap));
$$;
do $$
declare f text;
begin
  foreach f in array array['ws_estruturados()','minhas_pessoas()','unidades_com(text)','ws_com(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- unidade da pessoa na data (vínculo daquele dia; no dia da troca vale o mais novo); sem vínculo → raiz
create or replace function public.unidade_na_data(p uuid, d date, ws uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select v.unidade_id from public.vinculo v
      where p is not null and v.pessoa_id = p and v.inicio <= d and (v.fim is null or v.fim >= d)
      order by v.inicio desc, v.criado_em desc limit 1),
    (select u.id from public.unidade u where u.workspace_id = ws and u.mae_id is null order by u.criado_em limit 1));
$$;
revoke all on function public.unidade_na_data(uuid, date, uuid) from public, anon, authenticated;

-- ---------- gatilho: preenche pessoa e unidade ----------
-- roda DEPOIS do set_ws (gatilhos BEFORE disparam em ordem alfabética: "set_ws" < "zz_fato_pessoa")
-- O nome do jogador manda: no insert, e no update quando o nome ou a pessoa mudam. A unidade é sempre recalculada.
create or replace function public.fato_pessoa_unidade() returns trigger
language plpgsql security definer set search_path = '' as $$
declare j jsonb := to_jsonb(new); v_nome text; d date; resolver boolean;
begin
  if new.workspace_id is null or not exists (select 1 from public.unidade where workspace_id = new.workspace_id) then
    new.pessoa_id := null; new.unidade_id := null;
    return new;
  end if;
  v_nome := nullif(btrim(j->>'player'), '');
  if tg_op = 'INSERT' then
    resolver := true;
  else
    resolver := new.pessoa_id is null or new.pessoa_id is distinct from old.pessoa_id
             or v_nome is distinct from nullif(btrim(to_jsonb(old)->>'player'), '');
  end if;
  if v_nome is not null and resolver then
    new.pessoa_id := (select x.id from public.pessoa x
                       where x.workspace_id = new.workspace_id and lower(btrim(x.nome)) = lower(v_nome)
                       order by (x.status = 'saiu'), x.criado_em limit 1);
  end if;
  if new.pessoa_id is not null and not exists (select 1 from public.pessoa x where x.id = new.pessoa_id and x.workspace_id = new.workspace_id) then
    raise exception 'pessoa de outro workspace' using errcode = 'check_violation';
  end if;
  d := coalesce(left(nullif(j->>tg_argv[0], ''), 10)::date, current_date);
  new.unidade_id := public.unidade_na_data(new.pessoa_id, d, new.workspace_id);
  return new;
end $$;
revoke all on function public.fato_pessoa_unidade() from public, anon, authenticated;

-- ---------- colunas, gatilho e policies nas tabelas de fato ----------
do $$
declare r record; ler text; gravar text;
begin
  for r in select * from (values
      ('tournaments','entry_date','ver_desempenho','administrar'),
      ('hh_tournament_stats','entry_date','ver_desempenho','administrar'),
      ('daily_entries','entry_date','ver_desempenho','administrar'),
      ('hh_import_log','created_at','ver_desempenho','administrar'),
      ('bankroll_ledger','entry_date','ver_financeiro','aprovar_saques'),
      ('withdrawals','week_ending_date','ver_financeiro','aprovar_saques'),
      ('player_wallets','','ver_financeiro','aprovar_saques')
    ) as t(tabela, coluna_data, cap_ler, cap_gravar)
  loop
    continue when to_regclass('public.' || r.tabela) is null;
    execute format('alter table public.%I add column if not exists pessoa_id uuid references public.pessoa(id), add column if not exists unidade_id uuid references public.unidade(id)', r.tabela);
    execute format('create index if not exists %I on public.%I (pessoa_id) where pessoa_id is not null', r.tabela || '_pessoa', r.tabela);
    execute format('create index if not exists %I on public.%I (unidade_id) where unidade_id is not null', r.tabela || '_unidade', r.tabela);
    execute format('drop trigger if exists zz_fato_pessoa on public.%I', r.tabela);
    execute format('create trigger zz_fato_pessoa before insert or update on public.%I for each row execute function public.fato_pessoa_unidade(%L)', r.tabela, r.coluna_data);

    ler := format($c$workspace_id in (select public.my_workspaces())
      and (workspace_id not in (select public.ws_estruturados())
           or pessoa_id in (select public.minhas_pessoas())
           or unidade_id in (select public.unidades_com(%L)))$c$, r.cap_ler);
    gravar := format($c$workspace_id in (select public.my_workspaces())
      and (workspace_id not in (select public.ws_estruturados())
           or pessoa_id in (select public.minhas_pessoas())
           or unidade_id in (select public.unidades_com(%L)))$c$, r.cap_gravar);

    -- a policy antiga "membro vê tudo" (ws_members) vira: membro + (sem estrutura OU escopo)
    execute format('drop policy if exists ws_members on public.%I', r.tabela);
    execute format('drop policy if exists fato_ler on public.%I', r.tabela);
    execute format('drop policy if exists fato_inserir on public.%I', r.tabela);
    execute format('drop policy if exists fato_editar on public.%I', r.tabela);
    execute format('drop policy if exists fato_apagar on public.%I', r.tabela);
    execute format('create policy fato_ler on public.%I for select to authenticated using (%s)', r.tabela, ler);
    execute format('create policy fato_inserir on public.%I for insert to authenticated with check (%s)', r.tabela, gravar);
    -- UPDATE: USING = quem lê, WITH CHECK = quem grava. Quem só vê e tenta editar recebe 403 (não um "0 linhas" mudo).
    execute format('create policy fato_editar on public.%I for update to authenticated using (%s) with check (%s)', r.tabela, ler, gravar);
    execute format('create policy fato_apagar on public.%I for delete to authenticated using (%s)', r.tabela, gravar);
  end loop;
end $$;

-- ---------- configuração do time: todos leem, só quem configura regras grava ----------
do $$
declare t text; gravar text := $c$workspace_id in (select public.my_workspaces())
      and (workspace_id not in (select public.ws_estruturados()) or workspace_id in (select public.ws_com('configurar_regras')))$c$;
begin
  foreach t in array array['pool_config','config_changes'] loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop policy if exists ws_members on public.%I', t);
    execute format('drop policy if exists config_ler on public.%I', t);
    execute format('drop policy if exists config_inserir on public.%I', t);
    execute format('drop policy if exists config_editar on public.%I', t);
    execute format('drop policy if exists config_apagar on public.%I', t);
    execute format('create policy config_ler on public.%I for select to authenticated using (workspace_id in (select public.my_workspaces()))', t);
    execute format('create policy config_inserir on public.%I for insert to authenticated with check (%s)', t, gravar);
    execute format('create policy config_editar on public.%I for update to authenticated using (workspace_id in (select public.my_workspaces())) with check (%s)', t, gravar);
    execute format('create policy config_apagar on public.%I for delete to authenticated using (%s)', t, gravar);
  end loop;
end $$;

-- ---------- recalcular a unidade dos fatos de uma pessoa (depois de mover ou corrigir vínculo) ----------
create or replace function public.recalcular_fatos(p uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  foreach t in array array['tournaments','hh_tournament_stats','daily_entries','hh_import_log','bankroll_ledger','withdrawals','player_wallets'] loop
    if to_regclass('public.' || t) is not null then
      execute format('update public.%I set unidade_id = unidade_id where pessoa_id = $1', t) using p;   -- o gatilho recalcula
    end if;
  end loop;
end $$;
revoke all on function public.recalcular_fatos(uuid) from public, anon, authenticated;

-- mover_jogador: igual ao passo 1 + recalcula os fatos (os de antes da troca ficam na unidade antiga)
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
  update public.vinculo set fim = greatest(current_date, inicio) where id = atual.id;
  insert into public.vinculo(pessoa_id, unidade_id, inicio, motivo) values (p_alvo, p_destino, current_date, p_motivo);
  perform public.recalcular_fatos(p_alvo);
end $$;

-- registrar_saida: igual ao passo 1 + tira a conta do workspace (sem isso quem saiu continuava lendo a configuração)
create or replace function public.registrar_saida(p_alvo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid; quem record;
begin
  select unidade_id into u from public.vinculo where pessoa_id = p_alvo and fim is null;
  if u is null or not public.pode('gerir_pessoas', u) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select workspace_id, user_id into quem from public.pessoa where id = p_alvo;
  update public.vinculo set fim = greatest(current_date, inicio) where pessoa_id = p_alvo and fim is null;
  update public.pessoa set status = 'saiu' where id = p_alvo;
  delete from public.acesso where pessoa_id = p_alvo;
  if quem.user_id is not null then
    delete from public.workspace_members where workspace_id = quem.workspace_id and user_id = quem.user_id and role <> 'owner';
  end if;
end $$;
revoke all on function public.mover_jogador(uuid,uuid,text) from public, anon;
revoke all on function public.registrar_saida(uuid) from public, anon;
grant execute on function public.mover_jogador(uuid,uuid,text) to authenticated;
grant execute on function public.registrar_saida(uuid) to authenticated;

-- ---------- estruturar um workspace que já existe (migração dos times atuais) ----------
-- Só pelo servidor (SQL Editor). jogadores = [{"nome":"Fulano","user_id":"…","admin":true,"joga":true}, …]
-- Cria a raiz com o nome do workspace, as pessoas, o vínculo de quem joga (desde sempre) e o acesso de quem
-- administra; depois liga os fatos existentes às pessoas pelo nome do jogador.
create or replace function public.estruturar_workspace(ws uuid, jogadores jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare raiz uuid; j jsonb; p uuid; t text; uid uuid;
begin
  if exists (select 1 from public.unidade where workspace_id = ws) then raise exception 'workspace já estruturado'; end if;
  insert into public.unidade(workspace_id, nome, rotulo) select ws, name, 'Time' from public.workspaces where id = ws returning id into raiz;
  if raiz is null then raise exception 'workspace não existe'; end if;
  for j in select * from jsonb_array_elements(jogadores) loop
    uid := nullif(j->>'user_id', '')::uuid;
    if uid is not null and not exists (select 1 from public.workspace_members where workspace_id = ws and user_id = uid) then
      raise exception 'conta % não é membro do workspace', uid; end if;
    insert into public.pessoa(workspace_id, user_id, nome, status)
    values (ws, uid, j->>'nome', case when uid is null then 'convidado' else 'ativo' end)
    returning id into p;
    if coalesce((j->>'joga')::boolean, true) then
      insert into public.vinculo(pessoa_id, unidade_id, inicio, motivo) values (p, raiz, date '2000-01-01', 'entrada');
    end if;
    if coalesce((j->>'admin')::boolean, false) then
      insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p, raiz, array['administrar']);
    end if;
  end loop;
  foreach t in array array['tournaments','hh_tournament_stats','daily_entries','hh_import_log','bankroll_ledger','withdrawals','player_wallets'] loop
    if to_regclass('public.' || t) is not null then
      execute format('update public.%I set pessoa_id = null where workspace_id = $1', t) using ws;   -- o gatilho liga pelo nome
    end if;
  end loop;
  return raiz;
end $$;
revoke all on function public.estruturar_workspace(uuid, jsonb) from public, anon, authenticated;
