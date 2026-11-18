-- Porta de entrada do cadastro self-service: cria o workspace SOLO do usuário logado.
-- Security definer porque um usuário novo ainda não é membro de nada (o RLS o impediria);
-- a trava: só cria se o usuário NÃO tiver nenhum workspace ainda (1 conta = 1 workspace solo).
create or replace function public.create_solo_workspace(ws_name text) returns uuid
language plpgsql security definer set search_path=''
as $$
declare wid uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if exists (select 1 from public.workspace_members where user_id=auth.uid()) then
    raise exception 'usuário já tem workspace';
  end if;
  insert into public.workspaces (name,kind,plan)
    values (coalesce(nullif(trim(ws_name),''),'Meu grind'),'solo','free')
    returning id into wid;
  insert into public.workspace_members (workspace_id,user_id,role) values (wid,auth.uid(),'owner');
  return wid;
end $$;
revoke all on function public.create_solo_workspace(text) from public;
grant execute on function public.create_solo_workspace(text) to authenticated;
