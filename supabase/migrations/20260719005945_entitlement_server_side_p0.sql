-- #1 (P0): tira a escrita de workspaces das mãos do cliente. O app só LÊ workspaces;
-- criação é via create_solo_workspace() e mudança de plano via aplicar_ativacao()/webhook,
-- todas SECURITY DEFINER (rodam como dono e ignoram estes grants). Assim ninguém destrava
-- o Pro com um PATCH /rest/v1/workspaces usando a anon key.
revoke insert, update, delete, truncate on public.workspaces from anon, authenticated;
revoke insert, update, delete, truncate on public.workspace_members from anon, authenticated;
-- plan_activations: acesso só via RPC/admin (RLS já sem policies) — remove grants residuais
revoke all on public.plan_activations from anon, authenticated;
-- player_profiles: cliente autenticado precisa gravar o próprio perfil; anon não grava nada
revoke insert, update, delete, truncate on public.player_profiles from anon;

-- #10 (P0/P2): fail-closed. Workspace criado fora do RPC nasce 'free', não 'founder';
-- e plan só aceita valores conhecidos.
alter table public.workspaces alter column plan set default 'free';
alter table public.workspaces drop constraint if exists workspaces_plan_check;
alter table public.workspaces add constraint workspaces_plan_check
  check (plan in ('free','gestao','pro','founder','team'));
