-- Cenários de ataque e de regra (F0.5/F0.6) sobre base_producao.sql + a migration.
-- Cada linha imprime OK/FALHA; o runner falha se houver alguma FALHA.
\set ON_ERROR_STOP 1
create schema teste;
grant usage on schema teste to authenticated;
create or replace function teste.ok(rotulo text, cmd text) returns void language plpgsql as $$
begin
  begin execute cmd; raise notice 'OK     %', rotulo;
  exception when others then raise notice 'FALHA  % (erro inesperado: %)', rotulo, sqlerrm; end;
end $$;
create or replace function teste.erro(rotulo text, cmd text) returns void language plpgsql as $$
begin
  begin execute cmd; raise notice 'FALHA  % (passou, devia ser barrado)', rotulo;
  exception when insufficient_privilege then raise notice 'OK     % (403: %)', rotulo, sqlerrm;
            when others then raise notice 'OK?    % (barrado, mas com outro erro: % %)', rotulo, sqlstate, sqlerrm; end;
end $$;
create or replace function teste.igual(rotulo text, consulta text, esperado text) returns void language plpgsql as $$
declare v text;
begin execute consulta into v;
  if v is not distinct from esperado then raise notice 'OK     % (= %)', rotulo, v; else raise notice 'FALHA  % (veio %, esperado %)', rotulo, v, esperado; end if;
end $$;
grant execute on all functions in schema teste to authenticated;

-- ---------- dados ----------
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-00000000000a','a@ex.com',now()),
 ('00000000-0000-0000-0000-00000000000b','b@ex.com',now()),
 ('00000000-0000-0000-0000-00000000000c','c@ex.com',null);  -- não confirmado
insert into public.workspaces(id,name,kind,plan,trial_ends_at) values
 ('10000000-0000-0000-0000-00000000000a','A','solo','gestao',now()+interval '5 days'),
 ('10000000-0000-0000-0000-00000000000b','B','solo','pro',null),
 ('10000000-0000-0000-0000-00000000000c','C','solo','gestao',now()+interval '5 days');
insert into public.workspace_members values
 ('10000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a',now()),
 ('10000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b',now()),
 ('10000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c',now());
insert into public.player_profiles(user_id,email,nickname,password_changed,role) values
 ('00000000-0000-0000-0000-00000000000a','a@ex.com','A',true,'solo'),
 ('00000000-0000-0000-0000-00000000000b','b@ex.com','B',true,'solo');
insert into public.tournaments(workspace_id,entry_date,player,buyin) values ('10000000-0000-0000-0000-00000000000a','2026-11-01','A',5);

-- ---------- como A ----------
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","email":"a@ex.com"}',false);

-- F0.5
select teste.ok('A tenta trocar o e-mail do perfil pro do B', $q$update public.player_profiles set email='b@ex.com' where user_id=auth.uid()$q$);
select teste.igual('e-mail do perfil de A continua o do auth', $q$select email from public.player_profiles where user_id=auth.uid()$q$, 'a@ex.com');
select teste.ok('A tenta virar admin', $q$update public.player_profiles set role='admin' where user_id=auth.uid()$q$);
select teste.igual('papel de A continua solo', $q$select role from public.player_profiles where user_id=auth.uid()$q$, 'solo');
select teste.ok('A edita o próprio nickname (permitido)', $q$update public.player_profiles set nickname='A2' where user_id=auth.uid()$q$);
select teste.igual('nickname mudou', $q$select nickname from public.player_profiles where user_id=auth.uid()$q$, 'A2');
select teste.erro('A tenta subir o próprio plano', $q$update public.workspaces set plan='pro', trial_ends_at=null$q$);
select teste.erro('A tenta chamar o RPC do webhook', $q$select public.webhook_ativar_plano('a@ex.com','pro','x','1')$q$);

-- F0.6 com teste ATIVO
select teste.ok('A grava torneio com teste ativo', $q$insert into public.tournaments(entry_date,player,buyin) values ('2026-11-02','A',3)$q$);
select teste.erro('A (plano gestão) grava stats', $q$insert into public.hh_tournament_stats(player,site,site_tournament_id) values ('A','GG','1')$q$);
select teste.igual('meu_status de A: ativo', $q$select (public.meu_status()->>'ativo')$q$, 'true');
select teste.igual('meu_status de A: sem stats', $q$select (public.meu_status()->>'pode_stats')$q$, 'false');

