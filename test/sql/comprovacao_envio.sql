-- Comprovação dos torneios e envio mensal (22/11). A admin · P professor da reta · F financeiro · J e K jogam · X de fora
\set ON_ERROR_STOP 1
reset role;
create table teste.ce(nome text primary key, id uuid);
grant select, insert on teste.ce to authenticated;
create or replace function teste.ceid(n text) returns uuid language sql stable as $$ select id from teste.ce where nome = n $$;
grant execute on function teste.ceid(text) to authenticated;
insert into auth.users(id, email, email_confirmed_at) select ('ce000000-0000-0000-0000-0000000000' || n)::uuid, 'c' || n || '@comprova.test', now()
  from unnest(array['a1','b1','f1','c1','c2','e1']) n;
insert into teste.ce select 'ws', public.criar_time('Comprova FC', 'ce000000-0000-0000-0000-0000000000a1', 'Admin C', null);
insert into teste.ce select 'R', id from public.unidade where workspace_id = teste.ceid('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome) values (teste.ceid('ws'), teste.ceid('R'), 'Base C');
insert into teste.ce select 'B', id from public.unidade where workspace_id = teste.ceid('ws') and nome = 'Base C';
insert into public.unidade(workspace_id, mae_id, nome) values (teste.ceid('ws'), teste.ceid('B'), 'Reta C');
insert into teste.ce select 'U', id from public.unidade where workspace_id = teste.ceid('ws') and nome = 'Reta C';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values
 ('cf000000-0000-0000-0000-0000000000b1', teste.ceid('ws'), 'ce000000-0000-0000-0000-0000000000b1', 'Prof C', 'ativo'),
 ('cf000000-0000-0000-0000-0000000000f1', teste.ceid('ws'), 'ce000000-0000-0000-0000-0000000000f1', 'Fin C', 'ativo'),
 ('cf000000-0000-0000-0000-0000000000c1', teste.ceid('ws'), 'ce000000-0000-0000-0000-0000000000c1', 'Joga C', 'ativo'),
 ('cf000000-0000-0000-0000-0000000000c2', teste.ceid('ws'), 'ce000000-0000-0000-0000-0000000000c2', 'Kaio C', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values
 ('cf000000-0000-0000-0000-0000000000b1', teste.ceid('U'), array['ver_desempenho']),
 ('cf000000-0000-0000-0000-0000000000f1', teste.ceid('R'), array['ver_financeiro','aprovar_saques']);
insert into public.vinculo(pessoa_id, unidade_id, inicio) values
 ('cf000000-0000-0000-0000-0000000000c1', teste.ceid('U'), current_date - 60), ('cf000000-0000-0000-0000-0000000000c2', teste.ceid('U'), current_date - 60);
insert into public.workspace_members(workspace_id, user_id, role) select teste.ceid('ws'), ('ce000000-0000-0000-0000-0000000000' || n)::uuid, 'member'
  from unnest(array['b1','f1','c1','c2']) n;
-- torneio importado ANTES desta mudança (tem o id do site, sem comprovante): a migração dá o comprovante com os valores de hoje
insert into public.tournaments(workspace_id, entry_date, player, buyin, prize, reentries, site_tournament_id) values
  (teste.ceid('ws'), current_date - 20, 'Joga C', 5, 12, 1, 'GG-ANTIGO-1');
update public.tournaments set comprovante = null where site_tournament_id = 'GG-ANTIGO-1';
set client_min_messages = warning;
\ir ../../supabase/migrations/20261122100000_comprovacao_e_envio_mensal.sql
reset client_min_messages;
select teste.igual('o já importado ganhou o comprovante com os valores de hoje',
  $q$select concat_ws('/', comprovante->>'fonte', comprovante->>'buyin', comprovante->>'prize', comprovante->>'reentries', (comprovante->>'em' is not null)::text) from public.tournaments where site_tournament_id = 'GG-ANTIGO-1'$q$,
  'importado_antes/5/12/1/true');

set role authenticated;
-- ---------- comprovante ----------
select teste.como('ce000000-0000-0000-0000-0000000000c1');
select teste.erro_qualquer('comprovante sem o id do torneio no site é recusado',
  $q$insert into public.tournaments(workspace_id, entry_date, player, buyin, prize, comprovante) values (teste.ceid('ws'), current_date - 2, 'Joga C', 2, 50, '{"fonte":"resumo","prize":50}')$q$);
select teste.ok('import grava o torneio com o comprovante do arquivo',
  $q$insert into public.tournaments(workspace_id, entry_date, player, buyin, prize, reentries, site_tournament_id, comprovante)
     values (teste.ceid('ws'), current_date - 2, 'Joga C', 2, 30, 0, 'GG-NOVO-1', '{"fonte":"resumo","buyin":2,"prize":30,"reentries":0}')$q$);
select teste.igual('…e o banco carimba a hora', $q$select (comprovante->>'em' is not null)::text from public.tournaments where site_tournament_id = 'GG-NOVO-1'$q$, 'true');
select teste.ok('digitado sem arquivo fica sem comprovante',
  $q$insert into public.tournaments(workspace_id, entry_date, player, buyin, prize) values (teste.ceid('ws'), current_date - 1, 'Joga C', 3, 0)$q$);
select teste.igual('…sem comprovante', $q$select count(*)::text from public.tournaments where workspace_id = teste.ceid('ws') and player = 'Joga C' and comprovante is null$q$, '1');
select teste.ok('mudar o prêmio depois do import mantém o comprovante (a tela mostra que diverge)',
  $q$update public.tournaments set prize = 80 where site_tournament_id = 'GG-NOVO-1'$q$);
select teste.igual('…o arquivo continua dizendo 30', $q$select (comprovante->>'prize') || ' x ' || prize from public.tournaments where site_tournament_id = 'GG-NOVO-1'$q$, '30 x 80');
select teste.como('ce000000-0000-0000-0000-0000000000b1');
select teste.igual('o professor vê o comprovante dos torneios da reta', $q$select count(*)::text from public.tournaments where workspace_id = teste.ceid('ws') and comprovante is not null$q$, '2');

-- ---------- regras do envio mensal ----------
select teste.erro('professor NÃO configura o envio', $q$select public.definir_regra(teste.ceid('R'), 'envio_ligado', 'true'::jsonb)$q$);
select teste.como('ce000000-0000-0000-0000-0000000000a1');
select teste.ok('admin liga o envio mensal pro time', $q$select public.definir_regra(teste.ceid('R'), 'envio_ligado', 'true'::jsonb)$q$);
select teste.erro_qualquer('e-mail inválido', $q$select public.definir_regra(teste.ceid('R'), 'envio_email', '"sem arroba"'::jsonb)$q$);
select teste.ok('e-mail do time', $q$select public.definir_regra(teste.ceid('R'), 'envio_email', '"arquivos@time.test"'::jsonb)$q$);
select teste.erro_qualquer('prazo 0 não existe', $q$select public.definir_regra(teste.ceid('R'), 'envio_prazo_dia', '0'::jsonb)$q$);
select teste.erro_qualquer('prazo quebrado não existe', $q$select public.definir_regra(teste.ceid('R'), 'envio_prazo_dia', '6.5'::jsonb)$q$);
select teste.ok('prazo dia 6', $q$select public.definir_regra(teste.ceid('R'), 'envio_prazo_dia', '6'::jsonb)$q$);
select teste.ok('divisão do time inteiro e a da base', $q$select public.definir_regra(teste.ceid('R'), 'envio_divisao', '"  SAMBA "'::jsonb);
  select public.definir_regra(teste.ceid('B'), 'envio_divisao', '"CHORINHO"'::jsonb)$q$);
select teste.erro_qualquer('texto vazio não vale (pra herdar é limpar_regra)', $q$select public.definir_regra(teste.ceid('B'), 'envio_divisao', '"   "'::jsonb)$q$);
select teste.erro_qualquer('instruções grandes demais', $q$select public.definir_regra(teste.ceid('R'), 'envio_instrucoes', to_jsonb(repeat('a', 4001)))$q$);
select teste.ok('instruções', $q$select public.definir_regra(teste.ceid('R'), 'envio_instrucoes', '"Pokercraft > My Tournaments > mês inteiro > Download summaries"'::jsonb)$q$);
select teste.igual('a reta herda a divisão da base (e o texto fica sem espaço sobrando)',
  $q$select (public.regra_efetiva(teste.ceid('U'), 'envio_divisao') #>> '{}') || ' / ' || (public.regra_efetiva(teste.ceid('R'), 'envio_divisao') #>> '{}')$q$, 'CHORINHO / SAMBA');

-- ---------- confirmar o envio ----------
select teste.erro('admin (não joga) não confirma envio', $q$select public.marcar_envio_mensal(date_trunc('month', current_date)::date)$q$);
select teste.como('ce000000-0000-0000-0000-0000000000c1');
select teste.ok('J confirma o envio do mês passado', $q$select public.marcar_envio_mensal((date_trunc('month', current_date) - interval '1 month')::date)$q$);
select teste.ok('…confirmar de novo não duplica', $q$select public.marcar_envio_mensal((date_trunc('month', current_date) - interval '1 month')::date + 10)$q$);
select teste.igual('…uma linha, no dia 1 do mês, na reta dele',
  $q$select count(*) || ' ' || min(mes)::text || ' ' || (min(unidade_id::text) = teste.ceid('U')::text) from public.envio_mensal$q$,
  '1 ' || (date_trunc('month', current_date) - interval '1 month')::date::text || ' true');
select teste.erro_qualquer('mês que ainda não chegou', $q$select public.marcar_envio_mensal((date_trunc('month', current_date) + interval '1 month')::date)$q$);
select teste.erro('ninguém grava direto na tabela', $q$insert into public.envio_mensal(workspace_id, pessoa_id, mes) values (teste.ceid('ws'), 'cf000000-0000-0000-0000-0000000000c2', date_trunc('month', current_date)::date)$q$);
select teste.como('ce000000-0000-0000-0000-0000000000c2');
select teste.igual('K não vê o envio do J', $q$select count(*)::text from public.envio_mensal$q$, '0');
select teste.como('ce000000-0000-0000-0000-0000000000b1');
select teste.igual('o professor da reta vê', $q$select count(*)::text from public.envio_mensal$q$, '1');
select teste.como('ce000000-0000-0000-0000-0000000000f1');
select teste.igual('o financeiro vê', $q$select count(*)::text from public.envio_mensal$q$, '1');
select teste.como('ce000000-0000-0000-0000-0000000000e1');
select teste.igual('quem é de fora não vê', $q$select count(*)::text from public.envio_mensal$q$, '0');
select teste.como('ce000000-0000-0000-0000-0000000000c1');
select teste.ok('J desfaz a confirmação', $q$select public.marcar_envio_mensal((date_trunc('month', current_date) - interval '1 month')::date, false)$q$);
select teste.igual('…sumiu', $q$select count(*)::text from public.envio_mensal$q$, '0');
reset role;
update public.workspaces set suspenso_em = now() where id = teste.ceid('ws');
set role authenticated;
select teste.como('ce000000-0000-0000-0000-0000000000c1');
select teste.erro('time suspenso não confirma envio', $q$select public.marcar_envio_mensal(date_trunc('month', current_date)::date)$q$);
reset role;
update public.workspaces set suspenso_em = null where id = teste.ceid('ws');
