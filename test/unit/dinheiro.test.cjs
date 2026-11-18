// Dinheiro e import (F0.8, F0.9, F0.11). Rodar: node --test test/unit/*.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine.cjs');
const j = x => JSON.parse(JSON.stringify(x));   // objetos do vm têm outro protótipo

test('F0.8 lucro = prêmio + bounty − investido; bilhete continua sem custo', () => {
  assert.equal(E.lucroTorneio({ buyin: 5.5, reentries: 0, prize: 0, bounty: 7.5 }), 2);
  assert.equal(E.lucroTorneio({ buyin: 5.5, reentries: 1, prize: 20, bounty: 2.75 }), 11.75);
  assert.equal(E.lucroTorneio({ buyin: 5.5, reentries: 0, prize: 0, bounty: 3, ticket: true }), 3);
  assert.equal(E.lucroTorneio({ buyin: 5.5, reentries: 0, prize: 0 }), -5.5, 'linha antiga sem a coluna');
});

test('F0.8 PKO com eliminação deixa de aparecer como prejuízo cheio no Diário', () => {
  const d = E.deriveDaily([
    { player: 'A', entry_date: '2026-11-01', buyin: 5.5, reentries: 0, prize: 0, bounty: 4 },
    { player: 'A', entry_date: '2026-11-01', buyin: 2, reentries: 0, prize: 10 },
  ]);
  assert.equal(d.length, 1);
  assert.equal(d[0].resultado, 6.5);
  assert.equal(d[0].bounties, 4);
  assert.equal(d[0].maior_premiacao, 10, 'prêmio e bounty separados');
});

test('F0.9 resumo nunca troca prêmio digitado sem confirmação', () => {
  const manual = { id: 'm', buyin: 3, reentries: 0, prize: 50, bounty: 0, ticket: true };
  const linha = { site_tournament_id: '1', tournament_name: 'X', modality: 'MTT', site: 'GG Poker', field_size: 100, final_position: 3, buyin: 3, reentries: 0, prize: 45, ticket: true };
  const sem = E.tsMesclar(manual, linha, {});
  assert.equal(sem.conflitos.length, 1);
  assert.deepEqual(j(sem.conflitos[0]), { campo: 'prize', digitado: 50, arquivo: 45 });
  assert.ok(!('prize' in sem.upd), 'sem escolha o prêmio não vai no update');
  assert.equal(sem.upd.final_position, 3, 'dado descritivo completa sem perguntar');
  const com = E.tsMesclar(manual, linha, { prize: 'arquivo' });
  assert.equal(com.upd.prize, 45, 'com confirmação usa o do arquivo');
  assert.equal(E.tsMesclar(manual, linha, { prize: 'digitado' }).upd.prize, undefined);
});

test('F0.9 prêmio vazio (0) também pede confirmação; igual não gera conflito', () => {
  const linha = { site_tournament_id: '1', prize: 12, reentries: 1 };
  assert.deepEqual(j(E.tsMesclar({ prize: 0, reentries: 1 }, linha).conflitos.map(c => c.campo)), ['prize']);
  assert.equal(E.tsMesclar({ prize: 12, reentries: 1 }, linha).conflitos.length, 0);
});

test('F0.9 re-entries mudam o investido: também não trocam sem confirmação', () => {
  const c = E.tsMesclar({ prize: 0, reentries: 2 }, { prize: 0, reentries: 1 }).conflitos;
  assert.deepEqual(j(c.map(x => x.campo)), ['reentries']);
});

test('F0.9 bounty só é comparado quando o arquivo traz o valor', () => {
  assert.equal(E.tsMesclar({ prize: 0, bounty: 7, reentries: 0 }, { prize: 0, reentries: 0 }).conflitos.length, 0);
});

test('F0.9 bilhete marcado à mão não é desmarcado ao completar', () => {
  // a prévia monta a linha de "completa" com o bilhete do lançamento manual
  const x = { atual: { buyin: 3, prize: 0, reentries: 0, ticket: true }, linha: { buyin: 3, prize: 0, reentries: 0, ticket: true }, escolhas: {} };
  assert.equal(E.tsEfetivo(x).ticket, true);
  assert.equal(E.lucroTorneio(E.tsEfetivo(x)), 0);
});

test('F0.9 prévia calcula o resultado com o valor que vai valer', () => {
  const x = { atual: { buyin: 10, prize: 100, reentries: 0 }, linha: { buyin: 10, prize: 30, reentries: 0 }, escolhas: {} };
  assert.equal(E.lucroTorneio(E.tsEfetivo(x)), 90, 'mantém o digitado');
  assert.equal(E.lucroTorneio(E.tsEfetivo({ ...x, escolhas: { prize: 'arquivo' } })), 20, 'usa o arquivo');
});

test('F0.11 nome do resumo GG sem cortes e freeroll com garantido no nome', () => {
  const r = E.parseSummaries(`Tournament #183587070, Daily $100,000 #ThanksGG Flipout, Hold'em No Limit
Buy-in: $0
1500 Players
Tournament started 2026/07/20 14:00:00
You finished the tournament in 300th place.
You received a total of $0.`)[0];
  assert.equal(r.name, 'Daily $100,000 #ThanksGG Flipout');
  assert.equal(r.buyin, 0);
  assert.equal(r.moeda, 'USD');
});

