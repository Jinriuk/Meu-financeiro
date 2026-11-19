-- ============================================================
-- Fase 1: papéis da gestão, convite único e manutenção da estrutura. Idempotente.
-- convidar_equipe  : professor / financeiro / admin num convite só (várias unidades) e, se também joga, já com a reta.
-- definir_papel    : troca de uma vez o papel e as unidades de alguém da gestão; sem papel e sem reta, a pessoa sai do time.
--                    O time nunca fica sem um admin com conta (a trava é no servidor).
-- renomear_pessoa  : troca o nome e acompanha os lançamentos dela (o fato se liga à pessoa pelo nome).
-- renomear_unidade / arquivar_unidade : estrutura sem precisar de SQL.
-- ver_convite      : também diz o papel de quem vai entrar (a tela do link mostra "você entra como professor").
-- ============================================================

-- capacidades válidas (as mesmas da tabela acesso)
create or replace function public.caps_validas(p_caps text[]) returns boolean
language sql immutable set search_path = '' as $$
  select p_caps is not null and cardinality(p_caps) > 0 and p_caps <@ array[
    'ver_desempenho','gerir_pessoas','promover','configurar_regras','ver_financeiro','aprovar_saques','administrar']::text[];
$$;
revoke all on function public.caps_validas(text[]) from public, anon, authenticated;

