-- Reparo: uma falha transitória de leitura fez o app criar configs padrão duplicadas
-- (e com 2+ linhas o maybeSingle falha sempre → cada reload criava outra).
-- Mantém a config ORIGINAL da pool (Gabriel/Breno, ABI 5/4, criada em 08/07) e apaga o resto.
delete from public.pool_config where id <> '91e2d7b6-eda7-4c57-a21e-1f0a3a1cfcf7';
-- Trava: a tabela nunca mais aceita uma segunda linha (índice único sobre constante).
create unique index if not exists pool_config_single_row on public.pool_config ((true));
