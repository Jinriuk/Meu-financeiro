-- O histórico de antes do time fica só com o jogador (decisão do dono, 20/11). Time "Histórico":
--   A admin (raiz) · F financeiro (raiz: ver e aprovar dinheiro) · P professor da Reta H1 · P2 professor da Reta H2
--   J1 tinha conta individual com histórico e é convidado pra H1 · J2 entra pelo código, espera a reta na raiz e vai pra H2
-- teste.qv(consulta) roda a mesma consulta como cada um e devolve "A=… F=… P=… P2=… J1=… J2=…".
\set ON_ERROR_STOP 1
reset role;
create table teste.h(nome text primary key, id uuid, t text);
grant select, insert, update on teste.h to authenticated;
create or replace function teste.hid(n text) returns uuid language sql stable as $$ select id from teste.h where nome = n $$;
create or replace function teste.ht(n text) returns text language sql stable as $$ select t from teste.h where nome = n $$;
create or replace function teste.qv(consulta text) returns text language plpgsql as $$
declare r record; n text; saida text := ''; antes text := current_setting('request.jwt.claims', true);
begin
  perform set_config('role', 'authenticated', true);   -- com as permissões de verdade (RLS), mesmo chamada fora do "set role"
  for r in select * from (values (1,'A','b1000000-0000-0000-0000-0000000000a1'), (2,'F','b1000000-0000-0000-0000-0000000000f1'),
      (3,'P','b1000000-0000-0000-0000-0000000000b1'), (4,'P2','b1000000-0000-0000-0000-0000000000b2'),
      (5,'J1','b1000000-0000-0000-0000-0000000000c1'), (6,'J2','b1000000-0000-0000-0000-0000000000c2')) v(o, rot, uid) order by o loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, false);
    execute consulta into n;
    saida := saida || r.rot || '=' || coalesce(n, '-') || ' ';
  end loop;
  perform set_config('request.jwt.claims', coalesce(antes, ''), false);
  return rtrim(saida);
end $$;
grant execute on function teste.hid(text), teste.ht(text), teste.qv(text) to authenticated;

insert into auth.users(id, email, email_confirmed_at) select ('b1000000-0000-0000-0000-0000000000' || n)::uuid, 'h' || n || '@historico.test', now()
  from unnest(array['a1','f1','b1','b2','c1','c2']) n;
insert into public.player_profiles(user_id, email, nickname) values
 ('b1000000-0000-0000-0000-0000000000c1', 'hc1@historico.test', 'Um Solo'), ('b1000000-0000-0000-0000-0000000000c2', 'hc2@historico.test', 'Dois Codigo');
