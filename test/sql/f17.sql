-- F0.17: captura de erro com limite e aviso sem dado pessoal. Usa as funções teste.* do f05_f06.sql.
\set ON_ERROR_STOP 1
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","email":"b@ex.com"}',false);
select teste.ok('usuário registra erro do app', $q$select public.registrar_erro('app','TypeError: x is undefined','{"tela":"stats"}','2026-11-18.1')$q$);
select teste.erro('usuário NÃO lê a tabela de erros', $q$select count(*) from public.app_erros$q$);
select teste.ok('cliente tentando se passar por webhook é ignorado', $q$select public.registrar_erro('webhook','falso')$q$);
do $$ begin for i in 1..40 loop perform public.registrar_erro('app','loop '||i); end loop; end $$;
reset role;
select teste.igual('limite de 30 por hora por usuário', $q$select count(*)::text from public.app_erros where user_id='00000000-0000-0000-0000-00000000000b'$q$, '30');
select teste.igual('workspace preenchido pelo servidor', $q$select (workspace_id='10000000-0000-0000-0000-00000000000b')::text from public.app_erros order by id limit 1$q$, 'true');
select teste.igual('origem webhook do cliente não entrou', $q$select count(*)::text from public.app_erros where origem='webhook'$q$, '0');
-- sem endereço configurado: monta o texto, não chama rede, marca como avisado
select teste.igual('aviso sem endereço: texto certo', $q$select (public.avisar_erros() like 'GrinderBank: 30 erro(s) novo(s) — app 30%')::text$q$, 'true');
select teste.igual('aviso sem endereço não chama a rede', $q$select count(*)::text from net.chamadas$q$, '0');
select teste.igual('erros ficam marcados como avisados', $q$select count(*)::text from public.app_erros where avisado_em is null$q$, '0');
-- com Discord configurado: uma chamada com {content}, sem e-mail no texto
update public.app_secrets set value='https://discord.com/api/webhooks/1/abc' where name='alerta_webhook_url';
insert into public.app_erros(origem, mensagem, user_id) values ('webhook','kiwify: plano não está no mapa', null);
select public.avisar_erros();
select teste.igual('Discord recebe 1 aviso com {content}', $q$select count(*)::text from net.chamadas where url like 'https://discord.com/%' and body ? 'content'$q$, '1');
select teste.igual('aviso não leva e-mail', $q$select (body->>'content' !~ '@')::text from net.chamadas order by id desc limit 1$q$, 'true');
-- ntfy: publica na raiz com topic
update public.app_secrets set value='https://ntfy.sh/gb-alerta-xyz' where name='alerta_webhook_url';
insert into public.app_erros(origem, mensagem) values ('servidor','teste');
select public.avisar_erros();
select teste.igual('ntfy: raiz + topic', $q$select url || ' ' || (body->>'topic') from net.chamadas order by id desc limit 1$q$, 'https://ntfy.sh gb-alerta-xyz');
select teste.igual('sem erro novo, não avisa de novo', $q$select coalesce(public.avisar_erros(),'nada')$q$, 'nada');
