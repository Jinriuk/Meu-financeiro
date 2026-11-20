-- Fase 1 · passo 2: fatos por pessoa e unidade. Roda depois do fase1.sql (usa teste.* e teste.como).
-- Time F: raiz > Base > (Reta A, Reta B) e Principal.
--   c1 admin (dono) · c2 professor da Base (só desempenho) · c3 financeiro (dinheiro do time inteiro, aprova saques)
--   c4 João joga na Reta A · c5 Maria joga na Reta B · c6 Pedro joga no Principal
-- Solo S (c7, sem estrutura) · Pool P (c8 Ana e c9 Beto, sócios, estruturado no fim) · c10 de fora.
\set ON_ERROR_STOP 1
reset role;
insert into auth.users(id,email,email_confirmed_at) select ('c0000000-0000-0000-0000-0000000000' || n)::uuid, 'u' || n || '@f.test', now()
  from unnest(array['c1','c2','c3','c4','c5','c6','c7','c8','c9','ca']) n;
insert into public.workspaces(id,name,kind,plan,trial_ends_at) values
 ('d0000000-0000-0000-0000-0000000000d1','Time F','team','team',null),
 ('d0000000-0000-0000-0000-0000000000d2','Solo S','solo','pro',null),
 ('d0000000-0000-0000-0000-0000000000d3','Pool P','team','team',null),
 ('d0000000-0000-0000-0000-0000000000d4','Fora','solo','pro',null);
insert into public.workspace_members(workspace_id,user_id,role) values
 ('d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c1','owner'),
 ('d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c2','member'),
 ('d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c3','member'),
 ('d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c4','member'),
 ('d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c5','member'),
 ('d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c6','member'),
 ('d0000000-0000-0000-0000-0000000000d2','c0000000-0000-0000-0000-0000000000c7','owner'),
 ('d0000000-0000-0000-0000-0000000000d3','c0000000-0000-0000-0000-0000000000c8','owner'),
 ('d0000000-0000-0000-0000-0000000000d3','c0000000-0000-0000-0000-0000000000c9','owner'),
 ('d0000000-0000-0000-0000-0000000000d4','c0000000-0000-0000-0000-0000000000ca','owner');

-- estrutura do Time F (direto como servidor; as RPCs já foram testadas no fase1.sql)
insert into public.unidade(id,workspace_id,mae_id,nome) values
 ('e0000000-0000-0000-0000-0000000000e1','d0000000-0000-0000-0000-0000000000d1',null,'Time F');
insert into public.unidade(id,workspace_id,mae_id,nome) values
 ('e0000000-0000-0000-0000-0000000000e2','d0000000-0000-0000-0000-0000000000d1','e0000000-0000-0000-0000-0000000000e1','Base'),
 ('e0000000-0000-0000-0000-0000000000e5','d0000000-0000-0000-0000-0000000000d1','e0000000-0000-0000-0000-0000000000e1','Principal');
insert into public.unidade(id,workspace_id,mae_id,nome) values
 ('e0000000-0000-0000-0000-0000000000e3','d0000000-0000-0000-0000-0000000000d1','e0000000-0000-0000-0000-0000000000e2','Reta A'),
 ('e0000000-0000-0000-0000-0000000000e4','d0000000-0000-0000-0000-0000000000d1','e0000000-0000-0000-0000-0000000000e2','Reta B');
insert into public.pessoa(id,workspace_id,user_id,nome,status) values
 ('f0000000-0000-0000-0000-0000000000f1','d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c1','Admin','ativo'),
 ('f0000000-0000-0000-0000-0000000000f2','d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c2','Professor','ativo'),
 ('f0000000-0000-0000-0000-0000000000f3','d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c3','Financeiro','ativo'),
 ('f0000000-0000-0000-0000-0000000000f4','d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c4','João','ativo'),
 ('f0000000-0000-0000-0000-0000000000f5','d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c5','Maria','ativo'),
 ('f0000000-0000-0000-0000-0000000000f6','d0000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000c6','Pedro','ativo');
