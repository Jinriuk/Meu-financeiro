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
-- a banca que o APP monta pro painel do aluno com o que quem olha consegue ler (mesma conta do bancaAtual no time)
create or replace function teste.banca_vista(p uuid) returns numeric language sql as $$
  select round(coalesce((select sum(saldo_inicial) from public.player_wallets where pessoa_id = p), 0)
    + coalesce((select sum(prize + coalesce(bounty, 0) - case when ticket then 0 else buyin * (1 + coalesce(reentries, 0)) end)
                  from public.tournaments where pessoa_id = p), 0)
    + coalesce((select sum(entrada - saida) from public.bankroll_ledger where pessoa_id = p), 0)
    - coalesce((select sum(devolucao + cashout) from public.saque where pessoa_id = p and status = 'pago'), 0), 2) $$;
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
select teste.igual('torneio de ANTES de entrar no time fica na raiz: o professor da reta não vê (regra da fase 1)',
  $q$select teste.quem_ve($c$select count(*)::text from public.tournaments where pessoa_id = teste.id('pJ1') and entry_date = current_date - 30$c$)$q$,
  'A=1 F=0 P1=0 P2=0 J1=1 J2=0 X=0');
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
select teste.ok('J1 envia a planilha (MU 100, sala PS com 80)', $q$select public.enviar_planilha('{"makeup":100,"cashout":0,"saldos":[{"sala":"PS","saldo":80}]}'::jsonb)$q$);
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
select teste.igual('o J1 vê a planilha conferida, o MU dela e a sala PS que veio dela',
  $q$select (public.situacao_jogador(teste.id('pJ1'))->>'abertura')||' MU '||(public.situacao_jogador(teste.id('pJ1'))->>'mu')||' salas '||
            (select string_agg(wallet||':'||saldo_inicial::text, ',' order by wallet) from public.player_wallets where pessoa_id = teste.id('pJ1'))$q$,
  'confirmada MU 100.00 salas GG Poker:100,PS:80.00');
select teste.igual('aviso "planilha conferida" chega só no J1', $q$select teste.quem_ve($c$select count(*)::text from public.aviso where tipo = 'planilha' and titulo like 'Planilha conferida%'$c$)$q$,
  'A=0 F=0 P1=0 P2=0 J1=1 J2=0 X=0');

-- ---------- 4) contrato do admin chega no aluno ----------
select teste.como('ac000000-0000-0000-0000-0000000000a1');
select teste.ok('A define o contrato do time (50%)', $q$select public.definir_contrato(teste.id('R'), null, '[{"ate":null,"jogador":0.5}]'::jsonb)$q$);
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.igual('o J1 vê o contrato', $q$select (public.situacao_jogador(teste.id('pJ1'))->'contrato')::text$q$, '[{"ate": null, "jogador": 0.5}]');

-- ---------- 5) a mesma banca pra todo mundo (lista do servidor x painel montado no app) ----------
-- banca do J1: salas 100 + 80, torneios +25 (30−10 e 10−5), movimento +50 = 255
select teste.igual('banca do J1 na lista de jogadores (servidor): quem vê',
  $q$select teste.quem_ve($c$select coalesce(teste.banca_lista(teste.id('pJ1'))::text, '-')$c$)$q$, 'A=255.00 F=255.00 P1=255.00 P2=- J1=255.00 J2=- X=-');
select teste.igual('a soma dos fatos que o admin e o próprio J1 leem bate com a banca da lista',
  $q$select split_part(v, ' ', 1)||' '||split_part(v, ' ', 5) from (select teste.quem_ve($c$select teste.banca_vista(teste.id('pJ1'))::text$c$) v) x$q$, 'A=255.00 J1=255.00');
-- quem não lê todos os fatos (financeiro sem torneios, professor sem o que é de antes do time) não pode montar a banca
-- no app: o painel do aluno aberto pela gestão mostra a banca e o MU do servidor (test/ui/gestao.mjs)
select teste.conhecido('BUG-2 a banca do servidor ainda soma o torneio de antes de entrar no time, que o professor da reta não vê (250 dos fatos dele x 255 da lista)',
  $q$select split_part(teste.quem_ve($c$select (teste.banca_vista(teste.id('pJ1')) = teste.banca_lista(teste.id('pJ1')))::text$c$), ' ', 3)$q$, 'P1=true');

