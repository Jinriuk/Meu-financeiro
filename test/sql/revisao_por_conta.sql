-- Ajustes da revisão por conta (21/11): base do stop loss semanal (banca no começo da semana), pedidos em aberto no
-- Início do jogador, avisos que somem quando o pedido é resolvido e aviso de capital. A admin · F financeiro · J e K jogam.
\set ON_ERROR_STOP 1
reset role;
create table teste.rv(nome text primary key, id uuid);
grant select, insert on teste.rv to authenticated;
create or replace function teste.rvid(n text) returns uuid language sql stable as $$ select id from teste.rv where nome = n $$;
grant execute on function teste.rvid(text) to authenticated;
-- os avisos de quem está logado, num texto só (título: texto), na ordem em que chegaram
create or replace function teste.avisos(p_tipo text) returns text language sql stable as $$
  select coalesce(string_agg(titulo || coalesce(': ' || texto, ''), ' | ' order by criado_em, id), '-') from public.aviso where tipo = p_tipo $$;
grant execute on function teste.avisos(text) to authenticated;

insert into auth.users(id, email, email_confirmed_at) select ('9e000000-0000-0000-0000-0000000000' || n)::uuid, 'r' || n || '@revisao.test', now()
  from unnest(array['a1','f1','c1','c2']) n;
