// Calibração contra o PT4: mesmas 56.255 mãos. Testa variantes de definição e imprime qual bate.
'use strict';
const fs = require('fs'), path = require('path'), E = require('./engine.cjs'), R = require('./ref.cjs');
const SPLIT = /(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
const n = s => Number(String(s).replace(/,/g, ''));
const T = {}; const inc = (k, v = 1) => T[k] = (T[k] || 0) + v;
const POS = {}; const pinc = (p, k, v = 1) => { POS[p] = POS[p] || {}; POS[p][k] = (POS[p][k] || 0) + v; };
const dist = {};

function pre(block) {
  // parser pré-flop mínimo e independente, com valores e stacks
  const L = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const hi = L.findIndex(l => /^(?:PokerStars Hand|Poker Hand) #/.test(l));
  let button = null; const seats = []; let hero = null; const posted = {}; let sb = null, bbp = null; const acts = []; let street = 0; const stack = {};
  for (let i = hi + 1; i < L.length; i++) {
    const l = L[i]; let m;
    if (/^\*\*\* SUMMARY/.test(l) || /^Hand #\d+:?$/.test(l)) break;
    if (/^\*\*\* FLOP/.test(l)) { street = 1; continue; }
    if (/^\*\*\* (TURN|RIVER)/.test(l)) { street = 2; continue; }
    if ((m = l.match(/Seat #(\d+) is the button/))) { button = +m[1]; continue; }
    if ((m = l.match(/^Seat (\d+): (.+?) \((\d[\d,]*) in chips/))) { if (/out of hand/.test(l)) continue; seats.push({ seat: +m[1], name: m[2] }); stack[m[2]] = n(m[3]); continue; }
    if ((m = l.match(/^Dealt to (.+?) \[/))) { hero = m[1]; continue; }
    if ((m = l.match(/^(.+?): posts (the ante|small blind|big blind) (\d[\d,]*)/))) { posted[m[1]] = (posted[m[1]] || 0) + n(m[3]); if (m[2] === 'small blind') sb = m[1]; if (m[2] === 'big blind') bbp = m[1]; if (m[2] !== 'the ante') acts.push({ who: m[1], a: 'post', amt: n(m[3]), street: 0 }); else acts.push({ who: m[1], a: 'ante', amt: n(m[3]), street: 0 }); continue; }
    if ((m = l.match(/^(.+?): (folds|checks|calls|bets|raises)(?: (\d[\d,]*))?(?: to (\d[\d,]*))?( and is all-in)?/))) { acts.push({ who: m[1], a: m[2], amt: m[3] ? n(m[3]) : 0, to: m[4] ? n(m[4]) : 0, allin: !!m[5], street }); continue; }
  }
  return { button, seats, hero, sb, bbp, acts, stack };
}
function ptPos(h) {
  const { seats, button, sb, bbp, hero } = h; const s = seats.slice().sort((a, b) => a.seat - b.seat); const N = s.length;
  if (N === 2) return { p: hero === bbp ? 'BB' : 'SB', d: null };
  if (hero === sb) return { p: 'SB' }; if (hero === bbp) return { p: 'BB' };
  const bi = s.findIndex(x => x.seat === button); if (bi < 0) return { p: '?' };
  if (s[bi].name === hero) return { p: 'BTN', d: 0 };
  let d = 0; for (let k = 1; k < N; k++) { const nm = s[(bi - k + N) % N].name; if (nm === sb || nm === bbp) continue; d++; if (nm === hero) return { p: d === 1 ? 'CO' : 'X', d, N }; }
  return { p: '?' };
}
for (const d of process.argv.slice(2)) for (const f of fs.readdirSync(d)) {
  const txt = E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d, f)))).replace(/\f/g, '\n');
  for (const b0 of txt.split(SPLIT)) {
    const b = b0.trim(); if (!/^(?:PokerStars Hand|Poker Hand) #/.test(b)) continue;
    let r; try { r = R.parseHand(b); } catch (e) { continue; } if (!r || r.skip) continue;
    const h = pre(b); const pp = ptPos(h); const hero = h.hero;
    inc('hands');
    const P0 = h.acts.filter(x => x.street === 0 && x.a !== 'ante' && x.a !== 'post');
    const heroP = P0.filter(x => x.who === hero);
    // walk = herói no BB, ninguém além dele agiu de forma voluntária e ele não teve ação
    const walk = heroP.length === 0;
    if (walk) inc('sem_acao_pre');
    if (r.vpip) inc('vpip'); if (r.pfr) inc('pfr');
    // ---- posição PT4 + distribuição de distância (pra achar o corte EP/MP)
    let pos = pp.p; if (pos === 'X') { dist[`N${pp.N}_d${pp.d}`] = (dist[`N${pp.N}_d${pp.d}`] || 0) + 1; }
    // regra candidata: X com d==2 ou d==3 -> MP ; d>=4 -> EP  (ajustada abaixo pelos totais)
    pinc(pos === 'X' ? 'X' : pos, 'h'); pinc(pos === 'X' ? 'X' : pos, 'net', r.net_bb);
    if (r.ev_hero_bb != null) pinc(pos === 'X' ? 'X' : pos, 'luckH', r.net_bb - r.ev_hero_bb);
    if (r.ev_bb != null) pinc(pos === 'X' ? 'X' : pos, 'luckA', r.net_bb - r.ev_bb);
    if (r.ev_pot_bb != null) pinc(pos === 'X' ? 'X' : pos, 'luckP', r.net_bb - r.ev_pot_bb);
    if (r.pfr) pinc(pos === 'X' ? 'X' : pos, 'pfr'); if (r.vpip) pinc(pos === 'X' ? 'X' : pos, 'vpip');
    if (walk) pinc(pos === 'X' ? 'X' : pos, 'walk');
    // ---- RFI (raise first in) por posição
    let before = true, folded = true; for (const x of P0) { if (x.who === hero) { if (folded) { pinc(pos, 'rfiOpp'); if (x.a === 'raises') pinc(pos, 'rfi'); } break; } if (x.a !== 'folds') folded = false; }
    // ---- 3-bet: variantes de oportunidade
    { let raises = 0, first = true, done = false, commit = {}, cur = 0; const st = h.stack; let invested = {};
      for (const x of h.acts.filter(y => y.street === 0)) {
        if (x.a === 'ante') { invested[x.who] = (invested[x.who] || 0) + x.amt; continue; }
        if (x.a === 'post') { commit[x.who] = (commit[x.who] || 0) + x.amt; invested[x.who] = (invested[x.who] || 0) + x.amt; cur = Math.max(cur, commit[x.who]); continue; }
        if (x.who === hero && !done) {
          if (raises === 1) {
            const toCall = cur - (commit[hero] || 0); const left = st[hero] - (invested[hero] || 0);
            // A: 1ª ação do herói (o que app/ref fazem); B: qualquer vez que enfrenta 1 raise; C: B + só se dá pra aumentar
            if (first) { inc('tb_opp_A'); if (x.a === 'raises') inc('tb_A'); }
            inc('tb_opp_B'); if (x.a === 'raises') inc('tb_B');
            if (left > toCall) { inc('tb_opp_C'); if (x.a === 'raises') inc('tb_C'); }
            done = true;
          }
          first = false;
        }
        if (x.a === 'calls') { commit[x.who] = (commit[x.who] || 0) + x.amt; invested[x.who] = (invested[x.who] || 0) + x.amt; }
        if (x.a === 'raises') { const add = x.to - (commit[x.who] || 0); commit[x.who] = x.to; invested[x.who] = (invested[x.who] || 0) + add; cur = x.to; raises++; }
      }
    }
    // ---- BB contra open de BTN/CO/SB: variantes (I) sem ninguém entre o open e o herói; (II) aceita call do SB no meio
    if (pos === 'BB') {
      let opener = null, oi = -1; let ok1 = true; const seq = P0;
      for (let i = 0; i < seq.length; i++) { const x = seq[i]; if (x.who === hero) break; if (x.a === 'raises') { opener = x.who; oi = i; break; } if (x.a !== 'folds') { ok1 = false; break; } }
      if (opener && ok1) {
        // posição PT4 do opener
        const op = ptPos({ ...h, hero: opener }).p;
        const k = op === 'BTN' ? 'BTN' : op === 'CO' ? 'CO' : op === 'SB' ? 'SB' : null;
        if (k) {
          const mid = seq.slice(oi + 1).filter(x => x.who !== hero); const hx = seq.slice(oi + 1).find(x => x.who === hero);
          const midBeforeHero = []; for (const x of seq.slice(oi + 1)) { if (x.who === hero) break; midBeforeHero.push(x); }
          const clean = midBeforeHero.every(x => x.a === 'folds'); const reraised = midBeforeHero.some(x => x.a === 'raises');
          if (hx && !reraised) { inc(`bbv${k}_II_opp`); if (hx.a === 'folds') inc(`bbv${k}_II_fold`); }
          if (hx && clean) { inc(`bbv${k}_I_opp`); if (hx.a === 'folds') inc(`bbv${k}_I_fold`); }
        }
      }
    }
    // ---- fold to 3-bet (2Bet PF & Fold) na referência
    if (r.f3bOpp) { inc('f3b_opp'); if (r.f3b) inc('f3b'); }
  }
}
const pc = (a, b) => b ? (100 * a / b).toFixed(2) + '%' : '-';
module.exports = { T, POS, dist };
if (require.main === module) {
  console.log(JSON.stringify({ T, dist }, null, 0));
  console.log('POS', JSON.stringify(POS));
}
