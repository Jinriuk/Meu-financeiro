// Relatório do time (22/11): a conta por trás da tela, com os números feitos à mão.
// Cenário de outubro/2026 numa árvore Time > Base > Reta 1 / Reta 2:
//   Ana (Reta 1 o mês todo) · Beto (promovido da Reta 1 pra Reta 2 no dia 15) · Caio (Reta 2, saiu dia 20 com acerto)
//   Duda (convidada, ainda não entrou) · Edu (entrou em novembro)
process.env.TZ = 'America/Sao_Paulo';   // o saque pago às 23h30 do dia 31 em Brasília chega como 01/11 em UTC
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine.cjs');
const j = x => JSON.parse(JSON.stringify(x));   // objetos do vm têm outro protótipo

const CAM = { R: '/R/', B: '/R/B/', U1: '/R/B/U1/', U2: '/R/B/U2/' };
const sob = raiz => id => !!CAM[id] && CAM[id].startsWith(CAM[raiz]);
const pessoas = [
  { id: 'ana', nome: 'Ana', status: 'ativo' }, { id: 'beto', nome: 'Beto', status: 'ativo' }, { id: 'caio', nome: 'Caio', status: 'saiu' },
  { id: 'duda', nome: 'Duda', status: 'convidado' }, { id: 'edu', nome: 'Edu', status: 'ativo' }];
const vinculos = [
  { pessoa_id: 'ana', unidade_id: 'U1', inicio: '2026-01-01', fim: null },
  { pessoa_id: 'beto', unidade_id: 'U1', inicio: '2026-01-01', fim: '2026-10-15' },
  { pessoa_id: 'beto', unidade_id: 'U2', inicio: '2026-10-15', fim: null },
  { pessoa_id: 'caio', unidade_id: 'U2', inicio: '2026-03-01', fim: '2026-10-20' },
  { pessoa_id: 'duda', unidade_id: 'U1', inicio: '2026-10-25', fim: null },
  { pessoa_id: 'edu', unidade_id: 'U1', inicio: '2026-11-03', fim: null }];
const T = (id, pessoa_id, unidade_id, entry_date, buyin, prize, extra = {}) =>
  ({ id, pessoa_id, unidade_id, entry_date, buyin, prize, reentries: 0, bounty: 0, ticket: false, site: 'GG Poker', ...extra });
const tours = [
  T('t1', 'ana', 'U1', '2026-10-02', 10, 50, { reentries: 1, comprovante: { buyin: 10, prize: 50, reentries: 1 } }), // inv 20 · res +30
  T('t2', 'ana', 'U1', '2026-10-02', 5, 0, { ticket: true, site: 'PokerStars' }),                                   // bilhete: inv 0 · sem comprovante
  T('t3', 'ana', 'U1', '2026-09-30', 99, 0),                                                                         // setembro: fora do período
  T('t4', 'ana', null, '2026-10-05', 99, 0),                                                                         // sem unidade: conta pessoal, não entra
  T('t5', 'beto', 'U1', '2026-10-10', 4, 0, { comprovante: { buyin: 4, prize: 10 } }),                               // inv 4 · res −4 · diverge
  T('t6', 'beto', 'U2', '2026-10-20', 8, 30, { bounty: 5 }),                                                         // inv 8 · res +27 · sem · fora da grade
  T('t7', 'caio', 'U2', '2026-10-18', 2, 0, { reentries: 1, site: 'PokerStars', comprovante: { buyin: 2, prize: 0, reentries: 1 } })]; // inv 4 · res −4
const saques = [
  { pessoa_id: 'ana', unidade_id: 'U1', status: 'pago', pago_em: '2026-11-01T02:30:00+00:00', devolucao: 100, cashout: 200, parte_jogador: 100, total_time: 200, recebido: 195 },
  { pessoa_id: 'ana', unidade_id: 'U1', status: 'pago', pago_em: '2026-10-01T02:00:00+00:00', devolucao: 50, cashout: 0, parte_jogador: 0, total_time: 50, recebido: 50 },   // 30/09 em Brasília
  { pessoa_id: 'ana', unidade_id: 'U1', status: 'aprovado', pago_em: null, devolucao: 70, cashout: 0, parte_jogador: 0, total_time: 70 }];
const aportes = [
  { pessoa_id: 'ana', unidade_id: 'U1', valor: 500, data: '2026-10-03' },
  { pessoa_id: 'beto', unidade_id: 'U2', valor: 300, data: '2026-10-16' }];
