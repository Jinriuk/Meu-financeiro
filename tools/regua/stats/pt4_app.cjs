// Cruza o export MÃO A MÃO do PT4 com o motor DO APP (hhParseHand), pelo número da mão.
// Uso: node tools/regua/stats/pt4_app.cjs <export_pt4.csv> <pasta_gg> [pasta_ps]   (EX=arquivo.json grava exemplos)
'use strict';
const fs = require('fs'), path = require('path');
const E = require('../../../test/lib/engine.cjs');
const [csvPath, ...dirs] = process.argv.slice(2);
if (!csvPath || !dirs.length) { console.error('uso: node tools/regua/stats/pt4_app.cjs <export.csv> <pasta_gg> [pasta_ps]'); process.exit(2); }
function csvRows(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const num = s => { const v = parseFloat(String(s).replace(/,/g, '').trim()); return isNaN(v) ? 0 : v; };
const key = s => String(s || '').replace(/\D/g, '');
const rows = csvRows(fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
const H = rows[0].map(h => h.trim()); const col = n => H.findIndex(h => h.toLowerCase() === n.toLowerCase());
const C = { hand: col('Hand #'), pos: col('Position'), vpip: col('GB VPIP n'), walk: col('GB Walk n'), pfr: col('GB PFR n'), pfrOpp: col('GB PFR Opp n'), tb: col('GB 3Bet n'), tbOpp: col('GB 3Bet Opp n'),
  sq: col('GB Squeeze n'), sqOpp: col('GB Squeeze Opp n'), f3b: col('GB F3B n'), f3bOpp: col('GB F3B Opp n'), rfi: col('GB RFI n'), rfiOpp: col('GB RFI Opp n'), bb: col('GB BB Won'), adj: col('GB All-In Adj BB') };
const PT = new Map();
for (const r of rows.slice(1)) { const k = key(r[C.hand]); if (!k) continue; const o = { pos: r[C.pos] }; for (const f in C) if (f !== 'hand' && f !== 'pos') o[f] = num(r[C[f]]); PT.set(k, o); }
const SPLIT = /(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
const div = {}, ex = {}; let casadas = 0, semPar = 0; let sorteApp = 0, sortePT = 0, nAi = 0, perto = 0; const aiDif = [];
const add = (k, hid, raw) => { div[k] = (div[k] || 0) + 1; (ex[k] = ex[k] || []).length < 4 && ex[k].push(raw); };
for (const d of dirs) for (const f of fs.readdirSync(d)) {
  const txt = E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d, f)))).replace(/\f/g, '\n');
  for (const b0 of txt.split(SPLIT)) { const b = b0.trim(); if (!/^(?:PokerStars Hand|Poker Hand) #/.test(b)) continue;
    const a = E.hhParseHand(b, {}); if (!a) continue;
    const p = PT.get(key(a.hid)); if (!p) { semPar++; continue; } casadas++;
    const cmp = (nome, vPT, vApp) => { if (vPT !== vApp) add(`${nome}: PT4=${vPT} app=${vApp}`, a.hid, b); };
    cmp('posição', p.pos, a.pos);
    cmp('walk', p.walk ? 1 : 0, a.walk ? 1 : 0); cmp('VPIP', p.vpip ? 1 : 0, a.vpip ? 1 : 0); cmp('PFR', p.pfr ? 1 : 0, a.pfr ? 1 : 0);
    cmp('PFR opp', p.pfrOpp ? 1 : 0, a.pfrOpp ? 1 : 0); cmp('3-bet opp', p.tbOpp ? 1 : 0, a.tbOpp ? 1 : 0); cmp('3-bet', p.tb ? 1 : 0, a.tb ? 1 : 0);
    cmp('squeeze opp', p.sqOpp ? 1 : 0, a.sqOpp ? 1 : 0); cmp('squeeze', p.sq ? 1 : 0, a.sq ? 1 : 0);
    cmp('F3B opp', p.f3bOpp ? 1 : 0, a.f3bOpp ? 1 : 0); cmp('F3B', p.f3b ? 1 : 0, a.f3b ? 1 : 0);
    cmp('RFI opp', p.rfiOpp ? 1 : 0, a.rfiOpp ? 1 : 0); cmp('RFI', p.rfi ? 1 : 0, a.rfi ? 1 : 0);
    if (Math.abs(p.bb - a.net_bb) > 0.011) add('bb ganhos (> 0,01)', a.hid, b);
    const lp = p.bb - p.adj, la = a.allin ? a.allin.net - a.allin.ev : 0; sortePT += lp; sorteApp += la;
    if (a.allin || Math.abs(lp) > 0.005) { nAi++; if (Math.abs(lp - la) <= 3) perto++; else aiDif.push({ hid: a.hid, pt4: +lp.toFixed(2), app: +la.toFixed(2), dif: +(lp - la).toFixed(2), tem: !!a.allin }); }
  } }
console.log('casadas', casadas, '| sem par no CSV', semPar, '| no CSV', PT.size);
Object.entries(div).sort((x, y) => y[1] - x[1]).forEach(([k, v]) => console.log(String(v).padStart(7), k));
console.log(`\nSorte total (bb): PT4 ${sortePT.toFixed(1)} | app ${sorteApp.toFixed(1)}`);
console.log(`All-ins a ±3 bb do PT4: ${perto} de ${nAi} (${(100 * perto / Math.max(1, nAi)).toFixed(1)}%)`);
aiDif.sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif));
console.log('maiores diferenças de sorte:', aiDif.length, 'soma', aiDif.reduce((s, x) => s + x.dif, 0).toFixed(1), JSON.stringify(aiDif.slice(0, 8)));
if (process.env.EX) fs.writeFileSync(process.env.EX, JSON.stringify({ ex, aiDif: aiDif.slice(0, 60) }));
