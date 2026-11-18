-- Fase 1: abertura pela planilha do Samba. Roda depois do fase1_dinheiro.sql (usa o Samba D e teste.*).
-- 02 financeiro (aprova saques) · 03 professor (só desempenho) · 04 Gabriel D · 05 Outro D (jogador sem histórico)
\set ON_ERROR_STOP 1
set role authenticated;

-- ---------- o jogador envia ----------
select teste.como('dd000000-0000-0000-0000-000000000005');
select teste.ok('jogador envia a planilha (MakeUp 110, Cashout 275)',
  $q$select public.enviar_planilha('{"makeup":110,"cashout":275,"banca":155,"saldos":[{"sala":"PS","saldo":75},{"sala":"GG","saldo":80}],"contrato_texto":"35% até 10k","grade":[]}')$q$);
select teste.igual('antes de conferir, não vale: MU 0 e lifetime 0', $q$select (s->>'mu')||'/'||(s->>'lifetime')||'/'||(s->>'abertura') from (select public.situacao_jogador('d1000000-0000-0000-0000-000000000005') s) x$q$, '0/0/enviada');
select teste.ok('jogador pode reenviar enquanto não conferiu', $q$select public.enviar_planilha('{"makeup":110,"cashout":275,"contrato_texto":"35% até 10k"}')$q$);
select teste.erro('jogador NÃO confere a própria planilha', $q$select public.conferir_abertura('d1000000-0000-0000-0000-000000000005', 0, 99999)$q$);
select teste.igual('jogador vê a própria planilha enviada', $q$select status from public.abertura$q$, 'enviada');
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.igual('professor (só desempenho) NÃO vê a planilha', $q$select count(*)::text from public.abertura$q$, '0');
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.erro_qualquer('planilha com MakeUp negativo', $q$select public.enviar_planilha('{"makeup":-5,"cashout":10}')$q$);
select teste.igual('outro jogador NÃO vê a planilha de ninguém', $q$select count(*)::text from public.abertura where pessoa_id='d1000000-0000-0000-0000-000000000005'$q$, '0');

-- ---------- o time confere ----------
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.igual('financeiro vê a planilha pra conferir', $q$select (mu||'/'||cashout||'/'||(planilha->>'contrato_texto')) from public.abertura where pessoa_id='d1000000-0000-0000-0000-000000000005'$q$, '110.00/275.00/35% até 10k');
select teste.ok('capital lançado ANTES da conferência (a planilha já inclui)', $q$select public.registrar_aporte('d1000000-0000-0000-0000-000000000005', 50)$q$);
select teste.ok('financeiro confere', $q$select public.conferir_abertura('d1000000-0000-0000-0000-000000000005', 110, 275)$q$);
select teste.igual('depois de conferir: vale a foto da planilha (o lançamento de antes não soma de novo)',
  $q$select (s->>'mu')||'/'||(s->>'lifetime')||'/'||(s->>'abertura') from (select public.situacao_jogador('d1000000-0000-0000-0000-000000000005') s) x$q$, '110.00/275.00/confirmada');
select teste.ok('capital mandado DEPOIS soma', $q$select public.registrar_aporte('d1000000-0000-0000-0000-000000000005', 40)$q$);
select teste.igual('MU 150', $q$select public.situacao_jogador('d1000000-0000-0000-0000-000000000005')->>'mu'$q$, '150.00');

-- ---------- saque depois da abertura ----------
select teste.como('dd000000-0000-0000-0000-000000000005');
select teste.erro_qualquer('reenviar depois de conferida', $q$select public.enviar_planilha('{"makeup":0,"cashout":0}')$q$);
create temp table sq2(id uuid);
reset role; grant all on sq2 to authenticated; set role authenticated;
select teste.como('dd000000-0000-0000-0000-000000000005');
insert into sq2 select public.solicitar_saque(300, 150, 100);
select teste.igual('saque divide pelo lifetime da planilha (275, faixa de 35%)', $q$select parte_jogador||'/'||parte_time||'/'||total_time from public.saque where id=(select id from sq2)$q$, '35.00/65.00/215.00');
select teste.como('dd000000-0000-0000-0000-000000000002');
select teste.ok('aprova', $q$select public.decidir_saque((select id from sq2), true)$q$);
select teste.igual('confirma o recebido sem diferença', $q$select public.confirmar_recebimento((select id from sq2), 215)->>'diferenca'$q$, '0.00');
select teste.igual('depois do saque: MU 0, lifetime 375', $q$select (s->>'mu')||'/'||(s->>'lifetime') from (select public.situacao_jogador('d1000000-0000-0000-0000-000000000005') s) x$q$, '0.00/375.00');
select teste.ok('financeiro corrige a abertura (fica conferida com os valores novos)', $q$select public.conferir_abertura('d1000000-0000-0000-0000-000000000005', 110, 300)$q$);
select teste.erro('jogador NÃO grava na tabela direto', $q$update public.abertura set mu = 0$q$);
reset role;
