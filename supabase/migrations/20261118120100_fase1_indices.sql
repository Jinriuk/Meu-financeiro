-- Fase 1: ajustes apontados pelo advisor do Supabase depois de aplicar a estrutura. Idempotente.
-- Chaves estrangeiras sem índice (convite.pessoa_id, convite.workspace_id, unidade.mae_id) e a policy
-- acesso_ler chamando auth.uid() por linha (agora uma vez por consulta).
create index if not exists convite_pessoa on public.convite (pessoa_id);
create index if not exists convite_workspace on public.convite (workspace_id);
create index if not exists unidade_mae on public.unidade (mae_id);
alter policy acesso_ler on public.acesso
  using (exists (select 1 from public.pessoa p where p.id = pessoa_id and p.user_id = (select auth.uid()))
         or public.pode('administrar', unidade_id));
