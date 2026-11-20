-- Matriz "quem faz, quem vê" (caça-bugs): cada ação de cada papel, conferida por TODOS os observadores com as
-- permissões reais (RLS, funções, gatilhos). Time novo "Matriz":
--   A admin (raiz) · F financeiro do time (raiz) · P1 professor da Reta Um · P2 professor da Reta Dois
--   J1 joga na Reta Um · J2 joga na Reta Dois · X é de fora (conta solo)
-- teste.quem_ve(consulta) roda a mesma consulta como cada um e devolve "A=… F=… P1=… P2=… J1=… J2=… X=…".
-- teste.conhecido(): bug achado e ainda não corrigido. Imprime CONHECIDO (não derruba o CI) com o valor certo;
-- quando a correção entrar, passa a imprimir OK e a linha vira teste.igual.
\set ON_ERROR_STOP 1
reset role;
create table teste.ids(nome text primary key, id uuid);
create table teste.tokens(nome text primary key, t text);
grant select, insert, update on teste.ids, teste.tokens to authenticated;
create or replace function teste.id(n text) returns uuid language sql stable as $$ select id from teste.ids where nome = n $$;
create or replace function teste.conhecido(rotulo text, consulta text, esperado text) returns void language plpgsql as $$
declare v text;
begin execute consulta into v;
  if v is not distinct from esperado then raise notice 'OK     % (= %) [era bug conhecido: troque por teste.igual]', rotulo, v;
  else raise notice 'CONHECIDO  % (hoje vem %, o certo é %)', rotulo, v, esperado; end if;
end $$;
create or replace function teste.quem_ve(consulta text) returns text language plpgsql as $$
declare r record; n text; saida text := ''; antes text := current_setting('request.jwt.claims', true);
begin
  for r in select * from (values (1,'A','ac000000-0000-0000-0000-0000000000a1'), (2,'F','ac000000-0000-0000-0000-0000000000f1'),
      (3,'P1','ac000000-0000-0000-0000-0000000000b1'), (4,'P2','ac000000-0000-0000-0000-0000000000b2'),
      (5,'J1','ac000000-0000-0000-0000-0000000000c1'), (6,'J2','ac000000-0000-0000-0000-0000000000c2'),
      (7,'X','ac000000-0000-0000-0000-000000000099')) v(o, rot, uid) order by o loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, false);
    execute consulta into n;
    saida := saida || r.rot || '=' || coalesce(n, '-') || ' ';
  end loop;
  perform set_config('request.jwt.claims', coalesce(antes, ''), false);
  return rtrim(saida);
end $$;
-- a banca que o SERVIDOR mostra na lista de jogadores e no Financeiro
create or replace function teste.banca_lista(p uuid) returns numeric language sql as $$ select banca from public.resumo_time() where pessoa_id = p $$;
grant execute on all functions in schema teste to authenticated;

-- ---------- montagem: contas, time, retas ----------
insert into auth.users(id, email, email_confirmed_at) values
 ('ac000000-0000-0000-0000-0000000000a1', 'admin@matriz.test', now()), ('ac000000-0000-0000-0000-0000000000f1', 'fin@matriz.test', now()),
 ('ac000000-0000-0000-0000-0000000000b1', 'prof1@matriz.test', now()), ('ac000000-0000-0000-0000-0000000000b2', 'prof2@matriz.test', now()),
 ('ac000000-0000-0000-0000-0000000000c1', 'joga1@matriz.test', now()), ('ac000000-0000-0000-0000-0000000000c2', 'joga2@matriz.test', now()),
 ('ac000000-0000-0000-0000-000000000099', 'fora@matriz.test', now());
