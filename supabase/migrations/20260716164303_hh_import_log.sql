-- Diagnóstico de cada tentativa de import de hand history (só metadados, nunca as mãos):
-- serve pra descobrir POR QUE um arquivo não entrou sem precisar do arquivo da pessoa.
create table if not exists public.hh_import_log (
  id uuid primary key default gen_random_uuid(),
  player text,
  saved int not null default 0,
  novas int not null default 0,
  repetidas int not null default 0,
  ignored int not null default 0,
  reasons jsonb,
  issues jsonb,
  meta jsonb,   -- arquivos (nome/tamanho/magic), entradas do zip, 1ª linha de cada texto, user agent, build
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.hh_import_log enable row level security;
drop policy if exists pool_shared on public.hh_import_log;
create policy pool_shared on public.hh_import_log
  for all to authenticated
  using (public.my_role()='pool' or created_by=auth.uid())
  with check (public.my_role()='pool' or created_by=auth.uid());
