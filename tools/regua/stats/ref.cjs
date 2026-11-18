// Parser de REFERÊNCIA, escrito do zero (não reaproveita nada do app), com as definições
// padrão de tracker (HM3/PT4). Serve pra diferencial mão a mão contra o hhParseHand do app.
'use strict';
const RANKS = '23456789TJQKA', SUITS = 'cdhs';
const card = s => { const r = RANKS.indexOf(s[0]), u = SUITS.indexOf(s[1]); if (r < 0 || u < 0) throw new Error('carta ' + s); return r * 4 + u; };
const n = s => Number(String(s).replace(/,/g, ''));

// ---------- avaliador 7 cartas independente (categoria*16^5 + desempates) ----------
function eval7(cs) {
  const cnt = new Array(13).fill(0), suitCnt = [0, 0, 0, 0], suitMask = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cs) { const r = c >> 2, s = c & 3; cnt[r]++; suitCnt[s]++; suitMask[s] |= 1 << r; mask |= 1 << r; }
  const straightHigh = m => { // m = bitmask de ranks
    const mm = m | ((m >> 12) & 1 ? 0 : 0);
    for (let h = 12; h >= 4; h--) { const need = 0b11111 << (h - 4); if ((m & need) === need) return h; }
    if ((m & 0b1000000001111) === 0b1000000001111) return 3; // A2345
    return -1;
  };
  const enc = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 16 + (ks[i] !== undefined ? ks[i] + 1 : 0); return v; };
  let fs = -1; for (let s = 0; s < 4; s++) if (suitCnt[s] >= 5) fs = s;
  if (fs >= 0) { const sh = straightHigh(suitMask[fs]); if (sh >= 0) return enc(8, [sh]); }
  const quads = [], trips = [], pairs = [], singles = [];
  for (let r = 12; r >= 0; r--) { if (cnt[r] === 4) quads.push(r); else if (cnt[r] === 3) trips.push(r); else if (cnt[r] === 2) pairs.push(r); else if (cnt[r] === 1) singles.push(r); }
  if (quads.length) { const k = [...trips, ...pairs, ...singles].sort((a, b) => b - a)[0]; return enc(7, [quads[0], k]); }
  if (trips.length >= 2) return enc(6, [trips[0], trips[1]]);
  if (trips.length && pairs.length) return enc(6, [trips[0], pairs[0]]);
  if (fs >= 0) { const rs = []; for (let r = 12; r >= 0 && rs.length < 5; r--) if (suitMask[fs] >> r & 1) rs.push(r); return enc(5, rs); }
  const sh = straightHigh(mask); if (sh >= 0) return enc(4, [sh]);
  if (trips.length) return enc(3, [trips[0], ...singles.slice(0, 2)]);
  if (pairs.length >= 2) { const k = [...pairs.slice(2), ...singles].sort((a, b) => b - a)[0]; return enc(2, [pairs[0], pairs[1], k]); }
  if (pairs.length) return enc(1, [pairs[0], ...singles.slice(0, 3)]);
  return enc(0, singles.slice(0, 5));
}
const category = v => Math.floor(v / 16 ** 5);

// equity de cada jogador (array de 2 cartas) num pote, dado o board parcial. Enumeração exata até 2 cartas; MC acima.
function equities(hands, board, iters = 6000, rng = Math.random) {
  const dead = new Set([...hands.flat(), ...board]);
  const deck = []; for (let c = 0; c < 52; c++) if (!dead.has(c)) deck.push(c);
  const need = 5 - board.length, eq = new Array(hands.length).fill(0); let tot = 0;
  const run = extra => {
    const full = board.concat(extra); let best = -1, win = [];
    hands.forEach((h, i) => { const v = eval7(h.concat(full)); if (v > best) { best = v; win = [i]; } else if (v === best) win.push(i); });
    win.forEach(i => eq[i] += 1 / win.length); tot++;
  };
  if (need === 0) run([]);
  else if (need === 1) deck.forEach(c => run([c]));
  else if (need === 2) { for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) run([deck[i], deck[j]]); }
  else for (let k = 0; k < iters; k++) { const d = deck.slice(), ex = []; for (let m = 0; m < need; m++) { const x = Math.floor(rng() * d.length); ex.push(d[x]); d[x] = d[d.length - 1]; d.pop(); } run(ex); }
  return eq.map(x => x / tot);
}

