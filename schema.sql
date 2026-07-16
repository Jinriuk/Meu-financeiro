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