insert into teste.ids select 'ws', public.criar_time('Matriz', 'ac000000-0000-0000-0000-0000000000a1', 'Admin M', null);
insert into teste.ids select 'R', id from public.unidade where workspace_id = teste.id('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome, rotulo, ordem) values
 (teste.id('ws'), teste.id('R'), 'Reta Um', 'Reta 1', 1), (teste.id('ws'), teste.id('R'), 'Reta Dois', 'Reta 2', 2);
insert into teste.ids select 'u1', id from public.unidade where workspace_id = teste.id('ws') and nome = 'Reta Um';
insert into teste.ids select 'u2', id from public.unidade where workspace_id = teste.id('ws') and nome = 'Reta Dois';
insert into public.workspaces(id, name, kind, plan) values ('ac100000-0000-0000-0000-000000000099', 'Fora', 'solo', 'pro');
insert into public.workspace_members(workspace_id, user_id) values ('ac100000-0000-0000-0000-000000000099', 'ac000000-0000-0000-0000-000000000099');
insert into public.tournaments(workspace_id, entry_date, player, buyin, prize) values ('ac100000-0000-0000-0000-000000000099', current_date, 'Fora', 1, 0);

-- ---------- convites (o admin chama, cada um aceita o próprio link) ----------
set role authenticated;
select teste.como('ac000000-0000-0000-0000-0000000000a1');
insert into teste.ids select 'pF', public.convidar_equipe('Fin M', array[teste.id('R')], array['ver_financeiro','aprovar_saques']);
insert into teste.ids select 'pP1', public.convidar_equipe('Prof Um', array[teste.id('u1')], array['promover','ver_desempenho','ver_financeiro']);
insert into teste.ids select 'pP2', public.convidar_equipe('Prof Dois', array[teste.id('u2')], array['promover','ver_desempenho','ver_financeiro']);
insert into teste.ids select 'pJ1', public.convidar_jogador(teste.id('u1'), 'Joga Um');
insert into teste.ids select 'pJ2', public.convidar_jogador(teste.id('u2'), 'Joga Dois');
insert into teste.tokens select 'F', public.criar_convite(teste.id('R'), teste.id('pF'));
insert into teste.tokens select 'P1', public.criar_convite(teste.id('u1'), teste.id('pP1'));
insert into teste.tokens select 'P2', public.criar_convite(teste.id('u2'), teste.id('pP2'));
insert into teste.tokens select 'J1', public.criar_convite(teste.id('u1'), teste.id('pJ1'));
insert into teste.tokens select 'J2', public.criar_convite(teste.id('u2'), teste.id('pJ2'));
select teste.como('ac000000-0000-0000-0000-0000000000f1'); select public.aceitar_convite((select t from teste.tokens where nome = 'F'));
select teste.como('ac000000-0000-0000-0000-0000000000b1'); select public.aceitar_convite((select t from teste.tokens where nome = 'P1'));
select teste.como('ac000000-0000-0000-0000-0000000000b2'); select public.aceitar_convite((select t from teste.tokens where nome = 'P2'));
select teste.como('ac000000-0000-0000-0000-0000000000c1'); select public.aceitar_convite((select t from teste.tokens where nome = 'J1'));
select teste.como('ac000000-0000-0000-0000-0000000000c2'); select public.aceitar_convite((select t from teste.tokens where nome = 'J2'));
-- os dois alunos entraram há 20 dias (o convite de verdade foi antes; aqui o relógio é o de hoje)
reset role;
update public.vinculo set inicio = current_date - 20 where pessoa_id in (teste.id('pJ1'), teste.id('pJ2'));
set role authenticated;
select teste.igual('quem joga aparece na lista do admin (gestão que não joga não aparece)',
  $q$select teste.quem_ve($c$select coalesce(string_agg(nome, ',' order by nome), '') from public.resumo_time()$c$)$q$,
  'A=Joga Dois,Joga Um F=Joga Dois,Joga Um P1=Joga Um P2=Joga Dois J1=Joga Um J2=Joga Dois X=');

-- ---------- 1) o aluno lança: torneio, sala, movimento ----------
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.ok('J1 lança um torneio de 10 dias atrás (+15)', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date - 10, 'Joga Um', 10, 25)$q$);
select teste.ok('J1 importa um torneio de antes de entrar no time (+5)', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date - 30, 'Joga Um', 5, 10)$q$);
select teste.ok('J1 cadastra a sala GG com US$ 100', $q$insert into public.player_wallets(player, wallet, saldo_inicial) values ('Joga Um', 'GG Poker', 100)$q$);
select teste.ok('J1 lança um movimento de +50', $q$insert into public.bankroll_ledger(entry_date, wallet, entrada, saida, player) values (current_date - 5, 'GG Poker', 50, 0, 'Joga Um')$q$);
select teste.como('ac000000-0000-0000-0000-0000000000c2');
select teste.erro('J2 NÃO lança torneio no nome do J1', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date, 'Joga Um', 1, 100)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.igual('torneio do J1 na reta: quem vê (financeiro não vê torneio, regra da fase 1)',
  $q$select teste.quem_ve($c$select count(*)::text from public.tournaments where pessoa_id = teste.id('pJ1') and entry_date = current_date - 10$c$)$q$,
  'A=1 F=0 P1=1 P2=0 J1=1 J2=0 X=0');
