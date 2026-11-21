-- ============================================================
-- Console da plataforma (pedido do dono, 21/11): a conta central é só de administração, sem nada de jogador.
-- Plano mestre 3.4 e 4.2: o gestor geral abre em "Times" (contrato, assentos usados/total, vencimento), cria time,
-- convida admin e vê os times só pelos números. Idempotente. Tudo conferido no servidor e registrado (acao_plataforma).
--   · times: pessoas por papel (admin, professor, financeiro, outros), jogadores ativos (os que pagam), cadastrados
--     (com os convidados) e os que jogaram nos últimos 7 dias, vencimento do contrato, suspensão e erros do app;
--   · suspender e reativar um time (o "cancelar plano" do time): o app de todo mundo do time trava com o aviso;
--   · vencimento do contrato (workspaces.contrato_fim, que já existia e nada usava);
--   · convidar um admin pra qualquer time (time sem dono ou que perdeu o admin);
--   · contas individuais: plano e teste de cada uma; estender o teste, liberar sem prazo ou encerrar o acesso;
--   · erros do app de um time (pra ajudar a resolver problema sem abrir os dados do time).
-- ============================================================

alter table public.workspaces add column if not exists suspenso_em timestamptz;
alter table public.workspaces add column if not exists suspenso_motivo text;
alter table public.workspaces drop constraint if exists workspaces_suspenso_motivo_check;
alter table public.workspaces add constraint workspaces_suspenso_motivo_check
  check (suspenso_motivo is null or length(suspenso_motivo) <= 200);

-- ---------- status da conta: time suspenso trava o app (o motivo fica só com a plataforma) ----------
create or replace function public.meu_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'agora', now(),
    'workspace_id', w.id,
    'plano', w.plan,
    'trial_ends_at', w.trial_ends_at,
    'suspenso', w.suspenso_em is not null,
    'time', case when w.kind <> 'solo' then coalesce(w.marca_nome, w.name) end,
    'ativo', (w.trial_ends_at is null or w.trial_ends_at > now()) and w.suspenso_em is null,
    'pode_stats', (w.kind <> 'solo' or w.plan in ('pro','founder','team')))
  from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid() order by m.created_at limit 1;
$$;

-- ---------- times: só números, agora por papel ----------
drop function if exists public.times_da_plataforma();
create function public.times_da_plataforma()
returns table(id uuid, nome text, tipo text, criado_em timestamptz, assentos int, pessoas int, jogadores int, convidados int,
              admins text, tem_dono boolean, admin_pendente boolean, ultimo_lancamento date, marca_nome text, tem_logo boolean,
              com_conta int, jogadores_cadastrados int, jogando_7d int, n_admins int, n_professores int, n_financeiros int, n_outros int,
              contrato_fim date, suspenso_em timestamptz, suspenso_motivo text, erros_7d int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.checar_gestor_geral();
  return query
  select w.id, w.name, w.kind, w.created_at, w.assentos,
         (select count(*)::int from public.pessoa p where p.workspace_id = w.id and p.status <> 'saiu'),
         (select count(*)::int from public.vinculo v join public.pessoa p on p.id = v.pessoa_id where p.workspace_id = w.id and v.fim is null and p.status = 'ativo'),
         (select count(*)::int from public.pessoa p where p.workspace_id = w.id and p.status = 'convidado'),
         (select string_agg(distinct p.nome, ', ') from public.pessoa p join public.acesso a on a.pessoa_id = p.id join public.unidade u on u.id = a.unidade_id
           where p.workspace_id = w.id and u.mae_id is null and 'administrar' = any(a.capacidades) and p.status <> 'saiu'),
         exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.role = 'owner'),
         exists (select 1 from public.pessoa p join public.acesso a on a.pessoa_id = p.id join public.unidade u on u.id = a.unidade_id
                  where p.workspace_id = w.id and p.status = 'convidado' and u.mae_id is null and 'administrar' = any(a.capacidades)),
         (select max(t.entry_date)::date from public.tournaments t where t.workspace_id = w.id),
         w.marca_nome, w.marca_logo is not null,
         (select count(*)::int from public.pessoa p where p.workspace_id = w.id and p.status = 'ativo' and p.user_id is not null),
         (select count(distinct v.pessoa_id)::int from public.vinculo v join public.pessoa p on p.id = v.pessoa_id
           where p.workspace_id = w.id and v.fim is null and p.status <> 'saiu'),
         (select count(distinct t.pessoa_id)::int from public.tournaments t
           where t.workspace_id = w.id and t.pessoa_id is not null and t.entry_date >= current_date - 6),
         coalesce(r.adm, 0), coalesce(r.prof, 0), coalesce(r.fin, 0), coalesce(r.outros, 0),
         w.contrato_fim, w.suspenso_em, w.suspenso_motivo,
         (select count(*)::int from public.app_erros e where e.workspace_id = w.id and e.created_at > now() - interval '7 days')
    from public.workspaces w
    left join lateral (
      -- papel de cada pessoa pelas capacidades (as mesmas dos pacotes do app): admin > financeiro > professor > outros
      select count(*) filter (where 'administrar' = any(x.cs))::int adm,
             count(*) filter (where not 'administrar' = any(x.cs) and 'aprovar_saques' = any(x.cs))::int fin,
             count(*) filter (where not 'administrar' = any(x.cs) and not 'aprovar_saques' = any(x.cs)
                                and x.cs && array['ver_desempenho', 'promover'])::int prof,
             count(*) filter (where not 'administrar' = any(x.cs) and not 'aprovar_saques' = any(x.cs)
                                and not x.cs && array['ver_desempenho', 'promover'])::int outros
        from (select p.id, array_agg(distinct c) cs
                from public.pessoa p join public.acesso a on a.pessoa_id = p.id cross join lateral unnest(a.capacidades) c
               where p.workspace_id = w.id and p.status <> 'saiu' group by p.id) x) r on true
   where w.kind in ('time', 'pool', 'team')      -- 'team' = os times antigos (antes da fase 1)
   order by w.created_at;
