-- ============================================================
-- Teste grátis de 15 dias. trial_ends_at em workspaces:
--   null = pool interna / fundador / assinatura paga ativa -> nunca bloqueia
--   data = conta em teste -> o app bloqueia quando now() passa da data
-- Idempotente.
-- ============================================================
alter table public.workspaces add column if not exists trial_ends_at timestamptz;

-- create_solo_workspace passa a receber o plano escolhido e abre 15 dias de teste desse plano.
drop function if exists public.create_solo_workspace(text);
create or replace function public.create_solo_workspace(ws_name text, plan_escolhido text default 'gestao')
returns uuid language plpgsql security definer set search_path='' as $$
declare wid uuid; pl text;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if exists (select 1 from public.workspace_members where user_id=auth.uid()) then
    raise exception 'usuário já tem workspace';
  end if;
  pl := case when plan_escolhido in ('gestao','pro') then plan_escolhido else 'gestao' end;
  insert into public.workspaces (name,kind,plan,trial_ends_at)
    values (coalesce(nullif(trim(ws_name),''),'Meu grind'),'solo',pl, now() + interval '15 days')
    returning id into wid;
  insert into public.workspace_members (workspace_id,user_id,role) values (wid,auth.uid(),'owner');
  return wid;
end $$;
revoke all on function public.create_solo_workspace(text,text) from public, anon;
grant execute on function public.create_solo_workspace(text,text) to authenticated;

-- ativação (manual/Kiwify): assinatura ativa -> zera o trial (deixa de bloquear)
create or replace function public.aplicar_ativacao() returns text
language plpgsql security definer set search_path='' as $$
declare act record; wid uuid; meu_email text;
begin
  meu_email := lower(coalesce(auth.jwt()->>'email',''));
  if meu_email='' then return null; end if;
  select * into act from public.plan_activations where lower(email)=meu_email and status='pending' order by created_at limit 1;
  if act.id is null then return null; end if;
  select workspace_id into wid from public.workspace_members where user_id=auth.uid() order by created_at limit 1;
  if wid is null then return null; end if;
  update public.workspaces set plan=act.plan, trial_ends_at=null where id=wid;
  update public.plan_activations set status='used', used_at=now(), used_by=auth.uid() where id=act.id;
  return act.plan;
end $$;
revoke all on function public.aplicar_ativacao() from public;
revoke execute on function public.aplicar_ativacao() from anon;
grant execute on function public.aplicar_ativacao() to authenticated;

-- webhook: pagar zera o trial; cancelar/estornar expira na hora (bloqueia)
create or replace function public.webhook_ativar_plano(p_email text, p_plan text, p_source text, p_order_id text)
returns text language plpgsql security definer set search_path='' as $$
declare wid uuid; uid uuid;
begin
  if p_plan not in ('gestao','pro','founder','team') then raise exception 'plano inválido: %', p_plan; end if;
  insert into public.plan_activations(email,plan,status,source,order_id)
    values(lower(p_email),p_plan,'pending',coalesce(p_source,'kiwify'),p_order_id);
  select pp.user_id into uid from public.player_profiles pp where lower(pp.email)=lower(p_email) limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id=uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan=p_plan, trial_ends_at=null where id=wid;
      update public.plan_activations set status='used', used_at=now(), used_by=uid
        where lower(email)=lower(p_email) and status='pending' and plan=p_plan;
    end if;
  end if;
  return 'ok';
end $$;

create or replace function public.webhook_revogar_plano(p_email text, p_order_id text)
returns text language plpgsql security definer set search_path='' as $$
declare wid uuid; uid uuid;
begin
  update public.plan_activations set status='revoked' where lower(email)=lower(p_email) and status='pending';
  select pp.user_id into uid from public.player_profiles pp where lower(pp.email)=lower(p_email) limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id=uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan='free', trial_ends_at=now() where id=wid and plan not in ('team','founder');
    end if;
  end if;
  return 'ok';
end $$;
revoke all on function public.webhook_ativar_plano(text,text,text,text) from public, anon, authenticated;
revoke all on function public.webhook_revogar_plano(text,text) from public, anon, authenticated;
