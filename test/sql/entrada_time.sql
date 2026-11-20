-- Entrada no time (20/11): convite aceito por conta que já existe (a conta individual vira do time) e código do time
-- com pedido e aprovação. Time "Entrada": A admin · G gere pessoas só na Reta E1.
-- U1 conta individual com histórico · U2 com plano pago · U3 em outro time · U4 conta nova vazia (o caso do "Jason Craig")
-- U5, U6, U7 pedem pelo código.
\set ON_ERROR_STOP 1
reset role;
create table teste.e(nome text primary key, id uuid, t text);
grant select, insert, update on teste.e to authenticated;
create or replace function teste.eid(n text) returns uuid language sql stable as $$ select id from teste.e where nome = n $$;
create or replace function teste.et(n text) returns text language sql stable as $$ select t from teste.e where nome = n $$;
grant execute on function teste.eid(text), teste.et(text) to authenticated;

insert into auth.users(id, email, email_confirmed_at) select ('ba000000-0000-0000-0000-0000000000' || n)::uuid, 'e' || n || '@entrada.test', now()
  from unnest(array['a1','b1','c1','c2','c3','c4','c5','c6','c7']) n;
insert into public.player_profiles(user_id, email, nickname) values
 ('ba000000-0000-0000-0000-0000000000c1', 'ec1@entrada.test', 'Ze Solo'), ('ba000000-0000-0000-0000-0000000000c5', 'ec5@entrada.test', 'Cinco'),
 ('ba000000-0000-0000-0000-0000000000c6', 'ec6@entrada.test', 'Seis'), ('ba000000-0000-0000-0000-0000000000c7', 'ec7@entrada.test', 'Sete');