end $$;

-- ---------- contas individuais (as do GrinderBank, sem time) ----------
create or replace function public.contas_da_plataforma()
returns table(id uuid, nome text, apelido text, email text, plano text, teste_ate timestamptz, criado_em timestamptz,
              torneios int, ultimo_lancamento date, erros_7d int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.checar_gestor_geral();
  return query
  select w.id, w.name, pp.nickname, u.email::text, w.plan, w.trial_ends_at, w.created_at,
         (select count(*)::int from public.tournaments t where t.workspace_id = w.id),
         (select max(t.entry_date)::date from public.tournaments t where t.workspace_id = w.id),
         (select count(*)::int from public.app_erros e where e.workspace_id = w.id and e.created_at > now() - interval '7 days')
    from public.workspaces w
    left join lateral (select m.user_id from public.workspace_members m where m.workspace_id = w.id
                        order by (m.role = 'owner') desc, m.created_at limit 1) dono on true
    left join auth.users u on u.id = dono.user_id
    left join public.player_profiles pp on pp.user_id = dono.user_id
   where w.kind = 'solo'
     and not exists (select 1 from public.gestor_plataforma g where g.user_id = dono.user_id)   -- a conta central não é cliente
   order by w.created_at desc;
end $$;

-- ---------- suspender e reativar um time ----------
create or replace function public.suspender_time(p_ws uuid, p_suspender boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare w record;
begin
  perform public.checar_gestor_geral();
  select x.id, x.suspenso_em, x.suspenso_motivo into w from public.workspaces x where x.id = p_ws and x.kind in ('time', 'pool', 'team');
  if w.id is null then raise exception 'time não encontrado'; end if;
  if coalesce(p_suspender, false) then
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'diga o motivo da suspensão (fica só no registro da plataforma)'; end if;
    if length(btrim(p_motivo)) > 200 then raise exception 'motivo: até 200 letras'; end if;
    update public.workspaces set suspenso_em = coalesce(suspenso_em, now()), suspenso_motivo = btrim(p_motivo) where id = p_ws;
    perform public.registrar_acao_plataforma('suspender', p_ws, jsonb_build_object('motivo', btrim(p_motivo)));
  else
    if w.suspenso_em is null then raise exception 'esse time não está suspenso'; end if;
    update public.workspaces set suspenso_em = null, suspenso_motivo = null where id = p_ws;
    perform public.registrar_acao_plataforma('reativar', p_ws, jsonb_build_object('suspenso_desde', w.suspenso_em, 'motivo', w.suspenso_motivo));
  end if;
end $$;

-- ---------- vencimento do contrato ----------
create or replace function public.definir_vencimento(p_ws uuid, p_data date) returns void
language plpgsql security definer set search_path = '' as $$
declare antes date;
begin
  perform public.checar_gestor_geral();
  select w.contrato_fim into antes from public.workspaces w where w.id = p_ws and w.kind in ('time', 'pool', 'team');
  if not found then raise exception 'time não encontrado'; end if;
  if p_data is not null and (p_data < current_date - 366 or p_data > current_date + 3660) then
    raise exception 'data do vencimento fora do razoável'; end if;
  update public.workspaces set contrato_fim = p_data where id = p_ws;
  perform public.registrar_acao_plataforma('vencimento', p_ws, jsonb_build_object('antes', antes, 'depois', p_data));
end $$;

-- ---------- convidar um admin pra um time (quem aceitar o link administra o time inteiro) ----------
create or replace function public.convidar_admin_plataforma(p_ws uuid, p_nome text) returns text
language plpgsql security definer set search_path = '' as $$
declare raiz uuid; p uuid; tok text; v_nome text := left(btrim(coalesce(p_nome, '')), 60);
begin
  perform public.checar_gestor_geral();
  if not exists (select 1 from public.workspaces w where w.id = p_ws and w.kind in ('time', 'pool', 'team')) then
    raise exception 'time não encontrado'; end if;
  if v_nome = '' then raise exception 'nome de quem vai administrar'; end if;
  select u.id into raiz from public.unidade u where u.workspace_id = p_ws and u.mae_id is null order by u.criado_em limit 1;
  if raiz is null then raise exception 'esse time ainda não tem estrutura'; end if;
  begin
    insert into public.pessoa(workspace_id, user_id, nome, status) values (p_ws, null, v_nome, 'convidado') returning id into p;
  exception when unique_violation then
    raise exception 'já tem alguém com o nome "%" no time', v_nome;
  end;
  insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p, raiz, array['administrar']);
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.convite(workspace_id, unidade_id, pessoa_id, token_hash, expira_em, usos_max)
  values (p_ws, raiz, p, public.convite_hash(tok), now() + interval '7 days', 1);
  perform public.registrar_acao_plataforma('convidar_admin', p_ws, jsonb_build_object('nome', v_nome));
  return tok;
end $$;

-- ---------- acesso de uma conta individual: estender o teste, liberar sem prazo ou encerrar ----------
create or replace function public.acesso_conta_plataforma(p_ws uuid, p_acao text, p_dias int default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare antes timestamptz; depois timestamptz;
begin
  perform public.checar_gestor_geral();
  select w.trial_ends_at into antes from public.workspaces w where w.id = p_ws and w.kind = 'solo';
  if not found then raise exception 'conta individual não encontrada'; end if;
  if p_acao = 'estender' then
    if p_dias is null or p_dias < 1 or p_dias > 365 then raise exception 'dias: de 1 a 365'; end if;
    depois := greatest(coalesce(antes, now()), now()) + make_interval(days => p_dias);
  elsif p_acao = 'sem_prazo' then
    depois := null;
  elsif p_acao = 'encerrar' then
    depois := now();
  else
    raise exception 'ação inválida (estender, sem_prazo ou encerrar)';
  end if;
  update public.workspaces set trial_ends_at = depois where id = p_ws;
  perform public.registrar_acao_plataforma('acesso_conta', p_ws, jsonb_build_object('acao', p_acao, 'dias', p_dias, 'antes', antes, 'depois', depois));
  return depois;
end $$;

-- ---------- erros do app de um time ou conta (só o técnico: quando, onde e a mensagem) ----------
create or replace function public.erros_do_time(p_ws uuid, p_limite int default 20)
returns table(criado_em timestamptz, origem text, mensagem text, versao text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.checar_gestor_geral();
  return query select e.created_at, e.origem, left(e.mensagem, 300), e.build from public.app_erros e
   where e.workspace_id = p_ws order by e.created_at desc limit least(greatest(coalesce(p_limite, 20), 1), 100);
end $$;

do $$
declare f text;
begin
  foreach f in array array['times_da_plataforma()', 'contas_da_plataforma()', 'suspender_time(uuid,boolean,text)', 'definir_vencimento(uuid,date)',
                           'convidar_admin_plataforma(uuid,text)', 'acesso_conta_plataforma(uuid,text,integer)', 'erros_do_time(uuid,integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
