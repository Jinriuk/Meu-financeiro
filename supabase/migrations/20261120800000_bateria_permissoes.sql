-- ============================================================
-- Bateria de permissões (plano mestre 3.4): higiene dos privilégios de tabela. Idempotente.
--
-- O Supabase dá ALL nas tabelas novas pra anon e authenticated, e quem protege as linhas é a RLS. Dois pontos que a
-- RLS não cobre:
--   · TRUNCATE não passa pela RLS (apaga a tabela inteira). Nenhum caminho do app usa TRUNCATE e o PostgREST não o
--     expõe, mas o privilégio estava lá pra anon e authenticated em 11 tabelas (torneios, movimentos, salas...);
--   · anon (a chave pública, antes do login) não grava nada em lugar nenhum: cadastro, convite e webhooks gravam pelo
--     servidor (funções e service role). INSERT/UPDATE/DELETE pra anon só alargava a superfície.
-- Fica: SELECT de anon (a RLS devolve 0 linhas; a bateria confere) e o resto de authenticated (a RLS decide).
-- As tabelas que forem criadas depois já nascem sem esses privilégios (default privileges de quem cria: postgres).
-- ============================================================

revoke truncate on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke truncate on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke insert, update, delete on tables from anon;
