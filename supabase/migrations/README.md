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

## O que está versionado aqui
- `20260719_audit_prod_hardening.sql` — todo o endurecimento da **auditoria pré-produção**
  (entitlement no servidor, fail-closed de plano, índices de FK + initplan, exclusão de conta
  LGPD, RPCs de cobrança do webhook, retirada do `email_for_login`/`my_role`). É idempotente e
  pode ser reaplicado com segurança sobre o schema base.

O histórico anterior (schema inicial da pool, realtime, perfis, ABI por jogador, banca por
plataforma, hand-history stats, multi-tenant) está no Supabase e no `schema.sql`.

## Edge Functions
Código versionado em [`../functions/`](../functions/):
- `auth-alias` — login/reset por apelido resolvido no servidor (não vaza e-mail).
- `kiwify-webhook` — recebe a cobrança da Kiwify (HMAC ou token), ativa/revoga plano.

Deploy: `supabase functions deploy auth-alias --no-verify-jwt` (idem kiwify-webhook).
