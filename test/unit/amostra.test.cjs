// F0.16: amostra ANONIMIZADA de mãos reais (3.500, 900 com all-in) com a resposta do PT4 de cada uma.
// Qualquer mudança no motor que piore uma stat contra o PT4 faz este teste falhar.
// Gerada por tools/regua/amostra.cjs a partir do export mão a mão do PT4 (56.255 mãos).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const E = require('../lib/engine.cjs');
const DIR = path.join(__dirname, '..', 'fixtures');
const maos = zlib.gunzipSync(fs.readFileSync(path.join(DIR, 'amostra_maos.txt.gz'))).toString('utf8').split(/(?=^(?:PokerStars Hand|Poker Hand) #)/m).map(s => s.trim()).filter(Boolean);
const PT = JSON.parse(fs.readFileSync(path.join(DIR, 'amostra_pt4.json'), 'utf8'));
const res = maos.map(b => { const a = E.hhParseHand(b, {}); return { a, p: a && PT[String(a.hid).replace(/\D/g, '')] }; });

test('amostra: todas as mãos lidas e casadas com o PT4', () => {
  assert.equal(maos.length, 3500);
  assert.equal(res.filter(x => x.a && x.p).length, 3500);
});

test('amostra: 0 divergência mão a mão com o PT4 nos contadores e no bb ganho', () => {
  const F = [['pos', 'pos'], ['walk', 'walk'], ['vpip', 'vpip'], ['pfr', 'pfr'], ['pfrOpp', 'pfrOpp'], ['tbOpp', 'tbOpp'], ['tb', 'tb'],
    ['sqOpp', 'sqOpp'], ['sq', 'sq'], ['f3bOpp', 'f3bOpp'], ['f3b', 'f3b'], ['rfiOpp', 'rfiOpp'], ['rfi', 'rfi']];
  const div = {};
  for (const { a, p } of res) {
    for (const [ka, kp] of F) { const va = ka === 'pos' ? a.pos : (a[ka] ? 1 : 0), vp = kp === 'pos' ? p.pos : (p[kp] ? 1 : 0); if (va !== vp) div[ka] = (div[ka] || 0) + 1; }
    if (Math.abs(a.net_bb - p.bb) > 0.011) div.bb = (div.bb || 0) + 1;
  }
  assert.deepEqual(div, {});
});

// A amostra tem all-in de propósito (900 de 3.500 mãos, 4x a taxa real), então bb/100 não serve de régua aqui.
// Tolerância do anexo A convertida: 0,5 bb/100 em 56.255 mãos = 281 bb em 4.369 all-ins = 0,064 bb por all-in.
test('amostra: all-in ajustado — ≥97% dos all-ins a ±3 bb do PT4 e desvio total ≤ 0,064 bb por all-in', () => {
  let n = 0, perto = 0, sApp = 0, sPT = 0;
  for (const { a, p } of res) {
    const lp = p.bb - p.adj, la = a.allin ? a.allin.net - a.allin.ev : 0; sApp += la; sPT += lp;
    if (a.allin || Math.abs(lp) > 0.005) { n++; if (Math.abs(lp - la) <= 3) perto++; }
  }
  assert.ok(perto / n >= 0.97, `${perto}/${n} = ${(100 * perto / n).toFixed(1)}%`);
  assert.ok(Math.abs(sApp - sPT) / n <= 0.064, `sorte app ${sApp.toFixed(1)} x PT4 ${sPT.toFixed(1)} bb em ${n} all-ins`);
});