-- raiz do time de uma unidade/pessoa
create or replace function public.raiz_do_ws(p_ws uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.unidade where workspace_id = p_ws and mae_id is null order by criado_em limit 1;
$$;
revoke all on function public.raiz_do_ws(uuid) from public, anon, authenticated;

-- o time precisa de pelo menos um admin da raiz com conta ativa
create or replace function public.checar_admin_do_time(p_ws uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.acesso a join public.pessoa p on p.id = a.pessoa_id
                  where a.unidade_id = public.raiz_do_ws(p_ws) and 'administrar' = any(a.capacidades)
                    and p.user_id is not null and p.status = 'ativo') then
    raise exception 'o time precisa de pelo menos um admin com conta: dê o papel de admin a outra pessoa antes' using errcode = 'check_violation';
  end if;
end $$;
revoke all on function public.checar_admin_do_time(uuid) from public, anon, authenticated;

create or replace function public.convidar_equipe(p_nome text, p_unidades uuid[], p_caps text[], p_joga_em uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ws uuid; u uuid; p uuid; v_nome text := left(btrim(coalesce(p_nome, '')), 60);
begin
  if v_nome = '' then raise exception 'nome de quem vai entrar'; end if;
  if not public.caps_validas(p_caps) then raise exception 'papel inválido'; end if;
  if p_unidades is null or cardinality(p_unidades) = 0 then raise exception 'escolha onde a pessoa vai cuidar'; end if;
  if cardinality(p_unidades) > 50 then raise exception 'unidades demais'; end if;
  select workspace_id into ws from public.unidade where id = p_unidades[1];
  foreach u in array p_unidades loop
    if not exists (select 1 from public.unidade where id = u and workspace_id = ws and not arquivada) then
      raise exception 'unidade inválida ou arquivada'; end if;
    if not public.pode('administrar', u) then
      raise exception 'só quem administra convida professor, financeiro ou admin' using errcode = 'insufficient_privilege'; end if;
  end loop;
  if p_joga_em is not null and not exists (select 1 from public.unidade where id = p_joga_em and workspace_id = ws and not arquivada) then
    raise exception 'reta de jogo inválida'; end if;
  begin
    insert into public.pessoa(workspace_id, nome) values (ws, v_nome) returning id into p;
  exception when unique_violation then
    raise exception 'já tem alguém com o nome "%" no time', v_nome;
  end;
  insert into public.acesso(pessoa_id, unidade_id, capacidades)
  select p, x, (select array_agg(distinct c order by c) from unnest(p_caps) c) from (select distinct unnest(p_unidades) x) s;
  if p_joga_em is not null then
    insert into public.vinculo(pessoa_id, unidade_id, motivo) values (p, p_joga_em, 'entrada');
  end if;
  return p;
end $$;

create or replace function public.definir_papel(p_alvo uuid, p_unidades uuid[], p_caps text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare pes record; u uuid; tira boolean := p_caps is null or cardinality(p_caps) = 0;
begin
  select * into pes from public.pessoa where id = p_alvo;
  if pes.id is null or pes.status = 'saiu' then raise exception 'pessoa não está no time'; end if;
  if not public.pode('administrar', public.raiz_do_ws(pes.workspace_id)) then
    raise exception 'só o admin do time muda papéis' using errcode = 'insufficient_privilege'; end if;
  if not tira then
    if not public.caps_validas(p_caps) then raise exception 'papel inválido'; end if;
    if p_unidades is null or cardinality(p_unidades) = 0 then raise exception 'escolha onde a pessoa vai cuidar'; end if;
    foreach u in array p_unidades loop
      if not exists (select 1 from public.unidade where id = u and workspace_id = pes.workspace_id and not arquivada) then
        raise exception 'unidade inválida ou arquivada'; end if;
    end loop;
  end if;
  delete from public.acesso where pessoa_id = p_alvo;
  if not tira then
    insert into public.acesso(pessoa_id, unidade_id, capacidades)
    select p_alvo, x, (select array_agg(distinct c order by c) from unnest(p_caps) c) from (select distinct unnest(p_unidades) x) s;
  end if;
  perform public.checar_admin_do_time(pes.workspace_id);
  -- sem papel e sem reta: a pessoa sai do time (o histórico de quem jogou fica)
  if tira and not exists (select 1 from public.vinculo where pessoa_id = p_alvo and fim is null) then
    update public.pessoa set status = 'saiu' where id = p_alvo;
    update public.convite set revogado = true where pessoa_id = p_alvo and not revogado;
    if pes.user_id is not null then
      delete from public.workspace_members where workspace_id = pes.workspace_id and user_id = pes.user_id and role <> 'owner';
    end if;
  end if;
end $$;

create or replace function public.renomear_pessoa(p_alvo uuid, p_nome text) returns void
language plpgsql security definer set search_path = '' as $$
declare pes record; v_nome text := left(btrim(coalesce(p_nome, '')), 60); u uuid; t text;
begin
  select * into pes from public.pessoa where id = p_alvo;
  if pes.id is null or pes.status = 'saiu' then raise exception 'pessoa não está no time'; end if;
  if v_nome = '' then raise exception 'nome vazio'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p_alvo and fim is null;
  if not (public.pode('administrar', public.raiz_do_ws(pes.workspace_id)) or (u is not null and public.pode('gerir_pessoas', u))) then
    raise exception 'sem permissão pra renomear' using errcode = 'insufficient_privilege'; end if;
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

create or replace function public.renomear_unidade(p_alvo uuid, p_nome text, p_rotulo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_nome text := left(btrim(coalesce(p_nome, '')), 60);
begin
  if not exists (select 1 from public.unidade where id = p_alvo) then raise exception 'unidade não existe'; end if;
  if not public.pode('administrar', p_alvo) then raise exception 'só quem administra a unidade renomeia' using errcode = 'insufficient_privilege'; end if;
  if v_nome = '' then raise exception 'nome vazio'; end if;
  begin
    update public.unidade set nome = v_nome, rotulo = nullif(left(btrim(coalesce(p_rotulo, '')), 40), '') where id = p_alvo;
  exception when unique_violation then
    raise exception 'já tem uma unidade "%" no mesmo lugar', v_nome;
  end;
end $$;

create or replace function public.arquivar_unidade(p_alvo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare un record;
begin
  select * into un from public.unidade where id = p_alvo;
  if un.id is null then raise exception 'unidade não existe'; end if;
  if un.mae_id is null then raise exception 'a raiz do time não pode ser arquivada'; end if;
  if not public.pode('administrar', un.mae_id) then raise exception 'só quem administra a unidade de cima arquiva' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.unidade f where f.mae_id = p_alvo and not f.arquivada) then
    raise exception 'arquive antes as unidades que estão dentro desta'; end if;
  if exists (select 1 from public.vinculo v join public.unidade t on t.id = v.unidade_id
              where v.fim is null and t.caminho like un.caminho || '%') then
    raise exception 'ainda tem jogador nesta unidade: mova ou registre a saída antes'; end if;
  update public.unidade set arquivada = true where id = p_alvo;
  update public.convite set revogado = true where unidade_id = p_alvo and not revogado;
end $$;

-- ver_convite: igual ao anterior + papel de quem vai entrar (capacidades e se também joga)
create or replace function public.ver_convite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record; caps text[]; joga text;
begin
  select cv.*, w.name as time_nome, u.nome as unidade_nome, u.arquivada, p.nome as pessoa_nome
    into c
    from public.convite cv join public.workspaces w on w.id = cv.workspace_id
    join public.unidade u on u.id = cv.unidade_id left join public.pessoa p on p.id = cv.pessoa_id
   where cv.token_hash = public.convite_hash(p_token);
  if c.id is null then return jsonb_build_object('valido', false, 'motivo', 'Convite não encontrado. Confere se o link veio inteiro.'); end if;
  if c.pessoa_id is not null then
    select array_agg(distinct x order by x) into caps from public.acesso a, unnest(a.capacidades) x where a.pessoa_id = c.pessoa_id;
    select u2.nome into joga from public.vinculo v join public.unidade u2 on u2.id = v.unidade_id where v.pessoa_id = c.pessoa_id and v.fim is null;
  end if;
  return jsonb_build_object(
    'valido', not (c.revogado or c.arquivada or c.expira_em <= now() or (c.usos_max is not null and c.usos >= c.usos_max)),
    'motivo', case when c.revogado then 'Esse convite foi cancelado. Pede um link novo pro gestor.'
                   when c.arquivada then 'A unidade desse convite foi encerrada. Pede um link novo pro gestor.'
                   when c.expira_em <= now() then 'Esse convite venceu. Pede um link novo pro gestor.'
                   when c.usos_max is not null and c.usos >= c.usos_max then 'Esse convite já foi usado. Pede um link novo pro gestor.'
              end,
    'time', c.time_nome, 'unidade', c.unidade_nome, 'pessoa', c.pessoa_nome, 'expira_em', c.expira_em,
    'capacidades', coalesce(to_jsonb(caps), '[]'::jsonb), 'joga_em', joga);
end $$;

revoke all on function public.convidar_equipe(text,uuid[],text[],uuid) from public, anon;
revoke all on function public.definir_papel(uuid,uuid[],text[]) from public, anon;
revoke all on function public.renomear_pessoa(uuid,text) from public, anon;
revoke all on function public.renomear_unidade(uuid,text,text) from public, anon;
revoke all on function public.arquivar_unidade(uuid) from public, anon;
revoke all on function public.ver_convite(text) from public;
grant execute on function public.convidar_equipe(text,uuid[],text[],uuid) to authenticated;
grant execute on function public.definir_papel(uuid,uuid[],text[]) to authenticated;
grant execute on function public.renomear_pessoa(uuid,text) to authenticated;
grant execute on function public.renomear_unidade(uuid,text,text) to authenticated;
grant execute on function public.arquivar_unidade(uuid) to authenticated;
grant execute on function public.ver_convite(text) to anon, authenticated;
