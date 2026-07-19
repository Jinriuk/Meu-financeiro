-- ============================================================
--  Pool de Poker (Gabriel & Guedes) · estrutura do banco
--  Supabase / Postgres. Cole tudo no SQL Editor e clique em RUN.
-- ============================================================
--
--  DIFERENÇA IMPORTANTE em relação ao app "Meu Financeiro":
--  aqui os dados são COMPARTILHADOS entre os dois jogadores.
--  Não é 1 usuário por linha — os dois veem a MESMA banca, o
--  mesmo make-up, os mesmos lançamentos. Por isso a política de
--  RLS é "qualquer autenticado vê tudo". Como só existirão 2
--  usuários (criados à mão no painel, cadastro público desligado),
--  isso é seguro e suficiente. Guardamos `created_by` só para
--  auditoria (saber quem lançou), nunca para restringir leitura.
-- ============================================================

-- ---------- Configuração da pool (uma única linha) ----------
create table if not exists public.pool_config (
  id uuid primary key default gen_random_uuid(),
  player1_name text not null default 'Gabriel',
  player2_name text not null default 'Guedes',
  player_pct numeric not null default 0.5,          -- fatia do jogador no lucro (0.5 = 50%)
  abi_max numeric not null default 2,               -- ABI máximo padrão / fallback (US$)
  abi_max_player1 numeric not null default 2,       -- ABI máximo do jogador 1 (US$)
  abi_max_player2 numeric not null default 2,       -- ABI máximo do jogador 2 (US$)
  piso_minimo numeric not null default 300,         -- banca não pode ficar abaixo disso (US$)
  makeup_max_recomendado numeric not null default 100,
  makeup_inicial_player1 numeric not null default 0,
  makeup_inicial_player2 numeric not null default 0,
  stoploss_daily_buyins numeric not null default 10,
  stoploss_weekly_pct numeric not null default 0.15,
  banca_inicial numeric not null default 400,       -- acima do piso, pra sobrar margem de saque
  week_start_date date not null default current_date,
  sites_permitidos text[] not null default '{PokerStars,"GG Poker"}',
  modalidades_permitidas text[] not null default '{MTT,Spin,Cash,"Sit & Go"}',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
-- a pool tem UMA config: índice único sobre constante impede segunda linha
-- (protege contra o app recriar a config padrão numa falha transitória de leitura)
create unique index if not exists pool_config_single_row on public.pool_config ((true));

-- ---------- Lançamento diário (fonte da verdade) ----------
create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  player text not null,
  site text,
  saldo_inicial numeric not null default 0,   -- SEMPRE digitado (o que o jogador vê no site)
  deposito numeric not null default 0,
  saque numeric not null default 0,
  saldo_final numeric not null default 0,      -- SEMPRE digitado
  qtd_torneios int not null default 0,
  total_buyins numeric not null default 0,
  maior_buyin numeric not null default 0,
  maior_premiacao numeric not null default 0,
  observacoes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Torneios (complementar / opcional) ----------
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  player text not null,
  site text,
  tournament_name text,
  modality text,
  buyin numeric not null default 0,
  reentries int not null default 0,
  field_size int not null default 0,
  final_position int,
  prize numeric not null default 0,
  observacoes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Banca central (ledger) ----------
create table if not exists public.bankroll_ledger (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  wallet text not null,                        -- PokerStars / GG Poker / Reserva / Outros
  player text,                                 -- opcional: atribui o movimento a um jogador
  entrada numeric not null default 0,
  saida numeric not null default 0,
  observacao text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Saldo inicial de cada jogador por plataforma ----------
create table if not exists public.player_wallets (
  id uuid primary key default gen_random_uuid(),
  player text not null,
  wallet text not null,                        -- PokerStars / GG Poker / Reserva / Outros
  saldo_inicial numeric not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (player, wallet)
);

-- ---------- Saques (só o que foi realmente pago) ----------
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  week_ending_date date not null,              -- domingo de fechamento da semana
  player text not null,
  wallet text,                                 -- opcional: de qual plataforma saiu o dinheiro
  valor_sacado numeric not null default 0,
  observacoes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Estatísticas de hand history (motor de stats) ----------
-- 1 linha por (jogador, site, torneio) — SÓ agregados (contagens + oportunidades,
-- pra somar qualquer período). O texto bruto das mãos NUNCA sobe pro banco.
create table if not exists public.hh_tournament_stats (
  id uuid primary key default gen_random_uuid(),
  player text not null,
  site text not null,                      -- PokerStars / GG Poker
  site_tournament_id text not null,        -- Tournament # do arquivo
  tournament_name text,
  entry_date date,
  buyin numeric not null default 0,
  hands int not null default 0,
  net_bb numeric not null default 0,       -- resultado em big blinds (fichas)
  vpip_cnt int not null default 0,
  pfr_cnt int not null default 0,
  tb_cnt int not null default 0,  tb_opp int not null default 0,     -- 3-bet
  f3b_cnt int not null default 0, f3b_opp int not null default 0,    -- fold para 3-bet
  steal_cnt int not null default 0, steal_opp int not null default 0,
  bbdef_cnt int not null default 0, bbdef_opp int not null default 0,
  cbet_cnt int not null default 0, cbet_opp int not null default 0,
  fcbet_cnt int not null default 0, fcbet_opp int not null default 0,
  sawflop_cnt int not null default 0,
  wwsf_cnt int not null default 0,
  wtsd_cnt int not null default 0,
  wsd_cnt int not null default 0,
  af_bets int not null default 0, af_calls int not null default 0,
  allin_cnt int not null default 0,
  allin_ev_bb numeric not null default 0,  -- quanto DEVIA ter ganho pela equity (sorte = net - ev)
  allin_net_bb numeric not null default 0,
  pos_json jsonb,                          -- {BTN:{h,v,p},...} mãos/vpip/pfr por posição
  stack_json jsonb,                        -- por faixa de stack em bb
  hand_ids jsonb not null default '[]'::jsonb, -- nº de cada mão já importada (dedup: reimportar não conta 2x)
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (player, site, site_tournament_id)
);

-- ============================================================
--  Segurança (RLS): pool compartilhada — qualquer AUTENTICADO
--  vê e mexe em tudo. Cadastro público deve ficar DESLIGADO
--  (Authentication → só os 2 usuários criados à mão entram).
-- ============================================================
alter table public.pool_config     enable row level security;
alter table public.daily_entries   enable row level security;
alter table public.tournaments     enable row level security;
alter table public.bankroll_ledger enable row level security;
alter table public.player_wallets  enable row level security;
alter table public.withdrawals     enable row level security;
alter table public.hh_tournament_stats enable row level security;

create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,                     -- espelho do e-mail do auth (pro lookup de login)
  nickname text,
  cpf text,                                -- só dígitos (11)
  password_changed boolean not null default false,
  role text not null default 'pool',       -- 'pool' = sócio (vê tudo) · 'guest' = convidado (só as próprias stats)
  created_at timestamptz not null default now()
);

-- papel do usuário logado (security definer: não entra em loop com o RLS dos perfis)
create or replace function public.my_role() returns text
language sql stable security definer set search_path=''
as $$ select coalesce((select p.role from public.player_profiles p where p.user_id=auth.uid()),'pool') $$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated;

-- Tabelas da POOL: só sócios (role='pool'). Convidado não lê nem escreve, nem pela API.
do $$
declare t text;
begin
  foreach t in array array['pool_config','daily_entries','tournaments','bankroll_ledger','player_wallets','withdrawals'] loop
    execute format('drop policy if exists pool_shared on public.%I;', t);
    execute format(
      'create policy pool_shared on public.%I
         for all to authenticated
         using (public.my_role()=''pool'') with check (public.my_role()=''pool'');', t);
  end loop;
end $$;

-- Stats de hand history: sócios veem tudo; convidado só as linhas que ELE criou
drop policy if exists pool_shared on public.hh_tournament_stats;
create policy pool_shared on public.hh_tournament_stats
  for all to authenticated
  using (public.my_role()='pool' or created_by=auth.uid())
  with check (public.my_role()='pool' or created_by=auth.uid());

-- ---------- Histórico de alterações dos Ajustes ----------
-- Quem mudou o quê, de que valor pra qual, quando. Usado pra avisar o outro
-- jogador em tempo real e pra julgar "fora da grade" pelo ABI vigente NA DATA
-- do torneio (mudar o ABI hoje não reprova torneio antigo).
create table if not exists public.config_changes (
  id uuid primary key default gen_random_uuid(),
  field text not null,
  old_value text,
  new_value text,
  resumo text not null,
  changed_by_name text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.config_changes enable row level security;
drop policy if exists pool_shared on public.config_changes;
create policy pool_shared on public.config_changes
  for all to authenticated
  using (public.my_role()='pool') with check (public.my_role()='pool');

-- ---------- Diagnóstico de import de hand history ----------
-- 1 linha por TENTATIVA de import, só metadados (nome/tamanho dos arquivos, entradas
-- do zip, 1ª linha de cada texto, contagens e motivos) — nunca as mãos em si.
-- Serve pra investigar um import que "não foi" sem precisar do arquivo da pessoa.
create table if not exists public.hh_import_log (
  id uuid primary key default gen_random_uuid(),
  player text,
  saved int not null default 0,
  novas int not null default 0,
  repetidas int not null default 0,
  ignored int not null default 0,
  reasons jsonb,
  issues jsonb,
  meta jsonb,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.hh_import_log enable row level security;
drop policy if exists pool_shared on public.hh_import_log;
create policy pool_shared on public.hh_import_log
  for all to authenticated
  using (public.my_role()='pool' or created_by=auth.uid())
  with check (public.my_role()='pool' or created_by=auth.uid());

-- ============================================================
--  Perfil dos jogadores: nickname/CPF pra login e primeiro acesso
--  (o app força troca de senha + cadastro no primeiro login;
--   depois dá pra entrar com e-mail, nickname ou CPF)
-- ============================================================
create unique index if not exists player_profiles_nickname_key on public.player_profiles (lower(nickname)) where nickname is not null;
create unique index if not exists player_profiles_cpf_key on public.player_profiles (cpf) where cpf is not null;

alter table public.player_profiles enable row level security;
drop policy if exists pool_shared on public.player_profiles;
-- sócios veem todos os perfis; convidado só o próprio (não enxerga e-mail/CPF dos outros)
create policy pool_shared on public.player_profiles
  for all to authenticated
  using (public.my_role()='pool' or user_id=auth.uid())
  with check (public.my_role()='pool' or user_id=auth.uid());

-- Traduz nickname/CPF/e-mail -> e-mail do auth; a tela de login chama como anon
create or replace function public.email_for_login(identifier text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select p.email from public.player_profiles p
  where (p.nickname is not null and lower(p.nickname) = lower(trim(identifier)))
     or lower(p.email) = lower(trim(identifier))
     or (p.cpf is not null and p.cpf = regexp_replace(identifier, '\D', '', 'g'))
  limit 1;
$$;
revoke all on function public.email_for_login(text) from public;
grant execute on function public.email_for_login(text) to anon, authenticated;

-- ============================================================
--  Tempo real: o lançamento de um jogador aparece na hora
--  na tela do outro (o app assina postgres_changes).
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['pool_config','daily_entries','tournaments','bankroll_ledger','player_wallets','withdrawals','hh_tournament_stats','config_changes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- ============================================================
--  FASE 1 (GrinderBank): MULTI-TENANT EM BANCO ÚNICO
--  Cada conta = um "workspace" (a pool é o único tipo 'team';
--  clientes são 'solo'). Este bloco SUBSTITUI as políticas
--  pool/guest acima: rodado por cima delas, derruba pool_shared
--  e instala o isolamento por associação de workspace.
-- ============================================================
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'solo' check (kind in ('team','solo')),
  plan text not null default 'founder',
  created_at timestamptz not null default now()
);
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create or replace function public.my_workspaces() returns setof uuid
language sql stable security definer set search_path=''
as $$ select workspace_id from public.workspace_members where user_id = auth.uid() $$;
revoke all on function public.my_workspaces() from public;
grant execute on function public.my_workspaces() to authenticated;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
drop policy if exists ws_self on public.workspaces;
create policy ws_self on public.workspaces for all to authenticated
  using (id in (select public.my_workspaces())) with check (id in (select public.my_workspaces()));
drop policy if exists wsm_self on public.workspace_members;
create policy wsm_self on public.workspace_members for select to authenticated
  using (user_id = auth.uid());

-- workspace_id em toda tabela de dados + trigger de preenchimento + RLS por associação
create or replace function public.set_workspace_id() returns trigger
language plpgsql security definer set search_path=''
as $$ begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from public.workspace_members where user_id=auth.uid() order by created_at limit 1;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['pool_config','daily_entries','tournaments','bankroll_ledger','player_wallets','withdrawals','hh_tournament_stats','hh_import_log','config_changes'] loop
    execute format('alter table public.%I add column if not exists workspace_id uuid references public.workspaces(id);', t);
    execute format('drop trigger if exists set_ws on public.%I;', t);
    execute format('create trigger set_ws before insert on public.%I for each row execute function public.set_workspace_id();', t);
    execute format('drop policy if exists pool_shared on public.%I;', t);
    execute format('drop policy if exists ws_members on public.%I;', t);
    execute format(
      'create policy ws_members on public.%I for all to authenticated
         using (workspace_id in (select public.my_workspaces()))
         with check (workspace_id in (select public.my_workspaces()));', t);
  end loop;
end $$;

-- únicos por workspace (clientes diferentes podem repetir nome/torneio/carteira)
drop index if exists pool_config_single_row;
create unique index if not exists pool_config_one_per_ws on public.pool_config (workspace_id);
alter table public.hh_tournament_stats drop constraint if exists hh_tournament_stats_player_site_site_tournament_id_key;
create unique index if not exists hh_stats_ws_key on public.hh_tournament_stats (workspace_id, player, site, site_tournament_id);
alter table public.player_wallets drop constraint if exists player_wallets_player_wallet_key;
create unique index if not exists player_wallets_ws_key on public.player_wallets (workspace_id, player, wallet);

-- perfis: o próprio + colegas de workspace
drop policy if exists pool_shared on public.player_profiles;
drop policy if exists profile_self_or_teammates on public.player_profiles;
create policy profile_self_or_teammates on public.player_profiles for all to authenticated
  using (user_id=auth.uid() or exists (
    select 1 from public.workspace_members m where m.user_id=player_profiles.user_id and m.workspace_id in (select public.my_workspaces())))
  with check (user_id=auth.uid());
-- NOTA: as sementes (workspace da pool com os 2 sócios, workspaces solo) são por instalação —
-- ver migration workspaces_multitenant no projeto.

-- ---------- Cadastro GrinderBank: apelido único + WhatsApp + ativações de plano ----------
alter table public.player_profiles add column if not exists whatsapp text;
create or replace function public.nickname_disponivel(nick text) returns boolean
language sql stable security definer set search_path=''
as $$ select not exists (select 1 from public.player_profiles p where lower(p.nickname)=lower(trim(nick))) $$;
revoke all on function public.nickname_disponivel(text) from public;
grant execute on function public.nickname_disponivel(text) to anon, authenticated;
-- pagou (Kiwify/manual) -> linha aqui; no login a conta com o e-mail aplica sozinha
create table if not exists public.plan_activations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plan text not null check (plan in ('gestao','pro','founder')),
  status text not null default 'pending' check (status in ('pending','used','revoked')),
  source text, note text,
  created_at timestamptz not null default now(),
  used_at timestamptz, used_by uuid references auth.users(id)
);
alter table public.plan_activations enable row level security;  -- sem policies: só via RPC/admin
create index if not exists plan_activations_email_idx on public.plan_activations (lower(email)) where status='pending';
create or replace function public.aplicar_ativacao() returns text
language plpgsql security definer set search_path=''
as $$
declare act record; wid uuid; meu_email text;
begin
  meu_email := lower(coalesce(auth.jwt()->>'email',''));
  if meu_email='' then return null; end if;
  select * into act from public.plan_activations where lower(email)=meu_email and status='pending' order by created_at limit 1;
  if act.id is null then return null; end if;
  select workspace_id into wid from public.workspace_members where user_id=auth.uid() order by created_at limit 1;
  if wid is null then return null; end if;
  update public.workspaces set plan=act.plan where id=wid;
  update public.plan_activations set status='used', used_at=now(), used_by=auth.uid() where id=act.id;
  return act.plan;
end $$;
revoke all on function public.aplicar_ativacao() from public;
-- os default privileges do Supabase concedem execute a anon em função nova — revoga explícito
revoke execute on function public.aplicar_ativacao() from anon;
grant execute on function public.aplicar_ativacao() to authenticated;

-- ============================================================
-- Passe de auditoria pré-produção (P0/P1/P2). A FONTE DA VERDADE do banco são as
-- migrations versionadas no projeto Supabase (supabase_migrations.schema_migrations);
-- para um snapshot completo recriável use `supabase db pull`. Este arquivo é o espelho
-- legível e reflete o estado atual de segurança abaixo.
-- ============================================================

-- #1 (P0) entitlement no servidor: cliente NÃO escreve workspaces (plano só muda via RPC definer)
revoke insert, update, delete, truncate on public.workspaces from anon, authenticated;
revoke insert, update, delete, truncate on public.workspace_members from anon, authenticated;
revoke all on public.plan_activations from anon, authenticated;
revoke insert, update, delete, truncate on public.player_profiles from anon;
-- #10 (P0/P2) fail-closed: plano nasce 'free' e só aceita valores conhecidos
alter table public.workspaces alter column plan set default 'free';
alter table public.workspaces drop constraint if exists workspaces_plan_check;
alter table public.workspaces add constraint workspaces_plan_check
  check (plan in ('free','gestao','pro','founder','team'));

-- #11 (P2) índices de FK (RLS filtra por workspace_id em toda query)
do $$ declare t text; c text;
begin
  foreach t in array array['bankroll_ledger','config_changes','daily_entries','hh_import_log',
    'hh_tournament_stats','player_wallets','pool_config','tournaments','withdrawals'] loop
    execute format('create index if not exists idx_%s_ws on public.%I(workspace_id);', t, t);
    execute format('create index if not exists idx_%s_cb on public.%I(created_by);', t, t);
  end loop;
  create index if not exists idx_plan_activations_usedby on public.plan_activations(used_by);
  create index if not exists idx_wsm_ws on public.workspace_members(workspace_id);
  create index if not exists idx_wsm_user on public.workspace_members(user_id);
end $$;
-- #11 (P2) initplan: avalia auth.uid() uma vez por query, não por linha
drop policy if exists wsm_self on public.workspace_members;
create policy wsm_self on public.workspace_members for select using (user_id = (select auth.uid()));
drop policy if exists profile_self_or_teammates on public.player_profiles;
create policy profile_self_or_teammates on public.player_profiles for all
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.workspace_members m
    where m.user_id = player_profiles.user_id and m.workspace_id in (select my_workspaces())))
  with check (user_id = (select auth.uid()));

-- #6 (P1/LGPD) exclusão definitiva: apaga TUDO do usuário; pool compartilhada só perde o membro
create or replace function public.excluir_minha_conta() returns void
language plpgsql security definer set search_path to '' as $$
declare uid uuid := auth.uid(); wsid uuid; membros int;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  for wsid in select workspace_id from public.workspace_members where user_id=uid loop
    select count(*) into membros from public.workspace_members where workspace_id=wsid;
    if membros<=1 then
      delete from public.bankroll_ledger where workspace_id=wsid;
      delete from public.config_changes where workspace_id=wsid;
      delete from public.daily_entries where workspace_id=wsid;
      delete from public.hh_import_log where workspace_id=wsid;
      delete from public.hh_tournament_stats where workspace_id=wsid;
      delete from public.player_wallets where workspace_id=wsid;
      delete from public.tournaments where workspace_id=wsid;
      delete from public.withdrawals where workspace_id=wsid;
      delete from public.pool_config where workspace_id=wsid;
      delete from public.workspace_members where workspace_id=wsid;
      delete from public.workspaces where id=wsid;
    else
      delete from public.workspace_members where workspace_id=wsid and user_id=uid;
    end if;
  end loop;
  update public.plan_activations set used_by=null where used_by=uid;
  delete from public.player_profiles where user_id=uid;
  delete from auth.users where id=uid;
end $$;
revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;

-- #2 (P0) cobrança: idempotência + ativar/revogar plano (chamadas pelo webhook via service role)
create table if not exists public.webhook_events(
  provider text not null, event_id text not null,
  received_at timestamptz not null default now(), primary key(provider,event_id));
alter table public.webhook_events enable row level security;  -- sem policy: só service role/admin
alter table public.plan_activations add column if not exists order_id text;
create or replace function public.webhook_ativar_plano(p_email text, p_plan text, p_source text, p_order_id text)
returns text language plpgsql security definer set search_path to '' as $$
declare wid uuid; uid uuid;
begin
  if p_plan not in ('gestao','pro','founder','team') then raise exception 'plano inválido: %', p_plan; end if;
  insert into public.plan_activations(email,plan,status,source,order_id)
    values(lower(p_email),p_plan,'pending',coalesce(p_source,'kiwify'),p_order_id);
  select pp.user_id into uid from public.player_profiles pp where lower(pp.email)=lower(p_email) limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id=uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan=p_plan where id=wid;
      update public.plan_activations set status='used', used_at=now(), used_by=uid
        where lower(email)=lower(p_email) and status='pending' and plan=p_plan;
    end if;
  end if;
  return 'ok';
end $$;
create or replace function public.webhook_revogar_plano(p_email text, p_order_id text)
returns text language plpgsql security definer set search_path to '' as $$
declare wid uuid; uid uuid;
begin
  update public.plan_activations set status='revoked' where lower(email)=lower(p_email) and status='pending';
  select pp.user_id into uid from public.player_profiles pp where lower(pp.email)=lower(p_email) limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id=uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan='free' where id=wid and plan not in ('team','founder');
    end if;
  end if;
  return 'ok';
end $$;
revoke all on function public.webhook_ativar_plano(text,text,text,text) from public, anon, authenticated;
revoke all on function public.webhook_revogar_plano(text,text) from public, anon, authenticated;

-- Edge Functions (código em supabase/functions/, deploy pelo painel/CLI):
--   auth-alias     : login/reset por apelido resolvido no servidor (não vaza e-mail)  [#4]
--   kiwify-webhook : recebe a cobrança da Kiwify, chama os RPCs acima                 [#2]