const HEAD = /^(?:PokerStars Hand|Poker Hand) #/;
function parseHand(block) {
  const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const hi = lines.findIndex(l => HEAD.test(l)); if (hi < 0) return null;
  const head = lines[hi];
  if (!/Hold'em No Limit/.test(head)) return { skip: 'game' };
  const mt = head.match(/Tournament #(\d+)/); if (!mt) return { skip: 'cash' };
  const mh = head.match(/Hand #([^:\s]+):/);
  const mb = head.match(/\((\d[\d,]*)\/(\d[\d,]*)/); const bb = n(mb[2]);
  const site = /^PokerStars/.test(head) ? 'PokerStars' : 'GG Poker';
  const P = {}; const order = []; let button = null, hero = null, heroCards = null; const board = [];
  let street = 0, inSum = false; const acts = []; const shows = {}; const col = {};
  const pl = name => P[name] || (P[name] = { contrib: 0, street: [0, 0, 0, 0], folded: false, allin: false, posted: null });
  let sbP = null, bbP = null;
  for (let i = hi + 1; i < lines.length; i++) {
    const L = lines[i]; let m;
    if (/^\*\*\* SUMMARY/.test(L)) { inSum = true; continue; }
    if (inSum) continue;
    if (/^Hand #\d+:?$/.test(L)) break; // transcript do PS: próxima mão
    if ((m = L.match(/Seat #(\d+) is the button/))) { button = +m[1]; continue; }
    if ((m = L.match(/^Seat (\d+): (.+?) \((\d[\d,]*) in chips/))) { if (/out of hand/.test(L)) continue; order.push({ seat: +m[1], name: m[2], chips: n(m[3]) }); pl(m[2]); continue; }
    if ((m = L.match(/^Dealt to (.+?) \[(.+?)\]$/))) { hero = m[1]; heroCards = m[2].split(' ').map(card); continue; }
    if ((m = L.match(/^\*\*\* (FLOP|TURN|RIVER) \*\*\* (.*)$/))) {
      street = { FLOP: 1, TURN: 2, RIVER: 3 }[m[1]];
      const groups = [...m[2].matchAll(/\[([^\]]+)\]/g)].map(g => g[1].split(' '));
      const last = groups[groups.length - 1]; if (street === 1) last.forEach(c => board.push(card(c))); else board.push(card(last[last.length - 1]));
      continue;
    }
    if ((m = L.match(/^(.+?): posts (the ante|small blind|big blind) (\d[\d,]*)( and is all-in)?/))) {
      const p = pl(m[1]), x = n(m[3]); p.contrib += x; if (m[2] !== 'the ante') { p.street[0] += x; p.posted = m[2]; if (m[2] === 'small blind') sbP = m[1]; else bbP = m[1]; }
      if (m[4]) { p.allin = true; if (p.allinSt == null) p.allinSt = 0; } continue;
    }
    if ((m = L.match(/^(.+?): (folds|checks|calls|bets|raises)(?: (\d[\d,]*))?(?: to (\d[\d,]*))?( and is all-in)?(?:\s*\[[^\]]*\])?\s*$/))) {
      const p = pl(m[1]), a = m[2];
      if (a === 'calls' || a === 'bets') { const x = n(m[3]); p.contrib += x; p.street[street] += x; }
      if (a === 'raises') { const to = n(m[4]); const add = to - p.street[street]; p.contrib += add; p.street[street] = to; }
      if (a === 'folds') p.folded = true;
      if (m[5]) { p.allin = true; if (p.allinSt == null) p.allinSt = street; }
      acts.push({ name: m[1], a, street, allin: !!m[5] });
      continue;
    }
    if ((m = L.match(/^Uncalled bet \((\d[\d,]*)\) returned to (.+)$/))) { pl(m[2]).contrib -= n(m[1]); continue; }
    if ((m = L.match(/^(.+?) collected (\d[\d,]*) from/))) { col[m[1]] = (col[m[1]] || 0) + n(m[2]); continue; }
    if ((m = L.match(/^(.+?): shows \[(.+?)\]/))) { shows[m[1]] = m[2].split(' ').map(card); continue; }
  }
  if (!hero || !heroCards || !P[hero] || !order.find(o => o.name === hero)) return { skip: 'incompleta' };
  const H = P[hero];
  const net = (col[hero] || 0) - H.contrib;
  // ---- posições: BTN pelo cabeçalho, SB/BB por quem POSTOU, resto contado pra trás a partir do BTN
  const seats = order.slice().sort((a, b) => a.seat - b.seat); const N = seats.length;
  const pos = {};
  const bi = seats.findIndex(s => s.seat === button);
  if (N === 2) { pos[sbP || (bi >= 0 ? seats[bi].name : '')] = 'BTN'; if (bbP) pos[bbP] = 'BB'; }
  else {
    if (bi >= 0) pos[seats[bi].name] = 'BTN'; if (sbP) pos[sbP] = 'SB'; if (bbP) pos[bbP] = 'BB';
    // jogadores que agem antes do BTN, de trás pra frente: CO, MP, EP...
    if (bi >= 0) { let d = 1; for (let k = 1; k < N; k++) { const s = seats[(bi - k + N) % N].name; if (pos[s]) continue; pos[s] = d === 1 ? 'CO' : d === 2 ? 'MP' : 'EP'; d++; } }
  }
  const heroPos = pos[hero] || '?';
  // ---- pré-flop
  const pre = acts.filter(x => x.street === 0);
  let raises = 0, opener = null, lastAgg = null, limpers = 0, heroFirst = true, heroFoldedPre = false;
  let vpip = false, pfr = false, tbOpp = false, tb = false, f3bOpp = false, f3b = false, stealOpp = false, steal = false, bbdOpp = false, bbd = false;
  let foldedToHero = true; let heroWasOpener = false; let facing3b = false;
  for (const x of pre) {
    if (x.name === hero) {
      if (heroFirst) {
        if (raises === 0 && limpers === 0 && foldedToHero && ['CO', 'BTN', 'SB'].includes(heroPos)) { stealOpp = true; steal = x.a === 'raises'; }
        if (raises === 1) { tbOpp = true; tb = x.a === 'raises'; }
        if (heroPos === 'BB' && raises === 1 && limpers === 0 && ['CO', 'BTN', 'SB'].includes(pos[opener]) && stealSeq(pre, opener)) { bbdOpp = true; bbd = x.a === 'calls' || x.a === 'raises'; }
        heroFirst = false;
      } else if (heroWasOpener && raises === 2 && facing3b && !f3bOpp) { f3bOpp = true; f3b = x.a === 'folds'; }
      if (x.a === 'calls' || x.a === 'raises') vpip = true;
      if (x.a === 'raises') { pfr = true; if (raises === 0) heroWasOpener = true; }
      if (x.a === 'folds') heroFoldedPre = true;
    } else {
      if (x.a !== 'folds') foldedToHero = heroFirst ? false : foldedToHero;
      if (x.a === 'calls' && raises === 0) limpers++;
      if (x.a === 'raises' && heroWasOpener && raises === 1) facing3b = true;
    }
    if (x.a === 'raises') { raises++; lastAgg = x.name; if (!opener) opener = x.name; }
  }
  function stealSeq(pre, op) { // o opener abriu com todo mundo antes dele desistindo
    for (const x of pre) { if (x.name === op) return x.a === 'raises'; if (x.a !== 'folds') return false; } return false;
  }
  const sawFlop = board.length >= 3 && !heroFoldedPre;
  // ---- flop: c-bet e fold to c-bet
  let cbOpp = false, cb = false, fcbOpp = false, fcb = false;
  if (sawFlop && raises > 0) {
    let betSeen = false, cbetBy = null, heroActed = false, raisedAfterCbet = false;
    for (const x of acts.filter(y => y.street === 1)) {
      if (x.name === hero) {
        if (!heroActed && lastAgg === hero && !betSeen) { cbOpp = true; cb = x.a === 'bets'; }
        // enfrenta a c-bet (na 1ª vez que age depois dela), sem raise no meio
        if (!fcbOpp && lastAgg !== hero && cbetBy === lastAgg && !raisedAfterCbet) { fcbOpp = true; fcb = x.a === 'folds'; }
        heroActed = true;
      }
      if (x.a === 'bets' && !betSeen) { betSeen = true; cbetBy = x.name; }
      else if (x.a === 'raises') { if (cbetBy) raisedAfterCbet = true; betSeen = true; }
    }
  }
  const remaining = Object.keys(P).filter(k => !P[k].folded);
  const sd = !H.folded && remaining.length >= 2;
  const won = (col[hero] || 0) > 0;
  let afB = 0, afC = 0; acts.forEach(x => { if (x.name === hero && x.street > 0) { if (x.a === 'bets' || x.a === 'raises') afB++; if (x.a === 'calls') afC++; } });
  // ---- all-in EV com side pots
  let ev = null, evSkip = null, evHero = null, evPot = null;
  const anyAllin = Object.values(P).some(p => p.allin);
  const heroActs = acts.filter(x => x.name === hero);
  const heroLast = heroActs.length ? Math.max(...heroActs.map(x => x.street)) : 0;
  for (const modo of ['any', 'hero', 'pot']) if (sd && anyAllin) {
    const lastStreet = modo === 'hero' ? heroLast : (acts.length ? Math.max(...acts.map(x => x.street)) : 0);
    const shownFor = name => name === hero ? heroCards : shows[name];
    const live = remaining;
    if (live.some(k => !shownFor(k) || shownFor(k).length !== 2)) evSkip = 'carta_desconhecida';
    else {
      const bAt = board.slice(0, [0, 3, 4, 5][lastStreet]);
      // monta potes por nível de contribuição
      const levels = [...new Set(live.map(k => P[k].contrib))].sort((a, b) => a - b);
      let prev = 0, evv = 0;
      for (const lv of levels) {
        let pot = 0; for (const k of Object.keys(P)) pot += Math.max(0, Math.min(P[k].contrib, lv) - prev);
        const elig = live.filter(k => P[k].contrib >= lv);
        if (elig.includes(hero)) {
          let bUse = bAt;
          if (modo === 'pot') { const closer = live.find(k => P[k].allin && P[k].contrib === lv); const st = closer && P[closer].allinSt != null ? Math.max(P[closer].allinSt, 0) : heroLast; bUse = board.slice(0, [0, 3, 4, 5][st]); }
          if (elig.length === 1) evv += pot; else { const e = equities(elig.map(shownFor), bUse); evv += e[elig.indexOf(hero)] * pot; }
        }
        prev = lv;
      }
      // dinheiro de quem foldou acima do maior nível vivo volta pro pote mais alto (já coberto: min(contrib,lv))
      if (modo === 'hero') evHero = evv - H.contrib; else if (modo === 'pot') evPot = evv - H.contrib; else ev = evv - H.contrib;
    }
  }
  // Regra do PT4 (descoberta comparando mão a mão com o export do PT4): NÃO ajusta o pote quando
  // (1) alguém pagou/aumentou depois do 1º all-in e depois foldou, ou (2) houve ação depois da última decisão do herói.
  let evPt4 = null;
  if (evHero != null) {
    const i0 = acts.findIndex(x => x.allin);
    const r1 = i0 >= 0 && acts.slice(i0 + 1).some(x => x.a === 'folds' && acts.slice(i0 + 1).some(y => y.name === x.name && (y.a === 'calls' || y.a === 'raises')));
    const r2 = acts.some(x => x.street > heroLast);
    evPt4 = (r1 || r2) ? net : evHero;
  }
  const heroChips = order.find(o => o.name === hero).chips;
  return { site, tid: mt[1], hid: mh ? mh[1] : null, bb, hero, heroChips, net, net_bb: net / bb, pos: heroPos, N,
    vpip, pfr, tbOpp, tb, f3bOpp, f3b, stealOpp, steal, bbdefOpp: bbdOpp, bbdef: bbd, cbetOpp: cbOpp, cbet: cb, fcbOpp, fcb,
    sawflop: sawFlop, wwsf: sawFlop && won, wtsd: sawFlop && sd, wsd: sawFlop && sd && won, sdAny: sd, afB, afC,
    ev_bb: ev == null ? null : ev / bb, ev_hero_bb: evHero == null ? null : evHero / bb, ev_pot_bb: evPot == null ? null : evPot / bb, ev_pt4_bb: evPt4 == null ? null : evPt4 / bb, evSkip, anyAllin, collected: col[hero] || 0, contrib: H.contrib };
}
module.exports = { parseHand, eval7, category, equities, card };
