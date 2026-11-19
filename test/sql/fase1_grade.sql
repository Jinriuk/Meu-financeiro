-- Fase 1: grade da reta e regras herdadas. Roda depois do fase1_visao.sql (Samba D).
-- 01 admin (raiz) · 02 financeiro (raiz) · 03 professor (ver_desempenho na Base) · 04 Gabriel D · 05 Outro D · 99 Novo D (todos na Base)
\set ON_ERROR_STOP 1
reset role;
insert into public.unidade(id,workspace_id,mae_id,nome) values
 ('df000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-000000000001','df000000-0000-0000-0000-000000000002','Reta A'),
 ('df000000-0000-0000-0000-00000000000b','de000000-0000-0000-0000-000000000001','df000000-0000-0000-0000-000000000002','Reta B');
create temp table gid(id uuid);
grant all on gid to authenticated;
set role authenticated;
select teste.como('dd000000-0000-0000-0000-000000000004'); select public.apagar_avisos();
select teste.como('dd000000-0000-0000-0000-000000000005'); select public.apagar_avisos();

-- ---------- gravar grade: só quem configura regras ----------
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.erro('professor (só ver desempenho) NÃO grava grade', $q$select public.salvar_grade('df000000-0000-0000-0000-000000000002', current_date, false, '[{"site":"GGpoker","tipo":"Semanal","regular":"até $2,50"}]')$q$);
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.erro('jogador NÃO grava grade', $q$select public.salvar_grade('df000000-0000-0000-0000-000000000002', current_date, false, '[{"site":"GGpoker","tipo":"Semanal","regular":"até $50"}]')$q$);
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.erro_qualquer('grade vazia', $q$select public.salvar_grade('df000000-0000-0000-0000-000000000002', current_date, false, '[]')$q$);
select teste.erro_qualquer('grade que não é lista', $q$select public.salvar_grade('df000000-0000-0000-0000-000000000002', current_date, false, '{"site":"GG"}')$q$);
select teste.erro_qualquer('linha sem sala', $q$select public.salvar_grade('df000000-0000-0000-0000-000000000002', current_date, false, '[{"tipo":"Semanal","regular":"até $2"}]')$q$);
select teste.erro_qualquer('célula que não é texto', $q$select public.salvar_grade('df000000-0000-0000-0000-000000000002', current_date, false, '[{"site":"GG","tipo":"Semanal","regular":{"x":1}}]')$q$);
select teste.erro_qualquer('mais de 300 linhas', $q$select public.salvar_grade('df000000-0000-0000-0000-000000000002', current_date, false, (select jsonb_agg(jsonb_build_object('site','GG','tipo','Semanal')) from generate_series(1,301)))$q$);
insert into gid select public.salvar_grade('df000000-0000-0000-0000-000000000002', current_date - 30, false,
  '[{"site":"GGpoker","tipo":"Semanal","regular":"até $2,50 + $3 2k+","prog_ko":"até $2","hyper":"não","lixo":"<script>"},{"site":"PokerStars","tipo":"Semanal","regular":3.3}]', 'grade da Base');
select teste.igual('admin grava a grade da Base (vale desde 30 dias atrás), só com as 5 colunas e número vira texto',
  $q$select (celulas->0 ? 'lixo')::text||'/'||(celulas->1->>'regular')||'/'||(celulas->1->>'hyper')||'/'||simulada from public.grade where id=(select id from gid)$q$, 'false/3.3//false');
select teste.ok('gravar de novo na mesma data substitui', $q$select public.salvar_grade('df000000-0000-0000-0000-000000000002', current_date - 30, false, '[{"site":"GGpoker","tipo":"Semanal","regular":"até $2,50"}]')$q$);
select teste.igual('…continua 1 grade na Base, com a linha nova', $q$select count(*)||'/'||max(jsonb_array_length(celulas)) from public.grade where unidade_id='df000000-0000-0000-0000-000000000002'$q$, '1/1');
select teste.ok('grade SIMULADA na Reta A', $q$select public.salvar_grade('df000000-0000-0000-0000-00000000000a', current_date, true, '[{"site":"GGpoker","tipo":"Semanal","regular":"até $5,40"}]')$q$);
select teste.erro('ninguém grava direto na tabela', $q$insert into public.grade(workspace_id,unidade_id,celulas) values ('de000000-0000-0000-0000-000000000001','df000000-0000-0000-0000-00000000000b','[]')$q$);

