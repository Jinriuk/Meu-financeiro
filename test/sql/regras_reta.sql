-- Regras por reta (plano 3.1/3.3): herança, vigência, validação, permissão, "voltar a herdar", contrato da reta e a
-- sugestão de saque com a reserva por sala. Time "Regras": raiz > Base > (R1, R2).
--   A admin (raiz) · F financeiro (raiz) · P configura regras na Base · Q professor da R1 (só desempenho)
--   J1 joga na R1 · J2 joga na R2
\set ON_ERROR_STOP 1
reset role;
create table teste.rg(nome text primary key, id uuid);
grant select, insert on teste.rg to authenticated;
create or replace function teste.rid(n text) returns uuid language sql stable as $$ select id from teste.rg where nome = n $$;
grant execute on function teste.rid(text) to authenticated;

insert into auth.users(id, email, email_confirmed_at) select ('b7000000-0000-0000-0000-0000000000' || n)::uuid, 'r' || n || '@regras.test', now()
  from unnest(array['a1','f1','b1','b2','c1','c2']) n;
insert into teste.rg select 'ws', public.criar_time('Regras', 'b7000000-0000-0000-0000-0000000000a1', 'Admin R', null);
insert into teste.rg select 'R', id from public.unidade where workspace_id = teste.rid('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome) values (teste.rid('ws'), teste.rid('R'), 'Base');
insert into teste.rg select 'Base', id from public.unidade where workspace_id = teste.rid('ws') and nome = 'Base';
insert into public.unidade(workspace_id, mae_id, nome) values (teste.rid('ws'), teste.rid('Base'), 'R1'), (teste.rid('ws'), teste.rid('Base'), 'R2');
insert into teste.rg select 'R1', id from public.unidade where workspace_id = teste.rid('ws') and nome = 'R1';
insert into teste.rg select 'R2', id from public.unidade where workspace_id = teste.rid('ws') and nome = 'R2';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values
 ('b8000000-0000-0000-0000-0000000000f1', teste.rid('ws'), 'b7000000-0000-0000-0000-0000000000f1', 'Fin R', 'ativo'),
 ('b8000000-0000-0000-0000-0000000000b1', teste.rid('ws'), 'b7000000-0000-0000-0000-0000000000b1', 'Prof Base', 'ativo'),
 ('b8000000-0000-0000-0000-0000000000b2', teste.rid('ws'), 'b7000000-0000-0000-0000-0000000000b2', 'Prof R1', 'ativo'),
 ('b8000000-0000-0000-0000-0000000000c1', teste.rid('ws'), 'b7000000-0000-0000-0000-0000000000c1', 'Joga R1', 'ativo'),
 ('b8000000-0000-0000-0000-0000000000c2', teste.rid('ws'), 'b7000000-0000-0000-0000-0000000000c2', 'Joga R2', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values
 ('b8000000-0000-0000-0000-0000000000f1', teste.rid('R'), array['ver_financeiro','aprovar_saques']),
 ('b8000000-0000-0000-0000-0000000000b1', teste.rid('Base'), array['ver_desempenho','configurar_regras']),
 ('b8000000-0000-0000-0000-0000000000b2', teste.rid('R1'), array['ver_desempenho']);
insert into public.vinculo(pessoa_id, unidade_id, inicio) values
 ('b8000000-0000-0000-0000-0000000000c1', teste.rid('R1'), current_date - 30), ('b8000000-0000-0000-0000-0000000000c2', teste.rid('R2'), current_date - 30);
insert into public.workspace_members(workspace_id, user_id, role) select teste.rid('ws'), ('b7000000-0000-0000-0000-0000000000' || n)::uuid, 'member'
  from unnest(array['f1','b1','b2','c1','c2']) n;

set role authenticated;
-- ---------- quem define ----------
select teste.como('b7000000-0000-0000-0000-0000000000b1');
select teste.ok('P define na Base: ABI 5 e sites GG e PS', $q$select public.definir_regra(teste.rid('Base'), 'abi_max', '5'::jsonb); select public.definir_regra(teste.rid('Base'), 'sites', '["GG Poker","PokerStars"]'::jsonb)$q$);
select teste.ok('P define na R1: ABI 3, stop diário 8 buy-ins, stop semanal 20%, reserva 50 por sala, só MTT',
  $q$select public.definir_regra(teste.rid('R1'), 'abi_max', '3'::jsonb); select public.definir_regra(teste.rid('R1'), 'stop_dia_buyins', '8'::jsonb);
     select public.definir_regra(teste.rid('R1'), 'stop_semana_pct', '0.2'::jsonb); select public.definir_regra(teste.rid('R1'), 'reserva_por_sala', '50'::jsonb);
     select public.definir_regra(teste.rid('R1'), 'modalidades', '["MTT"]'::jsonb)$q$);
select teste.erro('P NÃO define regra do time inteiro (fora do escopo dele)', $q$select public.definir_regra(teste.rid('R'), 'abi_max', '9'::jsonb)$q$);
select teste.como('b7000000-0000-0000-0000-0000000000b2');
select teste.erro('Q (só desempenho) NÃO define regra da reta dele', $q$select public.definir_regra(teste.rid('R1'), 'abi_max', '30'::jsonb)$q$);
select teste.erro('…nem limpa', $q$select public.limpar_regra(teste.rid('R1'), 'abi_max')$q$);
select teste.como('b7000000-0000-0000-0000-0000000000c1');
select teste.erro('o jogador NÃO muda a regra da própria reta', $q$select public.definir_regra(teste.rid('R1'), 'abi_max', '100'::jsonb)$q$);

-- ---------- validação ----------
select teste.como('b7000000-0000-0000-0000-0000000000b1');
select teste.erro_qualquer('ABI 0', $q$select public.definir_regra(teste.rid('R1'), 'abi_max', '0'::jsonb)$q$);
select teste.erro_qualquer('stop semanal de 150%', $q$select public.definir_regra(teste.rid('R1'), 'stop_semana_pct', '1.5'::jsonb)$q$);
select teste.erro_qualquer('reserva negativa', $q$select public.definir_regra(teste.rid('R1'), 'reserva_por_sala', '-1'::jsonb)$q$);
select teste.erro_qualquer('lista de sites vazia', $q$select public.definir_regra(teste.rid('R1'), 'sites', '[]'::jsonb)$q$);
select teste.erro_qualquer('site que não é texto', $q$select public.definir_regra(teste.rid('R1'), 'sites', '[1]'::jsonb)$q$);
select teste.erro_qualquer('ABI como texto', $q$select public.definir_regra(teste.rid('R1'), 'abi_max', '"3"'::jsonb)$q$);
select teste.erro_qualquer('regra que não existe', $q$select public.definir_regra(teste.rid('R1'), 'rake', '1'::jsonb)$q$);
select teste.erro_qualquer('valor vazio (pra herdar é limpar_regra)', $q$select public.definir_regra(teste.rid('R1'), 'abi_max', 'null'::jsonb)$q$);

-- ---------- herança e vigência ----------
select teste.como('b7000000-0000-0000-0000-0000000000c1');
select teste.igual('R1: ABI 3 (dela), sites da Base, só MTT, reserva 50',
  $q$select concat_ws(' | ', public.regra_efetiva(teste.rid('R1'), 'abi_max'), public.regra_efetiva(teste.rid('R1'), 'sites'), public.regra_efetiva(teste.rid('R1'), 'modalidades'), public.regra_efetiva(teste.rid('R1'), 'reserva_por_sala'))$q$,
  '3 | ["GG Poker", "PokerStars"] | ["MTT"] | 50');
select teste.igual('R2: herda tudo da Base (ABI 5, sites) e não tem reserva nem stop próprio',
  $q$select concat_ws(' | ', public.regra_efetiva(teste.rid('R2'), 'abi_max'), public.regra_efetiva(teste.rid('R2'), 'sites'), coalesce(public.regra_efetiva(teste.rid('R2'), 'reserva_por_sala')::text, 'sem'), coalesce(public.regra_efetiva(teste.rid('R2'), 'stop_dia_buyins')::text, 'sem'))$q$,
  '5 | ["GG Poker", "PokerStars"] | sem | sem');
select teste.como('b7000000-0000-0000-0000-0000000000b1');
select teste.ok('P agenda ABI 4 na R1 a partir de daqui a 10 dias', $q$select public.definir_regra(teste.rid('R1'), 'abi_max', '4'::jsonb, current_date + 10)$q$);
select teste.igual('…hoje continua 3; daqui a 10 dias vale 4',
  $q$select public.regra_efetiva(teste.rid('R1'), 'abi_max')::text||' → '||public.regra_efetiva(teste.rid('R1'), 'abi_max', current_date + 10)::text$q$, '3 → 4');
select teste.ok('P limpa o ABI da R1 (volta a herdar)', $q$select public.limpar_regra(teste.rid('R1'), 'abi_max')$q$);
select teste.igual('…e a R1 passa a usar o ABI da Base, hoje e depois', $q$select public.regra_efetiva(teste.rid('R1'), 'abi_max')::text||' → '||public.regra_efetiva(teste.rid('R1'), 'abi_max', current_date + 10)::text$q$, '5 → 5');
select teste.como('b7000000-0000-0000-0000-000000000099');
select teste.igual('quem é de fora não lê a regra do time', $q$select coalesce(public.regra_efetiva(teste.rid('R1'), 'sites')::text, 'nada')$q$, 'nada');

-- ---------- contrato da reta ----------
select teste.como('b7000000-0000-0000-0000-0000000000a1');
select teste.ok('A define o contrato do time: 35% até 10k, 40% depois', $q$select public.definir_contrato(teste.rid('R'), null, '[{"ate":10000,"jogador":0.35},{"ate":null,"jogador":0.40}]'::jsonb)$q$);
select teste.como('b7000000-0000-0000-0000-0000000000b1');
select teste.ok('P define um contrato só da Base: 40% até 5k, 50% depois', $q$select public.definir_contrato(teste.rid('Base'), null, '[{"ate":5000,"jogador":0.40},{"ate":null,"jogador":0.50}]'::jsonb)$q$);
select teste.como('b7000000-0000-0000-0000-0000000000a1');
select teste.igual('J1 e J2 (na Base) usam o contrato da Base', $q$select (public.situacao_jogador('b8000000-0000-0000-0000-0000000000c1')->'contrato'->0->>'jogador')||'/'||(public.situacao_jogador('b8000000-0000-0000-0000-0000000000c2')->'contrato'->0->>'jogador')$q$, '0.40/0.40');
select teste.como('b7000000-0000-0000-0000-0000000000b1');
select teste.ok('P limpa o contrato da Base', $q$select public.limpar_regra(teste.rid('Base'), 'contrato')$q$);
select teste.como('b7000000-0000-0000-0000-0000000000a1');
select teste.igual('…e os dois voltam pro contrato do time', $q$select (public.situacao_jogador('b8000000-0000-0000-0000-0000000000c1')->'contrato'->0->>'jogador')||'/'||(public.situacao_jogador('b8000000-0000-0000-0000-0000000000c2')->'contrato'->0->>'jogador')$q$, '0.35/0.35');

-- ---------- sugestão de saque com a reserva (o exemplo do plano: banca 400, MU 200, 50 em cada uma das 2 salas) ----------
select teste.como('b7000000-0000-0000-0000-0000000000f1');
select teste.ok('F manda 200 pro J1 e 100 pro J2', $q$select public.registrar_aporte('b8000000-0000-0000-0000-0000000000c1', 200); select public.registrar_aporte('b8000000-0000-0000-0000-0000000000c2', 100)$q$);
select teste.como('b7000000-0000-0000-0000-0000000000c1');
select teste.ok('J1 tem 2 salas (0 cada) e ganha um torneio de 200', $q$insert into public.player_wallets(player, wallet, saldo_inicial) values ('Joga R1', 'GG Poker', 0), ('Joga R1', 'PokerStars', 0);
  insert into public.tournaments(entry_date, player, buyin, prize) values (current_date - 2, 'Joga R1', 0, 200)$q$);
select teste.igual('sugestão do J1: devolve os 200 de MU e saca 100, deixando 50 em cada sala (banca depois 100)',
  $q$select concat_ws('/', s->>'banca', s->>'mu', s->>'salas', s->>'reserva_total', s->>'devolucao', s->>'cashout', s->>'banca_depois') from (select public.sugerir_saque('b8000000-0000-0000-0000-0000000000c1') s) x$q$,
  '400.00/200.00/2/100.00/200.00/100.00/100.00');
select teste.ok('…e o saque sugerido passa no servidor', $q$select public.solicitar_saque(400, 200, 100, null, null)$q$);
select teste.erro('J1 NÃO vê a sugestão do J2', $q$select public.sugerir_saque('b8000000-0000-0000-0000-0000000000c2')$q$);
select teste.como('b7000000-0000-0000-0000-0000000000c2');
select teste.ok('J2 perde 30', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date - 1, 'Joga R2', 30, 0)$q$);
select teste.igual('J2 em MK (banca 70, MU 100): nenhuma sugestão de saque',
  $q$select concat_ws('/', s->>'em_mk', s->>'devolucao', s->>'cashout') from (select public.sugerir_saque('b8000000-0000-0000-0000-0000000000c2') s) x$q$, 'true/0.00/0.00');
select teste.como('b7000000-0000-0000-0000-0000000000b2');
select teste.erro('Q (sem ver dinheiro) NÃO vê a sugestão do J1', $q$select public.sugerir_saque('b8000000-0000-0000-0000-0000000000c1')$q$);
select teste.como('b7000000-0000-0000-0000-0000000000f1');
select teste.igual('F (vê dinheiro do time) vê a do J1, já com o saque pedido de fora (o pedido ainda não foi pago)',
  $q$select public.sugerir_saque('b8000000-0000-0000-0000-0000000000c1')->>'cashout'$q$, '100.00');
reset role;
