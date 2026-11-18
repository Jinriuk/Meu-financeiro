-- Passe de segurança (advisors): funções security definer só pra quem precisa.
-- email_for_login: PRECISA de anon (tela de login traduz nickname/CPF -> e-mail). Mantém.
revoke execute on function public.create_solo_workspace(text) from anon;
revoke execute on function public.my_role() from anon;
revoke execute on function public.my_workspaces() from anon;
-- função de trigger: ninguém chama via API (o trigger dispara sozinho, sem precisar de EXECUTE do caller)
revoke execute on function public.set_workspace_id() from anon, authenticated, public;