test('F0.11 resumo em ¥ guarda a moeda', () => {
  const r = E.parseSummaries(`Tournament #9, Sunday Special ¥100, Hold'em No Limit
Buy-in: ¥90+¥10
100 Players
Tournament started 2026/07/20 14:00:00
You finished the tournament in 3rd place.
You received a total of ¥1,200.`)[0];
  assert.equal(r.moeda, 'CNY'); assert.equal(r.buyin, 100); assert.equal(r.prize, 1200);
});

test('F0.11 resumo comum da GG continua igual (nome, jogo, buy-in em 3 parcelas)', () => {
  const r = E.parseSummaries(`Tournament #77, Bounty Hunters Special $5.40, Hold'em No Limit
Buy-in: $2.5+$0.4+$2.5
800 Players
Tournament started 2026/07/20 14:00:00
You finished the tournament in 12th place.
You received a total of $14.20.`)[0];
  assert.equal(r.name, 'Bounty Hunters Special $5.40'); assert.equal(r.game, "Hold'em No Limit");
  assert.equal(r.buyin, 5.4); assert.equal(r.bounty, true); assert.equal(r.prize, 14.2);
});

test('F0.11 hand history da GG: buy-in nunca do nome; nome inteiro', () => {
  const h = E.hhParseHand(`Poker Hand #TM5000000001: Tournament #183587070, Daily $100,000 #ThanksGG Flipout Hold'em No Limit - Level1(10/20) - 2026/07/20 14:31:02
Table '1' 6-max Seat #1 is the button
Seat 1: Hero (1500 in chips)
Seat 2: V (1500 in chips)
Hero: posts small blind 10
V: posts big blind 20
*** HOLE CARDS ***
Dealt to Hero [Ah Kd]
Hero: folds
Uncalled bet (10) returned to V
V collected 20 from pot
*** SUMMARY ***`, {});
  assert.ok(h);
  assert.equal(h.buyin, 0);
  assert.equal(h.tname, 'Daily $100,000 #ThanksGG Flipout');
});

test('hand history do PS continua lendo o buy-in do cabeçalho', () => {
  const { H } = require('../lib/hands.cjs');
  assert.equal(E.hhParseHand(H.openUTG, {}).buyin, 1.5);
});

test('F0.10 torneios do PokerStars a partir do hand history: colocação, prêmio, bounty, título, re-entry', () => {
  const mao = (n, tid, linhas) => `PokerStars Hand #9000${n}: Tournament #${tid}, $1.44+$1.50+$0.36 USD Hold'em No Limit - Level I (10/20) - 2026/10/01 10:0${n}:00 ET
Table '${tid} 1' 8-max Seat #1 is the button
Seat 1: heroi (1500 in chips, $1.50 bounty)
Seat 2: vil (1500 in chips, $1.50 bounty)
heroi: posts small blind 10
vil: posts big blind 20
*** HOLE CARDS ***
Dealt to heroi [Ah Kh]
${linhas}
*** SUMMARY ***`;
  const txt = [
    mao(1, '111', 'heroi wins $0.75 for eliminating vil and their own bounty increases by $0.75 to $2.25'),
    mao(2, '111', 'heroi wins $0.50 for splitting the elimination of x and their own bounty increases by $0.50 to $2.75'),
    mao(3, '111', 'heroi finished the tournament in 532nd place'),           // 1ª entrada caiu
    mao(4, '111', 'heroi finished the tournament in 12th place and received $14.20.'),   // re-entry acabou no dinheiro
    mao(5, '222', 'heroi wins the tournament and receives $58.26 - congratulations!'),
    mao(6, '333', 'heroi: folds'),                                            // ainda rodando
  ].join('\n\n');
  const { rows, cont } = E.psTorneiosDoHH(txt);
  assert.deepEqual(j(cont), { colocacoes: 2, premios: 1, bounties: 2, titulos: 1 });
  const t1 = rows.find(r => r.tid === '111'), t2 = rows.find(r => r.tid === '222'), t3 = rows.find(r => r.tid === '333');
  assert.deepEqual([t1.position, t1.prize, t1.bountyGanho, t1.reentries, t1.buyin, t1.bounty], [12, 14.2, 1.25, 1, 3.3, true]);
  assert.deepEqual([t2.position, t2.prize, t2.titulo, t2.reentries], [1, 58.26, true, 0]);
  assert.equal(t3.fim, false);
});

test('F0.11 nome de resumo com vírgula no meio não é cortado', () => {
  const r = E.parseSummaries(`Tournament #318349389, $5 Ocean KO Opener, $1M [Stage 1], Hold'em No Limit
Buy-in: $2.1+$0.4+$2.5
6380 Players
Tournament started 2026/10/08 09:30:00
You finished the tournament in 2586th place.
You received a total of 0 chips.`)[0];
  assert.equal(r.name, '$5 Ocean KO Opener, $1M [Stage 1]'); assert.equal(r.buyin, 5); assert.equal(r.prize, 0);
});
