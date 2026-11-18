-- #11 (P2): índice em cada FK (workspace_id/created_by/user_id/used_by) — o RLS filtra por
-- workspace_id em toda query, então sem índice a leitura degrada linearmente com o crescimento.
create index if not exists idx_bankroll_ledger_ws on public.bankroll_ledger(workspace_id);
create index if not exists idx_bankroll_ledger_cb on public.bankroll_ledger(created_by);
create index if not exists idx_config_changes_ws on public.config_changes(workspace_id);
create index if not exists idx_config_changes_cb on public.config_changes(created_by);
create index if not exists idx_daily_entries_ws on public.daily_entries(workspace_id);
create index if not exists idx_daily_entries_cb on public.daily_entries(created_by);
create index if not exists idx_hh_import_log_ws on public.hh_import_log(workspace_id);
create index if not exists idx_hh_import_log_cb on public.hh_import_log(created_by);
create index if not exists idx_hh_stats_ws on public.hh_tournament_stats(workspace_id);
create index if not exists idx_hh_stats_cb on public.hh_tournament_stats(created_by);
create index if not exists idx_plan_activations_usedby on public.plan_activations(used_by);
create index if not exists idx_player_wallets_ws on public.player_wallets(workspace_id);
create index if not exists idx_player_wallets_cb on public.player_wallets(created_by);
create index if not exists idx_pool_config_ws on public.pool_config(workspace_id);
create index if not exists idx_pool_config_cb on public.pool_config(created_by);
create index if not exists idx_tournaments_ws on public.tournaments(workspace_id);
create index if not exists idx_tournaments_cb on public.tournaments(created_by);
create index if not exists idx_withdrawals_ws on public.withdrawals(workspace_id);
create index if not exists idx_withdrawals_cb on public.withdrawals(created_by);
create index if not exists idx_wsm_ws on public.workspace_members(workspace_id);
create index if not exists idx_wsm_user on public.workspace_members(user_id);

-- #11: RLS reavaliava auth.uid() por linha nas policies base. (select auth.uid()) faz o
-- planner avaliar UMA vez (initplan) — ganho grande em varreduras.
drop policy if exists wsm_self on public.workspace_members;
create policy wsm_self on public.workspace_members for select using (user_id = (select auth.uid()));

drop policy if exists profile_self_or_teammates on public.player_profiles;
create policy profile_self_or_teammates on public.player_profiles for all
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.workspace_members m
               where m.user_id = player_profiles.user_id
                 and m.workspace_id in (select my_workspaces()))
  )
  with check (user_id = (select auth.uid()));