select teste.igual('torneio de ANTES de entrar no time: só o J1 vê, nem o admin (decisão de 20/11)',
  $q$select teste.quem_ve($c$select count(*)::text from public.tournaments where pessoa_id = teste.id('pJ1') and entry_date = current_date - 30$c$)$q$,
  'A=0 F=0 P1=0 P2=0 J1=1 J2=0 X=0');
select teste.igual('sala do J1: quem vê', $q$select teste.quem_ve($c$select count(*)::text from public.player_wallets where pessoa_id = teste.id('pJ1')$c$)$q$,
  'A=1 F=1 P1=1 P2=0 J1=1 J2=0 X=0');
select teste.igual('movimento do J1: quem vê', $q$select teste.quem_ve($c$select count(*)::text from public.bankroll_ledger where pessoa_id = teste.id('pJ1')$c$)$q$,
  'A=1 F=1 P1=1 P2=0 J1=1 J2=0 X=0');
select teste.igual('o time não vê o torneio de quem é de fora',
  $q$select teste.quem_ve($c$select count(*)::text from public.tournaments where workspace_id = 'ac100000-0000-0000-0000-000000000099'$c$)$q$, 'A=0 F=0 P1=0 P2=0 J1=0 J2=0 X=1');
select teste.igual('quem é de fora não vê nada do time (torneios, salas, movimentos, pessoas)',
  $q$select split_part(teste.quem_ve($c$select ((select count(*) from public.tournaments where workspace_id = teste.id('ws')) + (select count(*) from public.player_wallets where workspace_id = teste.id('ws'))
     + (select count(*) from public.bankroll_ledger where workspace_id = teste.id('ws')) + (select count(*) from public.pessoa where workspace_id = teste.id('ws')))::text$c$), ' ', 7)$q$, 'X=0');

-- ---------- 2) edição e exclusão do aluno chegam pra gestão; outra reta não mexe ----------
select teste.ok('J1 corrige o prêmio do torneio de 10 dias (25 → 30)', $q$update public.tournaments set prize = 30 where pessoa_id = teste.id('pJ1') and entry_date = current_date - 10$q$);
select teste.como('ac000000-0000-0000-0000-0000000000b2');
select teste.ok('P2 tenta mudar o prêmio do torneio do J1 (não enxerga: nenhuma linha muda)', $q$update public.tournaments set prize = 999 where pessoa_id = teste.id('pJ1')$q$);
select teste.igual('o prêmio corrigido é o que todos que podem ver enxergam',
  $q$select teste.quem_ve($c$select coalesce(max(prize)::text, '-') from public.tournaments where pessoa_id = teste.id('pJ1') and entry_date = current_date - 10$c$)$q$,
  'A=30 F=- P1=30 P2=- J1=30 J2=- X=-');

-- ---------- 3) planilha: o aluno envia, o financeiro confere ----------
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.ok('J1 envia a planilha (MU 100; GG 90 e PS 80; atualizada no dia em que entrou, há 20 dias)',
  $q$select public.enviar_planilha(jsonb_build_object('makeup', 100, 'cashout', 0, 'atualizado_em', (current_date - 20)::text,
     'saldos', jsonb_build_array(jsonb_build_object('sala', 'GG Poker', 'saldo', 90), jsonb_build_object('sala', 'PS', 'saldo', 80))))$q$);
select teste.igual('planilha do J1: quem vê', $q$select teste.quem_ve($c$select count(*)::text from public.abertura where pessoa_id = teste.id('pJ1')$c$)$q$,
  'A=1 F=1 P1=1 P2=0 J1=1 J2=0 X=0');
