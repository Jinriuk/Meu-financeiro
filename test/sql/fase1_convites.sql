-- Fase 1 · passo 3: convite por link. Roda depois do fase1_fatos.sql (usa o Time F e teste.*).
\set ON_ERROR_STOP 1
reset role;
insert into auth.users(id,email,email_confirmed_at) select ('cb000000-0000-0000-0000-0000000000' || n)::uuid, 'n' || n || '@conv.test', now()
  from unnest(array['01','02','03','04','05']) n;
insert into public.player_profiles(user_id,email,nickname,password_changed,role) values
 ('cb000000-0000-0000-0000-000000000001','n01@conv.test','Novato',true,'solo'),
 ('cb000000-0000-0000-0000-000000000002','n02@conv.test','Segundo',true,'solo'),
 ('cb000000-0000-0000-0000-000000000003','n03@conv.test','Terceiro',true,'solo'),
 ('cb000000-0000-0000-0000-000000000005','n05@conv.test','João',true,'solo');
create temp table tok(nome text primary key, t text);
grant all on tok to authenticated, anon;
grant usage on schema teste to anon;
grant execute on all functions in schema teste to anon;
set role authenticated;

-- ---------- quem cria ----------
select teste.como('c0000000-0000-0000-0000-0000000000c1');
insert into tok select 'retaA', public.criar_convite('e0000000-0000-0000-0000-0000000000e3');
select teste.igual('o token tem 64 caracteres', $q$select length(t)::text from tok where nome='retaA'$q$, '64');
select teste.erro_qualquer('validade fora de 1 a 30 dias', $q$select public.criar_convite('e0000000-0000-0000-0000-0000000000e3', null, 0)$q$);
select teste.igual('admin lista os convites (sem ver o hash)', $q$select count(*)::text from public.convite$q$, '1');
select teste.erro('ninguém lê o hash do token', $q$select token_hash from public.convite$q$);
select teste.como('c0000000-0000-0000-0000-0000000000c2');
select teste.erro('professor só de desempenho NÃO cria convite', $q$select public.criar_convite('e0000000-0000-0000-0000-0000000000e3')$q$);
select teste.igual('…nem lista convites', $q$select count(*)::text from public.convite$q$, '0');
select teste.como('c0000000-0000-0000-0000-0000000000c4');
select teste.erro('jogador NÃO cria convite', $q$select public.criar_convite('e0000000-0000-0000-0000-0000000000e5')$q$);

-- ---------- quem abre o link sem conta ----------
reset role; set role anon;
select teste.igual('sem login, o link mostra time e unidade', $q$select (public.ver_convite((select t from tok where nome='retaA')) - 'expira_em')::text$q$,
  '{"time": "Time F", "motivo": null, "pessoa": null, "valido": true, "unidade": "Reta A"}');
select teste.igual('link quebrado', $q$select (public.ver_convite('abc')->>'valido')$q$, 'false');
select teste.erro('sem login não aceita', $q$select public.aceitar_convite((select t from tok where nome='retaA'))$q$);
reset role; set role authenticated;

-- ---------- conta nova aceita o link da reta ----------
select teste.como('cb000000-0000-0000-0000-000000000001');
select teste.ok('Novato aceita o link da Reta A', $q$select public.aceitar_convite((select t from tok where nome='retaA'))$q$);
select teste.igual('Novato virou pessoa ativa com o apelido, jogando na Reta A',
  $q$select p.nome||':'||p.status||':'||u.nome from public.pessoa p join public.vinculo v on v.pessoa_id=p.id and v.fim is null join public.unidade u on u.id=v.unidade_id where p.user_id=auth.uid()$q$, 'Novato:ativo:Reta A');
select teste.igual('…e membro do workspace (o app já carrega o time)', $q$select count(*)::text from public.workspaces where id='d0000000-0000-0000-0000-0000000000d1'$q$, '1');
select teste.erro_qualquer('aceitar de novo', $q$select public.aceitar_convite((select t from tok where nome='retaA'))$q$);
select teste.ok('Novato lança torneio no nome dele', $q$insert into public.tournaments(entry_date,player,buyin) values (current_date,'Novato',2)$q$);

-- ---------- conta que já está em outro lugar ----------
select teste.como('c0000000-0000-0000-0000-0000000000c7');
select teste.erro_qualquer('conta de jogador solo não entra (uma conta, um lugar, até a fase 2)', $q$select public.aceitar_convite((select t from tok where nome='retaA'))$q$);