insert into teste.e(nome, id) select 'ws', public.criar_time('Entrada', 'ba000000-0000-0000-0000-0000000000a1', 'Admin E', null);
insert into teste.e(nome, id) select 'R', id from public.unidade where workspace_id = teste.eid('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome, rotulo, ordem) values (teste.eid('ws'), teste.eid('R'), 'Reta E1', 'Reta 1', 1), (teste.eid('ws'), teste.eid('R'), 'Reta E2', 'Reta 2', 2);
insert into teste.e(nome, id) select 'E1', id from public.unidade where workspace_id = teste.eid('ws') and nome = 'Reta E1';
insert into teste.e(nome, id) select 'E2', id from public.unidade where workspace_id = teste.eid('ws') and nome = 'Reta E2';
-- G: gere pessoas só na Reta E1
insert into public.pessoa(id, workspace_id, user_id, nome, status) values ('bb000000-0000-0000-0000-0000000000b1', teste.eid('ws'), 'ba000000-0000-0000-0000-0000000000b1', 'Gestor G', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values ('bb000000-0000-0000-0000-0000000000b1', teste.eid('E1'), array['gerir_pessoas','promover','ver_desempenho']);
insert into public.workspace_members(workspace_id, user_id, role) values (teste.eid('ws'), 'ba000000-0000-0000-0000-0000000000b1', 'member');
-- contas individuais (as do cadastro normal)
insert into public.workspaces(id, name, kind, plan, trial_ends_at) values
 ('bc000000-0000-0000-0000-0000000000c1', 'Ze Solo', 'solo', 'pro', now() + interval '10 days'),
 ('bc000000-0000-0000-0000-0000000000c2', 'Pagante', 'solo', 'pro', null),
 ('bc000000-0000-0000-0000-0000000000c3', 'Outro Time', 'time', 'team', null),
 ('bc000000-0000-0000-0000-0000000000c4', 'Jason', 'solo', 'gestao', now() + interval '14 days'),
 ('bc000000-0000-0000-0000-0000000000c5', 'Cinco', 'solo', 'pro', now() + interval '14 days'),
 ('bc000000-0000-0000-0000-0000000000c6', 'Seis', 'solo', 'pro', now() + interval '14 days');
insert into public.workspace_members(workspace_id, user_id, role) values
 ('bc000000-0000-0000-0000-0000000000c1', 'ba000000-0000-0000-0000-0000000000c1', 'owner'), ('bc000000-0000-0000-0000-0000000000c2', 'ba000000-0000-0000-0000-0000000000c2', 'owner'),
 ('bc000000-0000-0000-0000-0000000000c3', 'ba000000-0000-0000-0000-0000000000c3', 'member'), ('bc000000-0000-0000-0000-0000000000c4', 'ba000000-0000-0000-0000-0000000000c4', 'owner'),
 ('bc000000-0000-0000-0000-0000000000c5', 'ba000000-0000-0000-0000-0000000000c5', 'owner'), ('bc000000-0000-0000-0000-0000000000c6', 'ba000000-0000-0000-0000-0000000000c6', 'owner');
-- U1 tem histórico na conta individual (inclusive o mesmo torneio lançado com dois nomes) e salas
insert into public.pool_config(workspace_id, player1_name, player2_name, banca_inicial) values ('bc000000-0000-0000-0000-0000000000c1', 'Ze Solo', '', 300);
insert into public.tournaments(workspace_id, entry_date, player, buyin, prize, site, site_tournament_id) values
 ('bc000000-0000-0000-0000-0000000000c1', current_date - 40, 'Ze Solo', 10, 30, 'GG Poker', 'T1'),
 ('bc000000-0000-0000-0000-0000000000c1', current_date - 40, 'ze solo velho', 10, 30, 'GG Poker', 'T1'),
 ('bc000000-0000-0000-0000-0000000000c1', current_date - 35, 'Ze Solo', 5, 0, 'GG Poker', null);
insert into public.hh_tournament_stats(workspace_id, player, site, site_tournament_id, entry_date) values
 ('bc000000-0000-0000-0000-0000000000c1', 'Ze Solo', 'GG Poker', 'T1', current_date - 40), ('bc000000-0000-0000-0000-0000000000c1', 'Ze Solo', 'GG Poker', 'T2', current_date - 39);
insert into public.bankroll_ledger(workspace_id, entry_date, wallet, entrada, saida, player) values ('bc000000-0000-0000-0000-0000000000c1', current_date - 38, 'GG Poker', 100, 0, 'Ze Solo');
insert into public.player_wallets(workspace_id, player, wallet, saldo_inicial) values ('bc000000-0000-0000-0000-0000000000c1', 'Ze Solo', 'GG Poker', 100), ('bc000000-0000-0000-0000-0000000000c1', 'Ze Solo', 'PokerStars', 50);
insert into public.config_changes(workspace_id, field, resumo) values ('bc000000-0000-0000-0000-0000000000c1', 'abi_max', 'teste');

set role authenticated;
-- ---------- 1) convite pessoal pro "Jason Craig", que já tinha criado a conta (individual e vazia) ----------
select teste.como('ba000000-0000-0000-0000-0000000000a1');
insert into teste.e(nome, id) select 'jason', public.convidar_jogador(teste.eid('E1'), 'Jason Craig');
insert into teste.e(nome, t) select 'tk_jason', public.criar_convite(teste.eid('E1'), teste.eid('jason'));
insert into teste.e(nome, t) select 'tk_aberto', public.criar_convite(teste.eid('E1'), null, 7, 10);
select teste.como('ba000000-0000-0000-0000-0000000000c4');
select teste.ok('Jason (conta que já existia) aceita o convite pessoal', $q$select public.aceitar_convite(teste.et('tk_jason'))$q$);
reset role;
select teste.igual('…entrou como Jason Craig, ativo, na Reta E1, e a conta individual vazia deixou de existir',
  $q$select (select status||'/'||(user_id = 'ba000000-0000-0000-0000-0000000000c4')::text from public.pessoa where id = teste.eid('jason'))||'/'||
            (select u.nome from public.vinculo v join public.unidade u on u.id = v.unidade_id where v.pessoa_id = teste.eid('jason') and v.fim is null)||'/'||
            (select count(*) from public.workspaces where id = 'bc000000-0000-0000-0000-0000000000c4')||'/'||
            (select count(*) from public.workspace_members where user_id = 'ba000000-0000-0000-0000-0000000000c4' and workspace_id = teste.eid('ws'))$q$,
  'ativo/true/Reta E1/0/1');
set role authenticated;

-- ---------- 2) link aberto aceito por quem já usava o app (com histórico): a conta vira do time ----------
select teste.como('ba000000-0000-0000-0000-0000000000c1');
select teste.ok('Ze Solo (conta individual com histórico) aceita o link aberto', $q$select public.aceitar_convite(teste.et('tk_aberto'))$q$);
reset role;
select teste.igual('o histórico foi pro time no nome dele (o mesmo torneio lançado 2 vezes ficou 1) e a conta individual sumiu',
  $q$select (select count(*) from public.tournaments where workspace_id = teste.eid('ws') and player = 'Ze Solo')||' torneios/'||
            (select count(*) from public.hh_tournament_stats where workspace_id = teste.eid('ws') and player = 'Ze Solo')||' stats/'||
            (select count(*) from public.bankroll_ledger where workspace_id = teste.eid('ws') and player = 'Ze Solo')||' mov/'||
            (select count(*) from public.workspaces where id = 'bc000000-0000-0000-0000-0000000000c1')||' conta/'||
            (select count(*) from public.tournaments where workspace_id = 'bc000000-0000-0000-0000-0000000000c1')||' sobrou'$q$,
  '2 torneios/2 stats/1 mov/0 conta/0 sobrou');
