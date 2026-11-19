-- Fase 1: workspace 'time' e salas criadas pela planilha conferida. Roda depois do fase1_abertura.sql.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users(id,email,email_confirmed_at) values ('ee000000-0000-0000-0000-000000000001','dono@time.test',now());
insert into public.player_profiles(user_id,email,nickname,password_changed,role) values ('ee000000-0000-0000-0000-000000000001','dono@time.test','DonoTime',true,'solo');
create temp table novo_ws(id uuid);
insert into novo_ws select public.criar_time('Samba Novo','ee000000-0000-0000-0000-000000000001',null,30);
select teste.igual('criar_time: workspace tipo time, plano de time, 30 assentos',
  $q$select kind||'/'||plan||'/'||assentos from public.workspaces where id=(select id from novo_ws)$q$, 'time/team/30');
select teste.igual('…com raiz, o dono como administrador (nome do apelido) e a config do time',
  $q$select (select count(*) from public.unidade where workspace_id=(select id from novo_ws) and mae_id is null)||'/'||
            (select p.nome||':'||array_to_string(a.capacidades,',') from public.pessoa p join public.acesso a on a.pessoa_id=p.id where p.workspace_id=(select id from novo_ws))||'/'||
            (select count(*) from public.pool_config where workspace_id=(select id from novo_ws))$q$, '1/DonoTime:administrar/1');
select teste.erro_qualquer('dono que já está em outro workspace', $q$select public.criar_time('Outro','ee000000-0000-0000-0000-000000000001')$q$);
select teste.erro_qualquer('tipo de workspace inválido', $q$update public.workspaces set kind='xyz' where id=(select id from novo_ws)$q$);
set role authenticated;
select teste.como('ee000000-0000-0000-0000-000000000001');
select teste.erro('cliente NÃO cria time', $q$select public.criar_time('Hack','ee000000-0000-0000-0000-000000000001')$q$);

-- salas pela planilha: o jogador 04 (Gabriel D, Samba D) envia com salas; financeiro confere
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.ok('jogador envia planilha com salas', $q$select public.enviar_planilha('{"makeup":0,"cashout":165,"saldos":[{"sala":"PS","saldo":75},{"sala":"GG","saldo":80},{"sala":"WPN","saldo":0}]}')$q$);
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.ok('financeiro confere', $q$select public.conferir_abertura('d1000000-0000-0000-0000-000000000004', 0, 165)$q$);
reset role;
select teste.igual('as salas com saldo viraram as salas do jogador (a de saldo 0 não)',
  $q$select string_agg(wallet||':'||saldo_inicial, ',' order by wallet) from public.player_wallets where workspace_id='de000000-0000-0000-0000-000000000001' and player='Gabriel D'$q$, 'GG:80.00,PS:75.00');
select teste.igual('…e ficam ligadas à pessoa (o gatilho dos fatos)',
  $q$select count(*)::text from public.player_wallets where player='Gabriel D' and pessoa_id='d1000000-0000-0000-0000-000000000004'$q$, '2');
set role authenticated;
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.ok('conferir de novo não duplica as salas', $q$select public.conferir_abertura('d1000000-0000-0000-0000-000000000004', 0, 165)$q$);
reset role;
select teste.igual('continuam 2 salas', $q$select count(*)::text from public.player_wallets where workspace_id='de000000-0000-0000-0000-000000000001' and player='Gabriel D'$q$, '2');
