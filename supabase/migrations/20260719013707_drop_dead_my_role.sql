-- #14 (higiene): my_role() era do modelo antigo de papéis globais, substituído por workspaces.
-- Nada no app a chama. Remove pra reduzir superfície e ruído de advisor.
drop function if exists public.my_role();
