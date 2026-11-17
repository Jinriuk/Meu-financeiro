// Motor de stats (F0.12 a F0.15): cada definição do anexo A testada numa mão montada à mão,
// mais o diferencial contra o parser de referência independente (tools/regua/stats/ref.cjs).
// Rodar: node --test test/unit
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine.cjs');
const R = require('../../tools/regua/stats/ref.cjs');
const { H } = require('../lib/hands.cjs');

const P = k => { const why = {}; const h = E.hhParseHand(H[k], why); assert.ok(h, `mão ${k} descartada: ${why.r}`); return h; };
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} x ${b} (tol ${tol})`);

test('versão do motor é 2 e vai em cada agregado', () => {
  assert.equal(E.HH_ENGINE, 2);
  const row = E.hhAggregate([P('openUTG')], 'X')[0];
  assert.equal(row.engine_version, 2);
});

test('walk: sem ação do herói no pré-flop; sai do denominador do VPIP', () => {
  const h = P('walk');
  assert.equal(h.walk, true); assert.equal(h.vpip, false); assert.equal(h.pfrOpp, false); assert.equal(h.pos, 'BB');
  close(h.net_bb, 0.5, 1e-9, 'net do walk');
  const T = E.hhTotals(E.hhAggregate([h, P('openUTG')], 'X'));
  assert.equal(T.hands, 2); assert.equal(T.walks, 1); assert.equal(T.vpipDen, 1); assert.equal(T.vpip, 1);
});

test('open do UTG: EP, RFI, PFR com oportunidade', () => {
  const h = P('openUTG');
  assert.equal(h.pos, 'EP');
  assert.deepEqual([h.rfiOpp, h.rfi, h.pfrOpp, h.pfr, h.vpip, h.stealOpp], [true, true, true, true, true, false]);
  close(h.net_bb, 1.5, 1e-9, 'net');
});

test('BB contra roubo do BTN com call do SB no meio: conta a defesa (vs BTN) e é squeeze, não 3-bet', () => {
  const h = P('bbVsBtnSbCall');
  assert.equal(h.bbdefOpp, true); assert.equal(h.bbdef, false); assert.equal(h.bbVs, 'BTN');
  assert.equal(h.tbOpp, false); assert.equal(h.sqOpp, true); assert.equal(h.sq, false);
  assert.equal(h.pfrOpp, true);
  const T = E.hhTotals(E.hhAggregate([h], 'X'));
  assert.equal(T.pos.BB.vBTN_o, 1); assert.equal(T.pos.BB.vBTN_f, 1);
});

test('squeeze: open + caller, herói aumenta', () => {
  const h = P('squeeze');
  assert.equal(h.pos, 'CO');
  assert.deepEqual([h.sqOpp, h.sq, h.tbOpp, h.tb], [true, true, false, false]);
  close(h.net_bb, 6.5, 1e-9, 'net');
});

test('fold to 3-bet só quando o herói abriu', () => {
  const a = P('openFold3b');
  assert.deepEqual([a.pos, a.stealOpp, a.steal, a.f3bOpp, a.f3b], ['BTN', true, true, true, true]);
  const b = P('threeBetFold4b');
  assert.deepEqual([b.tbOpp, b.tb, b.f3bOpp], [true, true, false]);
});

test('oportunidade de PFR (fórmula cnt_pfr_opp do PT4)', () => {
  assert.equal(P('curtoFold').pfrOpp, false, 'stack menor que BB + ante, 1 ação');
  assert.equal(P('curtoFold').rfiOpp, true);
  assert.equal(P('shoveMaior').pfrOpp, false, 'raise enfrentado maior que o stack, 1 ação');
  assert.equal(P('openFold3b').pfrOpp, true, '2 ações no pré-flop');
});

test('heads-up: botão conta como SB (roubo e RFI)', () => {
  const h = P('huBotao');
  assert.deepEqual([h.pos, h.stealOpp, h.steal, h.rfiOpp, h.rfi], ['SB', true, true, true, true]);
  close(h.net_bb, 1, 1e-9, 'net');
});

test('fold to c-bet só sem raise entre a c-bet e o herói', () => {
  const a = P('foldCbet');
  assert.deepEqual([a.fcbOpp, a.fcb, a.bbdefOpp, a.bbdef, a.sawflop], [true, true, true, true, true]);
  const b = P('cbetComRaise');
  assert.equal(b.fcbOpp, false);
});

test('posições do PT4: SB/BB por quem postou, EP = UTG (+UTG+1 em 8-9), MP até o CO', () => {
  const seats = n => Array.from({ length: n }, (_, i) => ({ seat: i + 1, n: 'S' + (i + 1) }));
  const p9 = E.hhPositions(seats(9), 1, 'S2', 'S3');
  assert.deepEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'].map(s => p9[s]), ['BTN', 'SB', 'BB', 'EP', 'EP', 'MP', 'MP', 'MP', 'CO']);
  const p6 = E.hhPositions(seats(6), 1, 'S2', 'S3');
  assert.deepEqual(['S4', 'S5', 'S6'].map(s => p6[s]), ['EP', 'MP', 'CO']);
  const p4 = E.hhPositions(seats(4), 1, 'S2', 'S3');
  assert.equal(p4.S4, 'CO');
  // "out of hand" é ignorado: mesa de 8 com 1 fora vira mesa de 7 (só 1 EP) e o lugar 7 é CO
  assert.equal(P('outOfHand').pos, 'CO');
});

test('all-in EV exato (turn, heads-up): 8 outs em 44', () => {
  const h = P('allinTurn');
  assert.ok(h.allin, 'all-in não detectado');
  close(h.net_bb, -50, 1e-9, 'net');
  close(h.allin.ev, (8 / 44 * 2000 - 1000) / 20, 1e-9, 'EV');
});

test('all-in EV com side pot: herói curto só disputa o pote principal', () => {
  const h = P('sidePot');
  const r = R.parseHand(H.sidePot);
  const eq = R.equities([[R.card('Kh'), R.card('Qh')], [R.card('9h'), R.card('9d')], [R.card('Ac'), R.card('Kc')]], ['2c', '5h', '9s', 'Kd'].map(R.card))[0];
  close(h.allin.ev, (eq * 900 - 300) / 20, 1e-9, 'EV pela conta');
  close(h.allin.ev, r.ev_pt4_bb, 1e-9, 'EV x referência');
  close(h.net_bb, -15, 1e-9, 'net');
});

test('all-in EV: equity na última decisão do herói (flop), potes por nível de contribuição', () => {
  const h = P('allinFlopComCurto');
  const c = R.card, flop = ['Ts', '9s', '2d'].map(c);
  const hero = [c('Ks'), c('Qs')], V = [c('Th'), c('Td')], S = [c('Ac'), c('Ad')];
  const e3 = R.equities([hero, V, S], flop)[0], e2 = R.equities([hero, V], flop)[0];
  close(h.net_bb, -50, 1e-9, 'net');
  close(h.allin.ev, (e3 * 300 + e2 * 1800 - 1000) / 20, 1e-9, 'EV pela conta');
  close(h.allin.ev, R.parseHand(H.allinFlopComCurto).ev_pt4_bb, 1e-9, 'EV x referência');
});

test('regra do PT4: ação depois da última decisão do herói -> não ajusta (EV = real)', () => {
  const h = P('acaoDepois');
  assert.ok(h.allin);
  assert.equal(h.allin.ev, h.allin.net);
  assert.equal(R.parseHand(H.acaoDepois).ev_pt4_bb, h.net_bb);
});

test('WTSD sem all-in pré-flop: flop sem ação nenhuma não entra', () => {
  const t = P('allinTurn'); assert.equal(t.sawflopNp, true); assert.equal(t.wtsd, true);
  const a = P('acaoDepois'); assert.equal(a.sawflopNp, true);   // houve aposta no flop
});

test('diferencial com a referência: net, VPIP, PFR e c-bet batem em todas as mãos', () => {
  for (const k of Object.keys(H)) {
    const a = P(k), r = R.parseHand(H[k]);
    assert.ok(r && !r.skip, `referência descartou ${k}`);
    close(a.net_bb, r.net_bb, 1e-9, `${k} net`);
    for (const f of ['vpip', 'pfr', 'cbetOpp', 'cbet', 'sawflop', 'f3bOpp', 'f3b'])
      assert.equal(a[f], r[f], `${k}.${f}: app ${a[f]} x ref ${r[f]}`);
    if (r.ev_pt4_bb != null) { assert.ok(a.allin, `${k}: ref tem all-in, app não`); close(a.allin.ev, r.ev_pt4_bb, 1e-6, `${k} EV`); }
  }
});

test('mergeHH soma os contadores novos e marca a versão mais antiga', () => {
  const a = E.hhAggregate([P('openUTG')], 'X')[0];
  const b = { ...E.hhAggregate([P('walk')], 'X')[0], engine_version: 1 };
  const m = E.mergeHH(a, b);
  assert.equal(m.hands, 2); assert.equal(m.walk_cnt, 1); assert.equal(m.rfi_cnt, 1); assert.equal(m.engine_version, 1);
  for (const k of ['walk_cnt', 'pfr_opp', 'rfi_cnt', 'rfi_opp', 'sq_cnt', 'sq_opp', 'sawflop_np_cnt', 'wtsd_np_cnt'])
    assert.ok(E.HH_SUM_KEYS.includes(k), k);
});

test('carga inicial não pede hand_ids (F0.18)', () => {
  const cols = E.HH_COLS.split(',');
  assert.ok(!cols.includes('hand_ids'));
  for (const k of ['engine_version', 'walk_cnt', 'pfr_opp', 'pos_json', 'hands']) assert.ok(cols.includes(k), k);
});

test('linha antiga (motor 1) entra com a definição antiga e é contada pra pedir reimport', () => {
  const T = E.hhTotals([{ hands: 100, vpip_cnt: 25, pfr_cnt: 18, sawflop_cnt: 30, wtsd_cnt: 10, pos_json: {} }]);
  assert.equal(T.pfrOpp, 100); assert.equal(T.wtsdDen, 30); assert.equal(T.wtsdNp, 10); assert.equal(T.antigas, 1);
});
