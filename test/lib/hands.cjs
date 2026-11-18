// Mãos sintéticas no formato PokerStars, montadas à mão. Cada uma isola UMA definição do anexo A do
// plano mestre (regras do PT4). Os valores esperados estão ao lado e foram conferidos na conta.
// Blinds 10/20, sem ante (exceto onde indicado). "Hero" é sempre o herói.
'use strict';
let seq = 0;
function hand({ seats, button, lines, hero = 'Hero', cards, tid = '3000000001', max = '6-max', ante = 0 }) {
  seq++;
  const head = `PokerStars Hand #25000000${String(seq).padStart(4, '0')}: Tournament #${tid}, $1.40+$0.10 USD Hold'em No Limit - Level I (10/20) - 2026/11/01 20:${String(seq % 60).padStart(2, '0')}:00 BRT [2026/11/01 19:00:00 ET]`;
  const out = [head, `Table '${tid} 1' ${max} Seat #${button} is the button`];
  for (const s of seats) out.push(`Seat ${s[0]}: ${s[1]} (${s[2]} in chips)${s[3] ? ' ' + s[3] : ''}`);
  if (ante) for (const s of seats) if (!s[3]) out.push(`${s[1]}: posts the ante ${ante}`);
  const pre = lines.split('\n').map(l => l.trim()).filter(Boolean);
  const iHole = pre.indexOf('*** HOLE CARDS ***');
  out.push(...pre.slice(0, iHole + 1), `Dealt to ${hero} [${cards}]`, ...pre.slice(iHole + 1));
  out.push('*** SUMMARY ***', 'Total pot 0 | Rake 0');
  return out.join('\n');
}
const six = (heroSeat, chips = {}) => [1, 2, 3, 4, 5, 6].map(i => [i, i === heroSeat ? 'Hero' : 'P' + i, chips[i] || 1500]);

const H = {};

// F1 walk: todos foldam pro herói no BB
H.walk = hand({ seats: six(3), button: 1, cards: '2c 7d', lines: `
P2: posts small blind 10
Hero: posts big blind 20
*** HOLE CARDS ***
P4: folds
P5: folds
P6: folds
P1: folds
P2: folds
Uncalled bet (10) returned to Hero
Hero collected 20 from pot` });

// F2 open do UTG (EP), todos foldam: RFI, PFR, oportunidade de PFR
H.openUTG = hand({ seats: six(4), button: 1, cards: 'Ah Kd', lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
Hero: raises 30 to 50
P5: folds
P6: folds
P1: folds
P2: folds
P3: folds
Uncalled bet (30) returned to Hero
Hero collected 50 from pot` });

// F3 BB contra roubo do BTN com call do SB no meio; herói folda. Conta defesa do BB (vs BTN) e é spot de squeeze
H.bbVsBtnSbCall = hand({ seats: six(3), button: 1, cards: '9c 4d', lines: `
P2: posts small blind 10
Hero: posts big blind 20
*** HOLE CARDS ***
P4: folds
P5: folds
P6: folds
P1: raises 30 to 50
P2: calls 40
Hero: folds
*** FLOP *** [2s 8h Jd]
P2: checks
P1: bets 60
P2: folds
Uncalled bet (60) returned to P1
P1 collected 120 from pot` });

// F4 squeeze do CO: open do EP + call do MP, herói aumenta
H.squeeze = hand({ seats: six(6), button: 1, cards: 'Qs Qd', lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
P4: raises 30 to 50
P5: calls 50
Hero: raises 150 to 200
P1: folds
P2: folds
P3: folds
P4: folds
P5: folds
Uncalled bet (150) returned to Hero
Hero collected 180 from pot` });

