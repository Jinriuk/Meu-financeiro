-- Segredos de webhook lidos SÓ pelo service role das Edge Functions (RLS ligado, sem policy
-- = anon/authenticated nunca leem). O hottok chega no relatório do agente e entra via UPDATE.
create table if not exists public.app_secrets (
  name text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (name, value) values ('hotmart_hottok', '')
on conflict (name) do nothing;
