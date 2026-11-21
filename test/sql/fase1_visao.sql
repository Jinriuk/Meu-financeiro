-- Fase 1: visão do time, reload e avisos. Roda depois do fase1_modo_time.sql (Samba D).
-- 01 admin · 02 financeiro (ver_financeiro + aprovar_saques na raiz) · 03 professor (ver_desempenho na Base) · 04 Gabriel D · 05 Outro D
\set ON_ERROR_STOP 1
reset role;
insert into public.tournaments(workspace_id,entry_date,player,buyin,reentries,prize,bounty,ticket) values
 ('de000000-0000-0000-0000-000000000001',current_date-3,'Outro D',10,1,50,5,false),
 ('de000000-0000-0000-0000-000000000001',current_date-1,'Outro D',5,0,0,0,true);
create temp table rl(id uuid);
grant all on rl to authenticated;
set role authenticated;
-- os testes anteriores já geraram avisos (saques, planilhas): começa com a caixa limpa
select teste.como('dd000000-0000-0000-0000-000000000001'); select public.apagar_avisos();
select teste.como('dd000000-0000-0000-0000-000000000002'); select public.apagar_avisos();
select teste.como('dd000000-0000-0000-0000-000000000003'); select public.apagar_avisos();
select teste.como('dd000000-0000-0000-0000-000000000004'); select public.apagar_avisos();

-- ---------- visão do time: cada um vê o que a permissão deixa ----------
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.igual('professor: desempenho do Outro (2 torneios, investido 20, lucro 35, ROI 175%, ABI por entrada (10×2 + 5)/3 = 8,33) e nada de dinheiro',
  $q$select concat_ws('/', torneios, investido, lucro, roi, abi, coalesce(banca::text,'-'), coalesce(mu::text,'-')) from public.resumo_time() where nome='Outro D'$q$, '2/20.00/35.00/175.0/8.33/-/-');
select teste.igual('professor vê os 2 alunos da Base', $q$select count(*)::text from public.resumo_time()$q$, '2');
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.igual('financeiro: dinheiro do Outro pela foto (torneios de antes da planilha já estão nela; capital de 40 e saque de 250 depois dela: banca 0 + 40 − 250; MU 110 + 40 − 150 = 0; lucro sacado 300 + 100) e nada de desempenho',
  $q$select concat_ws('/', coalesce(torneios::text,'-'), banca, mu, lucro_sacado, planilha) from public.resumo_time() where nome='Outro D'$q$, '-/-210.00/0.00/400.00/confirmada');
select teste.como('dd000000-0000-0000-0000-000000000005');
select teste.igual('aluno só vê a própria linha, completa', $q$select string_agg(nome||':'||torneios||':'||banca, ',') from public.resumo_time()$q$, 'Outro D:2:-210.00');
select teste.igual('filtro de período (só os últimos 2 dias: 1 torneio)', $q$select torneios::text from public.resumo_time(current_date-2)$q$, '1');

select teste.igual('valor no formato do app, com milhar', $q$select public.fmt_usd(1234567.891)||' | '||public.fmt_usd(-2)$q$, 'US$ 1.234.567,89 | US$ -2,00');