// F5 herói abre no BTN, leva 3-bet do BB e folda: fold to 3-bet (quem abriu)
H.openFold3b = hand({ seats: six(1), button: 1, cards: 'Kh 9s', lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
P4: folds
P5: folds
P6: folds
Hero: raises 30 to 50
P2: folds
P3: raises 130 to 180
Hero: folds
Uncalled bet (130) returned to P3
P3 collected 110 from pot` });

// F6 herói dá 3-bet, o opener dá 4-bet e o herói folda: NÃO é fold to 3-bet (herói não abriu)
H.threeBetFold4b = hand({ seats: six(6), button: 1, cards: 'Ac 5c', lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
P4: raises 30 to 50
P5: folds
Hero: raises 100 to 150
P1: folds
P2: folds
P3: folds
P4: raises 250 to 400
Hero: folds
Uncalled bet (250) returned to P4
P4 collected 330 from pot` });

// F7 herói com 15 fichas (menos que o BB) e uma ação só: não tem oportunidade de PFR
H.curtoFold = hand({ seats: six(4, { 4: 15 }), button: 1, cards: '7h 2c', lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
Hero: folds
P5: raises 30 to 50
P6: folds
P1: folds
P2: folds
P3: folds
Uncalled bet (30) returned to P5
P5 collected 50 from pot` });

// F8 herói (300 fichas) enfrenta shove maior que o stack dele e folda: sem oportunidade de PFR
H.shoveMaior = hand({ seats: six(1, { 1: 300 }), button: 1, cards: 'Jc Td', lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
P4: raises 1480 to 1500 and is all-in
P5: folds
P6: folds
Hero: folds
P2: folds
P3: folds
Uncalled bet (1480) returned to P4
P4 collected 50 from pot` });

// F9 heads-up: o botão posta o SB; abre e leva. PT4: botão no HU conta como SB (roubo e RFI)
H.huBotao = hand({ seats: [[1, 'Hero', 1000], [2, 'P2', 1000]], button: 1, max: '2-max', cards: 'As 3d', lines: `
Hero: posts small blind 10
P2: posts big blind 20
*** HOLE CARDS ***
Hero: raises 30 to 50
P2: folds
Uncalled bet (30) returned to Hero
Hero collected 40 from pot` });

// F10a fold to c-bet simples (BB pagou o roubo do BTN e folda pra c-bet)
H.foldCbet = hand({ seats: six(3), button: 1, cards: '8c 6c', lines: `
P2: posts small blind 10
Hero: posts big blind 20
*** HOLE CARDS ***
P4: folds
P5: folds
P6: folds
P1: raises 30 to 50
P2: folds
Hero: calls 30
*** FLOP *** [Kd 2s 2h]
Hero: checks
P1: bets 60
Hero: folds
Uncalled bet (60) returned to P1
P1 collected 110 from pot` });

// F10b c-bet com raise entre a c-bet e o herói: NÃO conta fold to c-bet
H.cbetComRaise = hand({ seats: six(3), button: 1, cards: '8c 6c', lines: `
P2: posts small blind 10
Hero: posts big blind 20
*** HOLE CARDS ***
P4: folds
P5: folds
P6: folds
P1: raises 30 to 50
P2: calls 40
Hero: calls 30
*** FLOP *** [Kd 2s 2h]
P2: checks
Hero: checks
P1: bets 100
P2: raises 200 to 300
Hero: folds
P1: folds
Uncalled bet (200) returned to P2
P2 collected 350 from pot` });