insert into public.vinculo(pessoa_id,unidade_id,inicio) values
 ('f0000000-0000-0000-0000-0000000000f4','e0000000-0000-0000-0000-0000000000e3',current_date-30),
 ('f0000000-0000-0000-0000-0000000000f5','e0000000-0000-0000-0000-0000000000e4',current_date-30),
 ('f0000000-0000-0000-0000-0000000000f6','e0000000-0000-0000-0000-0000000000e5',current_date-30);
insert into public.acesso(pessoa_id,unidade_id,capacidades) values
 ('f0000000-0000-0000-0000-0000000000f1','e0000000-0000-0000-0000-0000000000e1',array['administrar']),
 ('f0000000-0000-0000-0000-0000000000f2','e0000000-0000-0000-0000-0000000000e2',array['ver_desempenho']),
 ('f0000000-0000-0000-0000-0000000000f3','e0000000-0000-0000-0000-0000000000e1',array['ver_financeiro','aprovar_saques']);
insert into public.pool_config(workspace_id,abi_max) values ('d0000000-0000-0000-0000-0000000000d1',2), ('d0000000-0000-0000-0000-0000000000d3',3);

-- fatos já existentes (gravados pelo servidor, como os de hoje): pessoa e unidade saem do nome e da data
insert into public.tournaments(workspace_id,entry_date,player,buyin,prize) values
 ('d0000000-0000-0000-0000-0000000000d1',current_date-10,'João',10,0),
 ('d0000000-0000-0000-0000-0000000000d1',current_date-10,'joão ',5,30),          -- caixa e espaço diferentes
 ('d0000000-0000-0000-0000-0000000000d1',current_date-9,'Maria',20,50),
 ('d0000000-0000-0000-0000-0000000000d1',current_date-8,'Pedro',50,0),
 ('d0000000-0000-0000-0000-0000000000d1',current_date-100,'João',1,0);           -- antes de entrar no time → sem unidade (só ele vê)
insert into public.withdrawals(workspace_id,week_ending_date,player,valor_sacado) values
 ('d0000000-0000-0000-0000-0000000000d1',current_date-7,'João',100),
 ('d0000000-0000-0000-0000-0000000000d1',current_date-7,'Pedro',300);
insert into public.bankroll_ledger(workspace_id,entry_date,wallet,entrada,player) values
 ('d0000000-0000-0000-0000-0000000000d1',current_date-7,'GG',500,'João'),
 ('d0000000-0000-0000-0000-0000000000d1',current_date-7,'Reserva',1000,null);    -- movimento do time, sem jogador

select teste.igual('gatilho liga o nome à pessoa (caixa/espaço não importam)',
  $q$select count(*)::text from public.tournaments where pessoa_id='f0000000-0000-0000-0000-0000000000f4'$q$, '3');
select teste.igual('fato na reta do jogador na data',
  $q$select string_agg(distinct u.nome, ',') from public.tournaments t join public.unidade u on u.id=t.unidade_id where t.player='Maria'$q$, 'Reta B');
select teste.igual('fato de antes de entrar no time fica sem unidade (só o jogador vê)',
  $q$select coalesce(t.unidade_id::text, 'sem unidade') from public.tournaments t where t.entry_date=current_date-100$q$, 'sem unidade');
select teste.igual('movimento sem jogador fica na raiz',
  $q$select u.nome from public.bankroll_ledger b join public.unidade u on u.id=b.unidade_id where b.wallet='Reserva'$q$, 'Time F');

set role authenticated;

