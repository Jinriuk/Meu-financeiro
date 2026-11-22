// Comprovação dos torneios (antifraude, plano seção 5): o que o arquivo do site disse x o que está lançado.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine.cjs');
const j = x => JSON.parse(JSON.stringify(x));   // objetos do vm têm outro protótipo

test('sem comprovante = digitado sem arquivo', () => {
  assert.strictEqual(E.comprovacaoDe({ buyin: 2, prize: 30 }).st, 'sem');
  assert.strictEqual(E.comprovacaoDe({ buyin: 2, prize: 30, comprovante: null }).st, 'sem');
});

test('bate com o arquivo = ok (centavo de arredondamento não conta)', () => {
  const t = { buyin: 2.2, prize: 30, reentries: 1, comprovante: { fonte: 'resumo', buyin: 2.2, prize: 30.004, reentries: 1 } };
  assert.deepStrictEqual(j(E.comprovacaoDe(t)), { st: 'ok', dif: [] });
});

test('mudou depois do import = diverge, dizendo o quê', () => {
  const t = { buyin: 2, prize: 80, reentries: 2, comprovante: { fonte: 'resumo', buyin: 2, prize: 30, reentries: 1 } };
  const c = E.comprovacaoDe(t);
  assert.strictEqual(c.st, 'diverge');
  assert.deepStrictEqual(j(c.dif.map(d => [d.campo, d.arquivo, d.lancado])), [['prêmio', 30, 80], ['reentradas', 1, 2]]);
});

test('bounty só é comparado quando o arquivo traz (o resumo da GG não traz)', () => {
  assert.strictEqual(E.comprovacaoDe({ buyin: 5, prize: 0, bounty: 12, comprovante: { buyin: 5, prize: 0 } }).st, 'ok');
  assert.strictEqual(E.comprovacaoDe({ buyin: 5, prize: 0, bounty: 12, comprovante: { buyin: 5, prize: 0, bounty: 7.5 } }).st, 'diverge');
});

test('o comprovante do import: resumo da GG x hand history da PokerStars', () => {
  const gg = E.comprovanteDoArquivo({ arquivo: 'GG20261101.txt' }, { buyin: 5.4, prize: 0, reentries: 0 });
  assert.deepStrictEqual(j(gg), { fonte: 'resumo', buyin: 5.4, prize: 0, reentries: 0 });
  const ps = E.comprovanteDoArquivo({ arquivo: 'hand history PokerStars' }, { buyin: 3.3, prize: 12, reentries: 1, bounty: 4.5 });
  assert.deepStrictEqual(j(ps), { fonte: 'hh_ps', buyin: 3.3, prize: 12, reentries: 1, bounty: 4.5 });
});
