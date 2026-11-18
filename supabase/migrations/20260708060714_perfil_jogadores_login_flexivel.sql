-- Perfil dos jogadores: nickname/CPF pra login e controle de primeiro acesso
create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,                     -- espelho do e-mail do auth (pro lookup de login)
  nickname text,
  cpf text,                                -- só dígitos (11)
  password_changed boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists player_profiles_nickname_key on public.player_profiles (lower(nickname)) where nickname is not null;
create unique index if not exists player_profiles_cpf_key on public.player_profiles (cpf) where cpf is not null;

alter table public.player_profiles enable row level security;
drop policy if exists pool_shared on public.player_profiles;
create policy pool_shared on public.player_profiles
  for all to authenticated using (true) with check (true);

-- Traduz nickname/CPF/e-mail -> e-mail do auth, usada pela tela de login (antes de autenticar)
create or replace function public.email_for_login(identifier text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select p.email from public.player_profiles p
  where (p.nickname is not null and lower(p.nickname) = lower(trim(identifier)))
     or lower(p.email) = lower(trim(identifier))
     or (p.cpf is not null and p.cpf = regexp_replace(identifier, '\D', '', 'g'))
  limit 1;
$$;
revoke all on function public.email_for_login(text) from public;
grant execute on function public.email_for_login(text) to anon, authenticated;