// F12 mesa de 8 com um lugar "out of hand": vira mesa de 7 (1 EP) e o herói no lugar 7 é CO
H.outOfHand = hand({ max: '8-max', button: 1, cards: '4h 4s',
  seats: [[1, 'P1', 1500], [2, 'P2', 1500], [3, 'P3', 1500], [4, 'P4', 1500], [5, 'P5', 1500], [6, 'P6', 1500], [7, 'Hero', 1500], [8, 'P8', 1500, 'out of hand (moved from another table into small blind)']],
  lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
P4: folds
P5: folds
P6: folds
Hero: raises 30 to 50
P1: folds
P2: folds
P3: folds
Uncalled bet (30) returned to Hero
Hero collected 50 from pot` });

// F13 all-in no turn, heads-up, 1 carta por vir: equity exata. AdQd x 7h7d em Ah 7c 2d Kd -> 8 outs de 44
H.allinTurn = hand({ seats: [[1, 'Hero', 1000], [2, 'P2', 1000]], button: 1, max: '2-max', cards: 'Ad Qd', lines: `
Hero: posts small blind 10
P2: posts big blind 20
*** HOLE CARDS ***
Hero: raises 40 to 60
P2: calls 40
*** FLOP *** [Ah 7c 2d]
P2: checks
Hero: bets 100
P2: calls 100
*** TURN *** [Ah 7c 2d] [Kd]
P2: bets 840 and is all-in
Hero: calls 840 and is all-in
*** RIVER *** [Ah 7c 2d Kd] [5s]
*** SHOW DOWN ***
P2: shows [7h 7d] (three of a kind, Sevens)
Hero: shows [Ad Qd] (a pair of Aces)
P2 collected 2000 from pot` });

// F14 side pot de 3, all-in no turn: o herói (curto) só disputa o pote principal de 900
H.sidePot = hand({ seats: [[1, 'B', 2000], [2, 'Hero', 300], [3, 'A', 600]], button: 1, max: '3-max', cards: 'Kh Qh', lines: `
Hero: posts small blind 10
A: posts big blind 20
*** HOLE CARDS ***
B: calls 20
Hero: calls 10
A: checks
*** FLOP *** [2c 5h 9s]
Hero: checks
A: checks
B: checks
*** TURN *** [2c 5h 9s] [Kd]
Hero: bets 280 and is all-in
A: raises 300 to 580 and is all-in
B: calls 580
*** RIVER *** [2c 5h 9s Kd] [3h]
*** SHOW DOWN ***
Hero: shows [Kh Qh] (a pair of Kings)
A: shows [9h 9d] (three of a kind, Nines)
B: shows [Ac Kc] (a pair of Kings)
A collected 600 from side pot
A collected 900 from main pot` });

// F15 regra (b) do PT4: herói all-in no pré-flop e houve ação DEPOIS da última decisão dele -> não ajusta
H.acaoDepois = hand({ seats: six(4, { 4: 200 }), button: 1, cards: 'Ac Kc', lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
Hero: raises 180 to 200 and is all-in
P5: folds
P6: folds
P1: calls 200
P2: folds
P3: calls 180
*** FLOP *** [Qd 7s 3c]
P3: bets 400
P1: folds
Uncalled bet (400) returned to P3
*** TURN *** [Qd 7s 3c] [2h]
*** RIVER *** [Qd 7s 3c 2h] [9d]
*** SHOW DOWN ***
P3: shows [Qs Jh] (a pair of Queens)
Hero: shows [Ac Kc] (high card Ace)
P3 collected 610 from pot` });

// F16 all-in curto no pré-flop (S) e o herói vai all-in no FLOP: equity tem que ser no flop (última decisão
// do herói), com pote principal de 3 (300) e side pot de 2 (1800). O motor antigo usava o pré-flop.
H.allinFlopComCurto = hand({ seats: [[1, 'V', 2000], [2, 'Hero', 1000], [3, 'S', 100]], button: 1, max: '3-max', cards: 'Ks Qs', lines: `
Hero: posts small blind 10
S: posts big blind 20
*** HOLE CARDS ***
V: raises 40 to 60
Hero: calls 50
S: raises 40 to 100 and is all-in
V: calls 40
Hero: calls 40
*** FLOP *** [Ts 9s 2d]
Hero: bets 200
V: raises 1700 to 1900 and is all-in
Hero: calls 700 and is all-in
Uncalled bet (1000) returned to V
*** TURN *** [Ts 9s 2d] [3c]
*** RIVER *** [Ts 9s 2d 3c] [4h]
*** SHOW DOWN ***
Hero: shows [Ks Qs] (high card King)
V: shows [Th Td] (three of a kind, Tens)
S: shows [Ac Ad] (a pair of Aces)
V collected 1800 from side pot
V collected 300 from main pot` });


