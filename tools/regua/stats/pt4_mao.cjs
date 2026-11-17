// Cruza o export mão a mão do PT4 (relatório GrinderBank_auditoria_mao_a_mao) com a referência e com o app.
// Uso: node stats/pt4_mao.cjs <export_pt4.csv> <pasta_maos_gg> <pasta_maos_ps>
'use strict';
const fs = require('fs'), path = require('path'), E = require('./engine.cjs'), R = require('./ref.cjs');
const SPLIT = /(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
const [csvPath, ...dirs] = process.argv.slice(2);
if (!csvPath || !dirs.length) { console.error('uso: node stats/pt4_mao.cjs <export.csv> <pasta_gg> [pasta_ps]'); process.exit(2); }
// ---- CSV do PT4 (aspas, vírgula como separador, números com milhar "1,234.56")
function csvRows(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const num = s => { const v = parseFloat(String(s).replace(/,/g, '').trim()); return isNaN(v) ? 0 : v; };
const key = s => String(s || '').replace(/\D/g, '');            // GG "TM6361043621" e "6361043621" viram a mesma chave
const rows = csvRows(fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
const H = rows[0].map(h => h.trim());
const col = nome => { const i = H.findIndex(h => h.toLowerCase() === nome.toLowerCase()); if (i < 0) throw new Error('coluna não encontrada no CSV: ' + nome + ' | tenho: ' + H.join(', ')); return i; };
const C = { hand: col('Hand #'), pos: col('Position'), vpip: col('GB VPIP n'), walk: col('GB Walk n'), pfr: col('GB PFR n'), pfrOpp: col('GB PFR Opp n'),
  tb: col('GB 3Bet n'), tbOpp: col('GB 3Bet Opp n'), sq: col('GB Squeeze n'), sqOpp: col('GB Squeeze Opp n'), f3b: col('GB F3B n'), f3bOpp: col('GB F3B Opp n'),
  rfi: col('GB RFI n'), rfiOpp: col('GB RFI Opp n'), bb: col('GB BB Won'), adj: col('GB All-In Adj BB') };
const PT = new Map();
for (const r of rows.slice(1)) { const k = key(r[C.hand]); if (!k) continue; PT.set(k, { pos: r[C.pos], vpip: num(r[C.vpip]), walk: num(r[C.walk]), pfr: num(r[C.pfr]), pfrOpp: num(r[C.pfrOpp]),
  tb: num(r[C.tb]), tbOpp: num(r[C.tbOpp]), sq: num(r[C.sq]), sqOpp: num(r[C.sqOpp]), f3b: num(r[C.f3b]), f3bOpp: num(r[C.f3bOpp]), rfi: num(r[C.rfi]), rfiOpp: num(r[C.rfiOpp]), bb: num(r[C.bb]), adj: num(r[C.adj]) }); }
console.log('mãos no CSV do PT4:', PT.size);
// ---- compara mão a mão
const cmp = {}; const ex = {}; let achadas = 0, faltando = 0; let luckPT = 0, luckRef = 0, luckApp = 0, nAllin = 0, nPerto = 0; const allinDif = [];
const add = (stat, pt, nosso, hid) => { const k = `${stat}: PT4=${pt} nosso=${nosso}`; if (pt === nosso) return; cmp[k] = (cmp[k] || 0) + 1; (ex[k] = ex[k] || []).length < 5 && ex[k].push(hid); };
for (const d of dirs) for (const f of fs.readdirSync(d)) {
  const txt = E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d, f)))).replace(/\f/g, '\n');
  for (const b0 of txt.split(SPLIT)) { const b = b0.trim(); if (!/^(?:PokerStars Hand|Poker Hand) #/.test(b)) continue;
    let r, a; try { r = R.parseHand(b); a = E.hhParseHand(b, {}); } catch (e) { continue; } if (!r || r.skip) continue;
    const p = PT.get(key(r.hid)); if (!p) { faltando++; continue; } achadas++;
    const heroPre = (b.split('*** FLOP')[0].match(new RegExp('^' + r.hero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': (folds|checks|calls|raises|bets)', 'gm')) || []).length;
    add('Walk', p.walk ? 1 : 0, heroPre ? 0 : 1, r.hid);
    add('VPIP', p.vpip ? 1 : 0, r.vpip ? 1 : 0, r.hid);
    add('PFR', p.pfr ? 1 : 0, r.pfr ? 1 : 0, r.hid);
    add('Fold to 3-bet opp', p.f3bOpp ? 1 : 0, r.f3bOpp ? 1 : 0, r.hid);
    if (Math.abs(p.bb - r.net_bb) > 0.011) add('BB ganhos (acima de 0,01)', p.bb.toFixed(2), r.net_bb.toFixed(2), r.hid);
    const lp = p.bb - p.adj; luckPT += lp;
    const lr = r.ev_pt4_bb == null ? 0 : r.net_bb - r.ev_pt4_bb; luckRef += lr; if (r.ev_pt4_bb != null || Math.abs(lp) > 0.005) { nAllin++; if (Math.abs(lp - lr) <= 3) nPerto++; }
    const la = a && a.allin ? a.allin.net - a.allin.ev : 0; luckApp += la;
    if (Math.abs(lp - lr) > 3) allinDif.push({ hid: r.hid, sorte_pt4: +lp.toFixed(2), sorte_ref: +lr.toFixed(2), dif: +(lp - lr).toFixed(2) });
  } }
console.log('mãos casadas:', achadas, '| mãos nossas sem par no CSV:', faltando);
console.log('\nDivergências por stat (exemplos de mão entre colchetes):');
Object.entries(cmp).sort((x, y) => y[1] - x[1]).forEach(([k, v]) => console.log(String(v).padStart(7), k, JSON.stringify(ex[k])));
console.log(`\nSorte total (bb): PT4 ${luckPT.toFixed(1)} | referência (regra do PT4) ${luckRef.toFixed(1)} | app ${luckApp.toFixed(1)}`);
console.log(`All-ins a ±3 bb do PT4: ${nPerto} de ${nAllin} (${(100*nPerto/Math.max(1,nAllin)).toFixed(1)}%)`);
allinDif.sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif));
console.log('All-ins com diferença > 3 bb entre PT4 e referência (abaixo disso é ruído do Monte Carlo):', allinDif.length, '| soma', allinDif.reduce((s, x) => s + x.dif, 0).toFixed(1), 'bb');
console.log(allinDif.slice(0, 15));
