-- Fase 1: dinheiro do time. Roda depois do fase1.sql (usa teste.* e teste.como). Números dos saques reais
-- do Samba: set/2026 (200 só de MU) e out/2026 (310 de MU + 165 de cashout a 35%).
\set ON_ERROR_STOP 1
reset role;
insert into auth.users(id,email,email_confirmed_at) select ('dd000000-0000-0000-0000-0000000000' || n)::uuid, 'd' || n || '@din.test', now()
  from unnest(array['01','02','03','04','05']) n;
insert into public.workspaces(id,name,kind,plan,trial_ends_at) values ('de000000-0000-0000-0000-000000000001','Samba D','team','team',null);
insert into public.workspace_members(workspace_id,user_id,role) values
 ('de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001','owner'),
 ('de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000002','member'),
 ('de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000003','member'),
 ('de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000004','member'),
 ('de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000005','member');
insert into public.unidade(id,workspace_id,mae_id,nome) values ('df000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001',null,'Samba D');
insert into public.unidade(id,workspace_id,mae_id,nome) values ('df000000-0000-0000-0000-000000000002','de000000-0000-0000-0000-000000000001','df000000-0000-0000-0000-000000000001','Base');
-- 01 admin · 02 financeiro (vê e aprova dinheiro) · 03 professor (só desempenho) · 04 Gabriel joga na Base · 05 outro jogador
insert into public.pessoa(id,workspace_id,user_id,nome,status) values
 ('d1000000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001','Admin D','ativo'),
 ('d1000000-0000-0000-0000-000000000002','de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000002','Financeiro D','ativo'),
 ('d1000000-0000-0000-0000-000000000003','de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000003','Professor D','ativo'),
 ('d1000000-0000-0000-0000-000000000004','de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000004','Gabriel D','ativo'),
 ('d1000000-0000-0000-0000-000000000005','de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000005','Outro D','ativo');
insert into public.vinculo(pessoa_id,unidade_id,inicio) values
 ('d1000000-0000-0000-0000-000000000004','df000000-0000-0000-0000-000000000002',current_date-90),
 ('d1000000-0000-0000-0000-000000000005','df000000-0000-0000-0000-000000000002',current_date-90);
insert into public.acesso(pessoa_id,unidade_id,capacidades) values
 ('d1000000-0000-0000-0000-000000000001','df000000-0000-0000-0000-000000000001',array['administrar']),
 ('d1000000-0000-0000-0000-000000000002','df000000-0000-0000-0000-000000000001',array['ver_financeiro','aprovar_saques']),
 ('d1000000-0000-0000-0000-000000000003','df000000-0000-0000-0000-000000000002',array['ver_desempenho']);
create temp table sq(nome text primary key, id uuid);
grant all on sq to authenticated;
set role authenticated;

-- ---------- contrato ----------
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.erro('professor NÃO define contrato', $q$select public.definir_contrato('df000000-0000-0000-0000-000000000001', null, '[{"ate":10000,"jogador":0.35},{"ate":null,"jogador":0.40}]')$q$);
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.erro_qualquer('faixa sem a última aberta', $q$select public.definir_contrato('df000000-0000-0000-0000-000000000001', null, '[{"ate":10000,"jogador":0.35}]')$q$);
select teste.erro_qualquer('percentual escrito como 35 (e não 0.35)', $q$select public.definir_contrato('df000000-0000-0000-0000-000000000001', null, '[{"ate":null,"jogador":35}]')$q$);
select teste.ok('admin define o contrato do time: 35% até 10 mil, 40% depois', $q$select public.definir_contrato('df000000-0000-0000-0000-000000000001', null, '[{"ate":10000,"jogador":0.35},{"ate":null,"jogador":0.40}]', current_date-90)$q$);
select teste.igual('faixa cruzada é dividida nas duas (9.900 + 200: 100×35% + 100×40%)',
  $q$select (public.dividir_cashout('[{"ate":10000,"jogador":0.35},{"ate":null,"jogador":0.40}]', 9900, 200)->>'jogador')$q$, '75.00');

-- ---------- capital ----------
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.erro('jogador NÃO registra aporte', $q$select public.registrar_aporte('d1000000-0000-0000-0000-000000000004', 1000)$q$);
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.ok('financeiro registra o capital mandado ao Gabriel (510)', $q$select public.registrar_aporte('d1000000-0000-0000-0000-000000000004', 510, current_date-80, 'banca inicial')$q$);
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.igual('Gabriel vê o MU dele (510) e lifetime 0', $q$select (s->>'mu')::numeric::text||'/'||(s->>'lifetime') from (select public.situacao_jogador('d1000000-0000-0000-0000-000000000004') s) x$q$, '510.00/0');
select teste.erro('Gabriel NÃO vê a situação do outro jogador', $q$select public.situacao_jogador('d1000000-0000-0000-0000-000000000005')$q$);

