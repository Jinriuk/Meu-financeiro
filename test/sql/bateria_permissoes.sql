-- Bateria de permissões (plano mestre 3.4): pra cada papel e escopo, tentar LER e GRAVAR fora dele. Aceite: 0 vazamentos.
-- É genérica: percorre TODAS as tabelas do schema public (tabela nova entra sozinha; tabela nova com pessoa_id sem
-- classificação derruba o teste). Dois times e gente de fora:
--   Time A: raiz > Base > (R1, R2). AA admin · FA financeiro (raiz) · P1 professor da R1 (desempenho + dinheiro)
--           G1 gere pessoas na R1 · C1 configura regras na Base · J1 joga na R1 (tem histórico de antes do time)
--           J2 joga na R2 · XJ jogava na R1 e saiu (opção B)
--   Time B: AB admin · JB joga na raiz. S: conta individual (pediu pra entrar no A). GG: gestor geral da plataforma.
\set ON_ERROR_STOP 1
reset role;
create table teste.bp(nome text primary key, id uuid, t text);
grant select, insert, update on teste.bp to authenticated;
create or replace function teste.bpid(n text) returns uuid language sql stable as $$ select id from teste.bp where nome = n $$;
grant execute on function teste.bpid(text) to authenticated, anon;
create or replace function teste.como_uid(n text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', ('e7000000-0000-0000-0000-0000000000' || n), 'role', 'authenticated')::text, false) $$;
grant execute on function teste.como_uid(text) to authenticated;

-- ---------- contas ----------
insert into auth.users(id, email, email_confirmed_at) select ('e7000000-0000-0000-0000-0000000000' || n)::uuid, 'bp' || n || '@bateria.test', now()
  from unnest(array['a1','f1','b1','e1','c9','c1','c2','c4','a2','c3','d1','99']) n;
insert into public.player_profiles(user_id, email, nickname) values
 ('e7000000-0000-0000-0000-0000000000c1', 'bpc1@bateria.test', 'Um'), ('e7000000-0000-0000-0000-0000000000c4', 'bpc4@bateria.test', 'Ex'),
 ('e7000000-0000-0000-0000-0000000000d1', 'bpd1@bateria.test', 'Solo');
insert into public.gestor_plataforma(user_id) values ('e7000000-0000-0000-0000-000000000099');
-- Time A
insert into teste.bp(nome, id) select 'wsA', public.criar_time('Bateria A', 'e7000000-0000-0000-0000-0000000000a1', 'Admin A', null);
insert into teste.bp(nome, id) select 'RA', id from public.unidade where workspace_id = teste.bpid('wsA') and mae_id is null;
insert into public.unidade(workspace_id, mae_id, nome) values (teste.bpid('wsA'), teste.bpid('RA'), 'Base A');
insert into teste.bp(nome, id) select 'BA', id from public.unidade where workspace_id = teste.bpid('wsA') and nome = 'Base A';
insert into public.unidade(workspace_id, mae_id, nome) values (teste.bpid('wsA'), teste.bpid('BA'), 'R1'), (teste.bpid('wsA'), teste.bpid('BA'), 'R2');
insert into teste.bp(nome, id) select 'R1', id from public.unidade where workspace_id = teste.bpid('wsA') and nome = 'R1';
insert into teste.bp(nome, id) select 'R2', id from public.unidade where workspace_id = teste.bpid('wsA') and nome = 'R2';
insert into public.pessoa(id, workspace_id, user_id, nome, status) values
 ('e9000000-0000-0000-0000-0000000000f1', teste.bpid('wsA'), 'e7000000-0000-0000-0000-0000000000f1', 'Fin A', 'ativo'),
 ('e9000000-0000-0000-0000-0000000000b1', teste.bpid('wsA'), 'e7000000-0000-0000-0000-0000000000b1', 'Prof R1', 'ativo'),
 ('e9000000-0000-0000-0000-0000000000e1', teste.bpid('wsA'), 'e7000000-0000-0000-0000-0000000000e1', 'Gestor R1', 'ativo'),
 ('e9000000-0000-0000-0000-0000000000c9', teste.bpid('wsA'), 'e7000000-0000-0000-0000-0000000000c9', 'Config Base', 'ativo'),
 ('e9000000-0000-0000-0000-0000000000c2', teste.bpid('wsA'), 'e7000000-0000-0000-0000-0000000000c2', 'Joga Dois', 'ativo'),
 ('e9000000-0000-0000-0000-0000000000c4', teste.bpid('wsA'), 'e7000000-0000-0000-0000-0000000000c4', 'Joga Ex', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) values
 ('e9000000-0000-0000-0000-0000000000f1', teste.bpid('RA'), array['ver_financeiro','aprovar_saques']),
 ('e9000000-0000-0000-0000-0000000000b1', teste.bpid('R1'), array['ver_desempenho','ver_financeiro','promover']),
 ('e9000000-0000-0000-0000-0000000000e1', teste.bpid('R1'), array['gerir_pessoas']),
 ('e9000000-0000-0000-0000-0000000000c9', teste.bpid('BA'), array['configurar_regras']);
insert into public.vinculo(pessoa_id, unidade_id, inicio) values
 ('e9000000-0000-0000-0000-0000000000c2', teste.bpid('R2'), current_date - 20), ('e9000000-0000-0000-0000-0000000000c4', teste.bpid('R1'), current_date - 20);
insert into public.workspace_members(workspace_id, user_id, role) select teste.bpid('wsA'), ('e7000000-0000-0000-0000-0000000000' || n)::uuid, 'member'
  from unnest(array['f1','b1','e1','c9','c2','c4']) n;
-- Time B
insert into teste.bp(nome, id) select 'wsB', public.criar_time('Bateria B', 'e7000000-0000-0000-0000-0000000000a2', 'Admin B', null);
insert into teste.bp(nome, id) select 'RB', id from public.unidade where workspace_id = teste.bpid('wsB') and mae_id is null;
insert into public.pessoa(id, workspace_id, user_id, nome, status) values ('e9000000-0000-0000-0000-0000000000c3', teste.bpid('wsB'), 'e7000000-0000-0000-0000-0000000000c3', 'Joga B', 'ativo');
insert into public.vinculo(pessoa_id, unidade_id, inicio) values ('e9000000-0000-0000-0000-0000000000c3', teste.bpid('RB'), current_date - 20);
insert into public.workspace_members(workspace_id, user_id, role) values (teste.bpid('wsB'), 'e7000000-0000-0000-0000-0000000000c3', 'member');
-- contas individuais: J1 (vai entrar no A pelo convite, com histórico) e S (fica de fora)
insert into public.workspaces(id, name, kind, plan, trial_ends_at) values
 ('e8000000-0000-0000-0000-0000000000c1', 'Solo do Um', 'solo', 'pro', now() + interval '9 days'),
 ('e8000000-0000-0000-0000-0000000000d1', 'Solo', 'solo', 'pro', now() + interval '9 days');
insert into public.workspace_members(workspace_id, user_id, role) values
 ('e8000000-0000-0000-0000-0000000000c1', 'e7000000-0000-0000-0000-0000000000c1', 'owner'), ('e8000000-0000-0000-0000-0000000000d1', 'e7000000-0000-0000-0000-0000000000d1', 'owner');
insert into public.pool_config(workspace_id, player1_name, player2_name) values ('e8000000-0000-0000-0000-0000000000c1', 'Um', ''), ('e8000000-0000-0000-0000-0000000000d1', 'Solo', '');
insert into public.tournaments(workspace_id, entry_date, player, buyin, prize) values
 ('e8000000-0000-0000-0000-0000000000c1', current_date - 40, 'Um', 3, 0), ('e8000000-0000-0000-0000-0000000000d1', current_date - 2, 'Solo', 7, 0);

-- ---------- o dia a dia de cada um (pelas funções e pelo app, com as permissões de verdade) ----------
set role authenticated;
select teste.como_uid('a1');
select public.definir_contrato(teste.bpid('RA'), null, '[{"ate":10000,"jogador":0.35},{"ate":null,"jogador":0.40}]'::jsonb);
insert into teste.bp(nome, id) select 'pJ1', public.convidar_jogador(teste.bpid('R1'), 'Joga Um');
insert into teste.bp(nome, t) select 'tk1', public.criar_convite(teste.bpid('R1'), teste.bpid('pJ1'));
insert into teste.bp(nome, t) select 'cod', public.gerar_codigo_time();
select public.salvar_grade(teste.bpid('R1'), current_date - 30, false, '[{"site":"GGpoker","tipo":"Semanal","regular":"até $5"}]'::jsonb);
select public.criar_convite(teste.bpid('R2'), null, 7, 5);
select teste.como_uid('c1'); select public.aceitar_convite(teste.bp.t) from teste.bp where nome = 'tk1';
reset role;
update public.vinculo set inicio = current_date - 20 where pessoa_id = teste.bpid('pJ1');   -- entrou há 20 dias (o de 40 dias atrás é de antes)
set role authenticated;
select teste.como_uid('d1'); select public.pedir_entrada_time(teste.bp.t) from teste.bp where nome = 'cod';
select teste.como_uid('c9'); select public.definir_regra(teste.bpid('BA'), 'abi_max', '5'::jsonb);
select teste.como_uid('f1');
select public.registrar_aporte(teste.bpid('pJ1'), 100); select public.registrar_aporte('e9000000-0000-0000-0000-0000000000c2', 100); select public.registrar_aporte('e9000000-0000-0000-0000-0000000000c4', 50);
-- cada jogador lança o que o app lança: torneio, mãos, diário, import, movimento, saque antigo do pool, sala
reset role;
create or replace function teste.lanca(nome text) returns void language plpgsql as $f$
begin
  insert into public.tournaments(entry_date, player, buyin, prize, site, site_tournament_id) values (current_date - 3, nome, 5, 20, 'GG Poker', 'T-' || nome);
  insert into public.hh_tournament_stats(player, site, site_tournament_id, entry_date, hands) values (nome, 'GG Poker', 'T-' || nome, current_date - 3, 40);
  insert into public.daily_entries(entry_date, player, saldo_final) values (current_date - 3, nome, 100);
  insert into public.hh_import_log(player, saved) values (nome, 1);
  insert into public.bankroll_ledger(entry_date, wallet, entrada, saida, player) values (current_date - 3, 'GG Poker', 10, 0, nome);
  insert into public.withdrawals(week_ending_date, player, valor_sacado) values (current_date - 3, nome, 1);
  insert into public.player_wallets(player, wallet, saldo_inicial) values (nome, 'GG Poker', 0);
end $f$;
grant execute on function teste.lanca(text) to authenticated;
set role authenticated;
select teste.como_uid('c1'); select teste.lanca('Joga Um');
select public.pedir_reload(30, 'GG', 'teste'); select public.solicitar_saque(125, 0, 5, null, null);
select public.enviar_planilha('{"makeup":100,"cashout":0}'::jsonb);
select teste.como_uid('c2'); select teste.lanca('Joga Dois');
select teste.como_uid('c4'); select teste.lanca('Joga Ex');
select teste.como_uid('c3'); select teste.lanca('Joga B');
select teste.como_uid('a2'); select public.registrar_aporte('e9000000-0000-0000-0000-0000000000c3', 70);
-- XJ sai (opção B): o histórico vai com ele; o acerto fica com o time
select teste.como_uid('a1'); select public.registrar_saida('e9000000-0000-0000-0000-0000000000c4');
reset role;

-- ---------- 1) catálogo: toda tabela com RLS; anon só executa o que é público; função do servidor com search_path ----------
select teste.igual('toda tabela do schema public tem RLS ligada',
  $q$select coalesce(string_agg(c.relname, ', '), 'todas') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity$q$, 'todas');
