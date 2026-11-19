-- Fase 1: papéis da gestão, convite único, renomear e arquivar. Roda depois do fase1_grade.sql (Samba D).
-- 01 admin (raiz) · 02 financeiro (raiz) · 03 professor (ver_desempenho na Base) · 04 Gabriel D (Base) · 05 Outro D (Reta A)
\set ON_ERROR_STOP 1
reset role;
insert into auth.users(id,email,email_confirmed_at) values ('dd000000-0000-0000-0000-000000000077','prof@din.test',now());
create temp table px(id uuid); create temp table tk(t text);
grant all on px, tk to authenticated;
set role authenticated;

-- ---------- convite de gestão ----------
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.erro('professor NÃO convida gente da gestão', $q$select public.convidar_equipe('Prof X', array['df000000-0000-0000-0000-00000000000a']::uuid[], array['ver_desempenho'])$q$);
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.erro_qualquer('papel inválido', $q$select public.convidar_equipe('Prof X', array['df000000-0000-0000-0000-00000000000a']::uuid[], array['mandar_em_tudo'])$q$);
select teste.erro_qualquer('sem unidade', $q$select public.convidar_equipe('Prof X', array[]::uuid[], array['ver_desempenho'])$q$);
select teste.erro_qualquer('nome que já existe no time', $q$select public.convidar_equipe('gabriel d', array['df000000-0000-0000-0000-00000000000a']::uuid[], array['ver_desempenho'])$q$);
insert into px select public.convidar_equipe('Prof X', array['df000000-0000-0000-0000-00000000000a','df000000-0000-0000-0000-00000000000b']::uuid[],
  array['promover','ver_desempenho','ver_financeiro','ver_desempenho'], 'df000000-0000-0000-0000-00000000000b');
select teste.igual('admin convida professor de duas retas que também joga na Reta B (capacidades sem repetição)',
  $q$select (select count(*) from public.acesso where pessoa_id=(select id from px))||'/'||
            (select array_to_string(capacidades,',') from public.acesso where pessoa_id=(select id from px) limit 1)||'/'||
            (select u.nome from public.vinculo v join public.unidade u on u.id=v.unidade_id where v.pessoa_id=(select id from px) and v.fim is null)||'/'||
            (select status from public.pessoa where id=(select id from px))$q$, '2/promover,ver_desempenho,ver_financeiro/Reta B/convidado');
insert into tk select public.criar_convite('df000000-0000-0000-0000-00000000000a', (select id from px), 7, null);
reset role;
select teste.igual('a tela do link mostra o papel e a reta em que ele joga',
  $q$select (public.ver_convite((select t from tk))->'capacidades')::text||' '||(public.ver_convite((select t from tk))->>'joga_em')$q$,
  '["promover", "ver_desempenho", "ver_financeiro"] Reta B');
set role authenticated;
select teste.como('dd000000-0000-0000-0000-000000000077');
select teste.ok('o professor aceita o convite', $q$select public.aceitar_convite((select t from tk))$q$);
select teste.igual('…e vê os jogadores das retas dele (Reta A: Outro D e Novo D; Reta B: ele mesmo)',
  $q$select string_agg(nome, ',' order by nome) from public.resumo_time()$q$, 'Novo D,Outro D,Prof X');

-- ---------- trocar papel ----------
select teste.erro('professor NÃO muda papel de ninguém', $q$select public.definir_papel('d1000000-0000-0000-0000-000000000003', array['df000000-0000-0000-0000-000000000001']::uuid[], array['administrar'])$q$);
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.erro_qualquer('o único admin NÃO tira o próprio admin (o time ficaria sem admin)',
  $q$select public.definir_papel('d1000000-0000-0000-0000-000000000001', array['df000000-0000-0000-0000-000000000001']::uuid[], array['ver_desempenho'])$q$);