// ---- regras confirmadas no export mão a mão do PT4 (56.255 mãos) ----
// limp e depois enfrenta raise: é oportunidade de 3-bet (na decisão diante do raise)
H.limpDepoisRaise = hand({ seats: six(4), button: 1, cards: 'Kd Qd', lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
Hero: calls 20
P5: raises 60 to 80
P6: folds
P1: folds
P2: folds
P3: folds
Hero: calls 60
*** FLOP *** [2c 3d 4h]
Hero: checks
P5: bets 100
Hero: folds
Uncalled bet (100) returned to P5
P5 collected 190 from pot` });

// único adversário vivo está all-in: não dá pra aumentar -> sem oportunidade de 3-bet (e sem PFR opp)
H.soAllinNaFrente = hand({ seats: six(3, { 2: 300 }), button: 1, cards: '9h 2c', lines: `
P2: posts small blind 10
Hero: posts big blind 20
*** HOLE CARDS ***
P4: folds
P5: folds
P6: folds
P1: folds
P2: raises 280 to 300 and is all-in
Hero: folds
Uncalled bet (280) returned to P2
P2 collected 40 from pot` });

// oportunidade de PFR: o "raise enfrentado" é o que falta pagar (BB com 1000: falta 930 < 980 que sobram)
H.pfrFaltaPagar = hand({ seats: six(3, { 3: 1000 }), button: 1, cards: '7c 7d', lines: `
P2: posts small blind 10
Hero: posts big blind 20
*** HOLE CARDS ***
P4: raises 40 to 60
P5: raises 890 to 950
P6: folds
P1: folds
P2: folds
Hero: folds
P4: folds
Uncalled bet (890) returned to P5
P5 collected 150 from pot` });

// squeeze tardio: paga o open com caller e aumenta depois do 3-bet de outro -> conta squeeze
H.squeezeTardio = hand({ seats: six(6), button: 1, cards: 'Ah Kh', lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
P4: raises 30 to 50
P5: calls 50
Hero: calls 50
P1: folds
P2: raises 150 to 200
P3: folds
P4: folds
P5: folds
Hero: raises 400 to 600
P2: folds
Uncalled bet (400) returned to Hero
Hero collected 570 from pot` });

// mesa de 5: não existe EP (o UTG é MP)
H.cincoNaMesa = hand({ max: '8-max', button: 1, cards: '5h 5d',
  seats: [[1, 'P1', 1500], [2, 'P2', 1500], [3, 'P3', 1500], [4, 'Hero', 1500], [5, 'P5', 1500]], lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
Hero: raises 30 to 50
P5: folds
P1: folds
P2: folds
P3: folds
Uncalled bet (30) returned to Hero
Hero collected 50 from pot` });

// all-in no BLIND sem a marca "and is all-in" (a GG não escreve): P3 tem 20 fichas e posta o BB.
// Depois do 1º all-in, P4 paga e mais tarde folda -> regra (a) do PT4: não ajusta
H.allinNoBlind = hand({ seats: six(1, { 3: 20 }), button: 1, cards: 'Ac Ad', lines: `
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
P4: calls 20
P5: folds
P6: folds
Hero: raises 80 to 100
P2: folds
P4: calls 80
*** FLOP *** [2c 7d 9h]
P4: checks
Hero: bets 100
P4: folds
Uncalled bet (100) returned to Hero
*** TURN *** [2c 7d 9h] [Js]
*** RIVER *** [2c 7d 9h Js] [3s]
*** SHOW DOWN ***
P3: shows [Kc Qc] (high card King)
Hero: shows [Ac Ad] (a pair of Aces)
Hero collected 170 from side pot
Hero collected 60 from main pot` });

module.exports = { H, hand, six };
