alter table public.pool_config add column if not exists abi_max_player1 numeric not null default 2;
alter table public.pool_config add column if not exists abi_max_player2 numeric not null default 2;
-- valores informados pela dupla: Gabriel (player1) joga até 8, Breno (player2) até 4
update public.pool_config set abi_max_player1 = 8, abi_max_player2 = 4;
