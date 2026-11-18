-- #4 (P1): o app não usa mais email_for_login (login/reset por apelido agora passam pela
-- Edge Function auth-alias, que resolve no servidor e nunca devolve o e-mail). Tira a função
-- do alcance de anon/authenticated — fecha a deanonimização apelido/CPF->e-mail e a
-- enumeração de contas por anônimo.
revoke execute on function public.email_for_login(text) from anon, authenticated, public;
