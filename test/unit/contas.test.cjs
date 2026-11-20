// Contas do dinheiro ao centavo (fase de caça-bugs). Rodar: node --test test/unit/*.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine.cjs');

const cfg = (x = {}) => ({ player1_name: 'Ana', player2_name: 'Beto', player_pct: 0.5, makeup_inicial_player1: 0, makeup_inicial_player2: 0, ...x });
const t = (player, entry_date, buyin, prize, x = {}) => ({ player, entry_date, buyin, prize, reentries: 0, bounty: 0, ...x });

test('centavo: arredonda no centavo, meio centavo pra longe do zero (igual ao round do banco)', () => {
  assert.equal(E.cent(0.1 + 0.2), 0.3);
  assert.equal(E.cent(1.005), 1.01);
  assert.equal(E.cent(5.025), 5.03);
  assert.equal(E.cent(-5.025), -5.03);
  assert.equal(E.cent(-2.5e-16), 0);
  assert.ok(Object.is(E.cent(-1e-17), 0), 'nunca devolve −0');
  assert.equal(E.cent('12,5'), 0, 'texto que não é número vira 0, como num()');
  assert.equal(E.cent(null), 0);
});

test('BUG-5 make-up que zera exatamente fica 0, não 0,000…04', () => {
  // semana 1: 3 torneios de 1,10 sem prêmio (−3,30); semana 2: prêmio de 3,30 sem custo (+3,30)
  const d = E.deriveDaily([t('Ana', '2026-11-03', 1.1, 0), t('Ana', '2026-11-04', 1.1, 0), t('Ana', '2026-11-05', 1.1, 0), t('Ana', '2026-11-10', 0, 3.3)]);
  const w = E.computeWeeks(d, cfg()).Ana;
  assert.equal(w.length, 2);
  assert.equal(w[0].resultado, -3.3);
  assert.equal(w[0].makeFinal, 3.3);
  assert.equal(w[1].makeFinal, 0);
  assert.equal(w[1].lucroDiv, 0);
  assert.equal(E.saqueStatus(w[1], 1000, 0, 0), 'Sem valor a sacar', 'não pode aparecer "Bloqueado por make-up" com make-up US$ 0,00');
});

test('BUG-5 saque pago exatamente o valor mostrado fica "Pago", não "Parcialmente autorizado"', () => {
  // lucro da semana 0,10 + 0,20 = 0,30 → metade do jogador = 0,15
  const d = E.deriveDaily([t('Ana', '2026-11-03', 0, 0.1), t('Ana', '2026-11-04', 0, 0.2)]);
  const [w] = E.computeWeeks(d, cfg()).Ana;
  assert.equal(w.resultado, 0.3);
  assert.equal(w.parteJog, 0.15);
  assert.equal(w.saqueAut, 0.15);
  assert.equal(E.saqueStatus(w, 1000, 0, 0.15), 'Pago');
});

test('BUG-5 parte do jogador + parte da pool = lucro dividido, sem centavo perdido', () => {
  const d = E.deriveDaily([t('Ana', '2026-11-03', 0, 10.05)]);
  const [w] = E.computeWeeks(d, cfg({ player_pct: 0.5 })).Ana;
  assert.equal(w.lucroDiv, 10.05);
  assert.equal(w.parteJog, 5.03, 'meio centavo arredonda pra cima, como no banco');
  assert.equal(w.partePool, 5.02);
  assert.equal(E.cent(w.parteJog + w.partePool), w.lucroDiv);
});

test('BUG-5 Diário guarda resultado e buy-ins no centavo', () => {
  const d = E.deriveDaily([t('Ana', '2026-11-03', 1.1, 0), t('Ana', '2026-11-03', 1.1, 0), t('Ana', '2026-11-03', 1.1, 0)]);
  assert.equal(d[0].resultado, -3.3);
  assert.equal(d[0].total_buyins, 3.3);
  assert.equal(d[0].buyins_nominal, 3.3);
});

test('BUG-6 nome com espaço ou maiúscula diferente entra no mesmo dia e na mesma semana', () => {
  const d = E.deriveDaily([t('Ana', '2026-11-03', 2, 0), t('ana ', '2026-11-03', 3, 10)]);
  assert.equal(d.length, 1, 'um dia só, não dois');
  assert.equal(d[0].player, 'Ana', 'fica o nome como foi escrito primeiro');
  assert.equal(d[0].resultado, 5);
  const [w] = E.computeWeeks(d, cfg()).Ana;
  assert.equal(w.resultado, 5, 'a semana soma os dois');
  const d2 = E.deriveDaily([t('ana ', '2026-11-03', 3, 10), t('Ana', '2026-11-04', 2, 0)]);
  assert.equal(E.computeWeeks(d2, cfg()).Ana[0].resultado, 5, 'mesmo quando o primeiro torneio veio com o nome diferente do da config');
});

test('BUG-3 lerTudo pagina de 1.000 em 1.000 até a última página', async () => {
  const linhas = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
  const pedidos = [];
  const montar = () => ({ range: async (de, ate) => { pedidos.push([de, ate]); return { data: linhas.slice(de, ate + 1), error: null }; } });
  const r = await E.lerTudo(montar);
  assert.equal(r.error, null);
  assert.equal(r.data.length, 2345);
  assert.equal(JSON.stringify(r.data.map(x => x.id)), JSON.stringify(linhas.map(x => x.id)), 'na ordem, sem repetir nem pular');
  assert.deepEqual(pedidos, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('BUG-3 lerTudo com exatamente 1.000 linhas confere a página seguinte (vazia)', async () => {
  const linhas = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
  let n = 0;
  const r = await E.lerTudo(() => ({ range: async (de, ate) => { n++; return { data: linhas.slice(de, ate + 1), error: null }; } }));
  assert.equal(r.data.length, 1000);
  assert.equal(n, 2);
});

test('BUG-3 lerTudo: erro em qualquer página devolve erro (nunca meia lista como se fosse tudo)', async () => {
  const linhas = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
  const r = await E.lerTudo(() => ({ range: async (de, ate) => de >= 1000 ? { data: null, error: { message: 'timeout' } } : { data: linhas.slice(de, ate + 1), error: null } }));
  assert.equal(r.data, null);
  assert.equal(r.error.message, 'timeout');
});