-- ---------- avisos: só os jogadores que a grade cobre ----------
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.igual('Gabriel (na Base) avisado da grade da Base (2x: gravou e regravou), nada da Reta A (ninguém lá ainda)',
  $q$select string_agg(distinct titulo, ',') ||' x'|| count(*) from public.aviso where tipo='grade'$q$, 'Grade nova na Base x2');
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.igual('professor não é jogador: sem aviso de grade', $q$select count(*)::text from public.aviso where tipo='grade'$q$, '0');

-- ---------- quem enxerga ----------
select teste.como('dd000000-0000-0000-0000-000000000005');
select teste.igual('jogador do time enxerga as grades do time', $q$select count(*)::text from public.grade$q$, '2');
select teste.como('ee000000-0000-0000-0000-000000000001');
select teste.igual('dono de OUTRO time não enxerga', $q$select count(*)::text from public.grade$q$, '0');

-- ---------- apagar ----------
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.erro('professor NÃO apaga grade', $q$select public.apagar_grade((select id from public.grade where unidade_id='df000000-0000-0000-0000-00000000000a'))$q$);
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.ok('admin apaga a grade simulada da Reta A', $q$select public.apagar_grade((select id from public.grade where unidade_id='df000000-0000-0000-0000-00000000000a'))$q$);
select teste.igual('…sobra a da Base', $q$select count(*)::text from public.grade$q$, '1');

-- ---------- regras herdadas ----------
select teste.como('dd000000-0000-0000-0000-000000000003');
select teste.erro('professor NÃO define regra', $q$select public.definir_regra('df000000-0000-0000-0000-000000000002', 'bloquear_promocao_com_mk', 'true')$q$);
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.erro_qualquer('regra desconhecida', $q$select public.definir_regra('df000000-0000-0000-0000-000000000002', 'qualquer', 'true')$q$);
select teste.erro_qualquer('valor que não é liga/desliga', $q$select public.definir_regra('df000000-0000-0000-0000-000000000002', 'bloquear_promocao_com_mk', '"sim"')$q$);
select teste.ok('admin liga "bloquear promoção com MK" na Base', $q$select public.definir_regra('df000000-0000-0000-0000-000000000002', 'bloquear_promocao_com_mk', 'true')$q$);
select teste.igual('a Reta A herda da Base', $q$select public.regra_efetiva('df000000-0000-0000-0000-00000000000a', 'bloquear_promocao_com_mk')::text$q$, 'true');
select teste.ok('admin desliga só na Reta B', $q$select public.definir_regra('df000000-0000-0000-0000-00000000000b', 'bloquear_promocao_com_mk', 'false')$q$);
select teste.igual('Reta B desligada, Base e Reta A ligadas, raiz sem regra',
  $q$select concat_ws('/', public.regra_efetiva('df000000-0000-0000-0000-00000000000b','bloquear_promocao_com_mk'), public.regra_efetiva('df000000-0000-0000-0000-000000000002','bloquear_promocao_com_mk'),
                          public.regra_efetiva('df000000-0000-0000-0000-00000000000a','bloquear_promocao_com_mk'), coalesce(public.regra_efetiva('df000000-0000-0000-0000-000000000001','bloquear_promocao_com_mk')::text,'-'))$q$, 'false/true/true/-');