-- ---------- João: jogador ----------
select teste.como('c0000000-0000-0000-0000-0000000000c4');
select teste.igual('João vê só os torneios dele (inclui os de antes do time)', $q$select count(*)::text from public.tournaments$q$, '3');
select teste.igual('João vê só o dinheiro dele', $q$select (select count(*) from public.withdrawals)||'/'||(select count(*) from public.bankroll_ledger)$q$, '1/1');
select teste.ok('João lança torneio dele', $q$insert into public.tournaments(entry_date,player,buyin) values (current_date-1,'João',3)$q$);
select teste.igual('…e o torneio cai na Reta A', $q$select u.nome from public.tournaments t join public.unidade u on u.id=t.unidade_id where t.entry_date=current_date-1$q$, 'Reta A');
select teste.erro('João NÃO lança torneio no nome da Maria', $q$insert into public.tournaments(entry_date,player,buyin) values (current_date,'Maria',3)$q$);
select teste.erro('João NÃO lança com nome que não é de ninguém', $q$insert into public.tournaments(entry_date,player,buyin) values (current_date,'Fulano',3)$q$);
select teste.erro('João NÃO passa torneio dele pra Maria', $q$update public.tournaments set player='Maria' where entry_date=current_date-1$q$);
select teste.erro('João NÃO força pessoa_id da Maria', $q$insert into public.bankroll_ledger(entry_date,wallet,entrada,pessoa_id) values (current_date,'GG',1,'f0000000-0000-0000-0000-0000000000f5')$q$);
select teste.ok('João lança stats e importação dele', $q$insert into public.hh_tournament_stats(player,site,site_tournament_id,entry_date,hands) values ('João','GG','t1',current_date-2,50); insert into public.hh_import_log(player,saved) values ('João',1)$q$);
select teste.ok('João reimporta as stats dele (upsert do app)', $q$insert into public.hh_tournament_stats(player,site,site_tournament_id,entry_date,hands) values ('João','GG','t1',current_date-2,60)
  on conflict (workspace_id,player,site,site_tournament_id) do update set hands=excluded.hands$q$);
select teste.igual('…e o upsert atualizou', $q$select hands::text from public.hh_tournament_stats where site_tournament_id='t1'$q$, '60');
select teste.ok('João tenta apagar torneios da Maria', $q$delete from public.tournaments where player='Maria'$q$);
select teste.igual('João lê a configuração do time', $q$select abi_max::text from public.pool_config$q$, '2');
select teste.erro('João NÃO muda a configuração do time', $q$update public.pool_config set abi_max=50$q$);
select teste.erro('João NÃO registra mudança de configuração', $q$insert into public.config_changes(field,resumo) values ('abi_max','hack')$q$);

-- ---------- Professor da Base: só desempenho, só da Base ----------
select teste.como('c0000000-0000-0000-0000-0000000000c2');
select teste.igual('Professor vê torneios de João e Maria (na Base), não Pedro nem o de antes do time',
  $q$select string_agg(player||':'||n, ',' order by player) from (select lower(btrim(player)) player, count(*) n from public.tournaments group by 1) x$q$, 'joão:3,maria:1');
select teste.ok('Professor tenta apagar torneios da Base', $q$delete from public.tournaments$q$);
select teste.igual('Professor vê stats da Base', $q$select count(*)::text from public.hh_tournament_stats$q$, '1');
select teste.igual('Professor NÃO vê dinheiro', $q$select (select count(*) from public.withdrawals)+(select count(*) from public.bankroll_ledger)+(select count(*) from public.player_wallets)||''$q$, '0');
select teste.erro('Professor NÃO edita torneio do João (403, não "0 linhas")', $q$update public.tournaments set buyin=999 where player='João'$q$);
select teste.erro('Professor NÃO lança torneio pro João', $q$insert into public.tournaments(entry_date,player,buyin) values (current_date,'João',3)$q$);

-- ---------- Financeiro: dinheiro do time inteiro, nada de desempenho ----------
select teste.como('c0000000-0000-0000-0000-0000000000c3');
select teste.igual('Financeiro vê todos os saques e movimentos (inclui a Reserva)', $q$select (select count(*) from public.withdrawals)||'/'||(select count(*) from public.bankroll_ledger)$q$, '2/2');
select teste.igual('Financeiro NÃO vê torneios nem stats', $q$select (select count(*) from public.tournaments)+(select count(*) from public.hh_tournament_stats)||''$q$, '0');
select teste.ok('Financeiro (aprovar saques) lança saque do Pedro', $q$insert into public.withdrawals(week_ending_date,player,valor_sacado) values (current_date,'Pedro',50)$q$);
select teste.erro('Financeiro NÃO lança torneio', $q$insert into public.tournaments(entry_date,player,buyin) values (current_date,'Pedro',3)$q$);

-- ---------- Admin: tudo ----------
select teste.como('c0000000-0000-0000-0000-0000000000c1');
reset role;
select teste.igual('…ninguém sem escopo de gravação apagou nada (Maria segue com 1, João com 4)',
  $q$select string_agg(lower(btrim(player))||':'||n, ',' order by 1) from (select lower(btrim(player)) player, count(*) n from public.tournaments where workspace_id='d0000000-0000-0000-0000-0000000000d1' and player in ('Maria','João','joão ') group by 1) x$q$, 'joão:4,maria:1');
