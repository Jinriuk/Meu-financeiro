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

do $$
declare t text;
begin
  foreach t in array array['pool_config','daily_entries','tournaments','bankroll_ledger','player_wallets','withdrawals'] loop
    execute format('drop policy if exists pool_shared on public.%I;', t);
    execute format(
      'create policy pool_shared on public.%I
         for all to authenticated
         using (true) with check (true);', t);
  end loop;
end $$;

-- ============================================================
--  Perfil dos jogadores: nickname/CPF pra login e primeiro acesso
--  (o app força troca de senha + cadastro no primeiro login;
--   depois dá pra entrar com e-mail, nickname ou CPF)
-- ============================================================
create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,                     -- espelho do e-mail do auth (pro lookup de login)
  nickname text,
  cpf text,                                -- só dígitos (11)
  password_changed boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists player_profiles_nickname_key on public.player_profiles (lower(nickname)) where nickname is not null;
create unique index if not exists player_profiles_cpf_key on public.player_profiles (cpf) where cpf is not null;

alter table public.player_profiles enable row level security;
drop policy if exists pool_shared on public.player_profiles;
create policy pool_shared on public.player_profiles
  for all to authenticated using (true) with check (true);

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
  foreach t in array array['pool_config','daily_entries','tournaments','bankroll_ledger','player_wallets','withdrawals'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