-- ---------- reload ----------
select teste.como('dd000000-0000-0000-0000-000000000004');
insert into rl select public.pedir_reload(100, 'GG', 'quebrei a banca');
select teste.erro_qualquer('segundo reload com um em aberto', $q$select public.pedir_reload(50)$q$);
select teste.erro_qualquer('cancelar reload que não existe', $q$select public.cancelar_reload(gen_random_uuid())$q$);
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.igual('professor (sem financeiro) NÃO vê o reload', $q$select count(*)::text from public.reload$q$, '0');
select teste.erro('professor NÃO aprova reload', $q$select public.decidir_reload((select id from rl), true)$q$);
select teste.igual('…e não recebeu aviso do reload', $q$select count(*)::text from public.aviso where tipo='reload'$q$, '0');
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.igual('financeiro recebeu o aviso do reload', $q$select titulo from public.aviso where tipo='reload'$q$, 'Gabriel D pediu reload de US$ 100,00');
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.igual('admin também foi avisado do reload (administrar vale aprovar)', $q$select count(*)::text from public.aviso where tipo='reload'$q$, '1');
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.ok('financeiro aprova', $q$select public.decidir_reload((select id from rl), true)$q$);
select teste.igual('…o pedido resolvido sai do sininho', $q$select count(*)::text from public.aviso where tipo='reload'$q$, '0');
select teste.ok('financeiro confirma o envio de 100', $q$select public.confirmar_envio_reload((select id from rl), 100)$q$);
select teste.igual('o reload virou capital: MU do Gabriel 100', $q$select public.situacao_jogador('d1000000-0000-0000-0000-000000000004')->>'mu'$q$, '100.00');
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.igual('…do admin também', $q$select count(*)::text from public.aviso where tipo='reload'$q$, '0');
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.igual('Gabriel recebeu "aprovado" e "enviado"', $q$select string_agg(titulo, ' + ' order by criado_em) from public.aviso where tipo='reload'$q$, 'Reload aprovado + Reload enviado');
select teste.igual('…e não recebeu aviso do próprio pedido', $q$select count(*)::text from public.aviso where titulo like 'Gabriel D pediu%'$q$, '0');

-- ---------- avisos de saque e de entrada ----------
select teste.como('dd000000-0000-0000-0000-000000000005');
select teste.ok('Outro D pede saque (cashout de 110: depois da correção da planilha o MU dele é 0)', $q$select public.solicitar_saque(1000, 0, 110)$q$);
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.igual('financeiro avisado do saque', $q$select titulo from public.aviso where tipo='saque'$q$, 'Outro D pediu saque');
select teste.como('dd000000-0000-0000-0000-000000000001');
create temp table novo_p(id uuid);
reset role; grant all on novo_p to authenticated; set role authenticated;
select teste.como('dd000000-0000-0000-0000-000000000001');
insert into novo_p select public.convidar_jogador('df000000-0000-0000-0000-000000000002','Novo D');
reset role;
insert into auth.users(id,email,email_confirmed_at) values ('dd000000-0000-0000-0000-000000000099','d99@din.test',now());
select set_config('request.jwt.claims', '', false);
update public.pessoa set user_id='dd000000-0000-0000-0000-000000000099', status='ativo' where id=(select id from novo_p);
set role authenticated;
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.igual('admin avisado: Novo D entrou no time', $q$select titulo from public.aviso where tipo='entrada'$q$, 'Novo D entrou no time');

-- ---------- apagar ----------
select teste.como('dd000000-0000-0000-0000-000000000004');
insert into rl select public.pedir_reload(30, null, 'pra testar o apagar');   -- o financeiro fica com 2 avisos: saque e reload
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.ok('apagar um aviso', $q$select public.apagar_aviso((select id from public.aviso where tipo='saque'))$q$);
select teste.igual('…sumiu, o outro fica', $q$select string_agg(tipo, ',' order by tipo) from public.aviso$q$, 'reload');
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.ok('outra conta tenta apagar aviso que não é dela (não faz nada)', $q$select public.apagar_aviso(id) from (select id from public.aviso limit 1) x$q$);
select teste.erro('ninguém grava aviso direto', $q$insert into public.aviso(workspace_id,user_id,tipo,titulo) values ('de000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000002','x','spam')$q$);
select teste.ok('apagar todos os próprios', $q$select public.apagar_avisos()$q$);
select teste.igual('Gabriel sem avisos', $q$select count(*)::text from public.aviso$q$, '0');
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.igual('…e os do financeiro continuam lá', $q$select count(*)::text from public.aviso$q$, '1');
select teste.como('dd000000-0000-0000-0000-000000000004');
select public.cancelar_reload(id) from public.reload where pessoa_id = 'd1000000-0000-0000-0000-000000000004' and status = 'solicitado';
reset role;
