-- Estatísticas de hand history: 1 linha por (jogador, site, torneio), só agregados.
-- Guardamos CONTAGENS + OPORTUNIDADES pra poder somar qualquer período depois.
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
  allin_ev_bb numeric not null default 0,  -- quanto DEVIA ter ganho pela equity
  allin_net_bb numeric not null default 0, -- quanto ganhou de fato nos all-ins
  pos_json jsonb,                          -- {BTN:{h,v,p},...} mãos/vpip/pfr por posição
  stack_json jsonb,                        -- por faixa de stack em bb
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (player, site, site_tournament_id)
);

alter table public.hh_tournament_stats enable row level security;
drop policy if exists pool_shared on public.hh_tournament_stats;
create policy pool_shared on public.hh_tournament_stats
  for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hh_tournament_stats'
  ) then
    execute 'alter publication supabase_realtime add table public.hh_tournament_stats';
  end if;
end $$;
