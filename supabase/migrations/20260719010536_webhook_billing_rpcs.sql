-- #2 (P0): suporte de cobrança pro webhook da Kiwify.
-- idempotência: cada evento entra uma vez; reprocesso é ignorado.
create table if not exists public.webhook_events(
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key(provider,event_id)
);
alter table public.webhook_events enable row level security;  -- sem policy: só service role/admin

-- order_id na ativação (auditoria + rastreio do pedido)
alter table public.plan_activations add column if not exists order_id text;

-- ATIVAR: registra a ativação e, se a conta já existe, aplica o plano na hora.
-- Funciona nas duas ordens (pagou antes de criar conta, ou depois).
create or replace function public.webhook_ativar_plano(p_email text, p_plan text, p_source text, p_order_id text)
returns text language plpgsql security definer set search_path to '' as $$
declare wid uuid; uid uuid;
begin
  if p_plan not in ('gestao','pro','founder','team') then raise exception 'plano inválido: %', p_plan; end if;
  insert into public.plan_activations(email,plan,status,source,order_id)
    values(lower(p_email),p_plan,'pending',coalesce(p_source,'kiwify'),p_order_id);
  -- conta já existe? aplica agora
  select pp.user_id into uid from public.player_profiles pp where lower(pp.email)=lower(p_email) limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id=uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan=p_plan where id=wid;
      update public.plan_activations set status='used', used_at=now(), used_by=uid
        where lower(email)=lower(p_email) and status='pending' and plan=p_plan;
    end if;
  end if;
  return 'ok';
end $$;

-- REVOGAR: cancelamento/estorno/chargeback -> volta pro grátis e invalida ativações pendentes.
create or replace function public.webhook_revogar_plano(p_email text, p_order_id text)
returns text language plpgsql security definer set search_path to '' as $$
declare wid uuid; uid uuid;
begin
  update public.plan_activations set status='revoked'
    where lower(email)=lower(p_email) and status='pending';
  select pp.user_id into uid from public.player_profiles pp where lower(pp.email)=lower(p_email) limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id=uid order by created_at limit 1;
    -- não rebaixa a pool interna (team) nem contas fundador cortesia
    if wid is not null then
      update public.workspaces set plan='free' where id=wid and plan not in ('team','founder');
    end if;
  end if;
  return 'ok';
end $$;

revoke all on function public.webhook_ativar_plano(text,text,text,text) from public, anon, authenticated;
revoke all on function public.webhook_revogar_plano(text,text) from public, anon, authenticated;