insert into teste.h(nome, id) select 'ws', public.criar_time('Histórico', 'b1000000-0000-0000-0000-0000000000a1', 'Admin H', null);
insert into teste.h(nome, id) select 'R', id from public.unidade where workspace_id = teste.hid('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome, rotulo, ordem) values (teste.hid('ws'), teste.hid('R'), 'Reta H1', 'Reta 1', 1), (teste.hid('ws'), teste.hid('R'), 'Reta H2', 'Reta 2', 2);
insert into teste.h(nome, id) select 'H1', id from public.unidade where workspace_id = teste.hid('ws') and nome = 'Reta H1';
insert into teste.h(nome, id) select 'H2', id from public.unidade where workspace_id = teste.hid('ws') and nome = 'Reta H2';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values
 ('b3000000-0000-0000-0000-0000000000f1', teste.hid('ws'), 'b1000000-0000-0000-0000-0000000000f1', 'Fin H', 'ativo'),
 ('b3000000-0000-0000-0000-0000000000b1', teste.hid('ws'), 'b1000000-0000-0000-0000-0000000000b1', 'Prof H1', 'ativo'),
 ('b3000000-0000-0000-0000-0000000000b2', teste.hid('ws'), 'b1000000-0000-0000-0000-0000000000b2', 'Prof H2', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values
 ('b3000000-0000-0000-0000-0000000000f1', teste.hid('R'), array['ver_financeiro','aprovar_saques']),
 ('b3000000-0000-0000-0000-0000000000b1', teste.hid('H1'), array['ver_desempenho','ver_financeiro','promover']),
 ('b3000000-0000-0000-0000-0000000000b2', teste.hid('H2'), array['ver_desempenho','ver_financeiro','promover']);
insert into public.workspace_members(workspace_id, user_id, role) select teste.hid('ws'), ('b1000000-0000-0000-0000-0000000000' || n)::uuid, 'member'
  from unnest(array['f1','b1','b2']) n;
-- contas individuais: J1 com histórico (10 e 3 dias atrás), J2 vazia
insert into public.workspaces(id, name, kind, plan, trial_ends_at) values
 ('b2000000-0000-0000-0000-0000000000c1', 'Um Solo', 'solo', 'pro', now() + interval '10 days'),
 ('b2000000-0000-0000-0000-0000000000c2', 'Dois Codigo', 'solo', 'pro', now() + interval '10 days');
insert into public.workspace_members(workspace_id, user_id, role) values
 ('b2000000-0000-0000-0000-0000000000c1', 'b1000000-0000-0000-0000-0000000000c1', 'owner'), ('b2000000-0000-0000-0000-0000000000c2', 'b1000000-0000-0000-0000-0000000000c2', 'owner');
insert into public.tournaments(workspace_id, entry_date, player, buyin, prize) values
 ('b2000000-0000-0000-0000-0000000000c1', current_date - 10, 'Um Solo', 10, 0),
 ('b2000000-0000-0000-0000-0000000000c1', current_date - 3, 'Um Solo', 5, 25);
insert into public.bankroll_ledger(workspace_id, entry_date, wallet, entrada, saida, player) values ('b2000000-0000-0000-0000-0000000000c1', current_date - 3, 'GG Poker', 40, 0, 'Um Solo');

-- ---------- 1) convite feito há 5 dias, aceito hoje: a entrada é hoje e o que ele fez antes é só dele ----------
set role authenticated;
select teste.como('b1000000-0000-0000-0000-0000000000a1');
insert into teste.h(nome, id) select 'pJ1', public.convidar_jogador(teste.hid('H1'), 'Jogador H');
insert into teste.h(nome, t) select 'tk1', public.criar_convite(teste.hid('H1'), teste.hid('pJ1'));
reset role;
update public.vinculo set inicio = current_date - 5 where pessoa_id = teste.hid('pJ1');   -- o convite é de 5 dias atrás
set role authenticated;
select teste.como('b1000000-0000-0000-0000-0000000000c1');
select teste.ok('J1 aceita o convite hoje', $q$select public.aceitar_convite(teste.ht('tk1'))$q$);
reset role;
select teste.igual('a entrada no time é o dia do aceite (não o do convite)',
  $q$select (inicio = current_date)::text from public.vinculo where pessoa_id = teste.hid('pJ1')$q$, 'true');
select teste.igual('o histórico da conta individual veio no nome dele, sem unidade (antes da entrada)',
  $q$select (select count(*) from public.tournaments where pessoa_id = teste.hid('pJ1') and unidade_id is null)||'/'||
            (select count(*) from public.bankroll_ledger where pessoa_id = teste.hid('pJ1') and unidade_id is null)$q$, '2/1');
select teste.igual('…e fica fora da banca do time',
  $q$select public.banca_de(teste.hid('pJ1'))->>'banca'$q$, '0.00');
select teste.igual('torneios de antes da entrada: só o J1 vê (nem o admin)',
  $q$select teste.qv($c$select count(*)::text from public.tournaments where pessoa_id = teste.hid('pJ1')$c$)$q$, 'A=0 F=0 P=0 P2=0 J1=2 J2=0');
select teste.igual('movimento de antes da entrada: só o J1 vê',
  $q$select teste.qv($c$select count(*)::text from public.bankroll_ledger where pessoa_id = teste.hid('pJ1')$c$)$q$, 'A=0 F=0 P=0 P2=0 J1=1 J2=0');
select teste.igual('a lista do time não conta os torneios de antes da entrada',
  $q$select teste.qv($c$select coalesce((select torneios::text from public.resumo_time() where pessoa_id = teste.hid('pJ1')), '-')$c$)$q$,
  'A=0 F=- P=0 P2=- J1=0 J2=-');
set role authenticated;
select teste.como('b1000000-0000-0000-0000-0000000000a1');
select teste.ok('o admin tenta apagar e editar o histórico de antes da entrada (não enxerga: nada muda)',
  $q$delete from public.tournaments where pessoa_id = teste.hid('pJ1'); update public.bankroll_ledger set entrada = 0 where pessoa_id = teste.hid('pJ1')$q$);
reset role;
select teste.igual('…e o histórico continua igual',
  $q$select (select count(*) from public.tournaments where pessoa_id = teste.hid('pJ1'))||'/'||(select sum(entrada)::numeric(12,2) from public.bankroll_ledger where pessoa_id = teste.hid('pJ1'))$q$, '2/40.00');
set role authenticated;
select teste.como('b1000000-0000-0000-0000-0000000000c1');
select teste.ok('J1 lança um torneio hoje (−2)', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date, 'Jogador H', 2, 0)$q$);
select teste.igual('o de hoje é do time: quem cuida da H1 vê (financeiro não vê torneio)',
  $q$select teste.qv($c$select count(*)::text from public.tournaments where pessoa_id = teste.hid('pJ1')$c$)$q$, 'A=1 F=0 P=1 P2=0 J1=3 J2=0');

