# Migrations — GrinderBank

Fonte da verdade do banco (Supabase, projeto `pegrfpsyddzdvvuliugr`). Cada arquivo `AAAAMMDDHHMMSS_nome.sql`
corresponde a uma linha de `supabase_migrations.schema_migrations` em produção.

## Como foi versionado (F0.7, 18/11/2026)
- As 28 migrations aplicadas em produção foram exportadas e conferidas uma a uma pelo **md5** contra o banco.
- Três delas foram ajustadas **só no repositório** (o repo é público), sem mudar a estrutura:
  - `20260716145354_create_guest_lucas` — semente de usuário com senha padrão: vira `select 1`.
  - `20260718223600_workspaces_multitenant` — e-mails reais trocados por marcadores; as sementes da pool
    são puladas num banco novo (em vez de abortar).
  - `20260716173626_config_changes` — a semente do histórico só roda onde já há usuários.
- Prova: `CATALOGO=catalogo_md5.sql bash tools/regua/banco/recriar.sh 20260805135400` recria o banco do
  zero num Postgres local e o catálogo do schema `public` (colunas, índices, policies, funções pelo hash do
  código, triggers, grants, RLS, realtime, comentários) sai **idêntico** ao de produção.
- `schema.sql` na raiz é gerado a partir dessas migrations (`DUMP=schema.sql bash tools/regua/banco/recriar.sh`).

## Aplicadas em produção depois do versionamento
- `20261118020330_motor_stats_v2.sql` — contadores do motor de stats calibrado com o PT4 e `engine_version`
  (as 2.448 linhas antigas ficaram com versão 1).
- `20261118020341_dinheiro_bounty_moeda.sql` — `tournaments.bounty` e `tournaments.currency`.
Conferidas pelo md5 contra `supabase_migrations.schema_migrations`.

## Pendentes de aplicar — nesta ordem
1. `20261118030000_seguranca_webhook_e_status_servidor.sql` — e-mail do perfil travado, webhook pelo e-mail
   do auth, contrato checado no servidor. Cenários de ataque: `bash test/sql/run.sh`.
2. `20261118030100_monitoramento_erros.sql` — `app_erros`, `registrar_erro()` e aviso a cada 5 min
   (`avisar_erros()` via pg_cron + pg_net) pro endereço em `app_secrets.alerta_webhook_url`.
Ao aplicar, o Supabase grava uma versão nova: renomeie o arquivo pra ela (e confira o md5).

Todas são compatíveis com o app que está no ar hoje (só acrescentam colunas, travas e funções).

## Edge Functions (`../functions/`)
Iguais ao que está publicado (conferido em 18/11/2026): `auth-alias` (v3), `hotmart-webhook` (v2),
`kiwify-webhook` (v6). Deploy: `supabase functions deploy <nome> --no-verify-jwt`.
