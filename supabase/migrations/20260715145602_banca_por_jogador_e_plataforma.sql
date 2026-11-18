create table if not exists public.player_wallets (
  id uuid primary key default gen_random_uuid(),
  player text not null,
  wallet text not null,
  saldo_inicial numeric not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (player, wallet)
);
alter table public.player_wallets enable row level security;
drop policy if exists pool_shared on public.player_wallets;
create policy pool_shared on public.player_wallets
  for all to authenticated using (true) with check (true);

alter table public.bankroll_ledger add column if not exists player text;
alter table public.withdrawals add column if not exists wallet text;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='player_wallets') then
    alter publication supabase_realtime add table public.player_wallets;
  end if;
end $$;
