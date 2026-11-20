-- Aceite do plano mestre 3.3: o exemplo do Samba como teste automático, passo a passo, com as funções do servidor
-- (reload, torneios, saque em duas etapas) e o contrato 35% até 10k / 40% depois.
--   Passo                               Banca  MakeUp  Profit  Cashout  Lifetime  Jogador  Time
--   Time recarrega 200                    200     200       0        0         0
--   Perde 180                              20     200    −180 (MK)  0      −180
--   Ganha torneio de 380                  400     200    +200        0      +200
--   Saque: time recolhe o capital         200       0    +200        0      +200              200
--   Saque: deixa 50 em cada conta, saca 100 100      0    +100      100      +200       35     65
\set ON_ERROR_STOP 1
reset role;
insert into auth.users(id, email, email_confirmed_at) values
 ('bd000000-0000-0000-0000-0000000000a1', 'admin@exemplo.test', now()), ('bd000000-0000-0000-0000-0000000000c1', 'jogador@exemplo.test', now());
create table teste.x(nome text primary key, id uuid);
grant select, insert on teste.x to authenticated;
insert into teste.x select 'ws', public.criar_time('Exemplo Samba', 'bd000000-0000-0000-0000-0000000000a1', 'Admin X', null);
insert into teste.x select 'R', id from public.unidade where workspace_id = (select id from teste.x where nome = 'ws') and mae_id is null;
insert into public.pessoa(id, workspace_id, user_id, nome, status) values ('bd100000-0000-0000-0000-0000000000c1', (select id from teste.x where nome = 'ws'), 'bd000000-0000-0000-0000-0000000000c1', 'Jogador X', 'ativo');
insert into public.vinculo(pessoa_id, unidade_id, inicio) values ('bd100000-0000-0000-0000-0000000000c1', (select id from teste.x where nome = 'R'), current_date - 10);
insert into public.workspace_members(workspace_id, user_id, role) values ((select id from teste.x where nome = 'ws'), 'bd000000-0000-0000-0000-0000000000c1', 'member');
-- foto de cada passo, como o jogador vê: banca / MakeUp / Profit / Cashout (já sacado) / Lifetime (cashout + profit)
create or replace function teste.passo() returns text language sql as $$
  select (s->>'banca')::numeric(12,2)||' / '||(s->>'mu')::numeric(12,2)||' / '||((s->>'banca')::numeric - (s->>'mu')::numeric)::numeric(12,2)
         ||' / '||(s->>'lifetime')::numeric(12,2)||' / '||((s->>'lifetime')::numeric + (s->>'banca')::numeric - (s->>'mu')::numeric)::numeric(12,2)
    from (select public.situacao_jogador('bd100000-0000-0000-0000-0000000000c1') s) x $$;
grant execute on function teste.passo() to authenticated;

set role authenticated;
select teste.como('bd000000-0000-0000-0000-0000000000a1');
select teste.ok('contrato do time: 35% até 10k, 40% depois', $q$select public.definir_contrato((select id from teste.x where nome = 'R'), null, '[{"ate":10000,"jogador":0.35},{"ate":null,"jogador":0.40}]'::jsonb)$q$);
select teste.ok('time recarrega 200', $q$select public.registrar_aporte('bd100000-0000-0000-0000-0000000000c1', 200)$q$);
select teste.como('bd000000-0000-0000-0000-0000000000c1');
select teste.igual('exemplo 1 · recarga de 200: banca 200, MakeUp 200, profit 0', $q$select teste.passo()$q$, '200.00 / 200.00 / 0.00 / 0.00 / 0.00');
select teste.ok('perde 180', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date - 5, 'Jogador X', 180, 0)$q$);
select teste.igual('exemplo 2 · perde 180: banca 20, profit −180 (em MK), lifetime −180', $q$select teste.passo()$q$, '20.00 / 200.00 / -180.00 / 0.00 / -180.00');
select teste.ok('ganha torneio de 380', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date - 4, 'Jogador X', 0, 380)$q$);
select teste.igual('exemplo 3 · ganha 380: banca 400, profit +200', $q$select teste.passo()$q$, '400.00 / 200.00 / 200.00 / 0.00 / 200.00');
create temp table sx(n int, id uuid);
reset role; grant all on sx to authenticated; set role authenticated;
select teste.como('bd000000-0000-0000-0000-0000000000c1');
insert into sx select 1, public.solicitar_saque(400, 200, 0, null, null);
select teste.como('bd000000-0000-0000-0000-0000000000a1');
select teste.ok('time aprova o recolhimento do capital', $q$select public.decidir_saque((select id from sx where n = 1), true)$q$);
select teste.igual('time recebe os 200 do capital', $q$select public.confirmar_recebimento((select id from sx where n = 1), 200)->>'diferenca'$q$, '0.00');
select teste.como('bd000000-0000-0000-0000-0000000000c1');
select teste.igual('exemplo 4 · time recolheu o capital: banca 200, MakeUp 0, profit +200, lifetime +200', $q$select teste.passo()$q$, '200.00 / 0.00 / 200.00 / 0.00 / 200.00');
insert into sx select 2, public.solicitar_saque(200, 0, 100, null, null);
select teste.igual('exemplo 5 · saca 100 (deixa 50 em cada uma das 2 contas): jogador 35 (35% de 100: lifetime 200, abaixo de 10k), time 65',
  $q$select parte_jogador||' / '||parte_time||' / '||total_time from public.saque where id = (select id from sx where n = 2)$q$, '35.00 / 65.00 / 65.00');
select teste.como('bd000000-0000-0000-0000-0000000000a1');
select teste.ok('time aprova o saque', $q$select public.decidir_saque((select id from sx where n = 2), true)$q$);
select teste.igual('time recebe os 65', $q$select public.confirmar_recebimento((select id from sx where n = 2), 65)->>'diferenca'$q$, '0.00');
select teste.como('bd000000-0000-0000-0000-0000000000c1');
select teste.igual('exemplo 5 · depois do saque: banca 100, profit +100, cashout 100, lifetime continua +200 (sacar não muda o lifetime)',
  $q$select teste.passo()$q$, '100.00 / 0.00 / 100.00 / 100.00 / 200.00');
reset role;
