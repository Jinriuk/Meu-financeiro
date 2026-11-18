-- aplicar_ativacao usa o e-mail do JWT; visitante deslogado (anon) não tem e-mail e
-- não deveria nem poder chamar a função. Fica só pra usuários autenticados.
revoke execute on function public.aplicar_ativacao() from anon;