select teste.igual('aviso "planilha pra conferir": só quem aprova saque (admin e financeiro)',
  $q$select teste.quem_ve($c$select count(*)::text from public.aviso where tipo = 'planilha'$c$)$q$, 'A=1 F=1 P1=0 P2=0 J1=0 J2=0 X=0');
select teste.erro('J1 NÃO confere a própria planilha', $q$select public.conferir_abertura(teste.id('pJ1'), 100, 0)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000b1');
select teste.erro('P1 (sem aprovar saques) NÃO confere', $q$select public.conferir_abertura(teste.id('pJ1'), 100, 0)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000f1');
select teste.ok('F confere a planilha', $q$select public.conferir_abertura(teste.id('pJ1'), 100, 0)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.igual('o J1 vê a planilha conferida, o MU dela e as salas dela (a GG que ele tinha digitado com 100 vira 90; a PS é criada)',
  $q$select (public.situacao_jogador(teste.id('pJ1'))->>'abertura')||' MU '||(public.situacao_jogador(teste.id('pJ1'))->>'mu')||' salas '||
            (select string_agg(wallet||':'||saldo_inicial::text, ',' order by wallet) from public.player_wallets where pessoa_id = teste.id('pJ1'))$q$,
  'confirmada MU 100.00 salas GG Poker:90.00,PS:80.00');
select teste.igual('aviso "planilha conferida" chega só no J1', $q$select teste.quem_ve($c$select count(*)::text from public.aviso where tipo = 'planilha' and titulo like 'Planilha conferida%'$c$)$q$,
  'A=0 F=0 P1=0 P2=0 J1=1 J2=0 X=0');
-- BUG-10: depois da foto, o saldo inicial das salas não muda pelo aluno (o reload entra sozinho; digitar contaria 2 vezes)
select teste.erro_qualquer('BUG-10 J1 NÃO muda o saldo inicial da GG depois da planilha conferida', $q$update public.player_wallets set saldo_inicial = 140 where pessoa_id = teste.id('pJ1') and wallet = 'GG Poker'$q$);
select teste.erro_qualquer('BUG-10 …nem cria sala nova com saldo', $q$insert into public.player_wallets(player, wallet, saldo_inicial) values ('Joga Um', 'Coin', 30)$q$);
select teste.erro_qualquer('BUG-10 …nem apaga sala com saldo', $q$delete from public.player_wallets where pessoa_id = teste.id('pJ1') and wallet = 'PS'$q$);
select teste.ok('BUG-10 J1 abre sala nova com 0 (o dinheiro chega pelo reload)', $q$insert into public.player_wallets(player, wallet, saldo_inicial) values ('Joga Um', 'WPT', 0)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000f1');
select teste.ok('BUG-10 quem aprova saques corrige o saldo de uma sala do J1', $q$update public.player_wallets set saldo_inicial = 5 where pessoa_id = teste.id('pJ1') and wallet = 'WPT'$q$);
select teste.ok('BUG-10 …e volta pro valor certo', $q$update public.player_wallets set saldo_inicial = 0 where pessoa_id = teste.id('pJ1') and wallet = 'WPT'$q$);
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.igual('BUG-10 as salas do J1 continuam a foto (GG 90, PS 80) e a WPT nova com 0',
  $q$select string_agg(wallet||':'||saldo_inicial::text, ',' order by wallet) from public.player_wallets where pessoa_id = teste.id('pJ1')$q$, 'GG Poker:90.00,PS:80.00,WPT:0');

-- ---------- 4) contrato do admin chega no aluno ----------
select teste.como('ac000000-0000-0000-0000-0000000000a1');
select teste.ok('A define o contrato do time (50%)', $q$select public.definir_contrato(teste.id('R'), null, '[{"ate":null,"jogador":0.5}]'::jsonb)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.igual('o J1 vê o contrato', $q$select (public.situacao_jogador(teste.id('pJ1'))->'contrato')::text$q$, '[{"ate": null, "jogador": 0.5}]');

-- ---------- 5) a banca: uma conta só, no servidor, a mesma pra todo mundo que pode ver ----------
-- foto = planilha de 20 dias atrás. banca = salas 170 + torneio de 10 dias +20 + movimento de 5 dias +50 = 240.
-- O torneio de 30 dias (antes da foto) já está nos saldos da planilha: não soma de novo.
select teste.igual('banca do J1 na lista de jogadores (servidor): quem vê',
  $q$select teste.quem_ve($c$select coalesce(teste.banca_lista(teste.id('pJ1'))::text, '-')$c$)$q$, 'A=240.00 F=240.00 P1=240.00 P2=- J1=240.00 J2=- X=-');
select teste.igual('BUG-2 o app do J1 mostra a mesma banca, com as partes, a partir da foto',
  $q$select (b->>'banca')||' = salas '||(b->>'salas')||' + resultados '||(b->>'resultados')||' + movimentos '||(b->>'movimentos')||' + aportes '||(b->>'aportes')||' − saques '||(b->>'saques')||' · corte '||(b->>'corte')
     from (select public.situacao_jogador(teste.id('pJ1'))->'banca_partes' b) x$q$,
  '240.00 = salas 170.00 + resultados 20.00 + movimentos 50.00 + aportes 0.00 − saques 0.00 · corte ' || (current_date - 20)::text);
select teste.igual('…e o servidor diz que ele não está em MK (240 x MU 100)', $q$select (public.situacao_jogador(teste.id('pJ1'))->>'banca')||' x '||(public.situacao_jogador(teste.id('pJ1'))->>'mu')$q$, '240.00 x 100.00');

-- ---------- 6) saque: aluno pede, financeiro aprova, admin confirma ----------
select teste.como('ac000000-0000-0000-0000-0000000000c1');
insert into teste.ids select 'saque', public.solicitar_saque(240, 0, 100, null, null);
select teste.igual('o pedido guarda a banca que o J1 digitou e a do sistema na hora', $q$select banca||' / '||banca_sistema from public.saque where id = teste.id('saque')$q$, '240.00 / 240.00');
select teste.igual('saque do J1: quem vê', $q$select teste.quem_ve($c$select count(*)::text from public.saque where id = teste.id('saque')$c$)$q$,
  'A=1 F=1 P1=1 P2=0 J1=1 J2=0 X=0');
select teste.igual('…com a divisão do contrato (jogador 50, time 50)', $q$select parte_jogador||'/'||parte_time||'/'||total_time from public.saque where id = teste.id('saque')$q$, '50.00/50.00/50.00');
select teste.igual('aviso "pediu saque": admin e financeiro', $q$select teste.quem_ve($c$select count(*)::text from public.aviso where tipo = 'saque' and ref_id = teste.id('saque')$c$)$q$,
  'A=1 F=1 P1=0 P2=0 J1=0 J2=0 X=0');
select teste.erro('J1 NÃO aprova o próprio saque', $q$select public.decidir_saque(teste.id('saque'), true)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000b1');
select teste.erro('P1 (sem aprovar saques) NÃO aprova', $q$select public.decidir_saque(teste.id('saque'), true)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000f1');
select teste.ok('F aprova', $q$select public.decidir_saque(teste.id('saque'), true)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000a1');
select teste.ok('A confirma que o time recebeu 50', $q$select public.confirmar_recebimento(teste.id('saque'), 50)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.igual('o J1 vê o saque pago (entra na banca dele) e os avisos de aprovado e confirmado',
  $q$select (select status from public.saque where id = teste.id('saque'))||' avisos:'||(select count(*) from public.aviso where tipo = 'saque' and ref_id = teste.id('saque'))$q$,
  'pago avisos:2');
select teste.igual('…MU e lucro sacado do J1 depois do saque', $q$select (public.situacao_jogador(teste.id('pJ1'))->>'mu')||' / '||(public.situacao_jogador(teste.id('pJ1'))->>'lifetime')$q$, '100.00 / 100.00');
select teste.igual('banca do J1 depois do saque (240 − 100): quem vê na lista',
  $q$select teste.quem_ve($c$select coalesce(teste.banca_lista(teste.id('pJ1'))::text, '-')$c$)$q$, 'A=140.00 F=140.00 P1=140.00 P2=- J1=140.00 J2=- X=-');

-- ---------- 7) reload: aluno pede, financeiro aprova e manda ----------
insert into teste.ids select 'reload', public.pedir_reload(200, 'GG', 'acabou a banca');
select teste.erro_qualquer('J1 NÃO pede outro reload com um aberto', $q$select public.pedir_reload(50, null, null)$q$);
select teste.igual('reload do J1: quem vê', $q$select teste.quem_ve($c$select count(*)::text from public.reload where id = teste.id('reload')$c$)$q$,
  'A=1 F=1 P1=1 P2=0 J1=1 J2=0 X=0');
select teste.como('ac000000-0000-0000-0000-0000000000f1');
select teste.ok('F aprova o reload', $q$select public.decidir_reload(teste.id('reload'), true)$q$);
select teste.ok('F confirma que mandou 200', $q$select public.confirmar_envio_reload(teste.id('reload'), 200)$q$);
select teste.igual('avisos do reload: pedido pra admin e financeiro; aprovado e enviado pro J1', $q$select teste.quem_ve($c$select count(*)::text from public.aviso where tipo = 'reload' and ref_id = teste.id('reload')$c$)$q$,
  'A=1 F=1 P1=0 P2=0 J1=2 J2=0 X=0');
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.igual('…e o MU dele sobe 200', $q$select public.situacao_jogador(teste.id('pJ1'))->>'mu'$q$, '300.00');
select teste.igual('BUG-1 reload sobe a banca junto com o MU (140 + 200 = 340)',
  $q$select teste.quem_ve($c$select coalesce(teste.banca_lista(teste.id('pJ1'))::text, '-')$c$)$q$, 'A=340.00 F=340.00 P1=340.00 P2=- J1=340.00 J2=- X=-');
select teste.igual('BUG-1 …e o lucro (banca − MU) não muda: era 140 − 100 = 40, continua 340 − 300 = 40',
  $q$select (teste.banca_lista(teste.id('pJ1')) - (public.situacao_jogador(teste.id('pJ1'))->>'mu')::numeric)::text$q$, '40.00');

-- ---------- 8) grade: só quem configura salva; o aluno da reta é avisado ----------
select teste.como('ac000000-0000-0000-0000-0000000000b1');
select teste.erro('P1 (sem configurar regras) NÃO salva grade', $q$select public.salvar_grade(teste.id('u1'), current_date, false, '[{"site":"GGpoker","tipo":"Semanal","regular":"até $2","prog_ko":"","hyper":""}]'::jsonb)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000a1');
select teste.ok('A salva a grade da Reta Um', $q$select public.salvar_grade(teste.id('u1'), current_date, false, '[{"site":"GGpoker","tipo":"Semanal","regular":"até $2","prog_ko":"","hyper":""}]'::jsonb)$q$);
select teste.igual('grade da Reta Um: o time inteiro lê, de fora não',
  $q$select teste.quem_ve($c$select count(*)::text from public.grade where unidade_id = teste.id('u1')$c$)$q$, 'A=1 F=1 P1=1 P2=1 J1=1 J2=1 X=0');
select teste.igual('aviso de grade nova: só o aluno da Reta Um', $q$select teste.quem_ve($c$select count(*)::text from public.aviso where tipo = 'grade'$c$)$q$,
  'A=0 F=0 P1=0 P2=0 J1=1 J2=0 X=0');

-- ---------- 9) promoção: o histórico tem que ir junto pra quem passa a cuidar ----------
select teste.como('ac000000-0000-0000-0000-0000000000b1');
select teste.erro('P1 NÃO promove pra uma reta que não é dele', $q$select public.mover_jogador(teste.id('pJ1'), teste.id('u2'), 'promocao')$q$);
select teste.como('ac000000-0000-0000-0000-0000000000a1');
select teste.ok('A promove o J1 pra Reta Dois', $q$select public.mover_jogador(teste.id('pJ1'), teste.id('u2'), 'promocao')$q$);
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.ok('J1 lança um torneio depois da promoção (+3)', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date, 'Joga Um', 2, 5)$q$);
select teste.igual('lista de jogadores depois da promoção',
  $q$select teste.quem_ve($c$select coalesce(string_agg(nome, ',' order by nome), '') from public.resumo_time()$c$)$q$,
  'A=Joga Dois,Joga Um F=Joga Dois,Joga Um P1= P2=Joga Dois,Joga Um J1=Joga Um J2=Joga Dois X=');
select teste.igual('…e o servidor soma o histórico do J1 no time (2 torneios; o de antes da entrada é só dele) pro P2',
  $q$select teste.quem_ve($c$select coalesce((select torneios::text from public.resumo_time() where pessoa_id = teste.id('pJ1')), '-')$c$)$q$,
  'A=2 F=- P1=- P2=2 J1=2 J2=- X=-');
select teste.igual('BUG-7 o P2 (que agora cuida do J1) lê o histórico dele no time (o da Reta Um e o novo); o de antes do time só o J1 vê; o P1 continua vendo o que foi jogado na reta dele',
  $q$select teste.quem_ve($c$select count(*)::text from public.tournaments where pessoa_id = teste.id('pJ1')$c$)$q$, 'A=2 F=0 P1=1 P2=2 J1=3 J2=0 X=0');
select teste.igual('BUG-7 …e o movimento antigo dele (dinheiro de dentro do time)',
  $q$select teste.quem_ve($c$select count(*)::text from public.bankroll_ledger where pessoa_id = teste.id('pJ1')$c$)$q$, 'A=1 F=1 P1=1 P2=1 J1=1 J2=0 X=0');
select teste.igual('BUG-7 …e o dinheiro antigo dele também (saque, aporte, reload e planilha)',
  $q$select teste.quem_ve($c$select ((select count(*) from public.saque where pessoa_id = teste.id('pJ1')) + (select count(*) from public.aporte where pessoa_id = teste.id('pJ1'))
     + (select count(*) from public.reload where pessoa_id = teste.id('pJ1')) + (select count(*) from public.abertura where pessoa_id = teste.id('pJ1')))::text$c$)$q$,
  'A=4 F=4 P1=4 P2=4 J1=4 J2=0 X=0');
select teste.igual('…e a banca dele pro P2 é a mesma de todo mundo (340 + 3 do torneio novo)',
  $q$select teste.quem_ve($c$select coalesce(teste.banca_lista(teste.id('pJ1'))::text, '-')$c$)$q$, 'A=343.00 F=343.00 P1=- P2=343.00 J1=343.00 J2=- X=-');

-- ---------- 10) renomear: os fatos acompanham e o aluno continua vendo tudo ----------
select teste.como('ac000000-0000-0000-0000-0000000000a1');
select teste.ok('A renomeia o J1', $q$select public.renomear_pessoa(teste.id('pJ1'), 'Joga Um B')$q$);
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.igual('o J1 vê os 3 torneios, as 3 salas e o movimento com o nome novo (nada no antigo)',
  $q$select (select count(*) from public.tournaments where player = 'Joga Um B')||'/'||(select count(*) from public.player_wallets where player = 'Joga Um B')||'/'||
            (select count(*) from public.bankroll_ledger where player = 'Joga Um B')||' antigo:'||(select count(*) from public.tournaments where player = 'Joga Um')$q$, '3/3/1 antigo:0');

-- ---------- 11) saída: o aluno sai; a gestão continua com o histórico ----------
select teste.como('ac000000-0000-0000-0000-0000000000c2');
select teste.ok('J2 lança um torneio', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date - 1, 'Joga Dois', 3, 0)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000b2');
select teste.erro('P2 (sem gerir pessoas) NÃO registra saída', $q$select public.registrar_saida(teste.id('pJ2'))$q$);
select teste.como('ac000000-0000-0000-0000-0000000000a1');
select teste.ok('A registra a saída do J2', $q$select public.registrar_saida(teste.id('pJ2'))$q$);
select teste.igual('torneio do J2 depois da saída: a gestão guarda; o J2 perde o acesso ao time',
  $q$select teste.quem_ve($c$select count(*)::text from public.tournaments where pessoa_id = teste.id('pJ2')$c$)$q$, 'A=1 F=0 P1=0 P2=1 J1=0 J2=0 X=0');

-- ---------- 12) avisos são de cada um ----------
select teste.igual('ninguém lê aviso de outra pessoa', $q$select teste.quem_ve($c$select (count(*) filter (where user_id <> auth.uid()))::text from public.aviso$c$)$q$,
  'A=0 F=0 P1=0 P2=0 J1=0 J2=0 X=0');
reset role;
