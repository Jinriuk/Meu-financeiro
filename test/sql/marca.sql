-- Marca do time (pedido do dono, 20/11): A admin · P professor · X de fora · G gestor geral da plataforma.
\set ON_ERROR_STOP 1
reset role;
create table teste.mc(nome text primary key, id uuid, t text);
grant select, insert on teste.mc to authenticated;
create or replace function teste.mcid(n text) returns uuid language sql stable as $$ select id from teste.mc where nome = n $$;
create or replace function teste.mct(n text) returns text language sql stable as $$ select t from teste.mc where nome = n $$;
grant execute on function teste.mcid(text), teste.mct(text) to authenticated;
insert into auth.users(id, email, email_confirmed_at) select ('f7000000-0000-0000-0000-0000000000' || n)::uuid, 'm' || n || '@marca.test', now()
  from unnest(array['a1','b1','99','e1']) n;
insert into public.gestor_plataforma(user_id) values ('f7000000-0000-0000-0000-0000000000e1') on conflict do nothing;
insert into teste.mc(nome, id) select 'ws', public.criar_time('Marca FC', 'f7000000-0000-0000-0000-0000000000a1', 'Admin M', null);
insert into teste.mc(nome, id) select 'R', id from public.unidade where workspace_id = teste.mcid('ws') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome) values (teste.mcid('ws'), teste.mcid('R'), 'Reta M');
insert into teste.mc(nome, id) select 'U', id from public.unidade where workspace_id = teste.mcid('ws') and nome = 'Reta M';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values ('f8000000-0000-0000-0000-0000000000b1', teste.mcid('ws'), 'f7000000-0000-0000-0000-0000000000b1', 'Prof M', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values ('f8000000-0000-0000-0000-0000000000b1', teste.mcid('U'), array['ver_desempenho']);
insert into public.workspace_members(workspace_id, user_id, role) values (teste.mcid('ws'), 'f7000000-0000-0000-0000-0000000000b1', 'member');
-- uma imagem pequena válida (o formato basta pro servidor) e uma grande demais
insert into teste.mc(nome, t) values ('png', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
insert into teste.mc(nome, t) values ('grande', 'data:image/png;base64,' || repeat('A', 400100));

set role authenticated;
select teste.como('f7000000-0000-0000-0000-0000000000a1');
select teste.ok('o admin põe o nome e a logo do time', $q$select public.definir_marca('Samba Poker Team', teste.mct('png'))$q$);
select teste.igual('…e o time passa a ter a marca', $q$select marca_nome || ' / ' || left(marca_logo, 22) from public.workspaces where id = teste.mcid('ws')$q$, 'Samba Poker Team / data:image/png;base64,');
select teste.ok('tirar só a logo (o nome fica)', $q$select public.definir_marca(null, '')$q$);
select teste.igual('…sem logo, nome igual', $q$select marca_nome || ' / ' || coalesce(marca_logo, 'sem logo') from public.workspaces where id = teste.mcid('ws')$q$, 'Samba Poker Team / sem logo');
select teste.erro_qualquer('logo em SVG (pode carregar script), não', $q$select public.definir_marca(null, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')$q$);
select teste.erro_qualquer('logo como link de fora, não', $q$select public.definir_marca(null, 'https://exemplo.com/logo.png')$q$);
select teste.erro_qualquer('logo grande demais', $q$select public.definir_marca(null, teste.mct('grande'))$q$);
select teste.erro_qualquer('nome com mais de 40 letras', $q$select public.definir_marca(repeat('x', 41), null)$q$);
select teste.ok('volta a logo', $q$select public.definir_marca(null, teste.mct('png'))$q$);
select teste.como('f7000000-0000-0000-0000-0000000000b1');
select teste.erro('professor NÃO troca a marca', $q$select public.definir_marca('Hack', null)$q$);
select teste.erro('…nem dizendo qual time', $q$select public.definir_marca('Hack', null, teste.mcid('ws'))$q$);
select teste.igual('…mas vê a marca do time (o app mostra no topo)', $q$select marca_nome || ' / ' || (marca_logo is not null) from public.workspaces where id = teste.mcid('ws')$q$, 'Samba Poker Team / true');
select teste.como('f7000000-0000-0000-0000-000000000099');
select teste.erro('quem é de fora NÃO troca a marca', $q$select public.definir_marca('Hack', null, teste.mcid('ws'))$q$);
select teste.igual('…nem vê', $q$select count(*)::text from public.workspaces where id = teste.mcid('ws')$q$, '0');
select teste.como('f7000000-0000-0000-0000-0000000000e1');
select teste.ok('o gestor geral troca a marca de um time', $q$select public.definir_marca('Samba', null, teste.mcid('ws'))$q$);
select teste.igual('…fica registrado (sem a imagem no registro)', $q$select acao || ' ' || (detalhes->>'nome') || ' ' || (detalhes->>'logo') from public.acoes_plataforma() where time_nome = 'Marca FC' order by criado_em desc limit 1$q$, 'marca Samba igual');
select teste.igual('…e a lista de times mostra o nome da marca e que tem logo', $q$select marca_nome || ' / ' || tem_logo from public.times_da_plataforma() where id = teste.mcid('ws')$q$, 'Samba / true');
select teste.como('f7000000-0000-0000-0000-0000000000a1');
insert into teste.mc(nome, t) select 'tk', public.criar_convite(teste.mcid('U'), null, 7, 5);
reset role;
select teste.igual('o convite mostra a marca antes do login (quem abre o link ainda não entrou: anon executa ver_convite)',
  $q$select (c->>'marca_nome') || ' / ' || left(c->>'marca_logo', 22) || ' / ' || (c->>'time') || ' / ' || has_function_privilege('anon', 'public.ver_convite(text)', 'execute')
     from (select public.ver_convite(teste.mct('tk')) c) x$q$, 'Samba / data:image/png;base64, / Marca FC / true');
