-- Papel do usuário: 'pool' (sócio: vê tudo) ou 'guest' (convidado: só as próprias stats)
alter table public.player_profiles add column if not exists role text not null default 'pool';

-- papel do usuário logado (security definer: não entra em loop com o RLS dos perfis)
create or replace function public.my_role() returns text
language sql stable security definer set search_path=''
as $$ select coalesce((select p.role from public.player_profiles p where p.user_id=auth.uid()),'pool') $$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated;

-- Tabelas da POOL: só sócios (convidado não lê nem escreve, nem pela API)
do $$
declare t text;
begin
  foreach t in array array['pool_config','daily_entries','tournaments','bankroll_ledger','player_wallets','withdrawals'] loop
    execute format('drop policy if exists pool_shared on public.%I;',t);
    execute format('create policy pool_shared on public.%I for all to authenticated using (public.my_role()=''pool'') with check (public.my_role()=''pool'');',t);
  end loop;
end $$;

-- Stats de hand history: sócios veem tudo; convidado só as linhas que ELE criou
drop policy if exists pool_shared on public.hh_tournament_stats;
create policy pool_shared on public.hh_tournament_stats
  for all to authenticated
  using (public.my_role()='pool' or created_by=auth.uid())
  with check (public.my_role()='pool' or created_by=auth.uid());

-- Perfis: sócios veem todos; convidado só o próprio (não enxerga e-mail/CPF dos outros)
drop policy if exists pool_shared on public.player_profiles;
create policy pool_shared on public.player_profiles
  for all to authenticated
  using (public.my_role()='pool' or user_id=auth.uid())
  with check (public.my_role()='pool' or user_id=auth.uid());
