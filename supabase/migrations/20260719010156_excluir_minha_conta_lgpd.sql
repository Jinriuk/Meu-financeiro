-- #6 (P1/LGPD): exclusão definitiva de verdade. A política promete apagar tudo; antes,
-- apagar o usuário deixava workspace + banca + torneios + stats + WhatsApp órfãos.
-- Regra: workspace onde o usuário é o ÚNICO membro é apagado inteiro (dados→config→ws);
-- workspace compartilhado (a pool dos sócios) só perde a associação dele — o dado do
-- companheiro fica intacto. No fim apaga o perfil e o próprio usuário de auth.
create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare uid uuid := auth.uid(); wsid uuid; membros int;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  for wsid in select workspace_id from public.workspace_members where user_id=uid loop
    select count(*) into membros from public.workspace_members where workspace_id=wsid;
    if membros<=1 then
      delete from public.bankroll_ledger      where workspace_id=wsid;
      delete from public.config_changes        where workspace_id=wsid;
      delete from public.daily_entries         where workspace_id=wsid;
      delete from public.hh_import_log          where workspace_id=wsid;
      delete from public.hh_tournament_stats    where workspace_id=wsid;
      delete from public.player_wallets         where workspace_id=wsid;
      delete from public.tournaments            where workspace_id=wsid;
      delete from public.withdrawals            where workspace_id=wsid;
      delete from public.pool_config            where workspace_id=wsid;
      delete from public.workspace_members      where workspace_id=wsid;
      delete from public.workspaces             where id=wsid;
    else
      delete from public.workspace_members where workspace_id=wsid and user_id=uid;
    end if;
  end loop;
  -- solta referências e apaga identidade
  update public.plan_activations set used_by=null where used_by=uid;
  delete from public.player_profiles where user_id=uid;
  delete from auth.users where id=uid;
end $$;

revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;
