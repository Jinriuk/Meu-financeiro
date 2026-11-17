// Aceite F0.12/F0.13/F0.14: roda o motor DO APP (parseHH -> hhAggregate -> hhTotals, exatamente o que a tela
// Stats usa) sobre as pastas de hand history e compara com as metas do PT4 (anexo A do plano mestre).
// Uso: node tools/regua/stats/calib_app.cjs <pasta_gg> [pasta_ps]
// Sai com código 1 se alguma meta não bater.
'use strict';
const fs = require('fs'), path = require('path');
const E = require('../../../test/lib/engine.cjs');
const dirs = process.argv.slice(2);
if (!dirs.length) { console.error('uso: node tools/regua/stats/calib_app.cjs <pasta_gg> [pasta_ps]'); process.exit(2); }

const SPLIT = /(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
let hands = [], ignored = 0, reasons = {};
for (const d of dirs) for (const f of fs.readdirSync(d)) {
  const parts = E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d, f)))).replace(/\f/g, '\n').split(SPLIT);
  for (let j = 0; j < parts.length; j += 400) {
    const r = E.parseHH(parts.slice(j, j + 400).join(''));
    hands = hands.concat(r.hands); ignored += r.ignored; for (const k in r.reasons) reasons[k] = (reasons[k] || 0) + r.reasons[k];
  }
}
// dedup pelo nº da mão (mesma regra do import)
const vistos = new Set(); hands = hands.filter(h => { const k = h.site + '|' + h.hid; if (vistos.has(k)) return false; vistos.add(k); return true; });
const rows = E.hhAggregate(hands, 'auditoria');
const T = E.hhTotals(rows);
const pc = (a, b) => b ? 100 * a / b : NaN;
const pb = (k, campo) => { const x = T.pos[k]; return x && x.hn ? x[campo] / x.hn * 100 : NaN; };
const bb = T.pos.BB || {};
const foldVs = o => pc(bb['v' + o + '_f'] || 0, bb['v' + o + '_o'] || 0);
const rfi = k => { const x = T.pos[k]; return x ? pc(x.r, x.ro) : NaN; };

// [nome, valor, meta, tolerância]
const M = [
  ['mãos', hands.length, 56255, 0],
  ['VPIP', pc(T.vpip, T.vpipDen), 26.59, 0.05],
  ['PFR', pc(T.pfr, T.pfrOpp), 18.52, 0.05],
  ['Fold to 3-bet', pc(T.f3b, T.f3bOpp), 33.02, 0.05],
  ['Fold to c-bet', pc(T.fcb, T.fcbOpp), 35.00, 0.05],
  ['C-bet flop', pc(T.cbet, T.cbetOpp), 63.59, 0.05],
  ['BB fold vs BTN', foldVs('BTN'), 45.64, 0.05],
  ['BB fold vs CO', foldVs('CO'), 54.59, 0.05],
  ['BB fold vs SB', foldVs('SB'), 41.49, 0.05],
  ['RFI CO', rfi('CO'), 32.11, 0.05],
  ['RFI BTN', rfi('BTN'), 42.09, 0.05],
  ['RFI SB', rfi('SB'), 51.83, 0.05],
  ['3-bet (sem squeeze)', pc(T.tb, T.tbOpp), 10.67, 0.05],
  ['Squeeze', pc(T.sq, T.sqOpp), 9.47, 0.05],
  ['mãos EP', (T.pos.EP || {}).h, 12083, 0], ['mãos MP', (T.pos.MP || {}).h, 14160, 0], ['mãos CO', (T.pos.CO || {}).h, 7501, 0],
  ['mãos BTN', (T.pos.BTN || {}).h, 7462, 0], ['mãos SB', (T.pos.SB || {}).h, 7509, 0], ['mãos BB', (T.pos.BB || {}).h, 7540, 0],
  ['bb/100', T.bb100, 4.84, 0.05],
  ['bb/100 SB', pb('SB', 'net'), -0.25, 0.05], ['bb/100 BB', pb('BB', 'net'), -22.20, 0.05],
  ['bb/100 CO', pb('CO', 'net'), 19.71, 0.05], ['bb/100 BTN', pb('BTN', 'net'), 19.10, 0.05],
  ['all-in ajustado bb/100', T.adjBb100, 7.14, 0.5],
  ['ajustado SB', pb('SB', 'adj'), -14.55, 0.5], ['ajustado BB', pb('BB', 'adj'), -34.00, 0.5],
  ['ajustado CO', pb('CO', 'adj'), 16.98, 0.5], ['ajustado BTN', pb('BTN', 'adj'), 30.96, 0.5],
  ['WTSD (sem all-in pré-flop)', pc(T.wtsdNp, T.wtsdDen), 34, 1.0],
];
let falhas = 0;
console.log('descartadas', ignored, reasons, '| torneios', rows.length);
for (const [nm, v, meta, tol] of M) {
  const ok = Number.isFinite(v) && Math.abs(v - meta) <= tol; if (!ok) falhas++;
  console.log(`${ok ? 'OK  ' : 'FORA'} ${nm.padEnd(28)} app ${Number.isFinite(v) ? v.toFixed(2).padStart(9) : '      n/d'}  meta ${String(meta).padStart(8)}  ±${tol}`);
}
console.log(falhas ? `\n${falhas} meta(s) fora` : '\ntodas as metas batem');
process.exit(falhas ? 1 : 0);