-- ---------- convite pessoal ----------
select teste.como('c0000000-0000-0000-0000-0000000000c1');
create temp table pes(id uuid);
reset role; grant all on pes to authenticated; set role authenticated;
select teste.como('c0000000-0000-0000-0000-0000000000c1');
insert into pes select public.convidar_jogador('e0000000-0000-0000-0000-0000000000e4','Convidado X');
select teste.erro_qualquer('convite pessoal numa unidade em que a pessoa não está', $q$select public.criar_convite('e0000000-0000-0000-0000-0000000000e5', (select id from pes))$q$);
insert into tok select 'pessoal', public.criar_convite('e0000000-0000-0000-0000-0000000000e4', (select id from pes));
select teste.igual('link pessoal mostra o nome cadastrado', $q$select public.ver_convite((select t from tok where nome='pessoal'))->>'pessoa'$q$, 'Convidado X');
select teste.como('cb000000-0000-0000-0000-000000000002');
select teste.ok('Segundo aceita o link pessoal', $q$select public.aceitar_convite((select t from tok where nome='pessoal'))$q$);
select teste.igual('…e virou o "Convidado X" (mesma pessoa, agora com conta)', $q$select nome||':'||status from public.pessoa where user_id=auth.uid()$q$, 'Convidado X:ativo');
select teste.como('cb000000-0000-0000-0000-000000000003');
select teste.erro_qualquer('link pessoal só vale uma vez', $q$select public.aceitar_convite((select t from tok where nome='pessoal'))$q$);

-- ---------- cancelado e vencido ----------
select teste.como('c0000000-0000-0000-0000-0000000000c1');
insert into tok select 'cancela', public.criar_convite('e0000000-0000-0000-0000-0000000000e5');
select teste.ok('admin cancela um link', $q$select public.revogar_convite((select id from public.convite where expira_em > now() and pessoa_id is null and unidade_id='e0000000-0000-0000-0000-0000000000e5'))$q$);
select teste.igual('link cancelado avisa', $q$select public.ver_convite((select t from tok where nome='cancela'))->>'motivo'$q$, 'Esse convite foi cancelado. Pede um link novo pro gestor.');
insert into tok select 'vence', public.criar_convite('e0000000-0000-0000-0000-0000000000e5', null, 1);
reset role;
update public.convite set expira_em = now() - interval '1 minute' where token_hash = public.convite_hash((select t from tok where nome='vence'));
set role authenticated;
select teste.como('cb000000-0000-0000-0000-000000000003');
select teste.erro_qualquer('link cancelado não entra', $q$select public.aceitar_convite((select t from tok where nome='cancela'))$q$);
select teste.erro_qualquer('link vencido não entra', $q$select public.aceitar_convite((select t from tok where nome='vence'))$q$);

-- ---------- nome repetido e assentos ----------
select teste.como('cb000000-0000-0000-0000-000000000005');
select teste.ok('apelido "João" entra mesmo já existindo um João no time', $q$select public.aceitar_convite((select t from tok where nome='retaA'))$q$);
select teste.igual('…com sufixo, pra não confundir os torneios dos dois', $q$select (nome like 'João #%')::text from public.pessoa where user_id=auth.uid()$q$, 'true');
reset role;
update public.workspaces set assentos = (select count(*) from public.pessoa where workspace_id='d0000000-0000-0000-0000-0000000000d1' and status<>'saiu') where id='d0000000-0000-0000-0000-0000000000d1';
set role authenticated;
select teste.como('cb000000-0000-0000-0000-000000000003');
select teste.erro_qualquer('time sem assento livre recusa o link', $q$select public.aceitar_convite((select t from tok where nome='retaA'))$q$);
reset role;
update public.workspaces set assentos = null where id='d0000000-0000-0000-0000-0000000000d1';

-- ---------- quem saiu e volta ----------
set role authenticated;
select teste.como('c0000000-0000-0000-0000-0000000000c5');
select teste.ok('Maria (saiu antes) volta pelo link', $q$select public.aceitar_convite((select t from tok where nome='retaA'))$q$);
reset role;
select teste.igual('…o registro antigo fica com o histórico, sem a conta; o novo é ativo',
  $q$select string_agg(status||':'||(user_id is not null), ',' order by status) from public.pessoa where workspace_id='d0000000-0000-0000-0000-0000000000d1' and (nome='Maria' or user_id='c0000000-0000-0000-0000-0000000000c5')$q$, 'ativo:true,saiu:false');
select teste.igual('usos do link da reta contados', $q$select usos::text from public.convite where token_hash=public.convite_hash((select t from tok where nome='retaA'))$q$, '3');