const acertos = [{ id: 'ac1', pessoa_id: 'caio', unidade_id: 'U2', saida: '2026-10-20', banca: 1000, mu: 800, total_time: 300, status: 'a_receber' }];
const base = { de: '2026-10-01', ate: '2026-10-31', pessoas, vinculos, tours, saques, aportes, acertos, fora: t => t.id === 't6' };
const tudo = () => true;
const rel = extra => E.relatorioTime({ ...base, naRecorte: sob('R'), vePerf: tudo, veDin: tudo, ...extra });
const por = (r, pid) => r.jogadores.find(x => x.pessoa_id === pid);

test('dia local: carimbo UTC vira o dia de Brasília; data pura fica igual', () => {
  assert.strictEqual(E.diaLocal('2026-11-01T02:30:00+00:00'), '2026-10-31');
  assert.strictEqual(E.diaLocal('2026-10-05'), '2026-10-05');
  assert.strictEqual(E.diaLocal(null), '');
});

test('time inteiro em outubro: totais feitos à mão', () => {
  const t = j(rel().total);
  assert.deepStrictEqual([t.n, t.dias, t.entradas, t.inv, t.res, t.abi, t.fora, t.sem, t.diverge, t.jogaram], [5, 4, 7, 36, 49, 5.86, 1, 2, 1, 3]);
  assert.strictEqual(t.roi.toFixed(2), (49 / 36 * 100).toFixed(2));
});

test('jogadores: quem saiu no mês entra; convidada e quem entrou depois não', () => {
  const r = rel();
  assert.deepStrictEqual(j(r.jogadores.map(x => x.nome).sort()), ['Ana', 'Beto', 'Caio']);
  assert.deepStrictEqual(j(['saiu', 'unidade_id', 'n'].map(k => por(r, 'caio')[k])), ['2026-10-20', 'U2', 1]);
  assert.deepStrictEqual(j(['unidade_id', 'mudou', 'n', 'inv', 'res'].map(k => por(r, 'beto')[k])), ['U2', null, 2, 12, 23]);
  assert.deepStrictEqual(j(['n', 'abi', 'inv', 'res', 'sem', 'diverge'].map(k => por(r, 'ana')[k])), [2, 8.33, 20, 30, 1, 0]);
});

test('por reta: cada torneio conta onde foi jogado (o promovido aparece nas duas)', () => {
  const u = Object.fromEntries(rel().porUnidade.map(x => [x.unidade_id, [x.jogaram, x.n, x.inv, x.res, x.fora]]));
  assert.deepStrictEqual(j(u), { U1: [2, 3, 24, 26, 0], U2: [2, 2, 12, 23, 1] });
});

test('recorte Reta 1: só o que aconteceu nela; o promovido aparece com "hoje em" a outra', () => {
  const r = rel({ naRecorte: sob('U1') });
  assert.deepStrictEqual(j(r.jogadores.map(x => x.nome).sort()), ['Ana', 'Beto']);
  assert.deepStrictEqual(j(['unidade_id', 'mudou', 'n', 'res', 'capital'].map(k => por(r, 'beto')[k])), ['U1', 'U2', 1, -4, 0]);
  assert.deepStrictEqual(j([r.total.n, r.total.res]), [3, 26]);
});

test('dinheiro: saque pelo dia do pagamento (fuso de Brasília), capital pela data, acerto de saída no período', () => {
  const r = rel();
  assert.deepStrictEqual(j(r.dinheiro), { capital: 800, saques: 1, sacado: 300, timeRecebeu: 195, jogadorFicou: 100 });
  assert.deepStrictEqual(j(por(r, 'caio').acertos.map(a => a.id)), ['ac1']);
  assert.strictEqual(rel({ de: '2026-11-01', ate: '2026-11-30' }).dinheiro.saques, 0, 'o saque das 23h30 do dia 31 é de outubro');
});

test('sem ver o desempenho da Reta 2: os torneios dela somem; o dinheiro continua pra quem vê', () => {
  const r = rel({ vePerf: u => u !== 'U2' });
  assert.deepStrictEqual(j([r.total.n, r.total.res]), [3, 26]);
  assert.deepStrictEqual(j(['perf', 'din', 'n'].map(k => por(r, 'caio')[k])), [false, true, 0]);
  assert.strictEqual(por(r, 'beto').perf, true, 'o Beto tem torneio visível na Reta 1');
  const s = rel({ veDin: u => u !== 'U2' });
  assert.deepStrictEqual(j([por(s, 'caio').din, por(s, 'caio').acertos.length, s.dinheiro.capital]), [false, 0, 500]);
});

test('intervalo vazio de torneios: ninguém, sem quebrar', () => {
  const r = rel({ de: '2025-01-01', ate: '2025-01-31' });
  assert.deepStrictEqual(j([r.jogadores.length, r.total.n, r.total.abi, r.total.roi, r.porUnidade.length]), [0, 0, null, null, 0]);
});
