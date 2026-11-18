-- Retrato normalizado do schema public (o mesmo SQL roda em produção e no banco recriado).
select jsonb_build_object(
 'colunas', (select jsonb_agg(x order by x) from (select table_name||'.'||column_name||' '||data_type||' null='||is_nullable||' def='||coalesce(column_default,'') x
   from information_schema.columns where table_schema='public') s),
 'indices', (select jsonb_agg(indexdef order by indexdef) from pg_indexes where schemaname='public'),
 'policies', (select jsonb_agg(x order by x) from (select tablename||'.'||policyname||' '||permissive||' '||cmd||' '||array_to_string(roles,',')||' using='||coalesce(qual,'')||' check='||coalesce(with_check,'') x from pg_policies where schemaname='public') s),
 'funcoes', (select jsonb_agg(x order by x) from (select p.proname||'('||pg_get_function_identity_arguments(p.oid)||') secdef='||p.prosecdef||' cfg='||coalesce(array_to_string(p.proconfig,','),'')||' src='||md5(p.prosrc) x
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') s),
 'triggers', (select jsonb_agg(x order by x) from (select pg_get_triggerdef(t.oid) x from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal) s),
 'rls', (select jsonb_agg(relname||' rls='||relrowsecurity order by relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'),
 'grants_tabela', (select jsonb_agg(x order by x) from (select table_name||' '||grantee||' '||string_agg(privilege_type,',' order by privilege_type) x from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') group by table_name,grantee) s),
 'grants_coluna', (select jsonb_agg(x order by x) from (select table_name||'.'||column_name||' '||grantee||' '||privilege_type x from information_schema.column_privileges cp where table_schema='public' and grantee in ('anon','authenticated') and not exists (select 1 from information_schema.role_table_grants tg where tg.table_schema='public' and tg.table_name=cp.table_name and tg.grantee=cp.grantee and tg.privilege_type=cp.privilege_type)) s),
 'grants_funcao', (select jsonb_agg(x order by x) from (select p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '||r.rolname x from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='public' and r.rolname in ('anon','authenticated') and has_function_privilege(r.oid,p.oid,'EXECUTE')) s),
 'realtime', (select jsonb_agg(tablename order by tablename) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'),
 'comentarios', (select jsonb_agg(x order by x) from (select c.relname||coalesce('.'||a.attname,'')||': '||d.description x from pg_description d join pg_class c on c.oid=d.objoid join pg_namespace n on n.oid=c.relnamespace left join pg_attribute a on a.attrelid=c.oid and a.attnum=d.objsubid and d.objsubid>0 where n.nspname='public' and d.classoid='pg_class'::regclass) s)
) as catalogo;
