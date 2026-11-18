-- id do torneio no site (ex.: GG "Tournament #301071014"): permite importar o resumo de
-- torneios sem duplicar o que já foi lançado, e reimportar a mesma pasta sem medo.
alter table public.tournaments add column if not exists site_tournament_id text;

-- dois jogadores da pool podem jogar o MESMO torneio: a chave inclui o jogador.
create unique index if not exists tournaments_site_tid_uniq
  on public.tournaments (workspace_id, player, site, site_tournament_id)
  where site_tournament_id is not null;
