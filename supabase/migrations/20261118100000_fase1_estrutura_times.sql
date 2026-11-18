-- ============================================================
-- Fase 1 · passo 1: estrutura de times (plano mestre, seções 3.1, 3.2 e 3.4). Idempotente.
--
-- Organização = workspace (já é a fronteira de isolamento). Dentro dela:
--   unidade  : árvore livre (Base > Pandeiro, Escola + Base…), qualquer profundidade, sem ciclo.
--              `caminho` materializado ('/id-raiz/…/id/') responde "está dentro de" com um LIKE.
--   pessoa   : alguém do time (com ou sem conta ainda). Status convidado / ativo / saiu.
--   vinculo  : pessoa ↔ unidade em que JOGA, com início e fim. No máximo 1 ativo por pessoa (no banco).
--   acesso   : pessoa ↔ unidade que GERE (cobre ela e as de baixo) × capacidades.
--              A mesma pessoa pode jogar numa unidade e gerir outras (professor que joga).
--
-- Regra de segurança: o cliente só LÊ estas tabelas (RLS por escopo). Toda gravação passa por uma
-- função do servidor que confere a capacidade no escopo certo. Nada decidido só na tela.
-- Os fatos (torneios, stats, saques) ganham pessoa/unidade no passo 2.
-- ============================================================

-- ---------- contrato da organização ----------
alter table public.workspaces
  add column if not exists assentos int check (assentos is null or assentos > 0),
  add column if not exists contrato_fim date;

-- ---------- tabelas ----------
create table if not exists public.unidade (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  mae_id uuid references public.unidade(id),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  rotulo text check (rotulo is null or length(rotulo) <= 30),     -- "Base", "Reta", "Escola"… livre
  ordem int not null default 0,
  caminho text not null default '',
  arquivada boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists unidade_ws on public.unidade (workspace_id);
create index if not exists unidade_caminho on public.unidade (caminho text_pattern_ops);
create unique index if not exists unidade_nome_irmas on public.unidade (workspace_id, coalesce(mae_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nome))) where not arquivada;

