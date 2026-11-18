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

## Aplicadas em produção em 18/11/2026 (depois do versionamento)
- `20261118020330_motor_stats_v2.sql` — contadores do motor calibrado com o PT4 e `engine_version`.
- `20261118020341_dinheiro_bounty_moeda.sql` — `tournaments.bounty` e `tournaments.currency`.
- `20261118030000_seguranca_webhook_e_status_servidor.sql` — e-mail do perfil travado, webhook pelo e-mail
  confirmado, contrato checado no servidor.
- `20261118030100_monitoramento_erros.sql` — `app_erros`, `registrar_erro()`, `avisar_erros()` a cada 5 min.
- `20261118072145_webhook_revoga_so_o_plano_do_pedido.sql` — revogação só derruba o plano se o pedido for do
  plano atual (`webhook_revogar_plano` com 3 argumentos; a de 2 argumentos, usada pela Kiwify, segue igual).
- `20261118100000_fase1_estrutura_times.sql` — organização, unidades (árvore), pessoas, vínculo, acesso, `pode()`.
- `20261118110000_fase1_fatos_por_pessoa.sql` — fatos com pessoa e unidade na data; escopo de leitura
  (`ver_desempenho` x `ver_financeiro`); `estruturar_workspace()` pra migrar times existentes.
- `20261118120000_fase1_convites.sql` — convite por link (token só no link, hash no banco).

As três da fase 1 foram aplicadas numa transação só, com uma foto do que cada conta enxergava antes e
depois (simulando o login de cada uma): as 17 contas viam exatamente o mesmo, senão a transação abortava.
Na mesma transação, o Pool e o Demo Staking foram estruturados (os donos administram; no Pool os dois jogam).

Conferência depois de aplicar: `CATALOGO=catalogo_md5.sql bash tools/regua/banco/recriar.sh` dá as 11 seções
idênticas ao catálogo de produção. As duas últimas foram coladas no SQL Editor pelo Windows: o código das
funções em produção tem `\r` nas quebras de linha (inofensivo); a régua ignora o `\r`.

Teste das travas no banco real (numa transação desfeita): conta com teste vencido recebe 403 ao gravar e
continua lendo os próprios dados; e-mail e papel do perfil não mudam pelo cliente; time grava normal.

## Edge Functions (`../functions/`)
Iguais ao que está publicado (conferido em 18/11/2026): `auth-alias` (v3), `hotmart-webhook` (v4),
`kiwify-webhook` (v7). Deploy: `supabase functions deploy <nome> --no-verify-jwt`.
