-- ============================================================
-- Motor de stats v2 (plano mestre F0.12 a F0.15 e F0.18).
-- Contadores novos para as definições do PT4 e a versão do motor em cada agregado.
-- Linhas existentes ficam com engine_version = 1: o app mostra o aviso e, ao reimportar o
-- mesmo torneio, recalcula a linha inteira (sem duplicar mãos).
-- Idempotente. Aplicar ANTES de publicar o app que grava esses campos.
-- ============================================================
alter table public.hh_tournament_stats
  add column if not exists engine_version int not null default 1,
  add column if not exists walk_cnt       int not null default 0,  -- mãos sem ação do herói no pré-flop (sai do VPIP)
  add column if not exists pfr_opp        int not null default 0,  -- oportunidade de PFR (cnt_pfr_opp do PT4)
  add column if not exists rfi_cnt        int not null default 0,  -- raise first in
  add column if not exists rfi_opp        int not null default 0,
  add column if not exists sq_cnt         int not null default 0,  -- squeeze (3-bet com caller no meio)
  add column if not exists sq_opp         int not null default 0,
  add column if not exists sawflop_np_cnt int not null default 0,  -- flops vistos com ação depois (WTSD sem all-in pré-flop)
  add column if not exists wtsd_np_cnt    int not null default 0;

comment on column public.hh_tournament_stats.engine_version is
  'Versão das definições do motor de stats que calculou a linha (HH_ENGINE no app). 1 = até jul/2026, 2 = PT4.';
