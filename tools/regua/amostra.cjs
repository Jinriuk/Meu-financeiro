// Gera a AMOSTRA ANONIMIZADA que o CI usa (F0.16): mãos reais + a resposta do PT4 de cada uma.
// O repositório é público: troca TODOS os nicks (herói vira "Hero"), renumera mãos e torneios, tira chat e
// linhas de eliminação/colocação. Depois confere que o motor dá o MESMO resultado antes e depois.
// Uso: node tools/regua/amostra.cjs <export_pt4.csv> <saida_dir> <pasta_gg> [pasta_ps]
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const E = require('../../test/lib/engine.cjs');
const [csvPath, outDir, ...dirs] = process.argv.slice(2);
if (!csvPath || !outDir || !dirs.length) { console.error('uso: node tools/regua/amostra.cjs <export.csv> <saida_dir> <pasta_gg> [pasta_ps]'); process.exit(2); }

// ---- PT4 por mão
const linhasCsv = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const parse = l => { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
const H = parse(linhasCsv[0]); const ix = n => H.indexOf(n);
const CAMPOS = { pos: 'Position', walk: 'GB Walk n', vpip: 'GB VPIP n', pfr: 'GB PFR n', pfrOpp: 'GB PFR Opp n', tb: 'GB 3Bet n', tbOpp: 'GB 3Bet Opp n', sq: 'GB Squeeze n', sqOpp: 'GB Squeeze Opp n', f3b: 'GB F3B n', f3bOpp: 'GB F3B Opp n', rfi: 'GB RFI n', rfiOpp: 'GB RFI Opp n', bb: 'GB BB Won', adj: 'GB All-In Adj BB' };
const PT = new Map();
for (const l of linhasCsv.slice(1)) { const r = parse(l); const k = String(r[ix('Hand #')] || '').replace(/\D/g, ''); if (!k) continue;
  const o = {}; for (const [c, n] of Object.entries(CAMPOS)) o[c] = c === 'pos' ? r[ix(n)] : parseFloat(String(r[ix(n)]).replace(/,/g, '')) || 0; PT.set(k, o); }

// ---- mãos
const SPLIT = /(?=^(?:PokerStars Hand|Poker Hand) #)/m;
const maos = [];
for (const d of dirs) for (const f of fs.readdirSync(d)) {
  const txt = E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d, f)))).replace(/\f/g, '\n');
  for (const b0 of txt.split(SPLIT)) { const b = b0.trim(); if (!/^(?:PokerStars Hand|Poker Hand) #/.test(b)) continue;
    const a = E.hhParseHand(b, {}); if (!a) continue; const k = String(a.hid).replace(/\D/g, ''); if (PT.has(k)) maos.push({ b, a, k }); } }

// ---- seleção determinística: todos os all-ins ajustados que couberem + aleatórias + mesas curtas
let seed = 20261118; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const ai = maos.filter(m => Math.abs(PT.get(m.k).bb - PT.get(m.k).adj) > 0.005 || m.a.allin);
const resto = maos.filter(m => !ai.includes(m));
const pick = (arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
const escolhidas = [...pick(ai, 900), ...pick(resto, 2600)];

// ---- anonimização
const nomes = new Map(); let nN = 0; const nick = n => { if (!nomes.has(n)) nomes.set(n, 'J' + (++nN).toString(36)); return nomes.get(n); };
const ids = new Map(); let nId = 0; const novoId = (v, pref) => { if (!ids.has(v)) ids.set(v, pref + String(900000000 + (++nId))); return ids.get(v); };
const TIRA = /( said, "|finished the tournament|wins the tournament|for eliminating|for splitting the elimination|is disconnected|is connected|has timed out|has returned|is sitting out|was removed from the table)/;
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const saida = [], pt4 = {};
for (const m of escolhidas) {
  const hero = (m.b.match(/^Dealt to (.+?) \[/m) || [])[1];
  const jogadores = [...m.b.matchAll(/^Seat \d+: (.+?) \(\$?[\d,.]+ in chips/gm)].map(x => x[1]);   // só assentos (o resumo também tem "Seat N:")
  const tid = (m.b.match(/Tournament #(\d+)/) || [])[1];
  const hidRaw = (m.b.match(/#([^:\s]+):/) || [])[1];
  const novoHid = novoId('h' + hidRaw, /^TM/.test(hidRaw) ? 'TM' : '');
  const novoTid = novoId('t' + tid, '');
  let linhas = m.b.split(/\r?\n/).filter(l => /^Seat \d+:/.test(l) || !TIRA.test(l));   // linha de assento fica ("is sitting out" vem nela)
  // nomes: o mais longo primeiro (evita trocar pedaço de outro nick); herói vira "Hero"
  const troca = [...new Set(jogadores)].sort((x, y) => y.length - x.length).map(n => [new RegExp('(^|[\\s:(\\[])' + escRe(n) + '(?=$|[\\s:)\\],])', 'g'), n === hero ? 'Hero' : nick(n)]);
  linhas = linhas.map(l => { let s = l.replace(new RegExp(escRe(tid), 'g'), novoTid).replace(hidRaw, novoHid); for (const [re, nv] of troca) s = s.replace(re, (all, pre) => pre + nv); return s; });
  const anon = linhas.join('\n');
  // prova: o motor dá o mesmo resultado na mão anonimizada
  const a2 = E.hhParseHand(anon, {});
  const sem = o => JSON.stringify({ ...o, hid: 0, tid: 0, tname: 0, buyin: 0 });
  if (!a2 || sem(a2) !== sem(m.a)) { console.error('anonimização mudou o resultado da mão', hidRaw, '\nantes ', sem(m.a), '\ndepois', a2 && sem(a2)); if (process.env.DEBUG) console.error(anon); process.exit(1); }
  // e nenhum nick original sobrou
  for (const n of jogadores) if (n !== 'Hero' && n.length >= 4 && anon.includes(n)) { console.error('nick sobrou na mão', hidRaw); process.exit(1); }
  saida.push(anon); pt4[novoHid.replace(/\D/g, '')] = PT.get(m.k);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'amostra_maos.txt.gz'), zlib.gzipSync(saida.join('\n\n\n'), { level: 9 }));
fs.writeFileSync(path.join(outDir, 'amostra_pt4.json'), JSON.stringify(pt4));
console.log('mãos na amostra', saida.length, '(all-in:', Math.min(900, ai.length) + ')', '| nicks trocados', nomes.size + 1);
