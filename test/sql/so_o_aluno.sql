-- Só o aluno mexe na própria conta (pedido do dono, 21/11): admin, professor e financeiro VEEM a conta do aluno, mas não
-- incluem, mudam nem apagam nada dela (torneio, nome do torneio, dia, mãos, importação, movimento, saque da conta, sala).
-- Os processos do time continuam (decidir reload, capital mandado). A admin · B professor · C financeiro · D aluno
\set ON_ERROR_STOP 1
reset role;
create table teste.sa(nome text primary key, id uuid);
grant select, insert on teste.sa to authenticated;
create or replace function teste.said(n text) returns uuid language sql stable as $$ select id from teste.sa where nome = n $$;
grant execute on function teste.said(text) to authenticated;
insert into auth.users(id, email, email_confirmed_at) select ('db000000-0000-0000-0000-0000000000' || n)::uuid, 'a' || n || '@soaluno.test', now()
  from unnest(array['a1','b1','c1','d1']) n;
insert into teste.sa(nome, id) select 'ws', public.criar_time('So Aluno FC', 'db000000-0000-0000-0000-0000000000a1', 'Admin A', null);
insert into teste.sa(nome, id) select 'R', id from public.unidade where workspace_id = teste.said('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome) values (teste.said('ws'), teste.said('R'), 'Reta A');
insert into teste.sa(nome, id) select 'U', id from public.unidade where workspace_id = teste.said('ws') and nome = 'Reta A';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values
  ('dc000000-0000-0000-0000-0000000000b1', teste.said('ws'), 'db000000-0000-0000-0000-0000000000b1', 'Prof A', 'ativo'),
  ('dc000000-0000-0000-0000-0000000000c1', teste.said('ws'), 'db000000-0000-0000-0000-0000000000c1', 'Fin A', 'ativo'),
  ('dc000000-0000-0000-0000-0000000000d1', teste.said('ws'), 'db000000-0000-0000-0000-0000000000d1', 'Aluno A', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values
  ('dc000000-0000-0000-0000-0000000000b1', teste.said('U'), array['promover','ver_desempenho','ver_financeiro']),
  ('dc000000-0000-0000-0000-0000000000c1', teste.said('R'), array['aprovar_saques','ver_financeiro']);
insert into public.vinculo(pessoa_id, unidade_id, inicio) values ('dc000000-0000-0000-0000-0000000000d1', teste.said('U'), current_date - 20);
insert into public.workspace_members(workspace_id, user_id, role)
  select teste.said('ws'), ('db000000-0000-0000-0000-0000000000' || n)::uuid, 'member' from unnest(array['b1','c1','d1']) n;
insert into teste.sa(nome, id) values ('t1', 'dd000000-0000-0000-0000-000000000001');
insert into public.tournaments(id, workspace_id, entry_date, player, tournament_name, buyin, prize) values
  ('dd000000-0000-0000-0000-000000000001', teste.said('ws'), current_date - 2, 'Aluno A', 'Daily Main', 2, 0);
insert into public.player_wallets(workspace_id, player, wallet, saldo_inicial) values (teste.said('ws'), 'Aluno A', 'GG Poker', 100);
insert into public.bankroll_ledger(workspace_id, entry_date, wallet, entrada, saida, player) values (teste.said('ws'), current_date - 2, 'GG Poker', 10, 0, 'Aluno A');

-- mudar ou apagar a conta de outro: barrado com 403 (quem vê a linha) ou 0 linhas (quem nem vê)
create or replace function teste.nao_mexe(rotulo text, cmd text) returns void language plpgsql as $f$
declare n int;
begin
  begin
    execute 'with x as (' || cmd || ' returning 1) select count(*) from x' into n;
    if n = 0 then raise notice 'OK     % (0 linhas)', rotulo; else raise notice 'FALHA  % (mudou % linha(s))', rotulo, n; end if;
  exception when insufficient_privilege then raise notice 'OK     % (403: %)', rotulo, sqlerrm;
            when others then raise notice 'OK?    % (barrado com outro erro: % %)', rotulo, sqlstate, sqlerrm;
  end;
end $f$;
-- cada um da equipe: vê o que o papel dele vê, mas não mexe em nada da conta do aluno
create or replace function teste.equipe_nao_mexe(quem text, rot text, ve_torneio text) returns void language plpgsql as $f$
begin
  perform teste.como(quem);
  perform teste.igual(rot || ' vê o torneio do aluno? ' || ve_torneio, $q$select count(*)::text from public.tournaments where id = 'dd000000-0000-0000-0000-000000000001'$q$, ve_torneio);
  perform teste.igual(rot || ' VÊ a banca do aluno', $q$select count(*)::text from public.bankroll_ledger where workspace_id = teste.said('ws') and player = 'Aluno A'$q$, '1');
  perform teste.erro(rot || ' NÃO lança torneio na conta do aluno',
    $q$insert into public.tournaments(workspace_id, entry_date, player, tournament_name, buyin, prize) values (teste.said('ws'), current_date, 'Aluno A', 'Lançado por outro', 1, 0)$q$);
  perform teste.nao_mexe(rot || ' NÃO muda o nome do torneio', $q$update public.tournaments set tournament_name = 'Mudado' where id = 'dd000000-0000-0000-0000-000000000001'$q$);
  perform teste.nao_mexe(rot || ' NÃO apaga torneio', $q$delete from public.tournaments where id = 'dd000000-0000-0000-0000-000000000001'$q$);
  perform teste.erro(rot || ' NÃO sobe mãos (stats) pro aluno',
    $q$insert into public.hh_tournament_stats(workspace_id, player, site, site_tournament_id, entry_date, hands) values (teste.said('ws'), 'Aluno A', 'GG', 'x-' || md5(random()::text), current_date, 10)$q$);
  perform teste.erro(rot || ' NÃO registra importação pro aluno', $q$insert into public.hh_import_log(workspace_id, player, saved) values (teste.said('ws'), 'Aluno A', 1)$q$);
  perform teste.erro(rot || ' NÃO lança dia (diário) pro aluno', $q$insert into public.daily_entries(workspace_id, entry_date, player) values (teste.said('ws'), current_date, 'Aluno A')$q$);
  perform teste.erro(rot || ' NÃO lança movimento na banca do aluno',
    $q$insert into public.bankroll_ledger(workspace_id, entry_date, wallet, entrada, saida, player) values (teste.said('ws'), current_date, 'GG Poker', 50, 0, 'Aluno A')$q$);
  perform teste.nao_mexe(rot || ' NÃO muda movimento da banca do aluno', $q$update public.bankroll_ledger set entrada = 999 where workspace_id = teste.said('ws') and player = 'Aluno A'$q$);
  perform teste.nao_mexe(rot || ' NÃO muda saldo de sala do aluno', $q$update public.player_wallets set saldo_inicial = 999 where workspace_id = teste.said('ws') and player = 'Aluno A'$q$);
  perform teste.erro(rot || ' NÃO registra saque na conta do aluno',
    $q$insert into public.withdrawals(workspace_id, week_ending_date, player, valor_sacado) values (teste.said('ws'), current_date, 'Aluno A', 10)$q$);
end $f$;
reset role;
grant execute on function teste.nao_mexe(text, text) to authenticated;
grant execute on function teste.equipe_nao_mexe(text, text, text) to authenticated;
set role authenticated;
select teste.equipe_nao_mexe('db000000-0000-0000-0000-0000000000a1', 'admin', '1');
select teste.equipe_nao_mexe('db000000-0000-0000-0000-0000000000b1', 'professor', '1');
select teste.equipe_nao_mexe('db000000-0000-0000-0000-0000000000c1', 'financeiro', '0');   -- financeiro vê dinheiro, não desempenho

-- os processos do time continuam: o financeiro registra o capital mandado e decide o reload que o aluno pediu
select teste.como('db000000-0000-0000-0000-0000000000c1');
select teste.ok('financeiro ainda lança movimento do TIME sem jogador (Reserva, não é conta de aluno)', $q$insert into public.bankroll_ledger(workspace_id, entry_date, wallet, entrada, saida) values (teste.said('ws'), current_date, 'Reserva', 500, 0)$q$);
select teste.ok('financeiro ainda registra capital mandado (processo do time)', $q$select public.registrar_aporte('dc000000-0000-0000-0000-0000000000d1', 30, current_date, 'teste', 'GG Poker')$q$);

-- o aluno mexe na própria conta
select teste.como('db000000-0000-0000-0000-0000000000d1');
select teste.ok('aluno lança o próprio torneio', $q$insert into public.tournaments(workspace_id, entry_date, player, tournament_name, buyin, prize) values (teste.said('ws'), current_date, 'Aluno A', 'Meu torneio', 1, 0)$q$);
select teste.igual('aluno corrige o nome do próprio torneio', $q$with u as (update public.tournaments set tournament_name = 'Daily Main 2' where id = 'dd000000-0000-0000-0000-000000000001' returning 1) select count(*)::text from u$q$, '1');
select teste.ok('aluno lança movimento na própria banca', $q$insert into public.bankroll_ledger(workspace_id, entry_date, wallet, entrada, saida, player) values (teste.said('ws'), current_date, 'GG Poker', 5, 0, 'Aluno A')$q$);
select teste.igual('aluno apaga o próprio torneio', $q$with d as (delete from public.tournaments where tournament_name = 'Meu torneio' and workspace_id = teste.said('ws') returning 1) select count(*)::text from d$q$, '1');
select teste.ok('…e pede reload (processo do time, pedido dele)', $q$select public.pedir_reload(40, 'GG Poker', null)$q$);
select teste.como('db000000-0000-0000-0000-0000000000c1');
select teste.ok('financeiro decide o reload pedido pelo aluno', $q$select public.decidir_reload((select id from public.reload where pessoa_id = 'dc000000-0000-0000-0000-0000000000d1' and status = 'solicitado'), true, null)$q$);
reset role;
select teste.igual('nada que a equipe tentou mudou o torneio do aluno', $q$select tournament_name from public.tournaments where id = 'dd000000-0000-0000-0000-000000000001'$q$, 'Daily Main 2');