create table if not exists public.pessoa (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  nick_ps text, id_gg text, whatsapp text,
  status text not null default 'convidado' check (status in ('convidado','ativo','saiu')),
  criado_em timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists pessoa_user on public.pessoa (user_id);

create table if not exists public.vinculo (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoa(id) on delete cascade,
  unidade_id uuid not null references public.unidade(id),
  inicio date not null default current_date,
  fim date,
  motivo text not null default 'entrada' check (motivo in ('entrada','promocao','rebaixamento','transferencia')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);
create unique index if not exists vinculo_um_ativo on public.vinculo (pessoa_id) where fim is null;
create index if not exists vinculo_unidade on public.vinculo (unidade_id);

create table if not exists public.acesso (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoa(id) on delete cascade,
  unidade_id uuid not null references public.unidade(id) on delete cascade,
  capacidades text[] not null check (cardinality(capacidades) > 0 and capacidades <@ array[
    'ver_desempenho','gerir_pessoas','promover','configurar_regras','ver_financeiro','aprovar_saques','administrar']::text[]),
  criado_em timestamptz not null default now(),
  unique (pessoa_id, unidade_id)
);
create index if not exists acesso_unidade on public.acesso (unidade_id);

-- ---------- integridade: caminho, ciclo, mesma organização, assentos ----------
create or replace function public.unidade_caminho() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  if tg_op = 'INSERT' or new.mae_id is distinct from old.mae_id then
    if new.mae_id is null then
      new.caminho := '/' || new.id || '/';
    else
      select workspace_id, caminho into m from public.unidade where id = new.mae_id;
      if m is null then raise exception 'unidade-mãe não existe'; end if;
      if m.workspace_id <> new.workspace_id then raise exception 'unidade-mãe é de outra organização'; end if;
      if m.caminho like '%/' || new.id || '/%' then raise exception 'mover criaria um ciclo na árvore'; end if;
      new.caminho := m.caminho || new.id || '/';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.workspace_id <> old.workspace_id then raise exception 'unidade não muda de organização'; end if;
  return new;
end $$;
drop trigger if exists unidade_caminho on public.unidade;
create trigger unidade_caminho before insert or update on public.unidade for each row execute function public.unidade_caminho();

-- mover uma unidade leva as de baixo junto (troca o prefixo do caminho)
create or replace function public.unidade_caminho_filhas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.caminho <> old.caminho then
    update public.unidade set caminho = new.caminho || substr(caminho, length(old.caminho) + 1)
     where caminho like old.caminho || '%' and id <> new.id;
  end if;
  return null;
end $$;
drop trigger if exists unidade_caminho_filhas on public.unidade;
create trigger unidade_caminho_filhas after update on public.unidade for each row execute function public.unidade_caminho_filhas();

create or replace function public.mesma_organizacao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select workspace_id from public.pessoa where id = new.pessoa_id)
     is distinct from (select workspace_id from public.unidade where id = new.unidade_id) then
    raise exception 'pessoa e unidade de organizações diferentes';
  end if;
  return new;
end $$;
drop trigger if exists vinculo_mesma_org on public.vinculo;
create trigger vinculo_mesma_org before insert or update on public.vinculo for each row execute function public.mesma_organizacao();
drop trigger if exists acesso_mesma_org on public.acesso;
create trigger acesso_mesma_org before insert or update on public.acesso for each row execute function public.mesma_organizacao();

-- assentos do contrato: convite além do limite é recusado no servidor
create or replace function public.pessoa_assentos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim int; usados int;
begin
  if new.status = 'saiu' then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'saiu' then return new; end if;
  select assentos into lim from public.workspaces where id = new.workspace_id;
  if lim is null then return new; end if;
  select count(*) into usados from public.pessoa where workspace_id = new.workspace_id and status <> 'saiu' and id <> new.id;
  if usados >= lim then raise exception 'limite de assentos do contrato atingido (%)', lim using errcode = 'check_violation'; end if;
  return new;
end $$;
drop trigger if exists pessoa_assentos on public.pessoa;
create trigger pessoa_assentos before insert or update of status on public.pessoa for each row execute function public.pessoa_assentos();

revoke all on function public.unidade_caminho() from public, anon, authenticated;
revoke all on function public.unidade_caminho_filhas() from public, anon, authenticated;
revoke all on function public.mesma_organizacao() from public, anon, authenticated;
revoke all on function public.pessoa_assentos() from public, anon, authenticated;

-- ---------- permissões ----------
-- pode(cap, unidade): quem está logado tem a capacidade numa unidade que contém a alvo? ('administrar' vale tudo)
create or replace function public.pode(cap text, alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.acesso a
      join public.pessoa p on p.id = a.pessoa_id
      join public.unidade u on u.id = a.unidade_id
      join public.unidade t on t.id = alvo
     where p.user_id = auth.uid() and p.status = 'ativo' and p.workspace_id = t.workspace_id
       and t.caminho like u.caminho || '%'
       and (cap = any(a.capacidades) or 'administrar' = any(a.capacidades)));
$$;
-- a pessoa é visível pra quem tem alguma capacidade de gestão numa unidade em que ela jogou (inclui histórico)
create or replace function public.pode_ver_pessoa(alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pessoa p where p.id = alvo and p.user_id = auth.uid())
      or exists (select 1 from public.vinculo v where v.pessoa_id = alvo
                   and (public.pode('ver_desempenho', v.unidade_id) or public.pode('gerir_pessoas', v.unidade_id)
                        or public.pode('ver_financeiro', v.unidade_id)))
      or exists (select 1 from public.acesso a where a.pessoa_id = alvo and public.pode('administrar', a.unidade_id));
$$;
revoke all on function public.pode(text, uuid) from public, anon;
revoke all on function public.pode_ver_pessoa(uuid) from public, anon;
grant execute on function public.pode(text, uuid) to authenticated;
grant execute on function public.pode_ver_pessoa(uuid) to authenticated;

-- ---------- RLS: cliente só lê ----------
alter table public.unidade enable row level security;
alter table public.pessoa enable row level security;
alter table public.vinculo enable row level security;
alter table public.acesso enable row level security;
revoke insert, update, delete, truncate on public.unidade, public.pessoa, public.vinculo, public.acesso from anon, authenticated;
grant select on public.unidade, public.pessoa, public.vinculo, public.acesso to authenticated;

drop policy if exists unidade_ler on public.unidade;
create policy unidade_ler on public.unidade for select to authenticated
  using (workspace_id in (select public.my_workspaces()));      -- a árvore (só nomes) é visível pro time inteiro
drop policy if exists pessoa_ler on public.pessoa;
create policy pessoa_ler on public.pessoa for select to authenticated using (public.pode_ver_pessoa(id));
drop policy if exists vinculo_ler on public.vinculo;
create policy vinculo_ler on public.vinculo for select to authenticated
  using (public.pode_ver_pessoa(pessoa_id));
drop policy if exists acesso_ler on public.acesso;
create policy acesso_ler on public.acesso for select to authenticated
  using (exists (select 1 from public.pessoa p where p.id = pessoa_id and p.user_id = auth.uid())
         or public.pode('administrar', unidade_id));

-- ---------- gravação: funções do servidor que conferem o escopo ----------
-- o dono do workspace inicia a estrutura do time: cria a raiz e vira admin dela
create or replace function public.iniciar_time(p_nome_raiz text, p_nome_admin text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid; raiz uuid; p uuid;
begin
  select m.workspace_id into ws from public.workspace_members m
   where m.user_id = auth.uid() and m.role = 'owner' order by m.created_at limit 1;
  if ws is null then raise exception 'só o dono do workspace inicia o time' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.unidade where workspace_id = ws) then raise exception 'o time já tem estrutura'; end if;
  insert into public.unidade(workspace_id, nome, rotulo) values (ws, p_nome_raiz, 'Time') returning id into raiz;
  insert into public.pessoa(workspace_id, user_id, nome, status) values (ws, auth.uid(), p_nome_admin, 'ativo')
    on conflict (workspace_id, user_id) do update set status = 'ativo' returning id into p;
  insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p, raiz, array['administrar']);
  return raiz;