-- ---------- 2) planilha com saldos de antes da entrada: a entrada recua até a data da planilha, não mais ----------
select teste.ok('J1 manda a planilha de 4 dias atrás (MU 100; GG 100)',
  $q$select public.enviar_planilha(jsonb_build_object('makeup', 100, 'cashout', 0, 'atualizado_em', (current_date - 4)::text,
     'saldos', jsonb_build_array(jsonb_build_object('sala', 'GG Poker', 'saldo', 100))))$q$);
select teste.como('b1000000-0000-0000-0000-0000000000f1');
select teste.erro_qualquer('F NÃO põe a data dos saldos antes da data da planilha (puxaria o histórico de antes)',
  $q$select public.conferir_abertura(teste.hid('pJ1'), 100, 0, current_date - 20)$q$);
select teste.igual('…e nada mudou (planilha ainda pra conferir; entrada hoje)',
  $q$select (select status from public.abertura where pessoa_id = teste.hid('pJ1'))||'/'||((select min(inicio) from public.vinculo where pessoa_id = teste.hid('pJ1')) = current_date)::text$q$, 'enviada/true');
select teste.ok('F confere com a data da planilha', $q$select public.conferir_abertura(teste.hid('pJ1'), 100, 0)$q$);
reset role;
select teste.igual('a entrada recuou pro dia seguinte ao dos saldos (3 dias atrás)',
  $q$select (min(inicio) = current_date - 3)::text from public.vinculo where pessoa_id = teste.hid('pJ1')$q$, 'true');
select teste.igual('o que ele jogou depois dos saldos passa a ser do time; o de 10 dias atrás continua só dele',
  $q$select teste.qv($c$select count(*)::text from public.tournaments where pessoa_id = teste.hid('pJ1')$c$)$q$, 'A=2 F=0 P=2 P2=0 J1=3 J2=0');
select teste.igual('…o movimento de 3 dias atrás também (dinheiro: quem vê financeiro)',
  $q$select teste.qv($c$select count(*)::text from public.bankroll_ledger where pessoa_id = teste.hid('pJ1')$c$)$q$, 'A=1 F=1 P=1 P2=0 J1=1 J2=0');
select teste.igual('banca = sala da planilha 100 + torneios depois dos saldos (+20 −2) + movimento +40',
  $q$select public.banca_de(teste.hid('pJ1'))->>'banca'$q$, '158.00');
select teste.igual('…a mesma que a gestão vê na lista, e o desempenho conta os 2 torneios do time',
  $q$select teste.qv($c$select coalesce((select coalesce(banca::text, '·')||'/'||coalesce(torneios::text, '·') from public.resumo_time() where pessoa_id = teste.hid('pJ1')), '-')$c$)$q$,
  'A=158.00/2 F=158.00/· P=158.00/2 P2=- J1=158.00/2 J2=-');
