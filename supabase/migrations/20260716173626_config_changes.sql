-- Histórico de alterações dos Ajustes: quem mudou o quê, de que valor pra qual, quando.
-- Usado pra (1) avisar o outro jogador em tempo real, (2) listar no app e
-- (3) julgar "fora da grade" pelo ABI vigente NA DATA do torneio, não pelo atual.
create table if not exists public.config_changes (
  id uuid primary key default gen_random_uuid(),
  field text not null,
  old_value text,
  new_value text,
  resumo text not null,               -- "ABI máximo · Gabriel: US$ 8,00 → US$ 5,00"
  changed_by_name text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.config_changes enable row level security;
drop policy if exists pool_shared on public.config_changes;
create policy pool_shared on public.config_changes
  for all to authenticated
  using (public.my_role()='pool') with check (public.my_role()='pool');
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='config_changes') then
    execute 'alter publication supabase_realtime add table public.config_changes;';
  end if;
end $$;
-- Semente: a redução de ABI do Gabriel (8 → 5) que já tinha acontecido antes do histórico
-- existir. Data inferida dos lançamentos: jogou até US$ 8 em 12/07 e no máximo US$ 4,40 de 14/07 em diante.
insert into public.config_changes (field, old_value, new_value, resumo, changed_by_name, created_at)
select 'abi_max_player1','8','5','ABI máximo · Gabriel: US$ 8,00 → US$ 5,00','Gabriel','2026-07-13 12:00:00+00'
where not exists (select 1 from public.config_changes where field='abi_max_player1')
  and exists (select 1 from auth.users);   -- [repo] banco novo não tem a pool: pula a semente
