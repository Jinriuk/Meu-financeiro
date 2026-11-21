-- Console da plataforma (pedido do dono, 21/11): a conta central vê os times por papel, suspende e reativa, marca o
-- vencimento, convida admin, cuida das contas individuais e vê os erros do app. Quem não é gestor geral não faz nada disso.
-- E gestor geral · A admin do time · B1 professor · B2 financeiro · D1/D2 jogadores · F1 conta individual · 99 de fora
\set ON_ERROR_STOP 1
reset role;
create table teste.cp(nome text primary key, id uuid, t text);
grant select, insert on teste.cp to authenticated;
create or replace function teste.cpid(n text) returns uuid language sql stable as $$ select id from teste.cp where nome = n $$;
create or replace function teste.cpt(n text) returns text language sql stable as $$ select t from teste.cp where nome = n $$;
grant execute on function teste.cpid(text), teste.cpt(text) to authenticated;
insert into auth.users(id, email, email_confirmed_at) select ('c5000000-0000-0000-0000-0000000000' || n)::uuid, 'c' || n || '@console.test', now()
  from unnest(array['e1','a1','b1','b2','d1','d2','f1','99']) n;
insert into public.gestor_plataforma(user_id) values ('c5000000-0000-0000-0000-0000000000e1') on conflict do nothing;
-- o time: raiz e uma reta; admin (dono), professor na reta, financeiro na raiz, 2 jogadores e 1 convidado
insert into teste.cp(nome, id) select 'ws', public.criar_time('Console FC', 'c5000000-0000-0000-0000-0000000000a1', 'Admin C', null);
insert into teste.cp(nome, id) select 'R', id from public.unidade where workspace_id = teste.cpid('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome) values (teste.cpid('ws'), teste.cpid('R'), 'Reta C');
insert into teste.cp(nome, id) select 'U', id from public.unidade where workspace_id = teste.cpid('ws') and nome = 'Reta C';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values
  ('c6000000-0000-0000-0000-0000000000b1', teste.cpid('ws'), 'c5000000-0000-0000-0000-0000000000b1', 'Prof C', 'ativo'),
  ('c6000000-0000-0000-0000-0000000000b2', teste.cpid('ws'), 'c5000000-0000-0000-0000-0000000000b2', 'Fin C', 'ativo'),
  ('c6000000-0000-0000-0000-0000000000d1', teste.cpid('ws'), 'c5000000-0000-0000-0000-0000000000d1', 'Jog C1', 'ativo'),
  ('c6000000-0000-0000-0000-0000000000d2', teste.cpid('ws'), 'c5000000-0000-0000-0000-0000000000d2', 'Jog C2', 'ativo'),
  ('c6000000-0000-0000-0000-0000000000d3', teste.cpid('ws'), null, 'Jog C3', 'convidado');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values
  ('c6000000-0000-0000-0000-0000000000b1', teste.cpid('U'), array['promover','ver_desempenho','ver_financeiro']),
  ('c6000000-0000-0000-0000-0000000000b2', teste.cpid('R'), array['aprovar_saques','ver_financeiro']);
insert into public.vinculo(pessoa_id, unidade_id, inicio) values
  ('c6000000-0000-0000-0000-0000000000d1', teste.cpid('U'), current_date - 30), ('c6000000-0000-0000-0000-0000000000d2', teste.cpid('U'), current_date - 30),
  ('c6000000-0000-0000-0000-0000000000d3', teste.cpid('U'), current_date);
insert into public.workspace_members(workspace_id, user_id, role)
  select teste.cpid('ws'), ('c5000000-0000-0000-0000-0000000000' || n)::uuid, 'member' from unnest(array['b1','b2','d1','d2']) n;
-- C1 jogou ontem (conta nos "últimos 7 dias"), C2 há 20 dias (não conta)
insert into public.tournaments(workspace_id, entry_date, player, buyin, prize) values
  (teste.cpid('ws'), current_date - 1, 'Jog C1', 2, 0), (teste.cpid('ws'), current_date - 20, 'Jog C2', 2, 5);
insert into public.app_erros(origem, mensagem, workspace_id, user_id) values ('app', 'falhou a carga do teste', teste.cpid('ws'), null);
-- uma conta individual em teste (5 dias) e a conta individual da própria conta central (não é cliente: fica fora da lista)
insert into public.workspaces(id, name, kind, plan, trial_ends_at) values
  ('c7000000-0000-0000-0000-0000000000f1', 'Solo C', 'solo', 'gestao', now() + interval '5 days'),
  ('c7000000-0000-0000-0000-0000000000e1', 'Central C', 'solo', 'gestao', null);
insert into public.workspace_members(workspace_id, user_id, role) values
  ('c7000000-0000-0000-0000-0000000000f1', 'c5000000-0000-0000-0000-0000000000f1', 'owner'),
  ('c7000000-0000-0000-0000-0000000000e1', 'c5000000-0000-0000-0000-0000000000e1', 'owner');
insert into public.player_profiles(user_id, email, nickname, password_changed, role)
values ('c5000000-0000-0000-0000-0000000000f1', 'cf1@console.test', 'SoloNick', true, 'solo');

set role authenticated;
select teste.como('c5000000-0000-0000-0000-0000000000e1');
select teste.igual('times: pessoas, com conta, convidados, jogadores ativos/cadastrados, jogando 7 dias e erros',
  $q$select pessoas || ' pessoas, ' || com_conta || ' com conta, ' || convidados || ' convidado, ' || jogadores || ' ativos, ' || jogadores_cadastrados
     || ' cadastrados, ' || jogando_7d || ' jogando, ' || erros_7d || ' erro' from public.times_da_plataforma() where id = teste.cpid('ws')$q$,
  '6 pessoas, 5 com conta, 1 convidado, 2 ativos, 3 cadastrados, 1 jogando, 1 erro');
select teste.igual('…e por papel: admin / professor / financeiro / outros',
  $q$select n_admins || '/' || n_professores || '/' || n_financeiros || '/' || n_outros from public.times_da_plataforma() where id = teste.cpid('ws')$q$, '1/1/1/0');

-- suspender e reativar (o "cancelar plano" do time)
select teste.erro_qualquer('suspender sem motivo, não', $q$select public.suspender_time(teste.cpid('ws'), true, '  ')$q$);
select teste.ok('suspende o time com o motivo', $q$select public.suspender_time(teste.cpid('ws'), true, 'inadimplência')$q$);
select teste.igual('…a lista mostra suspenso e o motivo', $q$select (suspenso_em is not null) || ' ' || suspenso_motivo from public.times_da_plataforma() where id = teste.cpid('ws')$q$, 'true inadimplência');
select teste.igual('…e fica no registro', $q$select acao || ' ' || (detalhes->>'motivo') from public.acoes_plataforma() where time_nome = 'Console FC' order by criado_em desc limit 1$q$, 'suspender inadimplência');
select teste.como('c5000000-0000-0000-0000-0000000000d1');
select teste.igual('jogador do time suspenso: o app trava (sem o motivo)',
  $q$select (s->>'suspenso') || ' ' || (s->>'ativo') || ' ' || (s->>'time') || ' ' || coalesce(s->>'motivo', 'sem motivo') from (select public.meu_status() s) x$q$, 'true false Console FC sem motivo');
select teste.erro('…e não se reativa sozinho (sem update no workspace)', $q$update public.workspaces set suspenso_em = null where id = teste.cpid('ws')$q$);
select teste.como('c5000000-0000-0000-0000-0000000000a1');
select teste.erro('nem o admin do time', $q$update public.workspaces set suspenso_em = null where id = teste.cpid('ws')$q$);
select teste.como('c5000000-0000-0000-0000-0000000000e1');
select teste.ok('reativa', $q$select public.suspender_time(teste.cpid('ws'), false)$q$);
select teste.erro_qualquer('reativar o que não está suspenso, não', $q$select public.suspender_time(teste.cpid('ws'), false)$q$);
select teste.como('c5000000-0000-0000-0000-0000000000d1');
select teste.igual('…o app volta', $q$select (s->>'suspenso') || ' ' || (s->>'ativo') from (select public.meu_status() s) x$q$, 'false true');

-- vencimento do contrato
select teste.como('c5000000-0000-0000-0000-0000000000e1');
select teste.ok('marca o vencimento do contrato', $q$select public.definir_vencimento(teste.cpid('ws'), current_date + 30)$q$);
select teste.igual('…aparece na lista', $q$select (contrato_fim - current_date)::text from public.times_da_plataforma() where id = teste.cpid('ws')$q$, '30');
select teste.igual('…e no registro (antes e depois)', $q$select acao || ' ' || coalesce(detalhes->>'antes', 'sem data') || ' ' || ((detalhes->>'depois')::date - current_date) from public.acoes_plataforma() where time_nome = 'Console FC' order by criado_em desc limit 1$q$, 'vencimento sem data 30');
select teste.erro_qualquer('data sem sentido, não', $q$select public.definir_vencimento(teste.cpid('ws'), current_date + 5000)$q$);

-- convidar admin pra um time que já existe
insert into teste.cp(nome, t) select 'tk', public.convidar_admin_plataforma(teste.cpid('ws'), 'Novo Admin');
select teste.igual('convida um admin: link de uso único com "administrar" no time inteiro',
  $q$select length(teste.cpt('tk')) || ' ' || (c->>'valido') || ' ' || (c->>'capacidades') || ' ' || (c->>'unidade') from (select public.ver_convite(teste.cpt('tk')) c) x$q$,
  '64 true ["administrar"] Console FC');
select teste.igual('…a lista mostra admin pendente e o registro', $q$select admin_pendente || ' ' || (select acao || ' ' || (detalhes->>'nome') from public.acoes_plataforma() where time_nome = 'Console FC' order by criado_em desc limit 1)
  from public.times_da_plataforma() where id = teste.cpid('ws')$q$, 'true convidar_admin Novo Admin');
select teste.erro_qualquer('nome repetido no time, não', $q$select public.convidar_admin_plataforma(teste.cpid('ws'), 'Novo Admin')$q$);
select teste.ok('assentos do contrato = os que já estão em uso (7)', $q$select public.mudar_assentos(teste.cpid('ws'), 7)$q$);
select teste.erro_qualquer('…convite de admin além do limite é recusado', $q$select public.convidar_admin_plataforma(teste.cpid('ws'), 'Mais Um')$q$);

-- contas individuais
select teste.igual('contas individuais: a conta com apelido, e-mail e teste; a conta central fica fora',
  $q$select string_agg(nome || ' ' || coalesce(apelido, '-') || ' ' || coalesce(email, '-') || ' ' || (teste_ate is not null), ', ' order by nome)
     from public.contas_da_plataforma() where nome in ('Solo C', 'Central C')$q$, 'Solo C SoloNick cf1@console.test true');
select teste.igual('estende o teste em 10 dias (5 que faltavam + 10)',
  $q$select round(extract(epoch from (public.acesso_conta_plataforma('c7000000-0000-0000-0000-0000000000f1', 'estender', 10) - now())) / 86400)::text$q$, '15');
select teste.ok('encerra o acesso', $q$select public.acesso_conta_plataforma('c7000000-0000-0000-0000-0000000000f1', 'encerrar')$q$);
select teste.como('c5000000-0000-0000-0000-0000000000f1');
select teste.igual('…a conta trava', $q$select (public.meu_status()->>'ativo')$q$, 'false');
select teste.como('c5000000-0000-0000-0000-0000000000e1');
select teste.ok('libera sem prazo', $q$select public.acesso_conta_plataforma('c7000000-0000-0000-0000-0000000000f1', 'sem_prazo')$q$);
select teste.como('c5000000-0000-0000-0000-0000000000f1');
select teste.igual('…a conta volta, sem teste', $q$select (public.meu_status()->>'ativo') || ' ' || coalesce(public.meu_status()->>'trial_ends_at', 'sem prazo')$q$, 'true sem prazo');
select teste.como('c5000000-0000-0000-0000-0000000000e1');
select teste.igual('…3 mudanças de acesso no registro', $q$select count(*)::text from public.acoes_plataforma() where acao = 'acesso_conta'$q$, '3');
select teste.erro_qualquer('ação inválida, não', $q$select public.acesso_conta_plataforma('c7000000-0000-0000-0000-0000000000f1', 'apagar')$q$);
select teste.erro_qualquer('estender 0 dias, não', $q$select public.acesso_conta_plataforma('c7000000-0000-0000-0000-0000000000f1', 'estender', 0)$q$);
select teste.erro_qualquer('mexer no acesso de um TIME por aqui, não', $q$select public.acesso_conta_plataforma(teste.cpid('ws'), 'encerrar')$q$);

-- erros do app de um time
select teste.igual('erros do app do time (só o técnico)', $q$select count(*) || ' ' || min(mensagem) from public.erros_do_time(teste.cpid('ws'))$q$, '1 falhou a carga do teste');

-- quem não é gestor geral: nada
select teste.como('c5000000-0000-0000-0000-0000000000a1');
select teste.erro('admin de time NÃO vê a lista de times', $q$select count(*) from public.times_da_plataforma()$q$);
select teste.erro('…nem as contas individuais', $q$select count(*) from public.contas_da_plataforma()$q$);
select teste.erro('…nem suspende', $q$select public.suspender_time(teste.cpid('ws'), true, 'x')$q$);
select teste.erro('…nem muda o vencimento', $q$select public.definir_vencimento(teste.cpid('ws'), current_date + 90)$q$);
select teste.erro('…nem convida admin pela plataforma', $q$select public.convidar_admin_plataforma(teste.cpid('ws'), 'Hack')$q$);
select teste.erro('…nem mexe no acesso de conta', $q$select public.acesso_conta_plataforma('c7000000-0000-0000-0000-0000000000f1', 'sem_prazo')$q$);
select teste.erro('…nem vê os erros', $q$select count(*) from public.erros_do_time(teste.cpid('ws'))$q$);
select teste.como('c5000000-0000-0000-0000-000000000099');
select teste.erro('quem é de fora também não', $q$select public.suspender_time(teste.cpid('ws'), true, 'x')$q$);
reset role;
select teste.igual('anon não executa nenhuma função do console',
  $q$select count(*)::text from unnest(array['public.times_da_plataforma()', 'public.contas_da_plataforma()', 'public.suspender_time(uuid,boolean,text)',
     'public.definir_vencimento(uuid,date)', 'public.convidar_admin_plataforma(uuid,text)', 'public.acesso_conta_plataforma(uuid,text,integer)',
     'public.erros_do_time(uuid,integer)']) f where has_function_privilege('anon', f, 'execute')$q$, '0');
