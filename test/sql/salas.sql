-- Dinheiro por sala (pedido do dono, 20/11). Time "Salas": A admin · F financeiro (raiz) · P professor da reta (só
-- desempenho) · J joga na reta, com GG Poker e PokerStars.
\set ON_ERROR_STOP 1
reset role;
create table teste.sl(nome text primary key, id uuid);
grant select, insert on teste.sl to authenticated;
create or replace function teste.slid(n text) returns uuid language sql stable as $$ select id from teste.sl where nome = n $$;
grant execute on function teste.slid(text) to authenticated;

-- ---------- a chave da sala ----------
select teste.igual('nomes da mesma sala viram a mesma chave (GG, PS, PS.es, WPN/ACR, Party, 888) e o resto fica como está',
  $q$select string_agg(coalesce(public.sala_chave(n), '∅'), ' ' order by o) from unnest(array['GG Poker','gg','Natural8','PokerStars','PS','PS.es','PokerStars.es',
     'ACR','WPN','Americas Cardroom','partypoker','888poker','Winamax','']) with ordinality x(n, o)$q$,
  'gg gg gg ps ps pses pses wpn wpn wpn party 888 winamax ∅');

insert into auth.users(id, email, email_confirmed_at) select ('f5000000-0000-0000-0000-0000000000' || n)::uuid, 's' || n || '@salas.test', now()
  from unnest(array['a1','f1','b1','c1']) n;