insert into teste.rv select 'ws', public.criar_time('Revisao FC', '9e000000-0000-0000-0000-0000000000a1', 'Admin R', null);
insert into teste.rv select 'R', id from public.unidade where workspace_id = teste.rvid('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome) values (teste.rvid('ws'), teste.rvid('R'), 'Reta R');
insert into teste.rv select 'U', id from public.unidade where workspace_id = teste.rvid('ws') and nome = 'Reta R';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values
 ('9f000000-0000-0000-0000-0000000000f1', teste.rvid('ws'), '9e000000-0000-0000-0000-0000000000f1', 'Fin R', 'ativo'),
 ('9f000000-0000-0000-0000-0000000000c1', teste.rvid('ws'), '9e000000-0000-0000-0000-0000000000c1', 'Joga R', 'ativo'),
 ('9f000000-0000-0000-0000-0000000000c2', teste.rvid('ws'), '9e000000-0000-0000-0000-0000000000c2', 'Kaio R', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values ('9f000000-0000-0000-0000-0000000000f1', teste.rvid('R'), array['ver_financeiro','aprovar_saques']);
insert into public.vinculo(pessoa_id, unidade_id, inicio) values
 ('9f000000-0000-0000-0000-0000000000c1', teste.rvid('U'), current_date - 20), ('9f000000-0000-0000-0000-0000000000c2', teste.rvid('U'), current_date - 20);
insert into public.workspace_members(workspace_id, user_id, role) select teste.rvid('ws'), ('9e000000-0000-0000-0000-0000000000' || n)::uuid, 'member'
  from unnest(array['f1','c1','c2']) n;
create temp table rv_pedido(nome text primary key, id uuid);
grant all on rv_pedido to authenticated;

set role authenticated;
select teste.como('9e000000-0000-0000-0000-0000000000a1');
select teste.ok('contrato do time: 35% até 10k', $q$select public.definir_contrato(teste.rvid('R'), null, '[{"ate":10000,"jogador":0.35},{"ate":null,"jogador":0.40}]'::jsonb)$q$);
select teste.como('9e000000-0000-0000-0000-0000000000c1');
select teste.ok('J: GG com 100 e três torneios (−10 há 10 dias, +50 há 3, −5 ontem)',
  $q$insert into public.player_wallets(workspace_id, player, wallet, saldo_inicial) values (teste.rvid('ws'), 'Joga R', 'GG Poker', 100);
     insert into public.tournaments(workspace_id, entry_date, player, buyin, prize) values
       (teste.rvid('ws'), current_date - 10, 'Joga R', 10, 0), (teste.rvid('ws'), current_date - 3, 'Joga R', 5, 55), (teste.rvid('ws'), current_date - 1, 'Joga R', 5, 0)$q$);

-- ---------- A-050: a base do stop loss semanal é a banca do começo da semana ----------
select teste.igual('banca agora 135; no começo da semana (anteontem) 140, sem o torneio de ontem',
  $q$select (s->>'banca') || ' / ' || (s->>'banca_inicio_semana') from (select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1', current_date - 2) s) x$q$, '135.00 / 140.00');
select teste.igual('sem pedir a semana, não calcula', $q$select coalesce(public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1')->>'banca_inicio_semana', 'nulo')$q$, 'nulo');
select teste.igual('sem nada em aberto: saque, reload e planilha vazios',
  $q$select concat_ws('/', s->>'abertura', coalesce(s->>'saque_aberto', '-'), coalesce(s->>'reload_aberto', '-'), coalesce(s->>'abertura_banca', '-'))
     from (select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1') s) x$q$, 'sem/-/-/-');
select teste.como('9e000000-0000-0000-0000-0000000000c2');
select teste.erro('K NÃO vê a situação do J (nem a banca da semana)', $q$select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1', current_date - 2)$q$);
select teste.erro('ninguém chama a conta interna da banca numa data', $q$select public.banca_na_data('9f000000-0000-0000-0000-0000000000c1', current_date)$q$);

-- capital: o de antes da semana entra na base, o de hoje não; e o jogador é avisado
select teste.como('9e000000-0000-0000-0000-0000000000f1');
select teste.ok('F registra 30 de capital na GG com data de 5 dias atrás e 20 hoje',
  $q$select public.registrar_aporte('9f000000-0000-0000-0000-0000000000c1', 30, current_date - 5, null, 'GG'); select public.registrar_aporte('9f000000-0000-0000-0000-0000000000c1', 20)$q$);
select teste.igual('…base da semana 170 (140 + 30); banca agora 185',
  $q$select (s->>'banca_inicio_semana') || ' / ' || (s->>'banca') from (select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1', current_date - 2) s) x$q$, '170.00 / 185.00');
select teste.como('9e000000-0000-0000-0000-0000000000c1');
select teste.igual('A-062: J foi avisado dos dois capitais', $q$select teste.avisos('capital')$q$,
  'Capital recebido do time: US$ 30,00 na GG · entra no seu MU. | Capital recebido do time: US$ 20,00 · entra no seu MU.');
reset role;
select teste.igual('antes da foto, a banca do dia é a das salas (a entrada foi há 20 dias)', $q$select public.banca_na_data('9f000000-0000-0000-0000-0000000000c1', current_date - 25)::text$q$, '100.00');
set role authenticated;

-- ---------- A-055 e A-046: reload em aberto aparece pro jogador e o aviso some quando resolvido ----------
select teste.como('9e000000-0000-0000-0000-0000000000c1');
insert into rv_pedido select 'reload', public.pedir_reload(40, 'GG Poker', null);
select teste.igual('J vê o reload aguardando', $q$select concat_ws('/', r->>'status', r->>'valor', r->>'sala') from (select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1')->'reload_aberto' r) x$q$,
  'solicitado/40.00/GG Poker');
select teste.como('9e000000-0000-0000-0000-0000000000f1');
select teste.igual('F tem o aviso do pedido', $q$select teste.avisos('reload')$q$, 'Joga R pediu reload de US$ 40,00: GG Poker');
select teste.ok('F aprova', $q$select public.decidir_reload((select id from rv_pedido where nome = 'reload'), true)$q$);
select teste.igual('…o aviso do pedido saiu do sininho do F', $q$select teste.avisos('reload')$q$, '-');
select teste.como('9e000000-0000-0000-0000-0000000000a1');
select teste.igual('…e do admin também', $q$select teste.avisos('reload')$q$, '-');
select teste.como('9e000000-0000-0000-0000-0000000000c1');
select teste.igual('J vê o reload aprovado, ainda em aberto', $q$select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1')->'reload_aberto'->>'status'$q$, 'aprovado');
select teste.como('9e000000-0000-0000-0000-0000000000f1');
select teste.ok('F manda os 40', $q$select public.confirmar_envio_reload((select id from rv_pedido where nome = 'reload'), 40)$q$);
select teste.como('9e000000-0000-0000-0000-0000000000c1');
select teste.igual('…fechou: nada em aberto; MU 90 e banca 225', $q$select coalesce(s->>'reload_aberto', '-') || ' ' || (s->>'mu') || ' ' || (s->>'banca') from (select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1') s) x$q$,
  '- 90.00 225.00');
select teste.igual('…e o reload não gera aviso de capital repetido (já vem "Reload enviado")', $q$select count(*)::text from public.aviso where tipo = 'capital'$q$, '2');
select teste.como('9e000000-0000-0000-0000-0000000000c2');
insert into rv_pedido select 'reload_k', public.pedir_reload(10);
select teste.ok('K pede e cancela um reload', $q$select public.cancelar_reload((select id from rv_pedido where nome = 'reload_k'))$q$);
select teste.como('9e000000-0000-0000-0000-0000000000f1');
select teste.igual('…o aviso do pedido cancelado também sai', $q$select teste.avisos('reload')$q$, '-');

-- ---------- A-014 e A-022: saque em aberto aparece e o aviso diz a divisão ----------
select teste.como('9e000000-0000-0000-0000-0000000000c1');
insert into rv_pedido select 'saque', public.solicitar_saque(225, 90, 100);
select teste.igual('J vê o saque aguardando (o time recebe 155, ele fica com 35)',
  $q$select concat_ws('/', q->>'status', q->>'total_time', q->>'parte_jogador') from (select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1')->'saque_aberto' q) x$q$, 'solicitado/155.00/35.00');
select teste.como('9e000000-0000-0000-0000-0000000000f1');
select teste.igual('aviso do saque com a divisão', $q$select teste.avisos('saque')$q$,
  'Joga R pediu saque: Devolve US$ 90,00 de MU. Cashout US$ 100,00: jogador US$ 35,00 · time US$ 65,00. O time recebe US$ 155,00.');
select teste.ok('F aprova o saque', $q$select public.decidir_saque((select id from rv_pedido where nome = 'saque'), true)$q$);
select teste.igual('…o aviso do pedido saiu', $q$select teste.avisos('saque')$q$, '-');
select teste.como('9e000000-0000-0000-0000-0000000000c1');
select teste.igual('J: saque aprovado, ainda em aberto, e o aviso dele fica', $q$select (public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1')->'saque_aberto'->>'status') || ' | ' || teste.avisos('saque')$q$,
  'aprovado | Saque aprovado: Pode mandar US$ 155,00 pro time.');
select teste.como('9e000000-0000-0000-0000-0000000000f1');
select teste.ok('F confirma que recebeu 155', $q$select public.confirmar_recebimento((select id from rv_pedido where nome = 'saque'), 155)$q$);
select teste.como('9e000000-0000-0000-0000-0000000000c1');
select teste.igual('…nada em aberto; banca 35; a base da semana continua 170 (o saque foi hoje, não derruba o stop)',
  $q$select coalesce(s->>'saque_aberto', '-') || ' ' || (s->>'banca') || ' ' || (s->>'banca_inicio_semana') from (select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c1', current_date - 2) s) x$q$,
  '- 35.00 170.00');

-- ---------- A-051/A-052 e A-021: planilha enviada aparece e o aviso não repete ----------
select teste.como('9e000000-0000-0000-0000-0000000000c2');
select teste.ok('K manda a planilha (MU 50, banca 80)', $q$select public.enviar_planilha('{"makeup":50,"cashout":0,"banca":80,"saldos":[{"sala":"GG Poker","saldo":80}]}')$q$);
select teste.igual('K vê a planilha aguardando, com a banca que mandou',
  $q$select concat_ws('/', s->>'abertura', s->>'abertura_banca', (s->>'abertura_enviada_em' is not null)::text) from (select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c2') s) x$q$, 'enviada/80/true');
select teste.ok('K corrige e manda de novo (MU 60, banca 90)', $q$select public.enviar_planilha('{"makeup":60,"cashout":0,"banca":90,"saldos":[{"sala":"GG Poker","saldo":90}]}')$q$);
select teste.como('9e000000-0000-0000-0000-0000000000f1');
select teste.igual('F tem UM aviso da planilha, o da versão nova, com "MU"', $q$select teste.avisos('planilha')$q$, 'Kaio R enviou a planilha pra conferir: MU US$ 60,00 · cashout US$ 0,00');
select teste.como('9e000000-0000-0000-0000-0000000000a1');
select teste.igual('…o admin também', $q$select teste.avisos('planilha')$q$, 'Kaio R enviou a planilha pra conferir: MU US$ 60,00 · cashout US$ 0,00');
select teste.como('9e000000-0000-0000-0000-0000000000f1');
select teste.ok('F confere', $q$select public.conferir_abertura('9f000000-0000-0000-0000-0000000000c2', 60, 0)$q$);
select teste.igual('…o aviso saiu do F', $q$select teste.avisos('planilha')$q$, '-');
select teste.como('9e000000-0000-0000-0000-0000000000c2');
select teste.igual('K: conferida, e a base da semana é a foto (90)',
  $q$select concat_ws('/', s->>'abertura', coalesce(s->>'abertura_banca', '-'), s->>'banca_inicio_semana') || ' | ' || teste.avisos('planilha')
     from (select public.situacao_jogador('9f000000-0000-0000-0000-0000000000c2', current_date - 2) s) x$q$, 'confirmada/-/90.00 | Planilha conferida pelo time');

-- ---------- limpeza única da migração: pedidos resolvidos e avisos repetidos de antes ----------
reset role;
insert into public.aviso(workspace_id, user_id, tipo, titulo, texto, ref_id) values
 (teste.rvid('ws'), '9e000000-0000-0000-0000-0000000000f1', 'saque', 'Joga R pediu saque', 'velho', (select id from rv_pedido where nome = 'saque')),
 (teste.rvid('ws'), '9e000000-0000-0000-0000-0000000000c1', 'saque', 'Saque aprovado', 'repetido', (select id from rv_pedido where nome = 'saque'));
select teste.igual('antes: 1 pedido já resolvido no F e o "Saque aprovado" repetido no J',
  $q$select (select count(*) from public.aviso where user_id = '9e000000-0000-0000-0000-0000000000f1' and tipo = 'saque')||'/'||
            (select count(*) from public.aviso where user_id = '9e000000-0000-0000-0000-0000000000c1' and titulo = 'Saque aprovado')$q$, '1/2');
set client_min_messages = warning;
\ir ../../supabase/migrations/20261121130000_revisao_por_conta.sql
reset client_min_messages;
select teste.igual('depois: o pedido resolvido saiu e o repetido virou um', $q$select (select count(*) from public.aviso where user_id = '9e000000-0000-0000-0000-0000000000f1' and tipo = 'saque')||'/'||
            (select count(*) from public.aviso where user_id = '9e000000-0000-0000-0000-0000000000c1' and titulo = 'Saque aprovado')$q$, '0/1');
select teste.igual('…e o resto dos avisos do J ficou (capital, reload, saque confirmado)',
  $q$select string_agg(titulo, ', ' order by titulo) from public.aviso where user_id = '9e000000-0000-0000-0000-0000000000c1'$q$,
  'Capital recebido do time, Capital recebido do time, Reload aprovado, Reload enviado, Saque aprovado, Saque confirmado pelo time');
