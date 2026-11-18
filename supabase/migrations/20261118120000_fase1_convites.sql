-- ============================================================
-- Fase 1 · passo 3: convite por link. Idempotente.
--   Link da unidade : quem abre e cria a conta entra como jogador naquela reta (vale N usos até vencer)
--   Link pessoal    : liga a conta a uma pessoa que o gestor já cadastrou (convidar_jogador/convidar_gestor); 1 uso
-- O token só existe no link: o banco guarda o hash (sha256). Quem gere pessoas na unidade lista e cancela.
-- Uma conta fica em um lugar só até a fase 2: quem já está em outro workspace (time ou conta individual) é recusado.
-- ============================================================

create table if not exists public.convite (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  unidade_id uuid not null references public.unidade(id) on delete cascade,
  pessoa_id uuid references public.pessoa(id) on delete cascade,
  token_hash text not null unique,
  expira_em timestamptz not null,
  usos_max int check (usos_max is null or usos_max > 0),
  usos int not null default 0,
  revogado boolean not null default false,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists convite_unidade on public.convite (unidade_id);
alter table public.convite enable row level security;
revoke all on public.convite from anon, authenticated;
grant select (id, workspace_id, unidade_id, pessoa_id, expira_em, usos_max, usos, revogado, criado_em) on public.convite to authenticated;
drop policy if exists convite_ler on public.convite;
create policy convite_ler on public.convite for select to authenticated
  using (unidade_id in (select public.unidades_com('gerir_pessoas')));

create or replace function public.convite_hash(t text) returns text
language sql immutable set search_path = '' as $$ select encode(sha256(convert_to(coalesce(t, ''), 'UTF8')), 'hex') $$;
revoke all on function public.convite_hash(text) from public, anon, authenticated;

-- cria o link; devolve o token (aparece só agora)
create or replace function public.criar_convite(p_unidade uuid, p_pessoa uuid default null, p_dias int default 7, p_usos int default null)
returns text language plpgsql security definer set search_path = '' as $$
declare ws uuid; cam text; tok text; pes record;
begin
  if not public.pode('gerir_pessoas', p_unidade) then
    raise exception 'sem permissão pra convidar nesta unidade' using errcode = 'insufficient_privilege'; end if;
  select workspace_id, caminho into ws, cam from public.unidade where id = p_unidade and not arquivada;
  if ws is null then raise exception 'unidade não existe ou está arquivada'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 30 then raise exception 'validade do convite: de 1 a 30 dias'; end if;
  if p_pessoa is not null then
    select * into pes from public.pessoa where id = p_pessoa and workspace_id = ws;
    if pes.id is null or pes.user_id is not null or pes.status <> 'convidado' then
      raise exception 'essa pessoa já tem conta ou não está mais no time'; end if;
    if not exists (select 1 from public.vinculo v join public.unidade u on u.id = v.unidade_id
                    where v.pessoa_id = p_pessoa and v.fim is null and u.caminho like cam || '%')
       and not exists (select 1 from public.acesso a join public.unidade u on u.id = a.unidade_id
                    where a.pessoa_id = p_pessoa and u.caminho like cam || '%') then
      raise exception 'essa pessoa não está nesta unidade'; end if;
    if exists (select 1 from public.acesso where pessoa_id = p_pessoa) and not public.pode('administrar', p_unidade) then
      raise exception 'convite de gestor: só quem administra a unidade' using errcode = 'insufficient_privilege'; end if;
    update public.convite set revogado = true where pessoa_id = p_pessoa and not revogado;   -- um link vivo por pessoa
    p_usos := 1;
  end if;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.convite(workspace_id, unidade_id, pessoa_id, token_hash, expira_em, usos_max)
  values (ws, p_unidade, p_pessoa, public.convite_hash(tok), now() + make_interval(days => p_dias), p_usos);
  return tok;
end $$;

-- o que a tela mostra antes de criar a conta (funciona sem login: o token é o segredo)
create or replace function public.ver_convite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record;
begin
  select cv.*, w.name as time_nome, u.nome as unidade_nome, u.arquivada, p.nome as pessoa_nome
    into c
    from public.convite cv join public.workspaces w on w.id = cv.workspace_id
    join public.unidade u on u.id = cv.unidade_id left join public.pessoa p on p.id = cv.pessoa_id
   where cv.token_hash = public.convite_hash(p_token);
  if c.id is null then return jsonb_build_object('valido', false, 'motivo', 'Convite não encontrado. Confere se o link veio inteiro.'); end if;
  return jsonb_build_object(
    'valido', not (c.revogado or c.arquivada or c.expira_em <= now() or (c.usos_max is not null and c.usos >= c.usos_max)),
    'motivo', case when c.revogado then 'Esse convite foi cancelado. Pede um link novo pro gestor.'
                   when c.arquivada then 'A unidade desse convite foi encerrada. Pede um link novo pro gestor.'
                   when c.expira_em <= now() then 'Esse convite venceu. Pede um link novo pro gestor.'
                   when c.usos_max is not null and c.usos >= c.usos_max then 'Esse convite já foi usado. Pede um link novo pro gestor.'
              end,
    'time', c.time_nome, 'unidade', c.unidade_nome, 'pessoa', c.pessoa_nome, 'expira_em', c.expira_em);
end $$;

-- a conta logada aceita: vira pessoa ativa do time, com vínculo na unidade, e membro do workspace
create or replace function public.aceitar_convite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c record; uid uuid := auth.uid(); p uuid; v_nome text;
begin
  if uid is null then raise exception 'entre na sua conta pra aceitar o convite' using errcode = 'insufficient_privilege'; end if;
  select cv.*, u.arquivada into c from public.convite cv join public.unidade u on u.id = cv.unidade_id
   where cv.token_hash = public.convite_hash(p_token) for update of cv;
  if c.id is null or c.revogado or c.arquivada or c.expira_em <= now() or (c.usos_max is not null and c.usos >= c.usos_max) then
    raise exception 'Convite inválido, vencido ou já usado. Pede um link novo pro gestor.'; end if;
  if exists (select 1 from public.workspace_members where user_id = uid and workspace_id <> c.workspace_id) then
    raise exception 'Tua conta já está em outro time ou numa conta individual. Por enquanto cada conta fica num lugar só: entra com outro e-mail pra aceitar este convite.'; end if;
  if exists (select 1 from public.pessoa where workspace_id = c.workspace_id and user_id = uid and status <> 'saiu') then
    raise exception 'Você já faz parte deste time.'; end if;
  -- quem já passou pelo time e volta: o registro antigo fica com o histórico, sem a conta
  update public.pessoa set user_id = null where workspace_id = c.workspace_id and user_id = uid and status = 'saiu';
  if c.pessoa_id is not null then
    update public.pessoa set user_id = uid, status = 'ativo'
     where id = c.pessoa_id and user_id is null and status = 'convidado' returning id into p;
    if p is null then raise exception 'Esse convite não vale mais. Pede um link novo pro gestor.'; end if;
  else
    v_nome := left(coalesce(nullif(btrim((select nickname from public.player_profiles where user_id = uid)), ''), 'Jogador'), 50);
    if exists (select 1 from public.pessoa where workspace_id = c.workspace_id and status <> 'saiu' and lower(btrim(nome)) = lower(v_nome)) then
      v_nome := v_nome || ' #' || left(replace(uid::text, '-', ''), 4);
    end if;
    insert into public.pessoa(workspace_id, user_id, nome, status) values (c.workspace_id, uid, v_nome, 'ativo') returning id into p;
    insert into public.vinculo(pessoa_id, unidade_id, motivo) values (p, c.unidade_id, 'entrada');
  end if;
  insert into public.workspace_members(workspace_id, user_id, role) values (c.workspace_id, uid, 'member') on conflict do nothing;
  update public.convite set usos = usos + 1 where id = c.id;
  return p;
end $$;

create or replace function public.revogar_convite(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  select unidade_id into u from public.convite where id = p_id;
  if u is null or not public.pode('gerir_pessoas', u) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  update public.convite set revogado = true where id = p_id;
end $$;

revoke all on function public.criar_convite(uuid,uuid,int,int) from public, anon;
revoke all on function public.ver_convite(text) from public;
revoke all on function public.aceitar_convite(text) from public, anon;
revoke all on function public.revogar_convite(uuid) from public, anon;
grant execute on function public.criar_convite(uuid,uuid,int,int) to authenticated;
grant execute on function public.ver_convite(text) to anon, authenticated;
grant execute on function public.aceitar_convite(text) to authenticated;
grant execute on function public.revogar_convite(uuid) to authenticated;