insert into teste.sl select 'ws', public.criar_time('Salas', 'f5000000-0000-0000-0000-0000000000a1', 'Admin S', null);
insert into teste.sl select 'R', id from public.unidade where workspace_id = teste.slid('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome) values (teste.slid('ws'), teste.slid('R'), 'Reta S');
insert into teste.sl select 'U', id from public.unidade where workspace_id = teste.slid('ws') and nome = 'Reta S';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values
 ('f6000000-0000-0000-0000-0000000000f1', teste.slid('ws'), 'f5000000-0000-0000-0000-0000000000f1', 'Fin S', 'ativo'),
 ('f6000000-0000-0000-0000-0000000000b1', teste.slid('ws'), 'f5000000-0000-0000-0000-0000000000b1', 'Prof S', 'ativo'),
 ('f6000000-0000-0000-0000-0000000000c1', teste.slid('ws'), 'f5000000-0000-0000-0000-0000000000c1', 'Joga S', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values
 ('f6000000-0000-0000-0000-0000000000f1', teste.slid('R'), array['ver_financeiro','aprovar_saques']),
 ('f6000000-0000-0000-0000-0000000000b1', teste.slid('U'), array['ver_desempenho']);
insert into public.vinculo(pessoa_id, unidade_id, inicio) values ('f6000000-0000-0000-0000-0000000000c1', teste.slid('U'), current_date - 20);
insert into public.workspace_members(workspace_id, user_id, role) select teste.slid('ws'), ('f5000000-0000-0000-0000-0000000000' || n)::uuid, 'member'
  from unnest(array['f1','b1','c1']) n;

set role authenticated;
select teste.como('f5000000-0000-0000-0000-0000000000a1');
select teste.ok('contrato 35% até 10k, 40% depois; reserva de 50 por sala', $q$select public.definir_contrato(teste.slid('R'), null, '[{"ate":10000,"jogador":0.35},{"ate":null,"jogador":0.40}]'::jsonb);
  select public.definir_regra(teste.slid('R'), 'reserva_por_sala', '50'::jsonb)$q$);
select teste.como('f5000000-0000-0000-0000-0000000000c1');
select teste.ok('J cadastra GG Poker e PokerStars (0 cada)', $q$insert into public.player_wallets(player, wallet, saldo_inicial) values ('Joga S', 'GG Poker', 0), ('Joga S', 'PokerStars', 0)$q$);
select teste.como('f5000000-0000-0000-0000-0000000000f1');
select teste.ok('F manda 200 de capital na GG (escrito "GG")', $q$select public.registrar_aporte('f6000000-0000-0000-0000-0000000000c1', 200, null, null, 'GG')$q$);
select teste.como('f5000000-0000-0000-0000-0000000000c1');
create temp table rl(id uuid); reset role; grant all on rl to authenticated; set role authenticated;
select teste.como('f5000000-0000-0000-0000-0000000000c1');
insert into rl select public.pedir_reload(100, 'PS', 'quebrei a PS');
select teste.como('f5000000-0000-0000-0000-0000000000f1');
select teste.ok('F aprova e manda o reload de 100 na PS', $q$select public.decidir_reload((select id from rl), true); select public.confirmar_envio_reload((select id from rl), 100)$q$);
reset role;
select teste.igual('o capital do reload foi pra sala do reload', $q$select string_agg(coalesce(sala, '∅') || ':' || valor, ',' order by valor) from public.aporte where pessoa_id = 'f6000000-0000-0000-0000-0000000000c1'$q$, 'PS:100.00,GG:200.00');
set role authenticated;
select teste.como('f5000000-0000-0000-0000-0000000000c1');
select teste.ok('J joga: +300 na GG, −20 na PokerStars, e paga 10 de taxa na GG',
  $q$insert into public.tournaments(entry_date, player, buyin, prize, site) values (current_date - 3, 'Joga S', 0, 300, 'GG Poker'), (current_date - 2, 'Joga S', 20, 0, 'PokerStars');
     insert into public.bankroll_ledger(entry_date, wallet, entrada, saida, player) values (current_date - 2, 'GG Poker', 0, 10, 'Joga S')$q$);

-- ---------- saldo por sala: a soma é a banca ----------
select teste.igual('por sala: GG 0 + 200 + 300 − 10 = 490; PS 0 + 100 − 20 = 80; total 570 = banca; nada sem sala',
  $q$select string_agg((x->>'sala') || ' ' || (x->>'saldo'), ' · ' order by x->>'sala') || ' | ' || (s->>'total') || ' = ' || (s->>'banca') || ' | sem sala ' || (s->>'sem_sala')
     from (select public.salas_jogador('f6000000-0000-0000-0000-0000000000c1') s) y cross join lateral jsonb_array_elements(s->'salas') x group by s$q$,
  'GG Poker 490.00 · PokerStars 80.00 | 570.00 = 570.00 | sem sala 0');
select teste.como('f5000000-0000-0000-0000-0000000000b1');
select teste.erro('P (sem ver dinheiro) NÃO vê as salas do J', $q$select public.salas_jogador('f6000000-0000-0000-0000-0000000000c1')$q$);
select teste.como('f5000000-0000-0000-0000-0000000000f1');
select teste.igual('F vê as mesmas salas', $q$select public.salas_jogador('f6000000-0000-0000-0000-0000000000c1')->>'total'$q$, '570.00');

-- ---------- conferência: o jogador lança, o sistema compara e avisa quem vê o dinheiro ----------
select teste.erro('F NÃO lança saldo (só quem joga)', $q$select public.conferir_saldos('[{"sala":"GG","saldo":1}]'::jsonb)$q$);
select teste.como('f5000000-0000-0000-0000-0000000000c1');
select teste.erro_qualquer('sala repetida ("GG" e "GG Poker")', $q$select public.conferir_saldos('[{"sala":"GG","saldo":1},{"sala":"GG Poker","saldo":2}]'::jsonb)$q$);
select teste.erro_qualquer('saldo negativo', $q$select public.conferir_saldos('[{"sala":"GG","saldo":-1}]'::jsonb)$q$);
select teste.igual('J lança GG 490 e PS 85: a PS diverge em +5 (e o total também)',
  $q$select concat_ws(' | ', (select string_agg((l->>'sala') || ' ' || coalesce(l->>'diferenca', '-'), ', ' order by l->>'sala') from jsonb_array_elements(r->'salas') l),
     r->>'total_informado', r->>'total_sistema', r->>'diferenca', r->>'diverge')
     from (select public.conferir_saldos('[{"sala":"GG","saldo":490},{"sala":"PokerStars","saldo":85}]'::jsonb) r) x$q$,
  'GG Poker 0.00, PokerStars 5.00 | 575.00 | 570.00 | 5.00 | true');
reset role;
select teste.igual('…e quem vê o dinheiro do time recebe o aviso (o professor só de desempenho não)',
  $q$select string_agg(u.n || '=' || (select count(*) from public.aviso a where a.tipo = 'saldo' and a.user_id = u.id), ' ' order by u.n)
     from (values ('A','f5000000-0000-0000-0000-0000000000a1'::uuid), ('F','f5000000-0000-0000-0000-0000000000f1'::uuid), ('P','f5000000-0000-0000-0000-0000000000b1'::uuid)) u(n, id)$q$,
  'A=1 F=1 P=0');
set role authenticated;
select teste.como('f5000000-0000-0000-0000-0000000000c1');
select teste.igual('lançando certo (GG Poker 490, PS 80): nada diverge, sem aviso novo',
  $q$select (public.conferir_saldos('[{"sala":"GG Poker","saldo":490},{"sala":"PS","saldo":80}]'::jsonb)->>'diverge')$q$, 'false');
select teste.igual('a conferência: o J e quem vê dinheiro leem; o professor só de desempenho não',
  $q$select (select count(*) from public.conferencia_saldo)::text$q$, '2');
select teste.como('f5000000-0000-0000-0000-0000000000b1');
select teste.igual('…P não lê', $q$select (select count(*) from public.conferencia_saldo)::text$q$, '0');
select teste.como('f5000000-0000-0000-0000-0000000000a1');
select teste.igual('…o admin lê, e a última vem junto com as salas', $q$select (select count(*) from public.conferencia_saldo)||'/'||(public.salas_jogador('f6000000-0000-0000-0000-0000000000c1')->'ultima_conferencia'->>'diverge')$q$, '2/false');

-- ---------- sugestão por sala: deixa 50 em cada uma ----------
select teste.como('f5000000-0000-0000-0000-0000000000c1');
select teste.igual('sugestão: devolve os 300 de MU e saca 170 (profit 270, mas só 470 sobram acima da reserva), tirando 440 da GG e 30 da PS',
  $q$select concat_ws(' | ', s->>'por_sala', s->>'devolucao', s->>'cashout', s->>'banca_depois', (select string_agg((d->>'sala') || ' ' || (d->>'sacar'), ', ' order by d->>'sala') from jsonb_array_elements(s->'de_onde') d))
     from (select public.sugerir_saque('f6000000-0000-0000-0000-0000000000c1') s) x$q$,
  'true | 300.00 | 170.00 | 100.00 | GG Poker 440.00, PokerStars 30.00');

-- ---------- saque por sala ----------
create temp table sq(n int, id uuid); reset role; grant all on sq to authenticated; set role authenticated;
select teste.como('f5000000-0000-0000-0000-0000000000c1');
select teste.erro_qualquer('o que sai das salas não fecha com devolução + cashout', $q$select public.solicitar_saque(570, 300, 170, '[{"sala":"GG Poker","saldo":490,"valor":400},{"sala":"PokerStars","saldo":80,"valor":30}]'::jsonb)$q$);
select teste.erro_qualquer('sacar de uma sala mais do que ela tem', $q$select public.solicitar_saque(570, 300, 170, '[{"sala":"GG Poker","saldo":490,"valor":380},{"sala":"PokerStars","saldo":80,"valor":90}]'::jsonb)$q$);
select teste.erro_qualquer('banca diferente da soma das salas', $q$select public.solicitar_saque(600, 300, 170, '[{"sala":"GG Poker","saldo":490,"valor":440},{"sala":"PokerStars","saldo":80,"valor":30}]'::jsonb)$q$);
select teste.erro_qualquer('a mesma sala duas vezes', $q$select public.solicitar_saque(570, 300, 170, '[{"sala":"GG","saldo":490,"valor":440},{"sala":"GG Poker","saldo":80,"valor":30}]'::jsonb)$q$);
insert into sq select 1, public.solicitar_saque(570, 300, 170, '[{"sala":"GG Poker","saldo":490,"valor":440},{"sala":"PokerStars","saldo":80,"valor":30}]'::jsonb);
select teste.igual('o pedido guarda cada sala com o saldo dela no sistema na hora',
  $q$select string_agg((c->>'chave') || ' ' || (c->>'saldo') || '/' || (c->>'sistema') || ' sai ' || (c->>'valor'), ', ' order by c->>'chave') from public.saque q cross join lateral jsonb_array_elements(q.carteiras) c where q.id = (select id from sq where n = 1)$q$,
  'gg 490.00/490.00 sai 440.00, ps 80.00/80.00 sai 30.00');
select teste.como('f5000000-0000-0000-0000-0000000000f1');
select teste.ok('F aprova e recebe 410,50 (300 de MU + 65% de 170)', $q$select public.decidir_saque((select id from sq where n = 1), true); select public.confirmar_recebimento((select id from sq where n = 1), 410.50)$q$);
select teste.igual('depois do saque pago: 50 em cada sala, total 100 = banca',
  $q$select string_agg((x->>'sala') || ' ' || (x->>'saldo'), ' · ' order by x->>'sala') || ' | ' || (s->>'total') || ' = ' || (s->>'banca')
     from (select public.salas_jogador('f6000000-0000-0000-0000-0000000000c1') s) y cross join lateral jsonb_array_elements(s->'salas') x group by s$q$,
  'GG Poker 50.00 · PokerStars 50.00 | 100.00 = 100.00');

-- ---------- saque do jeito antigo (sem dividir): vai pro "sem sala"; a soma continua sendo a banca ----------
select teste.como('f5000000-0000-0000-0000-0000000000c1');
insert into sq select 2, public.solicitar_saque(100, 0, 10, null, null);
select teste.como('f5000000-0000-0000-0000-0000000000f1');
select teste.ok('F aprova e recebe o saque sem divisão', $q$select public.decidir_saque((select id from sq where n = 2), true); select public.confirmar_recebimento((select id from sq where n = 2), (select total_time from public.saque where id = (select id from sq where n = 2)))$q$);
select teste.igual('…os 10 ficam "sem sala"; a soma (90) é a banca',
  $q$select string_agg((x->>'sala') || ' ' || (x->>'saldo'), ' · ' order by (x->>'chave') is null, x->>'sala') || ' | ' || (s->>'total') || ' = ' || (s->>'banca')
     from (select public.salas_jogador('f6000000-0000-0000-0000-0000000000c1') s) y cross join lateral jsonb_array_elements(s->'salas') x group by s$q$,
  'GG Poker 50.00 · PokerStars 50.00 · sem sala -10.00 | 90.00 = 90.00');
select teste.como('f5000000-0000-0000-0000-0000000000c1');
select teste.igual('com dinheiro sem sala, a sugestão volta pra conta do total (não divide por sala)',
  $q$select (public.sugerir_saque('f6000000-0000-0000-0000-0000000000c1')->>'por_sala')$q$, 'false');
reset role;