-- ---------- setembro: 200 só de MU ----------
insert into sq select 'set', public.solicitar_saque(700, 200, 0, '{"PS":200}');
select teste.igual('setembro: tudo vai pro time, nada de divisão', $q$select total_time||'/'||parte_jogador||'/'||banca_depois from public.saque where id=(select id from sq where nome='set')$q$, '200.00/0.00/500.00');
select teste.erro_qualquer('segundo pedido com um em aberto', $q$select public.solicitar_saque(500, 10, 0)$q$);
select teste.erro('Gabriel NÃO aprova o próprio saque', $q$select public.decidir_saque((select id from sq where nome='set'), true)$q$);
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.erro_qualquer('confirmar recebimento antes de aprovar', $q$select public.confirmar_recebimento((select id from sq where nome='set'), 200)$q$);
select teste.ok('financeiro aprova', $q$select public.decidir_saque((select id from sq where nome='set'), true)$q$);
select teste.igual('financeiro confirma 200 recebidos: sem diferença', $q$select public.confirmar_recebimento((select id from sq where nome='set'), 200)->>'diferenca'$q$, '0.00');

-- ---------- outubro: 310 de MU + 165 de cashout ----------
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.igual('MU depois de setembro: 310', $q$select public.situacao_jogador('d1000000-0000-0000-0000-000000000004')->>'mu'$q$, '310.00');
select teste.igual('prévia de outubro igual à conta do Samba',
  $q$select concat_ws(' ', s->>'parte_jogador', s->>'parte_time', s->>'total_time', s->>'banca_depois', s->>'mu_depois')
     from (select public.simular_saque('d1000000-0000-0000-0000-000000000004', 625, 310, 165) s) x$q$, '57.75 107.25 417.25 150 0.00');
select teste.erro_qualquer('cashout maior que o lucro (banca 625 − MU 310 = 315)', $q$select public.simular_saque('d1000000-0000-0000-0000-000000000004', 625, 0, 316)$q$);
select teste.erro_qualquer('devolução maior que o MU', $q$select public.simular_saque('d1000000-0000-0000-0000-000000000004', 625, 311, 0)$q$);
insert into sq select 'out', public.solicitar_saque(625, 310, 165, '{"GG":525,"PS":100}', 'PS 50 vai pra Bullet');
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.igual('professor (só desempenho) NÃO vê saques', $q$select count(*)::text from public.saque$q$, '0');
select teste.como('dd000000-0000-0000-0000-000000000005');
select teste.igual('outro jogador NÃO vê os saques do Gabriel', $q$select count(*)::text from public.saque$q$, '0');
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.igual('financeiro vê os dois saques', $q$select count(*)::text from public.saque$q$, '2');
select teste.ok('financeiro aprova outubro', $q$select public.decidir_saque((select id from sq where nome='out'), true)$q$);
select teste.igual('time recebeu 365,25 (GG) + 50 (PS): faltaram 2 dólares',
  $q$select public.confirmar_recebimento((select id from sq where nome='out'), 415.25)->>'diferenca'$q$, '-2.00');
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.igual('depois de outubro: MU zerado, lifetime 165', $q$select (s->>'mu')||'/'||(s->>'lifetime') from (select public.situacao_jogador('d1000000-0000-0000-0000-000000000004') s) x$q$, '0.00/165.00');

-- ---------- recusa e cancelamento ----------
insert into sq select 'nov', public.solicitar_saque(150, 0, 100);
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.erro_qualquer('recusar sem motivo', $q$select public.decidir_saque((select id from sq where nome='nov'), false)$q$);
select teste.ok('recusar com motivo', $q$select public.decidir_saque((select id from sq where nome='nov'), false, 'deixa banca mínima de 100')$q$);
select teste.como('dd000000-0000-0000-0000-000000000004');
insert into sq select 'nov2', public.solicitar_saque(150, 0, 50);
select teste.ok('jogador cancela o próprio pedido enquanto solicitado', $q$select public.cancelar_saque((select id from sq where nome='nov2'))$q$);
select teste.igual('recusado e cancelado não mexem no MU nem no lifetime', $q$select (s->>'mu')||'/'||(s->>'lifetime') from (select public.situacao_jogador('d1000000-0000-0000-0000-000000000004') s) x$q$, '0.00/165.00');
select teste.erro('jogador NÃO grava saque direto na tabela', $q$insert into public.saque(workspace_id,pessoa_id,banca,mu_antes,lifetime_antes,devolucao,cashout,parte_jogador,parte_time,total_time,divisao,banca_depois)
  values ('de000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000004',1,0,0,0,1,1,0,0,'{}',0)$q$);
reset role;
