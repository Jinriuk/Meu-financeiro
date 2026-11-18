# GrinderBank

Gestão de banca e estatísticas de MTT para jogador solo e para times de staking. Site: grinderbank.com.

## Como é feito

- **Front**: React 18 sem bundler. A fonte é `app.jsx`; `node build.js` gera `app.js` (commitado). A Vercel serve os
  arquivos estáticos direto, com CSP estrita (`vercel.json`): nada de script inline nem `eval`.
- **Banco**: Supabase (projeto `pegrfpsyddzdvvuliugr`). Multi-tenant em banco único: cada conta é um *workspace*
  e o RLS só entrega as linhas dos workspaces de quem está logado. Plano e teste grátis são checados no
  servidor (policies + `meu_status()`), não só na tela.
- **Edge Functions**: `auth-alias` (login por apelido sem vazar e-mail), `kiwify-webhook` e `hotmart-webhook`
  (liberam/revogam plano achando o cliente pelo e-mail confirmado do login).
- **Motor de stats**: roda no navegador; pro banco sobem só agregados por torneio. Definições calibradas
  mão a mão com o PokerTracker 4 (56.255 mãos, 0 divergência nos contadores). Detalhes em
  `tools/regua/README.md`.

## Pastas

| Caminho | O quê |
|---|---|
| `app.jsx` / `app.js` | o app (fonte / compilado) |
| `supabase/migrations/` | histórico completo do banco (ver o README de lá) |
| `supabase/functions/` | Edge Functions publicadas |
| `schema.sql` | schema gerado a partir das migrations (não edite à mão) |
| `test/` | testes: unidade (motor, dinheiro, amostra real anonimizada), telas com Supabase simulado, segurança SQL |
| `tools/regua/` | régua de auditoria: calibração com o PT4, gerador da amostra, recriação do banco do zero |

## Rodar e testar

```bash
npm ci
node build.js                 # app.jsx -> app.js (o CI falha se app.js estiver desatualizado)
npm test                      # unidade + fumaça + telas + segurança SQL (precisa de Chromium e Postgres 15+)
npm run test:unit             # só o motor e o dinheiro (rápido, sem navegador)
```

Calibração completa com os seus arquivos (fora do repo): `node tools/regua/stats/calib_app.cjs <pasta_gg> <pasta_ps>`.

## Mudança de banco

1. Escreva a migration em `supabase/migrations/AAAAMMDDHHMMSS_nome.sql` (idempotente).
2. Aplique primeiro em homologação, depois em produção, **antes** de publicar o app que depende dela.
3. Regere o `schema.sql`: `DUMP=schema.sql bash tools/regua/banco/recriar.sh`.
