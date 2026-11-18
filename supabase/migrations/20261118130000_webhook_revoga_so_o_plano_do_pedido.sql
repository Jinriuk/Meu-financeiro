-- ============================================================
-- Webhook: a revogação só derruba o plano se o pedido revogado for DO PLANO ATUAL. Idempotente.
-- Antes: qualquer reembolso/chargeback/atraso do mesmo e-mail derrubava o plano. Quem subiu de Gestão
-- para Pro e depois teve o pedido do Gestão reembolsado ou cancelado perdia o Pro.
-- p_plan = plano do produto do pedido (o webhook sabe pelo produto). Sem p_plan: comportamento antigo.
-- ============================================================
create or replace function public.webhook_revogar_plano(p_email text, p_order_id text, p_plan text)
returns text language plpgsql security definer set search_path = '' as $$
declare wid uuid; uid uuid; atual text;
begin
  update public.plan_activations set status = 'revoked'
   where lower(email) = lower(p_email) and status = 'pending' and (p_plan is null or plan = p_plan);
  select u.id into uid from auth.users u
   where lower(u.email) = lower(p_email) and u.email_confirmed_at is not null limit 1;
  if uid is null then return 'ok'; end if;
  select workspace_id into wid from public.workspace_members where user_id = uid order by created_at limit 1;
  if wid is null then return 'ok'; end if;
  select plan into atual from public.workspaces where id = wid;
  if p_plan is not null and atual is distinct from p_plan then
    return 'ignorado: o plano atual é ' || coalesce(atual, '?') || ', o pedido é de ' || p_plan;
  end if;
  update public.workspaces set plan = 'free', trial_ends_at = now() where id = wid and plan not in ('team','founder');
  return 'ok';
end $$;

-- a assinatura antiga (2 argumentos) continua existindo pro webhook da Kiwify até ele mandar o plano
create or replace function public.webhook_revogar_plano(p_email text, p_order_id text)
returns text language sql security definer set search_path = '' as $$
  select public.webhook_revogar_plano(p_email, p_order_id, null::text);
$$;

revoke all on function public.webhook_revogar_plano(text,text,text) from public, anon, authenticated;
revoke all on function public.webhook_revogar_plano(text,text) from public, anon, authenticated;
grant execute on function public.webhook_revogar_plano(text,text,text) to service_role;
grant execute on function public.webhook_revogar_plano(text,text) to service_role;
