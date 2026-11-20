-- Saída do jogador, opção B (plano mestre, seção 6). Time "Saída":
--   A dono e admin (joga na raiz) · A2 admin (joga na raiz) · F financeiro (raiz) · G gere pessoas só na Reta S1 (sem dinheiro)
--   P professor da S1 (vê desempenho e dinheiro) · J1 tinha conta individual e entra pelo convite · J2 entra pelo código e sai
--   em MK · J3 convidado que nunca aceitou · X de fora
-- teste.sv(consulta) roda a mesma consulta como cada um e devolve "A=… F=… G=… P=… J1=… J2=… X=…".
\set ON_ERROR_STOP 1
reset role;
create table teste.s(nome text primary key, id uuid, t text);
grant select, insert, update on teste.s to authenticated;
create or replace function teste.sid(n text) returns uuid language sql stable as $$ select id from teste.s where nome = n $$;
create or replace function teste.st(n text) returns text language sql stable as $$ select t from teste.s where nome = n $$;
create or replace function teste.sv(consulta text) returns text language plpgsql as $$
declare r record; n text; saida text := ''; antes text := current_setting('request.jwt.claims', true);
begin
  perform set_config('role', 'authenticated', true);
  for r in select * from (values (1,'A','b4000000-0000-0000-0000-0000000000a1'), (2,'F','b4000000-0000-0000-0000-0000000000f1'),
      (3,'G','b4000000-0000-0000-0000-0000000000e1'), (4,'P','b4000000-0000-0000-0000-0000000000b1'),
      (5,'J1','b4000000-0000-0000-0000-0000000000c1'), (6,'J2','b4000000-0000-0000-0000-0000000000c2'),
      (7,'X','b4000000-0000-0000-0000-000000000099')) v(o, rot, uid) order by o loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, false);
    execute consulta into n;
    saida := saida || r.rot || '=' || coalesce(n, '-') || ' ';
  end loop;
  perform set_config('request.jwt.claims', coalesce(antes, ''), false);
  return rtrim(saida);
end $$;
grant execute on function teste.sid(text), teste.st(text), teste.sv(text) to authenticated;

insert into auth.users(id, email, email_confirmed_at) select ('b4000000-0000-0000-0000-0000000000' || n)::uuid, 's' || n || '@saida.test', now()
  from unnest(array['a1','a2','f1','e1','b1','c1','c2','99']) n;
insert into public.player_profiles(user_id, email, nickname) values
 ('b4000000-0000-0000-0000-0000000000c1', 'sc1@saida.test', 'Um Antigo'), ('b4000000-0000-0000-0000-0000000000c2', 'sc2@saida.test', 'Dois');
