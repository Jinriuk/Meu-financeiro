-- ============================================================
-- Gestor geral (plano mestre 3.4 e 8): administradores da PLATAFORMA. Idempotente.
--
--   · tabela própria (gestor_plataforma), fechada ao cliente: ninguém lê nem grava por fora. Quem é gestor geral entra
--     só pelo SQL Editor (não existe RPC pra se promover);
--   · ações por RPC, conferidas no servidor, e CADA ação registrada (acao_plataforma): criar time, mudar assentos,
--     gerar de novo o link do admin;
--   · sem acesso aos dados de um time: ser gestor geral não põe ninguém em workspace nenhum (as policies dos dados
--     não olham esta tabela). A lista de times traz só números agregados e o nome de quem administra;
--   · onboarding (plano, seção 8, passo 1): o gestor geral cria o time e recebe o link do admin; quem aceita esse link
--     vira o dono do time (aceitar_convite).
-- ============================================================

create table if not exists public.gestor_plataforma (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.gestor_plataforma enable row level security;
revoke all on public.gestor_plataforma from anon, authenticated;

create table if not exists public.acao_plataforma (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  acao text not null,
  workspace_id uuid,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists acao_plataforma_quando on public.acao_plataforma (criado_em desc);
create index if not exists acao_plataforma_ws on public.acao_plataforma (workspace_id);
alter table public.acao_plataforma enable row level security;
revoke all on public.acao_plataforma from anon, authenticated;

create or replace function public.sou_gestor_geral() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gestor_plataforma where user_id = auth.uid());
$$;

-- interna: barra quem não é gestor geral
create or replace function public.checar_gestor_geral() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.gestor_plataforma where user_id = auth.uid()) then
    raise exception 'só o gestor geral da plataforma' using errcode = 'insufficient_privilege'; end if;
end $$;
revoke all on function public.checar_gestor_geral() from public, anon, authenticated;