-- ---------- 6) saque: aluno pede, financeiro aprova, admin confirma ----------
select teste.como('ac000000-0000-0000-0000-0000000000c1');
insert into teste.ids select 'saque', public.solicitar_saque(255, 0, 100, null, null);
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
select teste.igual('banca do J1 depois do saque (255 − 100): quem vê na lista',
  $q$select teste.quem_ve($c$select coalesce(teste.banca_lista(teste.id('pJ1'))::text, '-')$c$)$q$, 'A=155.00 F=155.00 P1=155.00 P2=- J1=155.00 J2=- X=-');

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
select teste.conhecido('BUG-1 reload sobe a banca junto com o MU: o lucro (banca − MU) não muda (era 155 − 100 = 55)',
  $q$select (teste.banca_lista(teste.id('pJ1')) - (public.situacao_jogador(teste.id('pJ1'))->>'mu')::numeric)::text$q$, '55.00');

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
select teste.igual('…e o servidor soma o histórico inteiro do J1 (3 torneios) pro P2',
  $q$select teste.quem_ve($c$select coalesce((select torneios::text from public.resumo_time() where pessoa_id = teste.id('pJ1')), '-')$c$)$q$,
  'A=3 F=- P1=- P2=3 J1=3 J2=- X=-');
select teste.igual('BUG-7 o P2 (que agora cuida do J1) lê o histórico dele no time (o da Reta Um e o novo); o de antes do time fica na raiz; o P1 continua vendo o que foi jogado na reta dele',
  $q$select teste.quem_ve($c$select count(*)::text from public.tournaments where pessoa_id = teste.id('pJ1')$c$)$q$, 'A=3 F=0 P1=1 P2=2 J1=3 J2=0 X=0');
select teste.igual('BUG-7 …e o movimento antigo dele (dinheiro de dentro do time)',
  $q$select teste.quem_ve($c$select count(*)::text from public.bankroll_ledger where pessoa_id = teste.id('pJ1')$c$)$q$, 'A=1 F=1 P1=1 P2=1 J1=1 J2=0 X=0');
select teste.igual('BUG-7 …e o dinheiro antigo dele também (saque, aporte, reload e planilha)',
  $q$select teste.quem_ve($c$select ((select count(*) from public.saque where pessoa_id = teste.id('pJ1')) + (select count(*) from public.aporte where pessoa_id = teste.id('pJ1'))
     + (select count(*) from public.reload where pessoa_id = teste.id('pJ1')) + (select count(*) from public.abertura where pessoa_id = teste.id('pJ1')))::text$c$)$q$,
  'A=4 F=4 P1=4 P2=4 J1=4 J2=0 X=0');
select teste.conhecido('BUG-2 …a soma do que o P2 lê do J1 só não bate com a lista por causa do torneio de antes do time (153 x 158)',
  $q$select split_part(teste.quem_ve($c$select (teste.banca_vista(teste.id('pJ1')) = teste.banca_lista(teste.id('pJ1')))::text$c$), ' ', 4)$q$, 'P2=true');

-- ---------- 10) renomear: os fatos acompanham e o aluno continua vendo tudo ----------
select teste.como('ac000000-0000-0000-0000-0000000000a1');
select teste.ok('A renomeia o J1', $q$select public.renomear_pessoa(teste.id('pJ1'), 'Joga Um B')$q$);
select teste.como('ac000000-0000-0000-0000-0000000000c1');
select teste.igual('o J1 vê os 3 torneios, a sala e o movimento com o nome novo (nada no antigo)',
  $q$select (select count(*) from public.tournaments where player = 'Joga Um B')||'/'||(select count(*) from public.player_wallets where player = 'Joga Um B')||'/'||
            (select count(*) from public.bankroll_ledger where player = 'Joga Um B')||' antigo:'||(select count(*) from public.tournaments where player = 'Joga Um')$q$, '3/2/1 antigo:0');

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