select teste.igual('…e continua admin', $q$select array_to_string(capacidades,',') from public.acesso where pessoa_id='d1000000-0000-0000-0000-000000000001'$q$, 'administrar');
select teste.ok('admin vira o Prof X em financeiro do time inteiro', $q$select public.definir_papel((select id from px), array['df000000-0000-0000-0000-000000000001']::uuid[], array['ver_financeiro','aprovar_saques'])$q$);
select teste.igual('…uma linha só, na raiz', $q$select count(*)||':'||max(array_to_string(capacidades,',')) from public.acesso where pessoa_id=(select id from px)$q$, '1:aprovar_saques,ver_financeiro');
select teste.ok('tirar o papel de quem joga: continua no time como jogador', $q$select public.definir_papel((select id from px), null, null)$q$);
select teste.igual('…sem acesso e ativo', $q$select (select count(*) from public.acesso where pessoa_id=(select id from px))||'/'||(select status from public.pessoa where id=(select id from px))$q$, '0/ativo');
create temp table fy(id uuid);
reset role; grant all on fy to authenticated; set role authenticated;
select teste.como('dd000000-0000-0000-0000-000000000001');
insert into fy select public.convidar_equipe('Fin Y', array['df000000-0000-0000-0000-000000000001']::uuid[], array['ver_financeiro','aprovar_saques']);
select teste.ok('link pessoal pra Fin Y', $q$select public.criar_convite('df000000-0000-0000-0000-000000000001', (select id from fy))$q$);
select teste.ok('tirar o papel de quem não joga', $q$select public.definir_papel((select id from fy), array[]::uuid[], array[]::text[])$q$);
reset role;
select teste.igual('…sai do time e o link dela é cancelado',
  $q$select (select status from public.pessoa where id=(select id from fy))||'/'||(select bool_and(revogado)::text from public.convite where pessoa_id=(select id from fy))$q$, 'saiu/true');
set role authenticated;

-- ---------- renomear pessoa ----------
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.erro('professor só de desempenho NÃO renomeia', $q$select public.renomear_pessoa('d1000000-0000-0000-0000-000000000005', 'Hack')$q$);
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.erro_qualquer('renomear pra um nome que já existe', $q$select public.renomear_pessoa('d1000000-0000-0000-0000-000000000005', 'Gabriel D')$q$);
select teste.ok('admin renomeia o Outro D', $q$select public.renomear_pessoa('d1000000-0000-0000-0000-000000000005', 'Outro Novo')$q$);
reset role;
select teste.igual('os torneios dele acompanham o nome e continuam ligados a ele',
  $q$select (select count(*) from public.tournaments where pessoa_id='d1000000-0000-0000-0000-000000000005')||'='||
            (select count(*) from public.tournaments where player='Outro Novo')||' antigos:'||
            (select count(*) from public.tournaments where player='Outro D')$q$, '2=2 antigos:0');
select teste.ok('torneio novo com o nome novo liga na mesma pessoa', $q$insert into public.tournaments(workspace_id,entry_date,player,buyin,prize) values ('de000000-0000-0000-0000-000000000001',current_date,'outro novo',1,0)$q$);
select teste.igual('…ligou', $q$select count(*)::text from public.tournaments where pessoa_id='d1000000-0000-0000-0000-000000000005'$q$, '3');
set role authenticated;

-- ---------- renomear e arquivar unidade ----------
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.erro('professor NÃO renomeia unidade', $q$select public.renomear_unidade('df000000-0000-0000-0000-00000000000b', 'X')$q$);
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.erro_qualquer('nome igual ao de uma irmã', $q$select public.renomear_unidade('df000000-0000-0000-0000-00000000000b', 'reta a')$q$);
select teste.ok('admin renomeia a Reta B com rótulo', $q$select public.renomear_unidade('df000000-0000-0000-0000-00000000000b', 'Banjo', 'Reta 3')$q$);
select teste.igual('…nome e rótulo novos', $q$select nome||' · '||rotulo from public.unidade where id='df000000-0000-0000-0000-00000000000b'$q$, 'Banjo · Reta 3');
select teste.erro_qualquer('arquivar a raiz', $q$select public.arquivar_unidade('df000000-0000-0000-0000-000000000001')$q$);
select teste.erro_qualquer('arquivar reta com jogador (Prof X joga na Banjo)', $q$select public.arquivar_unidade('df000000-0000-0000-0000-00000000000b')$q$);
create temp table vz(id uuid);
reset role; grant all on vz to authenticated; set role authenticated;
select teste.como('dd000000-0000-0000-0000-000000000001');
insert into vz select public.criar_unidade('df000000-0000-0000-0000-000000000002', 'Vazia', null, 9);
select teste.ok('arquivar reta vazia', $q$select public.arquivar_unidade((select id from vz))$q$);
select teste.igual('…arquivada', $q$select arquivada::text from public.unidade where id=(select id from vz)$q$, 'true');
reset role;