-- vence o teste de A (como o servidor faria com o tempo)
reset role;
update public.workspaces set trial_ends_at = now() - interval '1 minute' where id='10000000-0000-0000-0000-00000000000a';
set role authenticated;
select teste.erro('A grava torneio com teste VENCIDO', $q$insert into public.tournaments(entry_date,player,buyin) values ('2026-11-03','A',3)$q$);
select teste.erro('A edita torneio com teste VENCIDO', $q$update public.tournaments set prize=100 where player='A'$q$);
select teste.igual('prêmio não mudou', $q$select max(prize)::text from public.tournaments$q$, '0');
select teste.ok('A apaga torneio com teste vencido (não erra, mas não apaga nada)', $q$delete from public.tournaments where player='A'$q$);
select teste.igual('nenhum torneio de A foi apagado', $q$select count(*)::text from public.tournaments where player='A'$q$, '2');
select teste.igual('A ainda LÊ os próprios dados', $q$select count(*)::text from public.tournaments$q$, '2');
select teste.igual('meu_status de A: bloqueado', $q$select (public.meu_status()->>'ativo')$q$, 'false');
select teste.erro('A tenta forjar workspace_id do B', $q$insert into public.tournaments(workspace_id,entry_date,player,buyin) values ('10000000-0000-0000-0000-00000000000b','2026-11-03','A',3)$q$);

-- ---------- como B (pro, sem teste) ----------
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","email":"b@ex.com"}',false);
select teste.ok('B (pro) grava stats', $q$insert into public.hh_tournament_stats(player,site,site_tournament_id) values ('B','GG','9')$q$);
select teste.igual('B não vê dados de A', $q$select count(*)::text from public.tournaments$q$, '0');

-- ---------- webhook (servidor) ----------
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
-- simula o ataque antigo à força (como se o e-mail do perfil tivesse sido trocado antes da migration)
alter table public.player_profiles disable trigger perfil_protegido;
update public.player_profiles set email='alvo@ex.com' where user_id='00000000-0000-0000-0000-00000000000a';
alter table public.player_profiles enable trigger perfil_protegido;
select public.webhook_ativar_plano('alvo@ex.com','founder','kiwify','pedido-1');
select teste.igual('compra de alvo@ex.com NÃO ativa o A (perfil adulterado)', $q$select plan from public.workspaces where id='10000000-0000-0000-0000-00000000000a'$q$, 'gestao');
select public.webhook_ativar_plano('b@ex.com','founder','kiwify','pedido-2');
select teste.igual('compra de b@ex.com ativa o B pelo e-mail do auth', $q$select plan from public.workspaces where id='10000000-0000-0000-0000-00000000000b'$q$, 'founder');
select public.webhook_ativar_plano('c@ex.com','pro','kiwify','pedido-3');
select teste.igual('e-mail NÃO confirmado não recebe plano direto', $q$select plan from public.workspaces where id='10000000-0000-0000-0000-00000000000c'$q$, 'gestao');
select teste.igual('…fica pendente pra aplicar_ativacao', $q$select status from public.plan_activations where order_id='pedido-3'$q$, 'pending');
select public.webhook_revogar_plano('alvo@ex.com','pedido-1');
select teste.igual('reembolso de alvo@ex.com NÃO muda o plano do A', $q$select plan from public.workspaces where id='10000000-0000-0000-0000-00000000000a'$q$, 'gestao');
select teste.igual('reembolso de alvo@ex.com NÃO derruba o A', $q$select trial_ends_at < now() - interval '30 seconds' from public.workspaces where id='10000000-0000-0000-0000-00000000000a'$q$, 'true');
-- troca de e-mail legítima no auth atualiza o perfil
update auth.users set email='a-novo@ex.com' where id='00000000-0000-0000-0000-00000000000a';
select teste.igual('troca no auth sincroniza o perfil', $q$select email from public.player_profiles where user_id='00000000-0000-0000-0000-00000000000a'$q$, 'a-novo@ex.com');