end $$;

create or replace function public.criar_unidade(p_mae uuid, p_nome text, p_rotulo text default null, p_ordem int default 0) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid; nova uuid;
begin
  if not public.pode('administrar', p_mae) then raise exception 'sem permissão nesta unidade' using errcode = 'insufficient_privilege'; end if;
  select workspace_id into ws from public.unidade where id = p_mae;
  insert into public.unidade(workspace_id, mae_id, nome, rotulo, ordem) values (ws, p_mae, p_nome, p_rotulo, p_ordem) returning id into nova;
  return nova;
end $$;

create or replace function public.editar_unidade(p_alvo uuid, p_nome text, p_rotulo text, p_ordem int, p_arquivar boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode('administrar', p_alvo) then raise exception 'sem permissão nesta unidade' using errcode = 'insufficient_privilege'; end if;
  if p_arquivar and exists (select 1 from public.vinculo v join public.unidade u on u.id = v.unidade_id
                           where v.fim is null and u.caminho like (select caminho from public.unidade where id = p_alvo) || '%') then
    raise exception 'há jogadores ativos nesta unidade: mova-os antes de arquivar';
  end if;
  update public.unidade set nome = coalesce(p_nome, nome), rotulo = p_rotulo, ordem = coalesce(p_ordem, ordem), arquivada = p_arquivar where id = p_alvo;
end $$;

create or replace function public.mover_unidade(p_alvo uuid, p_nova_mae uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.pode('administrar', p_alvo) and public.pode('administrar', p_nova_mae)) then
    raise exception 'precisa administrar a unidade e o novo lugar' using errcode = 'insufficient_privilege'; end if;
  if (select mae_id from public.unidade where id = p_alvo) is null then raise exception 'a raiz do time não se move'; end if;
  update public.unidade set mae_id = p_nova_mae where id = p_alvo;
end $$;

-- convida alguém pra jogar numa unidade (cria a pessoa e o vínculo); a conta liga depois pelo convite
create or replace function public.convidar_jogador(p_unidade uuid, p_nome text, p_nick_ps text default null, p_id_gg text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid; p uuid;
begin
  if not public.pode('gerir_pessoas', p_unidade) then raise exception 'sem permissão pra convidar nesta unidade' using errcode = 'insufficient_privilege'; end if;
  select workspace_id into ws from public.unidade where id = p_unidade and not arquivada;
  if ws is null then raise exception 'unidade não existe ou está arquivada'; end if;
  insert into public.pessoa(workspace_id, nome, nick_ps, id_gg) values (ws, p_nome, p_nick_ps, p_id_gg) returning id into p;
  insert into public.vinculo(pessoa_id, unidade_id, motivo) values (p, p_unidade, 'entrada');
  return p;
end $$;

-- convida alguém que GERE (professor, financeiro) sem jogar: pessoa + acesso, sem vínculo
create or replace function public.convidar_gestor(p_unidade uuid, p_nome text, p_caps text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid; p uuid;
begin
  if not public.pode('administrar', p_unidade) then raise exception 'só quem administra a unidade convida gestores' using errcode = 'insufficient_privilege'; end if;
  select workspace_id into ws from public.unidade where id = p_unidade and not arquivada;
  if ws is null then raise exception 'unidade não existe ou está arquivada'; end if;
  insert into public.pessoa(workspace_id, nome) values (ws, p_nome) returning id into p;
  insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p, p_unidade, p_caps);
  return p;
end $$;

-- promover / rebaixar / transferir: fecha o vínculo ativo hoje e abre o novo
-- promoção e rebaixamento exigem 'promover' na ORIGEM e no DESTINO; transferência exige 'gerir_pessoas' nos dois
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
end $$;

-- capacidades de gestão de alguém numa unidade (vazio = tira o acesso)
create or replace function public.definir_acesso(p_alvo uuid, p_unidade uuid, p_caps text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode('administrar', p_unidade) then raise exception 'só quem administra a unidade define acessos nela' using errcode = 'insufficient_privilege'; end if;
  if p_caps is null or cardinality(p_caps) = 0 then
    delete from public.acesso where pessoa_id = p_alvo and unidade_id = p_unidade;
  else
    insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p_alvo, p_unidade, p_caps)
      on conflict (pessoa_id, unidade_id) do update set capacidades = excluded.capacidades;
  end if;
end $$;

-- saída do jogador: fecha o vínculo e tira a pessoa dos assentos (o acerto financeiro vem na parte de dinheiro)
create or replace function public.registrar_saida(p_alvo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  select unidade_id into u from public.vinculo where pessoa_id = p_alvo and fim is null;
  if u is null or not public.pode('gerir_pessoas', u) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  update public.vinculo set fim = greatest(current_date, inicio) where pessoa_id = p_alvo and fim is null;
  update public.pessoa set status = 'saiu' where id = p_alvo;
  delete from public.acesso where pessoa_id = p_alvo;
end $$;

do $$
declare f text;
begin
  foreach f in array array['iniciar_time(text,text)','criar_unidade(uuid,text,text,int)','editar_unidade(uuid,text,text,int,boolean)',
    'mover_unidade(uuid,uuid)','convidar_jogador(uuid,text,text,text)','convidar_gestor(uuid,text,text[])','mover_jogador(uuid,uuid,text)',
    'definir_acesso(uuid,uuid,text[])','registrar_saida(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
