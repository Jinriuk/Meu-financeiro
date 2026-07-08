-- ============================================================
--  Minhas Finanças  ·  estrutura do banco (Supabase / Postgres)
--  Cole tudo no SQL Editor do Supabase e clique em RUN.
-- ============================================================

-- Contas (bancos)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  opening_balance numeric not null default 0,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- Lançamentos (entradas e saídas das contas)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  description text not null,
  category text,
  account text,
  type text not null check (type in ('entrada','saida')),
  value numeric not null,
  created_at timestamptz not null default now()
);

-- Compras no cartão de crédito
create table if not exists public.card_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  description text not null,
  category text,
  value numeric not null,
  created_at timestamptz not null default now()
);

-- Investimentos
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  value numeric not null,
  created_at timestamptz not null default now()
);

-- Configurações (1 linha por usuário)
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  card_limit numeric not null default 3000
);

-- ============================================================
--  Segurança: cada usuário só enxerga e mexe nos próprios dados
-- ============================================================
alter table public.accounts       enable row level security;
alter table public.transactions   enable row level security;
alter table public.card_purchases enable row level security;
alter table public.investments    enable row level security;
alter table public.settings       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts','transactions','card_purchases','investments'] loop
    execute format('drop policy if exists own_all on public.%I;', t);
    execute format(
      'create policy own_all on public.%I for all to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;

drop policy if exists own_settings on public.settings;
create policy own_settings on public.settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