select teste.igual('…ligado à pessoa dele; é histórico de antes do time (raiz) e fica fora da banca do time',
  $q$select (select count(*) from public.tournaments t join public.pessoa p on p.id = t.pessoa_id where t.workspace_id = teste.eid('ws') and p.nome = 'Ze Solo' and t.unidade_id = teste.eid('R'))||'/'||
            (public.banca_de((select id from public.pessoa where workspace_id = teste.eid('ws') and nome = 'Ze Solo'))->>'banca')$q$, '2/0.00');
select teste.igual('…as salas e a config da conta individual ficaram guardadas (não entram na banca do time)',
  $q$select jsonb_array_length(dados->'salas')||' salas/'||jsonb_array_length(dados->'config')||' config/'||jsonb_array_length(dados->'ajustes')||' ajuste'
     from public.conta_individual_arquivada where user_id = 'ba000000-0000-0000-0000-0000000000c1'$q$, '2 salas/1 config/1 ajuste');
set role authenticated;
select teste.como('ba000000-0000-0000-0000-0000000000b1');
select teste.igual('o professor da Reta E1 não vê o histórico de antes do time (regra da fase 1)',
  $q$select count(*)::text from public.tournaments where player = 'Ze Solo'$q$, '0');
select teste.como('ba000000-0000-0000-0000-0000000000c1');
select teste.igual('o próprio Ze Solo vê o histórico dele no time', $q$select count(*)::text from public.tournaments where player = 'Ze Solo'$q$, '2');

-- ---------- 3) quem não pode entrar assim ----------
select teste.como('ba000000-0000-0000-0000-0000000000c2');
select teste.erro_qualquer('conta individual com plano pago ativo NÃO entra direto (fala com o suporte)', $q$select public.aceitar_convite(teste.et('tk_aberto'))$q$);
select teste.como('ba000000-0000-0000-0000-0000000000c3');
select teste.erro_qualquer('conta que está em OUTRO time NÃO entra', $q$select public.aceitar_convite(teste.et('tk_aberto'))$q$);
reset role;
select teste.igual('…e nada mudou pra eles (a conta paga e a do outro time continuam lá)',
  $q$select (select count(*) from public.workspaces where id in ('bc000000-0000-0000-0000-0000000000c2','bc000000-0000-0000-0000-0000000000c3'))||'/'||
            (select count(*) from public.pessoa where user_id in ('ba000000-0000-0000-0000-0000000000c2','ba000000-0000-0000-0000-0000000000c3'))$q$, '2/0');
set role authenticated;

-- ---------- 4) código do time ----------
select teste.como('ba000000-0000-0000-0000-0000000000b1');
select teste.erro('G (gere pessoas só na E1) NÃO gera o código do time inteiro', $q$select public.gerar_codigo_time()$q$);
select teste.como('ba000000-0000-0000-0000-0000000000a1');
insert into teste.e(nome, t) select 'cod', public.gerar_codigo_time();
select teste.igual('A gera o código: nome do time + 5 números', $q$select (teste.et('cod') ~ '^ENTRADA-[0-9]{5}$')::text$q$, 'true');
select teste.igual('quem vê o código: só quem gere pessoas no time inteiro', $q$select count(*)::text from public.time_codigo$q$, '1');
select teste.como('ba000000-0000-0000-0000-0000000000b1');
select teste.igual('…o G não vê', $q$select count(*)::text from public.time_codigo$q$, '0');
select teste.como('ba000000-0000-0000-0000-0000000000c5');
select teste.erro_qualquer('código errado', $q$select public.pedir_entrada_time('ENTRADA-00000x')$q$);
select teste.igual('Cinco pede pelo código (minúsculo e com espaço nas pontas também vale)', $q$select public.pedir_entrada_time('  ' || lower(teste.et('cod')) || ' ')->>'status'$q$, 'pendente');
select teste.igual('…pedir de novo não duplica', $q$select count(*)::text from (select public.pedir_entrada_time(teste.et('cod'))) x, public.pedido_entrada where user_id = auth.uid()$q$, '1');
select teste.igual('…e ainda não está no time (pendente)', $q$select count(*)::text from public.pessoa where user_id = auth.uid()$q$, '0');
select teste.como('ba000000-0000-0000-0000-0000000000c6');
select teste.ok('Seis pede pelo código', $q$select public.pedir_entrada_time(teste.et('cod'))$q$);
select teste.igual('Seis não vê o pedido do Cinco', $q$select count(*)::text from public.pedido_entrada$q$, '1');
select teste.como('ba000000-0000-0000-0000-0000000000c3');
select teste.erro_qualquer('quem está em outro time NÃO pede', $q$select public.pedir_entrada_time(teste.et('cod'))$q$);
select teste.como('ba000000-0000-0000-0000-0000000000a1');
select teste.igual('A vê os 2 pedidos e foi avisado deles', $q$select (select count(*) from public.pedido_entrada where status = 'pendente')||'/'||(select count(*) from public.aviso where tipo = 'entrada' and titulo like '%pediu pra entrar%')$q$, '2/2');
select teste.como('ba000000-0000-0000-0000-0000000000b1');
select teste.igual('G vê os pedidos (pode aprovar na reta dele)', $q$select count(*)::text from public.pedido_entrada where status = 'pendente'$q$, '2');

