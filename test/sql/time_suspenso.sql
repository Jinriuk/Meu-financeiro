-- Time suspenso travado no banco (pedido do dono, 21/11): com o time suspenso, ninguém do time grava nada, nem direto
-- pela API nem pelas funções do servidor; ler continua; o gestor geral passa; outro time e conta individual seguem
-- normais; reativou, volta tudo. A admin · D jogador · E gestor geral · F conta individual
\set ON_ERROR_STOP 1
reset role;
create table teste.ts(nome text primary key, id uuid, t text);
grant select, insert on teste.ts to authenticated;
create or replace function teste.tsid(n text) returns uuid language sql stable as $$ select id from teste.ts where nome = n $$;
grant execute on function teste.tsid(text) to authenticated;
insert into auth.users(id, email, email_confirmed_at) select ('d8000000-0000-0000-0000-0000000000' || n)::uuid, 's' || n || '@suspenso.test', now()
  from unnest(array['a1','d1','e1','f1']) n;
insert into public.gestor_plataforma(user_id) values ('d8000000-0000-0000-0000-0000000000e1') on conflict do nothing;
insert into teste.ts(nome, id) select 'ws', public.criar_time('Suspenso FC', 'd8000000-0000-0000-0000-0000000000a1', 'Admin S', null);
insert into teste.ts(nome, id) select 'R', id from public.unidade where workspace_id = teste.tsid('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome) values (teste.tsid('ws'), teste.tsid('R'), 'Reta S');
insert into teste.ts(nome, id) select 'U', id from public.unidade where workspace_id = teste.tsid('ws') and nome = 'Reta S';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values
  ('d9000000-0000-0000-0000-0000000000d1', teste.tsid('ws'), 'd8000000-0000-0000-0000-0000000000d1', 'Jog S', 'ativo');
insert into public.vinculo(pessoa_id, unidade_id, inicio) values ('d9000000-0000-0000-0000-0000000000d1', teste.tsid('U'), current_date - 10);
insert into public.workspace_members(workspace_id, user_id, role) values (teste.tsid('ws'), 'd8000000-0000-0000-0000-0000000000d1', 'member');
insert into public.tournaments(workspace_id, entry_date, player, buyin, prize) values (teste.tsid('ws'), current_date - 1, 'Jog S', 2, 0);
-- conta individual sem prazo (não tem nada a ver com o time)
insert into public.workspaces(id, name, kind, plan, trial_ends_at) values ('da000000-0000-0000-0000-0000000000f1', 'Solo S', 'solo', 'gestao', null);
insert into public.workspace_members(workspace_id, user_id, role) values ('da000000-0000-0000-0000-0000000000f1', 'd8000000-0000-0000-0000-0000000000f1', 'owner');

set role authenticated;
select teste.como('d8000000-0000-0000-0000-0000000000e1');
select teste.ok('o gestor geral suspende o time', $q$select public.suspender_time(teste.tsid('ws'), true, 'teste da trava')$q$);

-- jogador do time suspenso
select teste.como('d8000000-0000-0000-0000-0000000000d1');
select teste.erro('jogador NÃO lança torneio direto pela API', $q$insert into public.tournaments(workspace_id, entry_date, player, buyin, prize) values (teste.tsid('ws'), current_date, 'Jog S', 1, 0)$q$);
select teste.igual('…nem apaga torneio (a regra do banco esconde as linhas: apaga 0)', $q$with d as (delete from public.tournaments where workspace_id = teste.tsid('ws') returning 1) select count(*)::text from d$q$, '0');
select teste.erro('…nem pede reload pela função do servidor', $q$select public.pedir_reload(50, 'GG Poker', null)$q$);
select teste.erro('…nem manda planilha', $q$select public.enviar_planilha('{"makeup": 0, "cashout": 0, "saldos": [{"sala": "GG Poker", "saldo": 100}]}'::jsonb)$q$);
select teste.igual('…mas continua lendo os próprios dados', $q$select count(*)::text from public.tournaments where workspace_id = teste.tsid('ws')$q$, '1');

-- admin do time suspenso
select teste.como('d8000000-0000-0000-0000-0000000000a1');
select teste.erro('admin NÃO convida', $q$select public.criar_convite(teste.tsid('U'), null, 7, 1)$q$);
select teste.erro('…nem muda regra da reta', $q$select public.definir_regra(teste.tsid('U'), 'abi_max', '5'::jsonb, null)$q$);
select teste.erro('…nem renomeia a reta', $q$select public.renomear_unidade(teste.tsid('U'), 'Outra', null)$q$);
select teste.erro('…nem mexe na configuração do time', $q$update public.pool_config set abi_max = 9 where workspace_id = teste.tsid('ws')$q$);

-- o gestor geral passa (ex.: convida o admin que vai reativar o time)
select teste.como('d8000000-0000-0000-0000-0000000000e1');
select teste.ok('o gestor geral ainda convida um admin no time suspenso', $q$select public.convidar_admin_plataforma(teste.tsid('ws'), 'Admin Novo S')$q$);

-- quem não é do time segue normal
select teste.como('d8000000-0000-0000-0000-0000000000f1');
select teste.ok('conta individual lança torneio normal', $q$insert into public.tournaments(workspace_id, entry_date, player, buyin, prize) values ('da000000-0000-0000-0000-0000000000f1', current_date, 'Solo S', 1, 0)$q$);

-- reativou, volta tudo
select teste.como('d8000000-0000-0000-0000-0000000000e1');
select teste.ok('reativa', $q$select public.suspender_time(teste.tsid('ws'), false)$q$);
select teste.como('d8000000-0000-0000-0000-0000000000d1');
select teste.ok('jogador volta a lançar', $q$insert into public.tournaments(workspace_id, entry_date, player, buyin, prize) values (teste.tsid('ws'), current_date, 'Jog S', 1, 0)$q$);
select teste.ok('…e a pedir reload', $q$select public.pedir_reload(50, 'GG Poker', null)$q$);
select teste.como('d8000000-0000-0000-0000-0000000000a1');
select teste.ok('admin volta a mudar regra', $q$select public.definir_regra(teste.tsid('U'), 'abi_max', '5'::jsonb, null)$q$);
reset role;
select teste.igual('o console não tem mais "erros do app"', $q$select (to_regprocedure('public.erros_do_time(uuid,integer)') is null)::text$q$, 'true');