insert into teste.s(nome, id) select 'ws', public.criar_time('Saída', 'b4000000-0000-0000-0000-0000000000a1', 'Admin S', null);
insert into teste.s(nome, id) select 'R', id from public.unidade where workspace_id = teste.sid('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome, rotulo, ordem) values (teste.sid('ws'), teste.sid('R'), 'Reta S1', 'Reta 1', 1), (teste.sid('ws'), teste.sid('R'), 'Reta S2', 'Reta 2', 2);
insert into teste.s(nome, id) select 'S1', id from public.unidade where workspace_id = teste.sid('ws') and nome = 'Reta S1';
insert into teste.s(nome, id) select 'S2', id from public.unidade where workspace_id = teste.sid('ws') and nome = 'Reta S2';
insert into teste.s(nome, id) select 'pA', id from public.pessoa where workspace_id = teste.sid('ws') and user_id = 'b4000000-0000-0000-0000-0000000000a1';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values
 ('b6000000-0000-0000-0000-0000000000a2', teste.sid('ws'), 'b4000000-0000-0000-0000-0000000000a2', 'Admin Dois', 'ativo'),
 ('b6000000-0000-0000-0000-0000000000f1', teste.sid('ws'), 'b4000000-0000-0000-0000-0000000000f1', 'Fin S', 'ativo'),
 ('b6000000-0000-0000-0000-0000000000e1', teste.sid('ws'), 'b4000000-0000-0000-0000-0000000000e1', 'Gestor S1', 'ativo'),
 ('b6000000-0000-0000-0000-0000000000b1', teste.sid('ws'), 'b4000000-0000-0000-0000-0000000000b1', 'Prof S1', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values
 ('b6000000-0000-0000-0000-0000000000a2', teste.sid('R'), array['administrar']),
 ('b6000000-0000-0000-0000-0000000000f1', teste.sid('R'), array['ver_financeiro','aprovar_saques']),
 ('b6000000-0000-0000-0000-0000000000e1', teste.sid('S1'), array['gerir_pessoas','ver_desempenho']),
 ('b6000000-0000-0000-0000-0000000000b1', teste.sid('S1'), array['ver_desempenho','ver_financeiro','promover']);
insert into public.workspace_members(workspace_id, user_id, role) select teste.sid('ws'), ('b4000000-0000-0000-0000-0000000000' || n)::uuid, 'member'
  from unnest(array['a2','f1','e1','b1']) n;
-- os dois admins também jogam (na raiz)
insert into public.vinculo(pessoa_id, unidade_id, inicio) values (teste.sid('pA'), teste.sid('R'), current_date - 30), ('b6000000-0000-0000-0000-0000000000a2', teste.sid('R'), current_date - 30);
-- J1 tinha conta individual (com config própria e um torneio); J2, uma vazia; X é de fora
insert into public.workspaces(id, name, kind, plan, trial_ends_at) values
 ('b5000000-0000-0000-0000-0000000000c1', 'Grind do Um', 'solo', 'gestao', now() + interval '3 days'),
 ('b5000000-0000-0000-0000-0000000000c2', 'Dois', 'solo', 'pro', now() + interval '10 days'),
 ('b5000000-0000-0000-0000-000000000099', 'Fora', 'solo', 'pro', null);
insert into public.workspace_members(workspace_id, user_id, role) values
 ('b5000000-0000-0000-0000-0000000000c1', 'b4000000-0000-0000-0000-0000000000c1', 'owner'), ('b5000000-0000-0000-0000-0000000000c2', 'b4000000-0000-0000-0000-0000000000c2', 'owner'),
 ('b5000000-0000-0000-0000-000000000099', 'b4000000-0000-0000-0000-000000000099', 'owner');
insert into public.pool_config(workspace_id, player1_name, player2_name, abi_max, banca_inicial) values ('b5000000-0000-0000-0000-0000000000c1', 'Um Antigo', '', 7, 300);
insert into public.tournaments(workspace_id, entry_date, player, buyin, prize, site, site_tournament_id) values ('b5000000-0000-0000-0000-0000000000c1', current_date - 40, 'Um Antigo', 10, 30, 'GG Poker', 'T1');
insert into public.hh_tournament_stats(workspace_id, player, site, site_tournament_id, entry_date) values ('b5000000-0000-0000-0000-0000000000c1', 'Um Antigo', 'GG Poker', 'T1', current_date - 40);

-- ---------- montagem: contrato, J1 pelo convite, J2 pelo código, J3 convidado sem conta ----------
set role authenticated;
select teste.como('b4000000-0000-0000-0000-0000000000a1');
select teste.ok('contrato do time: 35% até 10k, 40% depois', $q$select public.definir_contrato(teste.sid('R'), null, '[{"ate":10000,"jogador":0.35},{"ate":null,"jogador":0.40}]'::jsonb)$q$);
insert into teste.s(nome, id) select 'pJ1', public.convidar_jogador(teste.sid('S1'), 'Jogador Um');
insert into teste.s(nome, t) select 'tk1', public.criar_convite(teste.sid('S1'), teste.sid('pJ1'));
insert into teste.s(nome, t) select 'cod', public.gerar_codigo_time();
insert into teste.s(nome, id) select 'pJ3', public.convidar_jogador(teste.sid('S1'), 'Convidado Tres');
select teste.como('b4000000-0000-0000-0000-0000000000c1');
select teste.ok('J1 aceita o convite (a conta individual vira do time)', $q$select public.aceitar_convite(teste.st('tk1'))$q$);
select teste.como('b4000000-0000-0000-0000-0000000000c2');
select teste.ok('J2 pede pelo código', $q$select public.pedir_entrada_time(teste.st('cod'))$q$);
select teste.como('b4000000-0000-0000-0000-0000000000a1');
insert into teste.s(nome, id) select 'pJ2', public.decidir_entrada((select id from public.pedido_entrada where user_id = 'b4000000-0000-0000-0000-0000000000c2'), true, teste.sid('S2'), 'Jogador Dois', null);
reset role;
update public.vinculo set inicio = current_date - 20 where pessoa_id in (teste.sid('pJ1'), teste.sid('pJ2'));   -- entraram há 20 dias
set role authenticated;

-- J1 no time: o mesmo torneio gravado com duas variações do nome (+15 cada), sala GG com 0; o time manda 100; saque de 20 pago
select teste.como('b4000000-0000-0000-0000-0000000000c1');
select teste.ok('J1 lança o torneio A1 (+15) e a mesma mão importada com o nome em minúsculas',
  $q$insert into public.tournaments(entry_date, player, buyin, prize, site, site_tournament_id) values (current_date - 10, 'Jogador Um', 10, 25, 'GG Poker', 'A1'), (current_date - 10, 'jogador um', 10, 25, 'GG Poker', 'A1')$q$);
select teste.ok('J1 cadastra a sala GG (0) e importa mãos', $q$insert into public.player_wallets(player, wallet, saldo_inicial) values ('Jogador Um', 'GG Poker', 0);
  insert into public.hh_tournament_stats(player, site, site_tournament_id, entry_date, hands) values ('Jogador Um', 'GG Poker', 'A1', current_date - 10, 80)$q$);
select teste.como('b4000000-0000-0000-0000-0000000000f1');
select teste.ok('F manda 100 de capital pro J1', $q$select public.registrar_aporte(teste.sid('pJ1'), 100)$q$);
create temp table sq(n int, id uuid);
reset role; grant all on sq to authenticated; set role authenticated;
select teste.como('b4000000-0000-0000-0000-0000000000c1');
insert into sq select 1, public.solicitar_saque(130, 0, 20, null, null);
select teste.como('b4000000-0000-0000-0000-0000000000f1');
select teste.ok('F aprova e recebe os 13 do saque (65% de 20)', $q$select public.decidir_saque((select id from sq where n = 1), true); select public.confirmar_recebimento((select id from sq where n = 1), 13)$q$);
-- J2: o time manda 200 e ele perde 150 (MK de 150)
select teste.ok('F manda 200 de capital pro J2', $q$select public.registrar_aporte(teste.sid('pJ2'), 200)$q$);
select teste.como('b4000000-0000-0000-0000-0000000000c2');
select teste.ok('J2 perde 150', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date - 5, 'Jogador Dois', 150, 0)$q$);

-- ---------- quem pode registrar a saída ----------
select teste.como('b4000000-0000-0000-0000-0000000000c1');
insert into sq select 2, public.solicitar_saque(110, 0, 5, null, null);
select teste.como('b4000000-0000-0000-0000-0000000000f1');
select teste.erro('F (sem gerir pessoas) NÃO registra saída', $q$select public.registrar_saida(teste.sid('pJ1'))$q$);
select teste.como('b4000000-0000-0000-0000-0000000000e1');
select teste.erro('G gere pessoas na S1, mas o J1 tem dinheiro do time: sem "aprovar saques" NÃO registra', $q$select public.registrar_saida(teste.sid('pJ1'))$q$);
select teste.como('b4000000-0000-0000-0000-0000000000a1');
select teste.erro_qualquer('com saque pendente a saída é recusada (o acerto sairia errado)', $q$select public.registrar_saida(teste.sid('pJ1'))$q$);
select teste.como('b4000000-0000-0000-0000-0000000000f1');
select teste.ok('F recusa o saque pendente', $q$select public.decidir_saque((select id from sq where n = 2), false, 'resolver antes da saída')$q$);
select teste.como('b4000000-0000-0000-0000-0000000000a2');
select teste.erro_qualquer('ninguém tira o dono do time por aqui', $q$select public.registrar_saida(teste.sid('pA'))$q$);
select teste.erro('ninguém registra a própria saída', $q$select public.registrar_saida('b6000000-0000-0000-0000-0000000000a2')$q$);
select teste.como('b4000000-0000-0000-0000-0000000000c1');
select teste.erro('o jogador NÃO vê a prévia da própria saída', $q$select public.previa_saida(teste.sid('pJ1'))$q$);

-- ---------- prévia: a conta do acerto ----------
select teste.como('b4000000-0000-0000-0000-0000000000a1');
select teste.igual('prévia do J1: banca 110 (0 + 100 + 30 − 20), MU 100, profit 10; time recolhe 100 + 65% de 10',
  $q$select concat_ws('/', a->>'banca', a->>'mu', a->>'profit', a->>'mk_congelado', a->>'devolucao', a->>'cashout', a->>'parte_jogador', a->>'parte_time', a->>'total_time')
     from (select public.previa_saida(teste.sid('pJ1'))->'acerto' a) x$q$, '110.00/100.00/10.00/0.00/100.00/10.00/3.50/6.50/106.50');
select teste.igual('…o desempenho do período no time e o que vai pra conta dele',
  $q$select (p->'resultado'->>'torneios')||' torneios, lucro '||(p->'resultado'->>'lucro')||' · leva '||(p->'leva'->>'torneios')||' torneios, '||(p->'leva'->>'maos')||' mãos, '||(p->'leva'->>'salas')||' sala'
     from (select public.previa_saida(teste.sid('pJ1')) p) x$q$, '2 torneios, lucro 30.00 · leva 3 torneios, 2 mãos, 1 sala');

-- ---------- saída do J1 com lucro: o admin confirma a banca real (112) ----------
select teste.ok('A registra a saída do J1 com banca final 112', $q$insert into teste.s(nome, id) select 'ac1', public.registrar_saida(teste.sid('pJ1'), 112, null, 'saiu pra jogar sozinho')$q$);
reset role;
select teste.igual('acerto: banca 112, profit 12; lifetime do dia 20 + 12 = 32 (faixa de 35%): jogador 4,20, time 100 + 7,80 = 107,80, a receber',
  $q$select concat_ws('/', banca_sistema, banca, mu, lifetime_antes, profit, mk_congelado, devolucao, cashout, parte_jogador, parte_time, total_time, status)
     from public.acerto_saida where id = teste.sid('ac1')$q$, '110.00/112.00/100.00/20.00/12.00/0.00/100.00/12.00/4.20/7.80/107.80/a_receber');
select teste.igual('…com o período e o resultado no time',
  $q$select ((entrada = current_date - 20) and saida = current_date)::text||' '||(resultado->>'torneios')||'/'||(resultado->>'lucro')||'/'||jsonb_array_length(resultado->'meses')||' '||time_nome
     from public.acerto_saida where id = teste.sid('ac1')$q$, 'true 2/30.00/1 Saída');
select teste.igual('J1 saiu: vínculo fechado, sem acesso, fora do time',
  $q$select (select status from public.pessoa where id = teste.sid('pJ1'))||'/'||(select count(*) from public.vinculo where pessoa_id = teste.sid('pJ1') and fim is null)||'/'||
            (select count(*) from public.workspace_members where workspace_id = teste.sid('ws') and user_id = 'b4000000-0000-0000-0000-0000000000c1')$q$, 'saiu/0/0');
select teste.igual('conta individual nova do J1: a dele de antes (nome, plano), com 15 dias de teste',
  $q$select w.name||'/'||w.kind||'/'||w.plan||'/'||(w.trial_ends_at::date = (now() + interval '15 days')::date)||'/'||m.role
     from public.acerto_saida a join public.workspaces w on w.id = a.conta_nova join public.workspace_members m on m.workspace_id = w.id
    where a.id = teste.sid('ac1')$q$, 'Grind do Um/solo/gestao/true/owner');
select teste.igual('…com a configuração antiga de volta (nome, teto de ABI 7, banca inicial 300)',
  $q$select c.player1_name||'/'||c.abi_max||'/'||c.banca_inicial from public.pool_config c join public.acerto_saida a on a.conta_nova = c.workspace_id where a.id = teste.sid('ac1')$q$,
  'Um Antigo/7/300');
select teste.igual('o histórico detalhado foi com ele, no nome dele (o torneio repetido virou 1): 2 torneios, 2 mãos, 1 sala',
  $q$select (select count(*) from public.tournaments t where t.workspace_id = a.conta_nova and t.player = 'Um Antigo' and t.pessoa_id is null and t.unidade_id is null)||'/'||
            (select count(*) from public.hh_tournament_stats h where h.workspace_id = a.conta_nova and h.player = 'Um Antigo')||'/'||
            (select count(*) from public.player_wallets w where w.workspace_id = a.conta_nova and w.player = 'Um Antigo')
     from public.acerto_saida a where a.id = teste.sid('ac1')$q$, '2/2/1');
select teste.igual('…e saiu do time; o financeiro ficou (saques, aporte)',
  $q$select (select count(*) from public.tournaments where workspace_id = teste.sid('ws') and (pessoa_id = teste.sid('pJ1') or lower(player) in ('jogador um','um antigo')))||'/'||
            (select count(*) from public.hh_tournament_stats where workspace_id = teste.sid('ws') and lower(player) in ('jogador um','um antigo'))||'/'||
            (select count(*) from public.player_wallets where workspace_id = teste.sid('ws') and lower(player) in ('jogador um','um antigo'))||' · '||
            (select count(*) from public.saque where pessoa_id = teste.sid('pJ1'))||' saques, '||(select count(*) from public.aporte where pessoa_id = teste.sid('pJ1'))||' aporte'$q$,
  '0/0/0 · 2 saques, 1 aporte');
select teste.igual('acerto: quem vê (o jogador, o admin, o financeiro e quem vê dinheiro na reta dele; o gestor só de pessoas não)',
  $q$select teste.sv($c$select count(*)::text from public.acerto_saida where pessoa_id = teste.sid('pJ1')$c$)$q$, 'A=1 F=1 G=0 P=1 J1=1 J2=0 X=0');
select teste.igual('o J1 vê o histórico dele na conta nova; ninguém do time vê',
  $q$select teste.sv($c$select count(*)::text from public.tournaments where player = 'Um Antigo'$c$)$q$, 'A=0 F=0 G=0 P=0 J1=2 J2=0 X=0');
select teste.igual('o J1 não lê mais nada do time (outras pessoas, retas, saques; só o próprio registro antigo)',
  $q$select split_part(teste.sv($c$select ((select count(*) from public.pessoa where workspace_id = teste.sid('ws') and user_id is distinct from auth.uid()) + (select count(*) from public.unidade where workspace_id = teste.sid('ws'))
     + (select count(*) from public.saque where workspace_id = teste.sid('ws')))::text$c$), ' ', 5)$q$, 'J1=0');
select teste.igual('a lista do time não tem mais o J1',
  $q$select teste.sv($c$select count(*)::text from public.resumo_time() where nome = 'Jogador Um'$c$)$q$, 'A=0 F=0 G=0 P=0 J1=0 J2=0 X=0');
select teste.igual('aviso da saída: só pra quem aprova saques (o admin que registrou não recebe)',
  $q$select teste.sv($c$select count(*)::text from public.aviso where tipo = 'saida'$c$)$q$, 'A=0 F=1 G=0 P=0 J1=0 J2=0 X=0');
set role authenticated;
select teste.como('b4000000-0000-0000-0000-0000000000b1');
select teste.erro('P (sem aprovar saques) NÃO confirma o recebido', $q$select public.confirmar_acerto(teste.sid('ac1'), 107)$q$);
select teste.como('b4000000-0000-0000-0000-0000000000f1');
select teste.igual('F confirma que o time recebeu 107: diferença de −0,80', $q$select public.confirmar_acerto(teste.sid('ac1'), 107)->>'diferenca'$q$, '-0.80');

-- ---------- saída do J2 em MK: o time recolhe o que sobrou e o MK fica congelado ----------
select teste.como('b4000000-0000-0000-0000-0000000000a1');
select teste.ok('A registra a saída do J2 (banca do sistema)', $q$insert into teste.s(nome, id) select 'ac2', public.registrar_saida(teste.sid('pJ2'))$q$);
reset role;
select teste.igual('acerto em MK: banca 50, MU 200, MK 150 congelado, time recolhe os 50, nada a dividir',
  $q$select concat_ws('/', banca, mu, profit, mk_congelado, devolucao, cashout, parte_jogador, parte_time, total_time) from public.acerto_saida where id = teste.sid('ac2')$q$,
  '50.00/200.00/-150.00/150.00/50.00/0.00/0.00/0.00/50.00');
select teste.igual('conta nova do J2 (a individual dele não tinha config): nome e plano da conta antiga, config no nome do time, com o torneio dele',
  $q$select w.name||'/'||w.plan||'/'||c.player1_name||'/'||(select count(*) from public.tournaments t where t.workspace_id = w.id)
     from public.acerto_saida a join public.workspaces w on w.id = a.conta_nova join public.pool_config c on c.workspace_id = w.id where a.id = teste.sid('ac2')$q$,
  'Dois/pro/Jogador Dois/1');

-- ---------- convidado que nunca aceitou: só fecha (não há conta pra levar nada) ----------
set role authenticated;
select teste.como('b4000000-0000-0000-0000-0000000000e1');
select teste.ok('G (gere pessoas na S1) tira o convidado sem dinheiro', $q$insert into teste.s(nome, id) select 'ac3', public.registrar_saida(teste.sid('pJ3'))$q$);
reset role;
select teste.igual('…saiu, sem conta nova, acerto zerado',
  $q$select p.status||'/'||coalesce(a.conta_nova::text, 'sem conta')||'/'||a.total_time from public.acerto_saida a join public.pessoa p on p.id = a.pessoa_id where a.id = teste.sid('ac3')$q$,
  'saiu/sem conta/0.00');

-- ---------- volta: o J1 é convidado de novo; o que ele levou é dele (o time não vê) ----------
set role authenticated;
select teste.como('b4000000-0000-0000-0000-0000000000a1');
insert into teste.s(nome, t) select 'tk_volta', public.criar_convite(teste.sid('S2'), null, 7, 1);
select teste.como('b4000000-0000-0000-0000-0000000000c1');
select teste.ok('J1 volta pelo link (a conta individual com tudo vira do time de novo)', $q$insert into teste.s(nome, id) select 'pJ1b', public.aceitar_convite(teste.st('tk_volta'))$q$);
reset role;
select teste.igual('voltou como pessoa nova (Um Antigo); o histórico que ele levou é de antes da entrada: só ele vê; banca 0',
  $q$select p.nome||'/'||(select count(*) from public.tournaments t where t.pessoa_id = p.id and t.unidade_id is null)||'/'||(public.banca_de(p.id)->>'banca')||'/'||
            (select count(*) from public.conta_individual_arquivada where user_id = 'b4000000-0000-0000-0000-0000000000c1')
     from public.pessoa p where p.id = teste.sid('pJ1b')$q$, 'Um Antigo/2/0.00/2');
select teste.igual('…o acerto antigo continua com o time, no registro antigo',
  $q$select (select count(*) from public.acerto_saida where pessoa_id = teste.sid('pJ1'))||'/'||coalesce((select user_id::text from public.pessoa where id = teste.sid('pJ1')), 'sem conta')$q$, '1/sem conta');