-- ---------- 5) aprovar e recusar ----------
select teste.ok('G aprova o Cinco na Reta E1', $q$select public.decidir_entrada((select id from public.pedido_entrada where nome = 'Cinco'), true, teste.eid('E1'), null, null)$q$);
select teste.erro('G NÃO aprova o Seis na Reta E2 (não é dele)', $q$select public.decidir_entrada((select id from public.pedido_entrada where nome = 'Seis'), true, teste.eid('E2'), null, null)$q$);
select teste.como('ba000000-0000-0000-0000-0000000000a1');
select teste.ok('A aprova o Seis deixando a reta pra depois (fica na raiz)', $q$select public.decidir_entrada((select id from public.pedido_entrada where nome = 'Seis'), true, null, 'Seis Silva', null)$q$);
reset role;
select teste.igual('Cinco na E1 e Seis Silva na raiz, ativos, contas individuais convertidas; pedidos aprovados',
  $q$select string_agg(p.nome||':'||u.nome||':'||p.status, ',' order by p.nome)||'/'||
            (select count(*) from public.workspaces where id in ('bc000000-0000-0000-0000-0000000000c5','bc000000-0000-0000-0000-0000000000c6'))||'/'||
            (select string_agg(status, ',' order by nome) from public.pedido_entrada where nome in ('Cinco','Seis'))
     from public.pessoa p join public.vinculo v on v.pessoa_id = p.id and v.fim is null join public.unidade u on u.id = v.unidade_id
    where p.workspace_id = teste.eid('ws') and p.nome in ('Cinco','Seis Silva')$q$, 'Cinco:Reta E1:ativo,Seis Silva:Entrada:ativo/0/aprovado,aprovado');
set role authenticated;
select teste.como('ba000000-0000-0000-0000-0000000000c5');
select teste.igual('Cinco recebeu o aviso de que entrou e já vê o time', $q$select (select titulo from public.aviso where tipo = 'entrada')||'/'||(select count(*) from public.resumo_time())$q$, 'Você entrou no time/1');
select teste.como('ba000000-0000-0000-0000-0000000000c7');
insert into teste.e(nome, id) select 'ped7', (public.pedir_entrada_time(teste.et('cod'))->>'pedido')::uuid;
select teste.como('ba000000-0000-0000-0000-0000000000a1');
select teste.ok('A recusa o Sete com motivo', $q$select public.decidir_entrada(teste.eid('ped7'), false, null, null, 'não é do time')$q$);
select teste.como('ba000000-0000-0000-0000-0000000000c7');
select teste.igual('Sete vê que foi recusado e o motivo', $q$select status||': '||motivo from public.pedido_entrada where id = teste.eid('ped7')$q$, 'recusado: não é do time');
select teste.ok('…e pode pedir de novo', $q$select public.pedir_entrada_time(teste.et('cod'))$q$);
reset role;
update public.workspaces set assentos = (select count(*) from public.pessoa where workspace_id = teste.eid('ws') and status <> 'saiu') where id = teste.eid('ws');
set role authenticated;
select teste.como('ba000000-0000-0000-0000-0000000000a1');
select teste.erro_qualquer('time sem assento livre: aprovar é recusado', $q$select public.decidir_entrada((select id from public.pedido_entrada where nome = 'Sete' and status = 'pendente'), true, teste.eid('E2'), null, null)$q$);
reset role;
select teste.igual('…e o pedido continua pendente', $q$select count(*)::text from public.pedido_entrada where nome = 'Sete' and status = 'pendente'$q$, '1');
update public.workspaces set assentos = null where id = teste.eid('ws');
set role authenticated;
select teste.como('ba000000-0000-0000-0000-0000000000c7');
select teste.ok('Sete (com pedido pendente) entra pelo link aberto', $q$select public.aceitar_convite(teste.et('tk_aberto'))$q$);
select teste.igual('…e o pedido pendente dele é cancelado sozinho', $q$select string_agg(status, ',' order by criado_em) from public.pedido_entrada$q$, 'recusado,cancelado');
select teste.como('ba000000-0000-0000-0000-0000000000a1');
select teste.erro_qualquer('pedido que não está mais pendente não se decide de novo', $q$select public.decidir_entrada(teste.eid('ped7'), true, teste.eid('E2'), null, null)$q$);
reset role;