set role authenticated;
select teste.como('b1000000-0000-0000-0000-0000000000f1');
select teste.ok('F corrige a planilha com uma data mais nova (a entrada não volta pra frente)', $q$select public.conferir_abertura(teste.hid('pJ1'), 100, 0, current_date - 1)$q$);
reset role;
select teste.igual('…entrada continua 3 dias atrás; a banca conta o que é depois da data nova (hoje −2)',
  $q$select ((select min(inicio) from public.vinculo where pessoa_id = teste.hid('pJ1')) = current_date - 3)::text||'/'||(public.banca_de(teste.hid('pJ1'))->>'banca')$q$, 'true/98.00');

-- ---------- 3) quem espera a reta na raiz: depois de ir pra reta, o professor dela vê esse período ----------
set role authenticated;
select teste.como('b1000000-0000-0000-0000-0000000000a1');
insert into teste.h(nome, t) select 'cod', public.gerar_codigo_time();
select teste.como('b1000000-0000-0000-0000-0000000000c2');
select teste.ok('J2 pede pelo código', $q$select public.pedir_entrada_time(teste.ht('cod'))$q$);
select teste.como('b1000000-0000-0000-0000-0000000000a1');
insert into teste.h(nome, id) select 'pJ2', public.decidir_entrada((select id from public.pedido_entrada where user_id = 'b1000000-0000-0000-0000-0000000000c2'), true, null, 'Jogador Raiz', null);
reset role;
update public.vinculo set inicio = current_date - 6 where pessoa_id = teste.hid('pJ2');   -- entrou há 6 dias
set role authenticated;
select teste.como('b1000000-0000-0000-0000-0000000000c2');
select teste.ok('J2 lança um torneio de 2 dias atrás, ainda na raiz', $q$insert into public.tournaments(entry_date, player, buyin, prize) values (current_date - 2, 'Jogador Raiz', 3, 9)$q$);
select teste.igual('na raiz: o admin vê, os professores das retas não',
  $q$select teste.qv($c$select count(*)::text from public.tournaments where pessoa_id = teste.hid('pJ2')$c$)$q$, 'A=1 F=0 P=0 P2=0 J1=0 J2=1');
select teste.como('b1000000-0000-0000-0000-0000000000a1');
select teste.ok('A manda o J2 pra Reta H2', $q$select public.mover_jogador(teste.hid('pJ2'), teste.hid('H2'), 'transferencia')$q$);
select teste.igual('o torneio continua na raiz (foi jogado lá), e o P2, que cuida dele agora, vê (é histórico de dentro do time)',
  $q$select teste.qv($c$select count(*)::text from public.tournaments where pessoa_id = teste.hid('pJ2')$c$)$q$, 'A=1 F=0 P=0 P2=1 J1=0 J2=1');

-- ---------- 4) movimento do time sem jogador continua na raiz ----------
select teste.ok('A lança um movimento do time sem jogador (Reserva)', $q$insert into public.bankroll_ledger(entry_date, wallet, entrada, saida) values (current_date, 'Reserva', 1000, 0)$q$);
select teste.igual('…só quem vê dinheiro do time inteiro vê',
  $q$select teste.qv($c$select count(*)::text from public.bankroll_ledger where pessoa_id is null and workspace_id = teste.hid('ws')$c$)$q$, 'A=1 F=1 P=0 P2=0 J1=0 J2=0');

-- ---------- 5) regra geral: tudo que entra na banca de alguém do time a gestão enxerga ----------
reset role;
select teste.igual('nenhum torneio ou movimento conta na banca sem estar à vista do time',
  $q$select ((select count(*) from public.tournaments t where t.pessoa_id is not null and t.unidade_id is null and t.entry_date > (select f.corte from public.foto_de(t.pessoa_id) f))
          + (select count(*) from public.bankroll_ledger l where l.pessoa_id is not null and l.unidade_id is null and l.entry_date > (select f.corte from public.foto_de(l.pessoa_id) f)))::text$q$, '0');