select teste.ok('regra que só vale daqui a 10 dias', $q$select public.definir_regra('df000000-0000-0000-0000-000000000001', 'jogador_ve_ranking', 'true', current_date + 10)$q$);
select teste.igual('…hoje ainda não vale; daqui a 11 dias vale (e desce pra Base)',
  $q$select coalesce(public.regra_efetiva('df000000-0000-0000-0000-000000000002','jogador_ve_ranking')::text,'-')||'/'||public.regra_efetiva('df000000-0000-0000-0000-000000000002','jogador_ve_ranking', current_date + 11)$q$, '-/true');
select teste.como('ee000000-0000-0000-0000-000000000001');
select teste.igual('dono de OUTRO time não lê a regra', $q$select coalesce(public.regra_efetiva('df000000-0000-0000-0000-00000000000a','bloquear_promocao_com_mk')::text,'-')$q$, '-');
select teste.igual('…nem enxerga a tabela', $q$select count(*)::text from public.regra_unidade$q$, '0');

-- ---------- promoção com MK ----------
select teste.erro('cliente NÃO chama em_mk', $q$select public.em_mk('d1000000-0000-0000-0000-000000000005')$q$);
create temp table rs(nome text, banca numeric, mu numeric);
reset role; grant all on rs to authenticated; set role authenticated;
select teste.como('dd000000-0000-0000-0000-000000000002');
insert into rs select nome, banca, mu from public.resumo_time();
reset role;
select teste.igual('em_mk igual à conta da visão do time (banca < MU) pra todo mundo',
  $q$select bool_and(public.em_mk(p.id) = (coalesce(r.banca,0) < coalesce(r.mu,0)))::text from rs r join public.pessoa p on p.nome = r.nome and p.workspace_id='de000000-0000-0000-0000-000000000001'$q$, 'true');
select teste.igual('Outro D está em MK; Novo D não', $q$select public.em_mk('d1000000-0000-0000-0000-000000000005')||'/'||public.em_mk((select id from public.pessoa where nome='Novo D'))$q$, 'true/false');
set role authenticated;
select teste.como('dd000000-0000-0000-0000-000000000001');
select teste.erro_qualquer('promover Outro D (em MK) com a regra ligada na Base: recusado', $q$select public.mover_jogador('d1000000-0000-0000-0000-000000000005','df000000-0000-0000-0000-00000000000a','promocao')$q$);
select teste.igual('…e ele continua na Base', $q$select u.nome from public.vinculo v join public.unidade u on u.id=v.unidade_id where v.pessoa_id='d1000000-0000-0000-0000-000000000005' and v.fim is null$q$, 'Base');
select teste.ok('promover Novo D (sem MK) passa', $q$select public.mover_jogador((select id from public.pessoa where nome='Novo D'),'df000000-0000-0000-0000-00000000000a','promocao')$q$);
select teste.ok('transferência não é promoção: Outro D vai pra Reta B mesmo em MK', $q$select public.mover_jogador('d1000000-0000-0000-0000-000000000005','df000000-0000-0000-0000-00000000000b','transferencia')$q$);
select teste.ok('na Reta B a regra está desligada: Outro D é promovido pra Reta A mesmo em MK', $q$select public.mover_jogador('d1000000-0000-0000-0000-000000000005','df000000-0000-0000-0000-00000000000a','promocao')$q$);
select teste.ok('nova grade simulada na Reta A', $q$select public.salvar_grade('df000000-0000-0000-0000-00000000000a', current_date, true, '[{"site":"GGpoker","tipo":"Semanal","regular":"até $5,40"}]')$q$);
select teste.como('dd000000-0000-0000-0000-000000000005');
select teste.igual('Outro D (agora na Reta A) avisado da grade simulada', $q$select titulo||' | '||texto from public.aviso where tipo='grade' and titulo like '%Reta A'$q$,
  'Grade simulada na Reta A | Vale desde ' || to_char(current_date, 'DD/MM/YYYY') || '. Montada sem a planilha oficial: confirme com o professor.');
select teste.como('dd000000-0000-0000-0000-000000000004');
select teste.igual('Gabriel (Base) não recebe aviso da Reta A', $q$select count(*)::text from public.aviso where titulo like '%Reta A'$q$, '0');
reset role;
