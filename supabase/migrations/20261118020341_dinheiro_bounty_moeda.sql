-- ============================================================
-- Dinheiro (plano mestre F0.8 e F0.11).
--  · bounty: bounty de PKO em campo próprio. Lucro = prêmio + bounty − investido.
--  · currency: moeda do torneio como veio do arquivo do site. A banca é em US$ e o app
--    NÃO converte; torneio fora de USD fica marcado para o jogador conferir.
-- Idempotente. Aplicar ANTES de publicar o app que grava esses campos.
-- ============================================================
alter table public.tournaments
  add column if not exists bounty   numeric not null default 0 check (bounty >= 0),
  add column if not exists currency text    not null default 'USD';
comment on column public.tournaments.bounty is 'Bounties de PKO ganhos no torneio (fora do prêmio por colocação).';
comment on column public.tournaments.currency is 'Moeda dos valores do torneio como veio do arquivo do site (USD, EUR, GBP, CNY).';