-- interna: registra a ação
create or replace function public.registrar_acao_plataforma(p_acao text, p_ws uuid, p_detalhes jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.acao_plataforma(user_id, acao, workspace_id, detalhes) values (auth.uid(), p_acao, p_ws, coalesce(p_detalhes, '{}'::jsonb));
$$;
revoke all on function public.registrar_acao_plataforma(text, uuid, jsonb) from public, anon, authenticated;

-- interna: link novo pro admin convidado do time (o anterior para de valer)
create or replace function public.link_do_admin(p_ws uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare raiz uuid; p uuid; tok text;
begin
  select u.id into raiz from public.unidade u where u.workspace_id = p_ws and u.mae_id is null order by u.criado_em limit 1;
  select pe.id into p from public.pessoa pe join public.acesso a on a.pessoa_id = pe.id
   where pe.workspace_id = p_ws and pe.status = 'convidado' and pe.user_id is null and a.unidade_id = raiz and 'administrar' = any(a.capacidades)
   order by pe.criado_em limit 1;
  if p is null then raise exception 'esse time não tem admin esperando convite'; end if;
  update public.convite set revogado = true where pessoa_id = p and not revogado;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.convite(workspace_id, unidade_id, pessoa_id, token_hash, expira_em, usos_max)
  values (p_ws, raiz, p, public.convite_hash(tok), now() + interval '7 days', 1);
  return tok;
end $$;
revoke all on function public.link_do_admin(uuid) from public, anon, authenticated;

-- ---------- lista de times: só números agregados ----------
create or replace function public.times_da_plataforma()
returns table(id uuid, nome text, tipo text, criado_em timestamptz, assentos int, pessoas int, jogadores int, convidados int,
              admins text, tem_dono boolean, admin_pendente boolean, ultimo_lancamento date)
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
         (select max(t.entry_date)::date from public.tournaments t where t.workspace_id = w.id)
    from public.workspaces w
   where w.kind in ('time', 'pool')
   order by w.created_at;
end $$;

-- ---------- criar um time: estrutura, configuração e o link do admin ----------
create or replace function public.criar_time_plataforma(p_nome text, p_assentos int, p_admin_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ws uuid; raiz uuid; p uuid; tok text;
begin
  perform public.checar_gestor_geral();
  if coalesce(btrim(p_nome), '') = '' or length(btrim(p_nome)) > 60 then raise exception 'nome do time: de 1 a 60 letras'; end if;
  if coalesce(btrim(p_admin_nome), '') = '' or length(btrim(p_admin_nome)) > 60 then raise exception 'nome do admin: de 1 a 60 letras'; end if;
  if p_assentos is not null and (p_assentos < 1 or p_assentos > 5000) then raise exception 'assentos: de 1 a 5.000 (ou em branco, sem limite)'; end if;
  if exists (select 1 from public.workspaces w where w.kind = 'time' and lower(btrim(w.name)) = lower(btrim(p_nome))) then
    raise exception 'já existe um time com esse nome'; end if;
  insert into public.workspaces(name, kind, plan, trial_ends_at, assentos) values (btrim(p_nome), 'time', 'team', null, p_assentos) returning id into ws;
  insert into public.unidade(workspace_id, nome, rotulo) values (ws, btrim(p_nome), 'Time') returning id into raiz;
  insert into public.pessoa(workspace_id, user_id, nome, status) values (ws, null, btrim(p_admin_nome), 'convidado') returning id into p;
  insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p, raiz, array['administrar']);
  insert into public.pool_config(workspace_id, player1_name, player2_name, player_pct, banca_inicial, piso_minimo, makeup_max_recomendado,
                                 abi_max, abi_max_player1, abi_max_player2, week_start_date)
  values (ws, '', '', 1, 0, 0, 0, 2, 2, 0, current_date);
  tok := public.link_do_admin(ws);
  perform public.registrar_acao_plataforma('criar_time', ws, jsonb_build_object('nome', btrim(p_nome), 'assentos', p_assentos, 'admin', btrim(p_admin_nome)));
  return jsonb_build_object('workspace_id', ws, 'convite', tok);
end $$;

-- ---------- assentos do contrato ----------
create or replace function public.mudar_assentos(p_ws uuid, p_assentos int) returns void
language plpgsql security definer set search_path = '' as $$
declare antes int;
begin
  perform public.checar_gestor_geral();
  select w.assentos into antes from public.workspaces w where w.id = p_ws and w.kind in ('time', 'pool');
  if not found then raise exception 'time não encontrado'; end if;
  if p_assentos is not null and (p_assentos < 1 or p_assentos > 5000) then raise exception 'assentos: de 1 a 5.000 (ou em branco, sem limite)'; end if;
  update public.workspaces set assentos = p_assentos where id = p_ws;
  perform public.registrar_acao_plataforma('mudar_assentos', p_ws, jsonb_build_object('antes', antes, 'depois', p_assentos));
end $$;

-- ---------- link novo pro admin (o de 7 dias venceu) ----------
create or replace function public.novo_link_admin(p_ws uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  perform public.checar_gestor_geral();
  tok := public.link_do_admin(p_ws);
  perform public.registrar_acao_plataforma('novo_link_admin', p_ws, '{}'::jsonb);
  return tok;
end $$;

-- ---------- o registro das ações ----------
create or replace function public.acoes_plataforma(p_limite int default 50)
returns table(criado_em timestamptz, acao text, time_nome text, detalhes jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.checar_gestor_geral();
  return query select a.criado_em, a.acao, w.name, a.detalhes
    from public.acao_plataforma a left join public.workspaces w on w.id = a.workspace_id
   order by a.criado_em desc limit least(greatest(coalesce(p_limite, 50), 1), 500);
end $$;

do $$
declare f text;
begin
  foreach f in array array['sou_gestor_geral()','times_da_plataforma()','criar_time_plataforma(text,integer,text)','mudar_assentos(uuid,integer)',
                           'novo_link_admin(uuid)','acoes_plataforma(integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- convite: o admin chamado pelo gestor geral vira o dono do time ----------
create or replace function public.aceitar_convite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c record; uid uuid := auth.uid(); p uuid; v_nome text;
begin
  if uid is null then raise exception 'entre na sua conta pra aceitar o convite' using errcode = 'insufficient_privilege'; end if;
  select cv.*, u.arquivada into c from public.convite cv join public.unidade u on u.id = cv.unidade_id
   where cv.token_hash = public.convite_hash(p_token) for update of cv;
  if c.id is null or c.revogado or c.arquivada or c.expira_em <= now() or (c.usos_max is not null and c.usos >= c.usos_max) then
    raise exception 'Convite inválido, vencido ou já usado. Peça um link novo pro gestor.'; end if;
  if exists (select 1 from public.pessoa where workspace_id = c.workspace_id and user_id = uid and status <> 'saiu') then
    raise exception 'Você já faz parte deste time.'; end if;
  -- quem já passou pelo time e volta: o registro antigo fica com o histórico, sem a conta
  update public.pessoa set user_id = null where workspace_id = c.workspace_id and user_id = uid and status = 'saiu';
  if c.pessoa_id is not null then
    update public.pessoa set user_id = uid, status = 'ativo'
     where id = c.pessoa_id and user_id is null and status = 'convidado' returning id into p;
    if p is null then raise exception 'Esse convite não vale mais. Peça um link novo pro gestor.'; end if;
    -- o vínculo nasceu com o convite; a entrada de fato é hoje (o que ele fez antes, na conta dele, é só dele)
    update public.vinculo v set inicio = current_date
     where v.pessoa_id = p and v.fim is null and v.inicio < current_date
       and not exists (select 1 from public.vinculo o where o.pessoa_id = p and o.id <> v.id);
    if found then perform public.recalcular_fatos(p); end if;
  else
    v_nome := left(coalesce(nullif(btrim((select nickname from public.player_profiles where user_id = uid)), ''), 'Jogador'), 50);
    if exists (select 1 from public.pessoa where workspace_id = c.workspace_id and status <> 'saiu' and lower(btrim(nome)) = lower(v_nome)) then
      v_nome := v_nome || ' #' || left(replace(uid::text, '-', ''), 4);
    end if;
    insert into public.pessoa(workspace_id, user_id, nome, status) values (c.workspace_id, uid, v_nome, 'ativo') returning id into p;
    insert into public.vinculo(pessoa_id, unidade_id, motivo) values (p, c.unidade_id, 'entrada');
  end if;
  perform public.levar_conta_pro_time(uid, c.workspace_id, p);   -- conta individual vira do time (ou recusa, explicando)
  insert into public.workspace_members(workspace_id, user_id, role) values (c.workspace_id, uid, 'member') on conflict do nothing;
  -- time criado pelo gestor geral: o primeiro admin que aceita o convite vira o dono
  if not exists (select 1 from public.workspace_members m where m.workspace_id = c.workspace_id and m.role = 'owner')
     and exists (select 1 from public.acesso a join public.unidade u on u.id = a.unidade_id
                  where a.pessoa_id = p and u.mae_id is null and 'administrar' = any(a.capacidades)) then
    update public.workspace_members set role = 'owner' where workspace_id = c.workspace_id and user_id = uid;
  end if;
  update public.convite set usos = usos + 1 where id = c.id;
  update public.pedido_entrada set status = 'cancelado', decidido_em = now() where user_id = uid and status = 'pendente';
  return p;
end $$;
revoke all on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;
