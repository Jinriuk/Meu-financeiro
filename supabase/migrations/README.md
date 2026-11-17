# Migrations — GrinderBank

O banco (Supabase, projeto `pegrfpsyddzdvvuliugr`) é gerenciado por migrations.

## Onde está a fonte da verdade
- **Histórico completo e aplicado**: `supabase_migrations.schema_migrations` no próprio projeto.
  Para exportar tudo para arquivos e recriar do zero:
  ```
  supabase link --project-ref pegrfpsyddzdvvuliugr
  supabase db pull          # baixa as migrations reais para supabase/migrations/
  ```
- **Snapshot recriável (schema atual inteiro)**: [`../../schema.sql`](../../schema.sql) na raiz do
  repo — espelho legível de todas as tabelas, RLS, funções e grants em produção.

## Pendentes de aplicar (plano mestre, 17/11/2026) — nesta ordem, primeiro em homologação
Cada uma é idempotente e precisa entrar no banco **antes** de publicar o app que depende dela.
1. `20261117120000_motor_stats_v2.sql` — contadores novos do motor de stats e `engine_version` (F0.12–F0.15).
2. `20261117130000_dinheiro_bounty_moeda.sql` — `tournaments.bounty` e `tournaments.currency` (F0.8, F0.11).
3. `20261117140000_seguranca_webhook_e_status_servidor.sql` — e-mail do perfil travado, webhook pelo
   e-mail do auth, contrato checado no servidor (F0.5, F0.6). Testada localmente: `bash test/sql/run.sh`.

O app publicado hoje NÃO funciona com o banco sem (1) e (2): a carga das stats pede colunas novas.
Por isso: aplica as migrations, depois publica o app.

## O que está versionado aqui
- `20260719_audit_prod_hardening.sql` — todo o endurecimento da **auditoria pré-produção**
  (entitlement no servidor, fail-closed de plano, índices de FK + initplan, exclusão de conta
  LGPD, RPCs de cobrança do webhook, retirada do `email_for_login`/`my_role`). É idempotente e
  pode ser reaplicado com segurança sobre o schema base.

O histórico anterior (28 migrations, de `pool_schema_inicial` a `webhook_cobrancas_registro`) está
só no Supabase. **Falta trazê-lo pra cá** (F0.7): `supabase db pull` com o token do projeto.

## Edge Functions
Código versionado em [`../functions/`](../functions/):
- `auth-alias` — login/reset por apelido resolvido no servidor (não vaza e-mail).
- `kiwify-webhook` — recebe a cobrança da Kiwify (HMAC ou token), ativa/revoga plano.

Deploy: `supabase functions deploy auth-alias --no-verify-jwt` (idem kiwify-webhook).
