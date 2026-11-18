-- Cadastro GrinderBank: apelido único como em sala de poker + WhatsApp + ponte pagamento->conta.

-- 1) WhatsApp no perfil (opcional; contato/suporte)
alter table public.player_profiles add column if not exists whatsapp text;

-- 2) Apelido disponível? (anon pode checar na tela de cadastro; não vaza nada além de sim/não)
create or replace function public.nickname_disponivel(nick text) returns boolean
language sql stable security definer set search_path=''
as $$ select not exists (select 1 from public.player_profiles p where lower(p.nickname)=lower(trim(nick))) $$;
revoke all on function public.nickname_disponivel(text) from public;
grant execute on function public.nickname_disponivel(text) to anon, authenticated;

-- 3) Ativações de plano: a Kiwify (webhook) ou o admin insere "email X pagou o plano Y";
--    no login, a conta com aquele e-mail aplica a ativação sozinha. Funciona mesmo se a
--    pessoa pagar ANTES de criar a conta.
create table if not exists public.plan_activations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plan text not null check (plan in ('gestao','pro','founder')),
  status text not null default 'pending' check (status in ('pending','used','revoked')),
  source text,
  note text,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users(id)
);
alter table public.plan_activations enable row level security;
create index if not exists plan_activations_email_idx on public.plan_activations (lower(email)) where status='pending';

-- 4) Aplica a ativação pendente do MEU e-mail no MEU workspace (chamada no carregamento do app)
create or replace function public.aplicar_ativacao() returns text
language plpgsql security definer set search_path=''
as $$
declare act record; wid uuid; meu_email text;
begin
  meu_email := lower(coalesce(auth.jwt()->>'email',''));
  if meu_email='' then return null; end if;
  select * into act from public.plan_activations where lower(email)=meu_email and status='pending' order by created_at limit 1;
  if act.id is null then return null; end if;
  select workspace_id into wid from public.workspace_members where user_id=auth.uid() order by created_at limit 1;
  if wid is null then return null; end if;
  update public.workspaces set plan=act.plan where id=wid;
  update public.plan_activations set status='used', used_at=now(), used_by=auth.uid() where id=act.id;
  return act.plan;
end $$;
revoke all on function public.aplicar_ativacao() from public;
grant execute on function public.aplicar_ativacao() to authenticated;