set role authenticated;
select teste.como('c0000000-0000-0000-0000-0000000000c1');
select teste.igual('Admin vê os torneios do time (não o de antes da entrada do João) e todos os saques', $q$select (select count(*) from public.tournaments)||'/'||(select count(*) from public.withdrawals)$q$, '5/3');
select teste.ok('Admin muda a configuração', $q$update public.pool_config set abi_max=4; insert into public.config_changes(field,resumo) values ('abi_max','2→4')$q$);
select teste.igual('…e a mudança gravou', $q$select abi_max::text from public.pool_config$q$, '4');

-- ---------- promoção: o passado fica na reta antiga, o futuro vai pra nova ----------
select teste.ok('Admin promove João da Reta A pro Principal', $q$select public.mover_jogador('f0000000-0000-0000-0000-0000000000f4','e0000000-0000-0000-0000-0000000000e5','promocao')$q$);
select teste.ok('João lança torneio de hoje', $q$select teste.como('c0000000-0000-0000-0000-0000000000c4'); insert into public.tournaments(entry_date,player,buyin) values (current_date,'João',7)$q$);
reset role;
select teste.igual('torneios do João por unidade depois da promoção',
  $q$select string_agg(coalesce(u.nome, 'sem unidade')||':'||n, ',' order by coalesce(u.nome, 'sem unidade')) from (select unidade_id, count(*) n from public.tournaments where pessoa_id='f0000000-0000-0000-0000-0000000000f4' group by 1) x left join public.unidade u on u.id=x.unidade_id$q$,
  'Principal:1,Reta A:3,sem unidade:1');
set role authenticated;
select teste.como('c0000000-0000-0000-0000-0000000000c2');
select teste.igual('Professor continua vendo o histórico do João na Base, não o de hoje', $q$select count(*)::text from public.tournaments where lower(btrim(player))='joão'$q$, '3');

-- ---------- solo: nada muda ----------
select teste.como('c0000000-0000-0000-0000-0000000000c7');
select teste.ok('Solo lança como sempre (qualquer nome)', $q$insert into public.tournaments(entry_date,player,buyin) values (current_date,'Qualquer',5); insert into public.withdrawals(week_ending_date,player,valor_sacado) values (current_date,'Qualquer',10)$q$);
select teste.igual('Solo vê o que lançou; pessoa e unidade ficam vazias', $q$select count(*)||':'||count(pessoa_id)||':'||count(unidade_id) from public.tournaments$q$, '1:0:0');
select teste.ok('Solo muda a própria configuração', $q$insert into public.pool_config(abi_max) values (9)$q$);

-- ---------- de fora: nada ----------
select teste.como('c0000000-0000-0000-0000-0000000000ca');
select teste.igual('Quem é de fora não vê nada do Time F', $q$select (select count(*) from public.tournaments)+(select count(*) from public.withdrawals)+(select count(*) from public.pool_config)||''$q$, '0');

-- ---------- saída: perde o acesso ----------
select teste.como('c0000000-0000-0000-0000-0000000000c1');
select teste.ok('Admin registra a saída da Maria', $q$select public.registrar_saida('f0000000-0000-0000-0000-0000000000f5')$q$);
select teste.como('c0000000-0000-0000-0000-0000000000c5');
select teste.igual('Maria, depois de sair, não lê mais nada do time', $q$select (select count(*) from public.tournaments)+(select count(*) from public.pool_config)+(select count(*) from public.unidade)||''$q$, '0');
reset role;
select teste.igual('…e os torneios dela continuam no time, na Reta B', $q$select string_agg(u.nome, ',') from public.tournaments t join public.unidade u on u.id=t.unidade_id where t.player='Maria'$q$, 'Reta B');

-- ---------- pool de sócios: estruturar sem mudar nada do que eles veem ----------
insert into public.tournaments(workspace_id,entry_date,player,buyin,prize) values
 ('d0000000-0000-0000-0000-0000000000d3','2026-09-01','Ana',10,25), ('d0000000-0000-0000-0000-0000000000d3','2026-09-02','Ana',10,0),
 ('d0000000-0000-0000-0000-0000000000d3','2026-09-03','Beto',20,0), ('d0000000-0000-0000-0000-0000000000d3','2026-09-04','ana',5,40);
