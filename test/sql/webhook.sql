-- Revogação pelo webhook: só derruba o plano se o pedido for do plano atual.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users(id,email,email_confirmed_at) values
 ('ab000000-0000-0000-0000-0000000000a1','sobe@ex.com',now()), ('ab000000-0000-0000-0000-0000000000a2','pro@ex.com',now()),
 ('ab000000-0000-0000-0000-0000000000a3','velho@ex.com',now());
insert into public.workspaces(id,name,kind,plan,trial_ends_at) values
 ('ab100000-0000-0000-0000-0000000000b1','Sobe','solo','gestao',null), ('ab100000-0000-0000-0000-0000000000b2','Pro','solo','gestao',null),
 ('ab100000-0000-0000-0000-0000000000b3','Velho','solo','gestao',null);
insert into public.workspace_members(workspace_id,user_id,role) values
 ('ab100000-0000-0000-0000-0000000000b1','ab000000-0000-0000-0000-0000000000a1','owner'),
 ('ab100000-0000-0000-0000-0000000000b2','ab000000-0000-0000-0000-0000000000a2','owner'),
 ('ab100000-0000-0000-0000-0000000000b3','ab000000-0000-0000-0000-0000000000a3','owner');
-- cliente comprou Gestão (pedido G) e depois Pro (pedido P)
select public.webhook_ativar_plano('sobe@ex.com','gestao','hotmart','G');
select public.webhook_ativar_plano('sobe@ex.com','pro','hotmart','P');
select teste.igual('quem subiu está no Pro', $q$select plan from public.workspaces where id='ab100000-0000-0000-0000-0000000000b1'$q$, 'pro');
select teste.igual('reembolso do pedido do Gestão é ignorado', $q$select (public.webhook_revogar_plano('sobe@ex.com','G','gestao') like 'ignorado%')::text$q$, 'true');
select teste.igual('…e o Pro continua', $q$select plan from public.workspaces where id='ab100000-0000-0000-0000-0000000000b1'$q$, 'pro');
select teste.igual('cancelamento do Pro responde ok', $q$select public.webhook_revogar_plano('sobe@ex.com','P','pro')$q$, 'ok');
select teste.igual('…e derruba o Pro', $q$select plan from public.workspaces where id='ab100000-0000-0000-0000-0000000000b1'$q$, 'free');
select public.webhook_ativar_plano('pro@ex.com','pro','hotmart','X');
select teste.igual('tentativa de Gestão cancelada não derruba quem é Pro', $q$select (public.webhook_revogar_plano('pro@ex.com','Y','gestao') like 'ignorado%')::text$q$, 'true');
select teste.igual('…e continua Pro', $q$select plan from public.workspaces where id='ab100000-0000-0000-0000-0000000000b2'$q$, 'pro');
select public.webhook_revogar_plano('velho@ex.com','Z');
select teste.igual('chamada antiga (sem plano) mantém o comportamento de antes', $q$select plan from public.workspaces where id='ab100000-0000-0000-0000-0000000000b3'$q$, 'free');
set role authenticated;
select teste.como('ab000000-0000-0000-0000-0000000000a2');
select teste.erro('cliente não chama a revogação', $q$select public.webhook_revogar_plano('pro@ex.com','X','pro')$q$);
reset role;
