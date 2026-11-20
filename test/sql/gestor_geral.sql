-- Gestor geral da plataforma (plano 3.4 e 8). G é gestor geral · N conta comum · D vai ser a admin do time novo.
\set ON_ERROR_STOP 1
reset role;
create table teste.gg(nome text primary key, id uuid, t text);
grant select, insert, update on teste.gg to authenticated;
create or replace function teste.gid(n text) returns uuid language sql stable as $$ select id from teste.gg where nome = n $$;
create or replace function teste.gt(n text) returns text language sql stable as $$ select t from teste.gg where nome = n $$;
grant execute on function teste.gid(text), teste.gt(text) to authenticated;
insert into auth.users(id, email, email_confirmed_at) select ('b9000000-0000-0000-0000-0000000000' || n)::uuid, 'g' || n || '@geral.test', now()
  from unnest(array['a1','c1','d1']) n;
insert into public.gestor_plataforma(user_id) values ('b9000000-0000-0000-0000-0000000000a1');   -- só pelo SQL Editor
insert into public.workspaces(id, name, kind, plan, trial_ends_at) values ('ba900000-0000-0000-0000-0000000000c1', 'Conta N', 'solo', 'pro', now() + interval '5 days');
insert into public.workspace_members(workspace_id, user_id, role) values ('ba900000-0000-0000-0000-0000000000c1', 'b9000000-0000-0000-0000-0000000000c1', 'owner');

set role authenticated;
-- ---------- conta comum: nada de plataforma ----------
select teste.como('b9000000-0000-0000-0000-0000000000c1');
select teste.igual('conta comum não é gestor geral', $q$select public.sou_gestor_geral()::text$q$, 'false');
select teste.erro('…não lista os times', $q$select * from public.times_da_plataforma()$q$);
select teste.erro('…não cria time', $q$select public.criar_time_plataforma('Hack', 5, 'Eu')$q$);
select teste.erro('…não lê quem é gestor geral', $q$select count(*) from public.gestor_plataforma$q$);
select teste.erro('…não se promove a gestor geral', $q$insert into public.gestor_plataforma(user_id) values ('b9000000-0000-0000-0000-0000000000c1')$q$);
select teste.erro('…não lê o registro de ações', $q$select count(*) from public.acao_plataforma$q$);
select teste.erro('…nem pela função', $q$select * from public.acoes_plataforma()$q$);
select teste.erro('…e o cliente continua sem criar time pelo caminho antigo', $q$select public.criar_time('Hack', 'b9000000-0000-0000-0000-0000000000c1')$q$);

-- ---------- gestor geral: cria o time e recebe o link do admin ----------
select teste.como('b9000000-0000-0000-0000-0000000000a1');
select teste.igual('G é gestor geral', $q$select public.sou_gestor_geral()::text$q$, 'true');
select teste.erro_qualquer('time sem nome', $q$select public.criar_time_plataforma('  ', 5, 'Dona')$q$);
select teste.erro_qualquer('admin sem nome', $q$select public.criar_time_plataforma('Time X', 5, '')$q$);
select teste.erro_qualquer('assentos 0', $q$select public.criar_time_plataforma('Time X', 0, 'Dona')$q$);
insert into teste.gg(nome, id, t) select 'novo', (r->>'workspace_id')::uuid, r->>'convite' from (select public.criar_time_plataforma('Time Novo', 10, 'Dona Nova') r) x;
select teste.igual('cria o time e devolve o link do admin', $q$select (teste.gid('novo') is not null and length(teste.gt('novo')) = 64)::text$q$, 'true');
select teste.erro_qualquer('dois times com o mesmo nome, não', $q$select public.criar_time_plataforma('time novo', 3, 'Outra')$q$);
select teste.igual('na lista: 1 pessoa (a admin convidada), sem jogadores, sem dono ainda, admin esperando o convite',
  $q$select concat_ws('/', nome, tipo, assentos, pessoas, jogadores, convidados, admins, tem_dono, admin_pendente) from public.times_da_plataforma() where id = teste.gid('novo')$q$,
  'Time Novo/time/10/1/0/1/Dona Nova/f/t');
select teste.igual('a lista não traz conta individual (só times)', $q$select count(*)::text from public.times_da_plataforma() where tipo = 'solo'$q$, '0');
select teste.igual('G NÃO lê os dados do time (não é membro: pessoas, retas, configuração, convites)',
  $q$select ((select count(*) from public.pessoa where workspace_id = teste.gid('novo')) + (select count(*) from public.unidade where workspace_id = teste.gid('novo'))
          + (select count(*) from public.pool_config where workspace_id = teste.gid('novo')) + (select count(*) from public.convite where workspace_id = teste.gid('novo')))::text$q$, '0');
select teste.ok('G muda os assentos pra 20', $q$select public.mudar_assentos(teste.gid('novo'), 20)$q$);
select teste.erro_qualquer('assentos negativos, não', $q$select public.mudar_assentos(teste.gid('novo'), -1)$q$);
select teste.erro_qualquer('assentos de conta individual, não', $q$select public.mudar_assentos('ba900000-0000-0000-0000-0000000000c1', 3)$q$);
insert into teste.gg(nome, t) select 'link2', public.novo_link_admin(teste.gid('novo'));
select teste.igual('link novo do admin: o anterior para de valer',
  $q$select (teste.gt('link2') <> teste.gt('novo'))::text$q$, 'true');

-- ---------- a admin aceita: vira a dona do time ----------
select teste.como('b9000000-0000-0000-0000-0000000000d1');
select teste.erro_qualquer('o link antigo não vale mais', $q$select public.aceitar_convite(teste.gt('novo'))$q$);
select teste.ok('D aceita o link novo', $q$select public.aceitar_convite(teste.gt('link2'))$q$);
select teste.igual('D administra o time (vê a estrutura e a si mesma)', $q$select (select count(*) from public.unidade where workspace_id = teste.gid('novo'))||'/'||(select status from public.pessoa where user_id = auth.uid())$q$, '1/ativo');
select teste.erro('admin de time não é gestor geral', $q$select * from public.times_da_plataforma()$q$);
select teste.como('b9000000-0000-0000-0000-0000000000a1');
select teste.igual('na lista: com dona, sem admin pendente', $q$select concat_ws('/', tem_dono, admin_pendente, convidados) from public.times_da_plataforma() where id = teste.gid('novo')$q$, 't/f/0');
select teste.erro_qualquer('sem admin esperando, não há link de admin pra gerar', $q$select public.novo_link_admin(teste.gid('novo'))$q$);
select teste.igual('o registro tem cada ação do gestor geral, na ordem',
  $q$select string_agg(acao, ',' order by criado_em) from public.acoes_plataforma()$q$, 'criar_time,mudar_assentos,novo_link_admin');
reset role;
select teste.igual('…com quem fez e os detalhes', $q$select count(*)||'/'||max(detalhes->>'depois') from public.acao_plataforma where user_id = 'b9000000-0000-0000-0000-0000000000a1'$q$, '3/20');
select teste.igual('a dona é dona (role owner) e membro do time', $q$select role from public.workspace_members where workspace_id = teste.gid('novo') and user_id = 'b9000000-0000-0000-0000-0000000000d1'$q$, 'owner');