insert into public.withdrawals(workspace_id,week_ending_date,player,valor_sacado) values
 ('d0000000-0000-0000-0000-0000000000d3','2026-10-05','Ana',200), ('d0000000-0000-0000-0000-0000000000d3','2026-10-05','Beto',310);
insert into public.bankroll_ledger(workspace_id,entry_date,wallet,entrada,saida,player) values
 ('d0000000-0000-0000-0000-0000000000d3','2026-10-05','PS',0,50,null), ('d0000000-0000-0000-0000-0000000000d3','2026-10-05','GG',100,0,'Beto');
create temp table antes as select 'x'::text k, ''::text v limit 0;
grant all on antes to authenticated;
set role authenticated;
select teste.como('c0000000-0000-0000-0000-0000000000c8');
insert into antes select 'ana', string_agg(lower(player)||':'||n||':'||s, ',' order by player) from (select lower(player) player, count(*) n, sum(prize-buyin) s from public.tournaments group by 1) x;
insert into antes select 'ana$', (select sum(valor_sacado) from public.withdrawals)||'/'||(select sum(entrada-saida) from public.bankroll_ledger);
select teste.como('c0000000-0000-0000-0000-0000000000c9');
insert into antes select 'beto', string_agg(lower(player)||':'||n||':'||s, ',' order by player) from (select lower(player) player, count(*) n, sum(prize-buyin) s from public.tournaments group by 1) x;
reset role;
select teste.ok('estruturar o pool (os dois sócios administram e jogam)', $q$select public.estruturar_workspace('d0000000-0000-0000-0000-0000000000d3',
  '[{"nome":"Ana","user_id":"c0000000-0000-0000-0000-0000000000c8","admin":true},{"nome":"Beto","user_id":"c0000000-0000-0000-0000-0000000000c9","admin":true}]')$q$);
select teste.erro_qualquer('estruturar duas vezes', $q$select public.estruturar_workspace('d0000000-0000-0000-0000-0000000000d3','[]')$q$);
select teste.erro_qualquer('estruturar com conta que não é do workspace', $q$select public.estruturar_workspace('d0000000-0000-0000-0000-0000000000d2','[{"nome":"X","user_id":"c0000000-0000-0000-0000-0000000000ca"}]')$q$);
select teste.igual('todo fato do pool ficou ligado a uma pessoa (menos o movimento sem jogador)',
  $q$select (select count(*) filter (where pessoa_id is null) from public.tournaments where workspace_id='d0000000-0000-0000-0000-0000000000d3')
        ||'/'||(select count(*) filter (where pessoa_id is null) from public.bankroll_ledger where workspace_id='d0000000-0000-0000-0000-0000000000d3')$q$, '0/1');
set role authenticated;
select teste.como('c0000000-0000-0000-0000-0000000000c8');
select teste.igual('Ana: totais por jogador idênticos antes e depois',
  $q$select (select string_agg(lower(player)||':'||n||':'||s, ',' order by player) from (select lower(player) player, count(*) n, sum(prize-buyin) s from public.tournaments group by 1) x) = (select v from antes where k='ana')$q$, 'true');
select teste.igual('Ana: dinheiro idêntico antes e depois',
  $q$select ((select sum(valor_sacado) from public.withdrawals)||'/'||(select sum(entrada-saida) from public.bankroll_ledger)) = (select v from antes where k='ana$')$q$, 'true');
select teste.ok('Ana continua lançando torneio do Beto (os dois administram)', $q$insert into public.tournaments(entry_date,player,buyin) values (current_date,'Beto',1)$q$);
select teste.como('c0000000-0000-0000-0000-0000000000c9');
select teste.igual('Beto: totais idênticos (+ o torneio que a Ana lançou pra ele)',
  $q$select string_agg(lower(player)||':'||n||':'||s, ',' order by player) from (select lower(player) player, count(*) n, sum(prize-buyin) s from public.tournaments group by 1) x$q$,
  (select replace(v, 'beto:1:-20', 'beto:2:-21') from antes where k='beto'));
reset role;
