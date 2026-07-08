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
  abi_max numeric not null default 2,               -- buy-in máximo permitido na grade (US$)
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
  entrada numeric not null default 0,
  saida numeric not null default 0,
  observacao text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Saques (só o que foi realmente pago) ----------
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  week_ending_date date not null,              -- domingo de fechamento da semana
  player text not null,
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
alter table public.withdrawals     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pool_config','daily_entries','tournaments','bankroll_ledger','withdrawals'] loop
    execute format('drop policy if exists pool_shared on public.%I;', t);
    execute format(
      'create policy pool_shared on public.%I
         for all to authenticated
         using (true) with check (true);', t);
  end loop;
end $$;
