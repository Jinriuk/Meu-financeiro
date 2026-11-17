# Régua de auditoria: stats

Ferramentas da auditoria de 17/11/2026 para provar os aceites de stats do plano (F0.10 a F0.16).
Não fazem parte do app e não vão para o deploy (`.vercelignore`). Sem dependências externas.

Os hand histories **não** ficam no repositório (têm nick de outros jogadores). Rode com as suas pastas,
a partir da raiz do repo (onde está o `app.js`):

| Script | O que prova | Esperado |
|---|---|---|
| `node tools/regua/stats/eval_check.cjs` | Avaliador de mãos do app × avaliador independente | 0 divergências; \|z\| < 3 |
| `node tools/regua/stats/pt4_mao.cjs <export_pt4.csv> <pasta_gg> <pasta_ps>` | App × PT4 mão a mão | Walk, VPIP, PFR, fold to 3-bet com 0 divergência; ≥ 97% dos all-ins a ±3 bb |
| `node tools/regua/stats/calib.cjs <pasta_gg> <pasta_ps>` / `calib2.cjs` | Calibração por posição | Metas do anexo A |
| `node tools/regua/stats/chips.cjs <pasta>` | bb ganhos por conservação de fichas | ≥ 99,9% |
| `node tools/regua/stats/wtsd.cjs <pasta>` | Peso do all-in pré-flop no WTSD | base da definição nova |
| `node tools/regua/stats/sums.cjs <resumos_gg>` e `kos.cjs <pasta_gg>` | Resumos da GG e PKO | nenhum PKO com eliminação sem bounty |
| `node tools/regua/stats/run_import.cjs <pasta>` | Import sem banco | sem descarte indevido |
| `node tools/regua/stats/calib_app.cjs <pasta_gg> <pasta_ps>` | **Motor novo do app** (hhAggregate + hhTotals) contra as metas do anexo A | cada stat a ±0,05 ponto; all-in ajustado a ±0,5 bb/100 |

`ref.cjs` é o parser de referência, independente do app. `engine.cjs` carrega as funções puras do `app.js`.
O relatório do PT4 (`.pt4rpt`) que gera o CSV mão a mão fica fora do repositório, junto com o plano.
