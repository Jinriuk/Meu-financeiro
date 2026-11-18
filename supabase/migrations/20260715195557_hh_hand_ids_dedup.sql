-- Dedup de mãos: guarda o nº de cada mão já importada (por torneio) pra que
-- reimportar arquivos sobrepostos nunca conte a mesma mão duas vezes.
alter table public.hh_tournament_stats
  add column if not exists hand_ids jsonb not null default '[]'::jsonb;