select teste.igual('anon (antes do login) só executa as funções públicas: ver convite e conferir apelido',
  $q$select coalesce(string_agg(p.proname, ', ' order by p.proname), 'nenhuma') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') and p.proname not in ('nickname_disponivel', 'ver_convite')$q$, 'nenhuma');
select teste.igual('toda função que roda como dono (security definer) fixa o search_path',
  $q$select coalesce(string_agg(p.proname, ', '), 'todas') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')$q$, 'todas');
select teste.igual('ninguém do cliente tem TRUNCATE (passa por cima da RLS)',
  $q$select coalesce(string_agg(distinct table_name||':'||grantee, ', '), 'ninguém') from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon','authenticated') and privilege_type = 'TRUNCATE'$q$, 'ninguém');
select teste.igual('anon não tem escrita em tabela nenhuma',
  $q$select coalesce(string_agg(distinct table_name, ', '), 'nenhuma') from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon' and privilege_type in ('INSERT','UPDATE','DELETE')$q$, 'nenhuma');

-- ---------- 2) anon: não lê nem grava linha nenhuma, em tabela nenhuma ----------
create or replace function teste.anon_vaza() returns text language plpgsql as $f$
declare t text; n bigint; saida text := ''; tabelas int := 0;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' order by 1 loop
    tabelas := tabelas + 1;
    begin
      perform set_config('role', 'anon', true); perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then saida := saida || t || ' lê ' || n || '; '; end if;
      perform set_config('role', 'postgres', true);
    exception when insufficient_privilege then perform set_config('role', 'postgres', true); end;
    begin
      perform set_config('role', 'anon', true);
      execute format('delete from public.%I', t); get diagnostics n = row_count;
      raise exception using errcode = 'GB001', message = n::text;
    exception when sqlstate 'GB001' then perform set_config('role', 'postgres', true); if sqlerrm::int > 0 then saida := saida || t || ' apaga ' || sqlerrm || '; '; end if;
              when insufficient_privilege then perform set_config('role', 'postgres', true); end;
  end loop;
  return coalesce(nullif(saida, ''), 'nada em ' || tabelas || ' tabelas');
end $f$;
select teste.igual('anon não lê nem apaga nada', $q$select teste.anon_vaza()$q$, (select 'nada em ' || count(*) || ' tabelas' from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'));

-- ---------- 3) entre times: cada pessoa, cada tabela com workspace_id: ler, mudar, apagar e inserir fora do próprio time ----------
-- (linha que é da própria pessoa não conta: o pedido de entrada dela, o acerto dela, o aviso dela, o registro antigo dela)
create or replace function teste.fora_do_time(uids text[]) returns text language plpgsql as $f$
declare u text; t text; n bigint; filtro text; saida text := ''; testes int := 0; amostra jsonb; ok_ins boolean;
begin
  foreach u in array uids loop
    for t in select c.table_name from information_schema.columns c join information_schema.tables b on b.table_schema = c.table_schema and b.table_name = c.table_name
              where c.table_schema = 'public' and c.column_name = 'workspace_id' and b.table_type = 'BASE TABLE' order by 1 loop
      filtro := 'workspace_id is not null and workspace_id not in (select public.my_workspaces())';
      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'user_id') then
        filtro := filtro || ' and user_id is distinct from auth.uid()'; end if;
      if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'jogador_user_id') then
        filtro := filtro || ' and jogador_user_id is distinct from auth.uid()'; end if;
      -- uma linha de OUTRO time pra tentar inserir de novo (lida como postgres)
      execute format('select to_jsonb(x) from public.%I x where x.workspace_id is not null and x.workspace_id not in (select m.workspace_id from public.workspace_members m where m.user_id = %L) limit 1',
                     t, ('e7000000-0000-0000-0000-0000000000' || u)) into amostra;
      perform set_config('request.jwt.claims', json_build_object('sub', 'e7000000-0000-0000-0000-0000000000' || u, 'role', 'authenticated')::text, true);
      testes := testes + 1;
      begin
        perform set_config('role', 'authenticated', true);
        execute format('select count(*) from public.%I where %s', t, filtro) into n;
        perform set_config('role', 'postgres', true);
        if n > 0 then saida := saida || u || ' lê ' || n || ' em ' || t || '; '; end if;
      exception when insufficient_privilege then perform set_config('role', 'postgres', true); end;
      begin
        perform set_config('role', 'authenticated', true);
        execute format('update public.%I set workspace_id = workspace_id where %s', t, filtro); get diagnostics n = row_count;
        raise exception using errcode = 'GB001', message = n::text;
      exception when sqlstate 'GB001' then perform set_config('role', 'postgres', true); if sqlerrm::int > 0 then saida := saida || u || ' muda ' || sqlerrm || ' em ' || t || '; '; end if;
                when others then perform set_config('role', 'postgres', true); end;
      begin
        perform set_config('role', 'authenticated', true);
        execute format('delete from public.%I where %s', t, filtro); get diagnostics n = row_count;
        raise exception using errcode = 'GB001', message = n::text;
      exception when sqlstate 'GB001' then perform set_config('role', 'postgres', true); if sqlerrm::int > 0 then saida := saida || u || ' apaga ' || sqlerrm || ' em ' || t || '; '; end if;
                when others then perform set_config('role', 'postgres', true); end;
      if amostra is not null then
        ok_ins := false;
        begin
          perform set_config('role', 'authenticated', true);
          execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', t, t)
            using case when amostra ? 'id' and jsonb_typeof(amostra->'id') = 'string' and (amostra->>'id') ~ '^[0-9a-f-]{36}$' then amostra || jsonb_build_object('id', gen_random_uuid()) else amostra end;
          ok_ins := true;
          raise exception using errcode = 'GB001', message = '1';
        exception when sqlstate 'GB001' then perform set_config('role', 'postgres', true);
                  when others then perform set_config('role', 'postgres', true); end;
        if ok_ins then saida := saida || u || ' insere em outro time em ' || t || '; '; end if;
      end if;
    end loop;
  end loop;
  return coalesce(nullif(saida, ''), '0 vazamentos em ' || testes || ' combinações');
end $f$;
select teste.igual('ninguém lê, muda, apaga ou insere linha de outro time (todas as tabelas com workspace_id × 12 contas)',
  $q$select split_part(teste.fora_do_time(array['a1','f1','b1','e1','c9','c1','c2','c4','a2','c3','d1','99']), ' em ', 1)$q$, '0 vazamentos');
-- conta como a pessoa: o EXECUTE é planejado depois da troca de papel (a RLS vale)
create or replace function teste.conta_como(u text, consulta text) returns bigint language plpgsql as $f$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'e7000000-0000-0000-0000-0000000000' || u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute consulta into n;
  perform set_config('role', 'postgres', true);
  return n;
end $f$;
select teste.igual('…nem a lista de workspaces mostra time que não é dele',
  $q$select coalesce((select string_agg(u, ',') from unnest(array['a1','f1','b1','e1','c9','c1','c2','c4','a2','c3','d1','99']) u
     where teste.conta_como(u, 'select count(*) from public.workspaces w where w.id not in (select public.my_workspaces())') > 0), 'ninguém')$q$, 'ninguém');

-- ---------- 4) dentro do time, por papel: quem vê o desempenho e o dinheiro de quem (exato: nem mais, nem menos) ----------
-- toda tabela com pessoa_id precisa estar classificada aqui (tabela nova sem classificação derruba o teste)
create table teste.classe(tabela text primary key, tipo text);
insert into teste.classe values
 ('tournaments','desempenho'), ('hh_tournament_stats','desempenho'), ('daily_entries','desempenho'), ('hh_import_log','desempenho'),
 ('bankroll_ledger','dinheiro'), ('withdrawals','dinheiro'), ('player_wallets','dinheiro'), ('aporte','dinheiro'), ('saque','dinheiro'),
 ('reload','dinheiro'), ('abertura','dinheiro'), ('acerto_saida','dinheiro'),
 ('vinculo','estrutura'), ('acesso','estrutura'), ('contrato','estrutura'), ('pedido_entrada','estrutura'), ('convite','estrutura');
select teste.igual('toda tabela com pessoa_id está classificada (desempenho, dinheiro ou estrutura)',
  $q$select coalesce(string_agg(c.table_name, ', '), 'todas') from information_schema.columns c join information_schema.tables b on b.table_schema = c.table_schema and b.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'pessoa_id' and b.table_type = 'BASE TABLE' and c.table_name not in (select tabela from teste.classe)$q$, 'todas');
grant select on teste.classe to authenticated;
-- de quem a conta enxerga linhas (nomes das pessoas), somando as tabelas do tipo
create or replace function teste.de_quem(u text, tipo_ text) returns text language plpgsql as $f$
declare t text; nomes text[] := '{}'; ns text[];
begin
  for t in select tabela from teste.classe where tipo = tipo_ order by 1 loop
    perform set_config('request.jwt.claims', json_build_object('sub', 'e7000000-0000-0000-0000-0000000000' || u, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute format('select array_agg(distinct pessoa_id::text) from public.%I where pessoa_id is not null', t) into ns;
    perform set_config('role', 'postgres', true);
    nomes := nomes || coalesce(ns, '{}');
  end loop;
  return coalesce((select string_agg(distinct p.nome, ',' order by p.nome) from public.pessoa p where p.id::text = any(nomes)), '—');
end $f$;
select teste.igual('desempenho (torneios, mãos, diário, imports): cada um vê exatamente quem deve',
  $q$select string_agg(u || '=' || teste.de_quem(u, 'desempenho'), ' ' order by o) from unnest(array['a1','f1','b1','e1','c9','c1','c2','c4','a2','c3','d1','99']) with ordinality x(u, o)$q$,
  'a1=Joga Dois,Joga Um f1=— b1=Joga Um e1=— c9=— c1=Joga Um c2=Joga Dois c4=— a2=Joga B c3=Joga B d1=— 99=—');
select teste.igual('dinheiro (movimentos, salas, aporte, saque, reload, planilha, acerto): cada um vê exatamente quem deve',
  $q$select string_agg(u || '=' || teste.de_quem(u, 'dinheiro'), ' ' order by o) from unnest(array['a1','f1','b1','e1','c9','c1','c2','c4','a2','c3','d1','99']) with ordinality x(u, o)$q$,
  'a1=Joga Dois,Joga Ex,Joga Um f1=Joga Dois,Joga Ex,Joga Um b1=Joga Ex,Joga Um e1=— c9=— c1=Joga Um c2=Joga Dois c4=Joga Ex a2=Joga B c3=Joga B d1=— 99=—');
select teste.igual('o histórico de antes do time do J1 (sem unidade): só ele vê',
  $q$select string_agg(u || '=' || teste.conta_como(u, format('select count(*) from public.tournaments t where t.pessoa_id = %L and t.unidade_id is null', teste.bpid('pJ1'))), ' ' order by o)
     from unnest(array['a1','f1','b1','c1','c2']) with ordinality x(u, o)$q$,
  'a1=0 f1=0 b1=0 c1=1 c2=0');
reset role;

-- ---------- 5) gravar dentro do time fora do papel: ninguém muda nem apaga desempenho/dinheiro de quem não pode ----------
-- pode gravar: o próprio jogador (o dele); admin (tudo do time); quem aprova saques (movimentos, saques do pool e salas)
create or replace function teste.grava_fora(u text, permitidas text[], tabelas text[]) returns text language plpgsql as $f$
declare t text; n bigint; saida text := '';
begin
  foreach t in array tabelas loop
    perform set_config('request.jwt.claims', json_build_object('sub', 'e7000000-0000-0000-0000-0000000000' || u, 'role', 'authenticated')::text, true);
    begin
      perform set_config('role', 'authenticated', true);
      execute format('update public.%I set pessoa_id = pessoa_id where pessoa_id is not null and not (pessoa_id::text = any($1))', t) using permitidas; get diagnostics n = row_count;
      raise exception using errcode = 'GB001', message = n::text;
    exception when sqlstate 'GB001' then perform set_config('role', 'postgres', true); if sqlerrm::int > 0 then saida := saida || 'muda ' || sqlerrm || ' em ' || t || '; '; end if;
              when others then perform set_config('role', 'postgres', true); end;
    begin
      perform set_config('role', 'authenticated', true);
      execute format('delete from public.%I where pessoa_id is not null and not (pessoa_id::text = any($1))', t) using permitidas; get diagnostics n = row_count;
      raise exception using errcode = 'GB001', message = n::text;
    exception when sqlstate 'GB001' then perform set_config('role', 'postgres', true); if sqlerrm::int > 0 then saida := saida || 'apaga ' || sqlerrm || ' em ' || t || '; '; end if;
              when others then perform set_config('role', 'postgres', true); end;
  end loop;
  return coalesce(nullif(saida, ''), 'nada');
end $f$;
create or replace function teste.pessoas(nomes text[]) returns text[] language sql as $$
  select coalesce(array_agg(p.id::text), '{}') from public.pessoa p where p.nome = any(nomes) $$;
select teste.igual('professor (vê desempenho e dinheiro da R1) não grava nada de ninguém',
  $q$select teste.grava_fora('b1', '{}', array(select tabela from teste.classe where tipo in ('desempenho','dinheiro')))$q$, 'nada');
select teste.igual('financeiro não grava desempenho de ninguém',
  $q$select teste.grava_fora('f1', '{}', array(select tabela from teste.classe where tipo = 'desempenho'))$q$, 'nada');
select teste.igual('quem gere pessoas e quem configura regras não gravam desempenho nem dinheiro',
  $q$select teste.grava_fora('e1', '{}', array(select tabela from teste.classe where tipo in ('desempenho','dinheiro')))||' / '||teste.grava_fora('c9', '{}', array(select tabela from teste.classe where tipo in ('desempenho','dinheiro')))$q$, 'nada / nada');
select teste.igual('jogador só grava o dele (nem o do colega da outra reta, nem o de outro time)',
  $q$select teste.grava_fora('c1', teste.pessoas(array['Joga Um']), array(select tabela from teste.classe where tipo in ('desempenho','dinheiro')))||' / '||
            teste.grava_fora('c2', teste.pessoas(array['Joga Dois']), array(select tabela from teste.classe where tipo in ('desempenho','dinheiro')))$q$, 'nada / nada');
select teste.igual('admin do time B não grava nada do time A',
  $q$select teste.grava_fora('a2', teste.pessoas(array['Joga B','Admin B']), array(select tabela from teste.classe where tipo in ('desempenho','dinheiro')))$q$, 'nada');
select teste.igual('quem saiu e o gestor geral não gravam nada do time',
  $q$select teste.grava_fora('c4', '{}', array(select tabela from teste.classe where tipo in ('desempenho','dinheiro')))||' / '||teste.grava_fora('99', '{}', array(select tabela from teste.classe where tipo in ('desempenho','dinheiro')))$q$, 'nada / nada');
reset role;
