-- Fase 1 · passo 1: estrutura de times. Cenário parecido com o Samba: Base > Pandeiro / Reco-reco, e Principal.
-- Usa teste.ok / teste.erro / teste.igual do f05_f06.sql.
\set ON_ERROR_STOP 1
create or replace function teste.erro_qualquer(rotulo text, cmd text) returns void language plpgsql as $$
begin
  begin execute cmd; raise notice 'FALHA  % (passou, devia ser barrado)', rotulo;
  exception when others then raise notice 'OK     % (barrado: %)', rotulo, sqlerrm; end;
end $$;
grant execute on function teste.erro_qualquer(text,text) to authenticated;
create or replace function teste.como(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
$$;
grant execute on function teste.como(text) to authenticated;

-- usuários: G dono/gestor geral do Samba · P professor da Base · Q professor só do Pandeiro · T joga no Principal e gere o Pandeiro
--           J1 joga no Pandeiro · J2 joga no Reco-reco · X dono de OUTRA organização
insert into auth.users(id,email,email_confirmed_at) values
 ('a0000000-0000-0000-0000-0000000000a1','g@samba.test',now()), ('a0000000-0000-0000-0000-0000000000a2','p@samba.test',now()),
 ('a0000000-0000-0000-0000-0000000000a3','q@samba.test',now()), ('a0000000-0000-0000-0000-0000000000a4','t@samba.test',now()),
 ('a0000000-0000-0000-0000-0000000000a5','j1@samba.test',now()), ('a0000000-0000-0000-0000-0000000000a6','j2@samba.test',now()),
 ('a0000000-0000-0000-0000-0000000000a7','x@outro.test',now());
insert into public.workspaces(id,name,kind,plan,trial_ends_at) values
 ('b0000000-0000-0000-0000-0000000000b1','Samba','team','team',null), ('b0000000-0000-0000-0000-0000000000b2','Outro','team','team',null);
insert into public.workspace_members(workspace_id,user_id,role) values
 ('b0000000-0000-0000-0000-0000000000b1','a0000000-0000-0000-0000-0000000000a1','owner'),
 ('b0000000-0000-0000-0000-0000000000b2','a0000000-0000-0000-0000-0000000000a7','owner');

-- ---------- G monta o time ----------
set role authenticated;
select teste.como('a0000000-0000-0000-0000-0000000000a1');
create temp table ids(nome text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'raiz', public.iniciar_time('Samba','Gestor');
select teste.erro_qualquer('iniciar o time duas vezes', $q$select public.iniciar_time('Samba','Gestor')$q$);
insert into ids select 'base', public.criar_unidade((select id from ids where nome='raiz'),'Base','Base',1);
insert into ids select 'pandeiro', public.criar_unidade((select id from ids where nome='base'),'Pandeiro','Reta',1);
insert into ids select 'reco', public.criar_unidade((select id from ids where nome='base'),'Reco-reco','Reta',2);
insert into ids select 'principal', public.criar_unidade((select id from ids where nome='raiz'),'Principal','Principal',2);
insert into ids select 'pandA', public.criar_unidade((select id from ids where nome='pandeiro'),'Pandeiro A','Turma',1);
insert into ids select 'P', public.convidar_gestor((select id from ids where nome='base'),'Prof Base',array['ver_desempenho','ver_financeiro','promover','gerir_pessoas']);
insert into ids select 'Q', public.convidar_gestor((select id from ids where nome='pandeiro'),'Prof Pandeiro',array['ver_desempenho']);
insert into ids select 'J1', public.convidar_jogador((select id from ids where nome='pandeiro'),'Jogador 1','j1ps');
insert into ids select 'J2', public.convidar_jogador((select id from ids where nome='reco'),'Jogador 2');
insert into ids select 'T', public.convidar_jogador((select id from ids where nome='principal'),'Prof que joga');
select public.definir_acesso((select id from ids where nome='T'),(select id from ids where nome='pandeiro'),array['ver_desempenho']);
select teste.igual('árvore: Pandeiro A dentro de Base', $q$select ((select caminho from public.unidade where id=(select id from ids where nome='pandA')) like (select caminho from public.unidade where id=(select id from ids where nome='base'))||'%')::text$q$, 'true');
select teste.erro_qualquer('ciclo: mover Base pra dentro do Pandeiro', $q$select public.mover_unidade((select id from ids where nome='base'),(select id from ids where nome='pandeiro'))$q$);
select teste.erro('gravar direto na tabela (sem a função)', $q$insert into public.unidade(workspace_id,nome) values ('b0000000-0000-0000-0000-0000000000b1','Hack')$q$);
reset role;

-- convites aceitos (o fluxo de convite liga a conta à pessoa; aqui, direto)
update public.pessoa set user_id='a0000000-0000-0000-0000-0000000000a2', status='ativo' where id=(select id from ids where nome='P');
update public.pessoa set user_id='a0000000-0000-0000-0000-0000000000a3', status='ativo' where id=(select id from ids where nome='Q');
update public.pessoa set user_id='a0000000-0000-0000-0000-0000000000a4', status='ativo' where id=(select id from ids where nome='T');
update public.pessoa set user_id='a0000000-0000-0000-0000-0000000000a5', status='ativo' where id=(select id from ids where nome='J1');
update public.pessoa set user_id='a0000000-0000-0000-0000-0000000000a6', status='ativo' where id=(select id from ids where nome='J2');
insert into public.workspace_members(workspace_id,user_id,role) select 'b0000000-0000-0000-0000-0000000000b1', u, 'member'
  from unnest(array['a0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-0000000000a3','a0000000-0000-0000-0000-0000000000a4',
                    'a0000000-0000-0000-0000-0000000000a5','a0000000-0000-0000-0000-0000000000a6']::uuid[]) u;
set role authenticated;

-- ---------- Q: professor só do Pandeiro, só ver desempenho ----------
select teste.como('a0000000-0000-0000-0000-0000000000a3');
select teste.igual('Q vê J1 (Pandeiro)', $q$select count(*)::text from public.pessoa where id=(select id from ids where nome='J1')$q$, '1');
select teste.igual('Q NÃO vê J2 (Reco-reco)', $q$select count(*)::text from public.pessoa where id=(select id from ids where nome='J2')$q$, '0');
select teste.erro('Q não convida (sem gerir pessoas)', $q$select public.convidar_jogador((select id from ids where nome='pandeiro'),'Novo')$q$);
select teste.erro('Q não promove (sem promover)', $q$select public.mover_jogador((select id from ids where nome='J1'),(select id from ids where nome='reco'),'promocao')$q$);

-- ---------- P: professor da Base inteira ----------
select teste.como('a0000000-0000-0000-0000-0000000000a2');
select teste.igual('P vê J1 e J2 (Base inteira)', $q$select count(*)::text from public.pessoa where id in ((select id from ids where nome='J1'),(select id from ids where nome='J2'))$q$, '2');
select teste.igual('P NÃO vê quem joga no Principal', $q$select count(*)::text from public.pessoa where id=(select id from ids where nome='T')$q$, '0');
select teste.ok('P promove J1 do Pandeiro pro Reco-reco', $q$select public.mover_jogador((select id from ids where nome='J1'),(select id from ids where nome='reco'),'promocao')$q$);
select teste.erro('P NÃO promove pro Principal (sem escopo no destino)', $q$select public.mover_jogador((select id from ids where nome='J2'),(select id from ids where nome='principal'),'promocao')$q$);
select teste.erro('P não cria unidade (sem administrar)', $q$select public.criar_unidade((select id from ids where nome='base'),'Nova')$q$);
reset role;
select teste.igual('J1: 1 vínculo ativo + histórico', $q$select count(*) filter (where fim is null)||'/'||count(*) from public.vinculo where pessoa_id=(select id from ids where nome='J1')$q$, '1/2');
select teste.erro_qualquer('banco recusa 2 vínculos ativos', $q$insert into public.vinculo(pessoa_id,unidade_id) values ((select id from ids where nome='J1'),(select id from ids where nome='principal'))$q$);
set role authenticated;

-- ---------- Q depois da promoção: continua vendo o histórico da reta dele ----------
select teste.como('a0000000-0000-0000-0000-0000000000a3');
select teste.igual('Q ainda vê J1 (jogou no Pandeiro)', $q$select count(*)::text from public.pessoa where id=(select id from ids where nome='J1')$q$, '1');

-- ---------- J1: jogador só vê a si ----------
select teste.como('a0000000-0000-0000-0000-0000000000a5');
select teste.igual('J1 só vê a própria pessoa', $q$select count(*)::text from public.pessoa$q$, '1');
select teste.igual('J1 não vê acessos de ninguém', $q$select count(*)::text from public.acesso$q$, '0');
select teste.erro('J1 não convida', $q$select public.convidar_jogador((select id from ids where nome='reco'),'Amigo')$q$);
select teste.igual('J1 vê a árvore (só nomes)', $q$select count(*)::text from public.unidade$q$, '6');

-- ---------- T: joga no Principal e gere o Pandeiro ----------
select teste.como('a0000000-0000-0000-0000-0000000000a4');
select teste.igual('T vê a si e quem passou pelo Pandeiro (J1), não J2', $q$select string_agg(nome, ',' order by nome) from public.pessoa$q$, 'Jogador 1,Prof que joga');

-- ---------- X: outra organização ----------
select teste.como('a0000000-0000-0000-0000-0000000000a7');
select teste.igual('X não vê unidades do Samba', $q$select count(*)::text from public.unidade where workspace_id='b0000000-0000-0000-0000-0000000000b1'$q$, '0');
select teste.igual('X não vê pessoas do Samba', $q$select count(*)::text from public.pessoa$q$, '0');
select teste.erro('X não cria unidade no Samba', $q$select public.criar_unidade((select id from ids where nome='raiz'),'Invasão')$q$);
select teste.erro('X não se dá acesso no Samba', $q$select public.definir_acesso((select id from ids where nome='J2'),(select id from ids where nome='raiz'),array['administrar'])$q$);

-- ---------- G: mover subárvore, assentos, saída ----------
select teste.como('a0000000-0000-0000-0000-0000000000a1');
select teste.ok('G move o Pandeiro (com a turma) pro Principal', $q$select public.mover_unidade((select id from ids where nome='pandeiro'),(select id from ids where nome='principal'))$q$);
select teste.igual('a turma do Pandeiro foi junto', $q$select ((select caminho from public.unidade where id=(select id from ids where nome='pandA')) like (select caminho from public.unidade where id=(select id from ids where nome='principal'))||'%')::text$q$, 'true');
reset role;
update public.workspaces set assentos = (select count(*) from public.pessoa where workspace_id='b0000000-0000-0000-0000-0000000000b1' and status<>'saiu') where id='b0000000-0000-0000-0000-0000000000b1';
set role authenticated;
select teste.como('a0000000-0000-0000-0000-0000000000a1');
select teste.erro_qualquer('convite além dos assentos do contrato', $q$select public.convidar_jogador((select id from ids where nome='reco'),'Excedente')$q$);
select teste.como('a0000000-0000-0000-0000-0000000000a2');
select teste.ok('P registra a saída do J2', $q$select public.registrar_saida((select id from ids where nome='J2'))$q$);
select teste.como('a0000000-0000-0000-0000-0000000000a1');
select teste.ok('saída libera assento: novo convite entra', $q$select public.convidar_jogador((select id from ids where nome='reco'),'Novo jogador')$q$);
reset role;
select teste.igual('J2 saiu sem vínculo ativo', $q$select status||':'||(select count(*) from public.vinculo where pessoa_id=p.id and fim is null) from public.pessoa p where id=(select id from ids where nome='J2')$q$, 'saiu:0');
