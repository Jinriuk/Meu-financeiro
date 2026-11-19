// Grade da reta no formato da planilha (sala × linha × Regular/Prog KO/Hyper, texto livre do professor).
// Grade INVENTADA com o mesmo jeito de escrever das planilhas reais.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine.cjs');
const J = x => JSON.parse(JSON.stringify(x));

const G = [
  { site: 'GGpoker', tipo: 'Semanal', regular: 'até $2,50 + $3 2k+', prog_ko: 'até $2 + $3,20 5k+ $5,40 25k+', hyper: 'Até $2 (somente vanilla)' },
  { site: 'GGpoker', tipo: 'Reentry semanal', regular: 'até $2,50', prog_ko: 'ok', hyper: 'não' },
  { site: 'GGpoker', tipo: 'Turbo/Fast', regular: '$2,50 5k+', prog_ko: 'não', hyper: '-' },
  { site: 'GGpoker', tipo: 'Reentry turbo', regular: 'não', prog_ko: '-', hyper: '-' },
  { site: 'GGpoker', tipo: 'Sunday (não engloba turbo)', regular: 'até $3,30', prog_ko: 'até $2,50 + $10,8 100k+', hyper: 'não' },
  { site: 'GGpoker', tipo: 'Extra', regular: '', prog_ko: 'Bounty Hunters $5,40 Mini Main', hyper: '$2.50 Bh Sunday Special' },
  { site: 'PokerStars', tipo: 'Semanal', regular: '3.3', prog_ko: '$1.10 + Bounty Builder até $3.30', hyper: '2.2' },
  { site: 'PokerStars', tipo: 'Reentry semanal', regular: 'ok', prog_ko: 'ok', hyper: 'não' },
  { site: 'PokerStars', tipo: 'Extra', regular: '$11 sunday storm', prog_ko: '$5,50 Micro Bounty HR + $11 Sunday Storm', hyper: '' },
  { site: 'PokerStars', tipo: 'SNG', regular: '1.0', prog_ko: '1.5', hyper: '' },
];
const T = (nome, site, buyin, d, x = {}) => ({ tournament_name: nome, site, buyin, entry_date: d, reentries: 0, currency: 'USD', ...x });
const C = t => E.classificarTorneioGrade(t, { celulas: G });
const QUA = '2026-11-18', DOM = '2026-11-15';

test('célula: teto, degraus por garantido, liberado pelo nome, proibido, livre, vazia', () => {
  assert.deepStrictEqual(J(E.lerCelulaGrade('até $2,50 + $3,20 5k+   $5,40 12k + $10,8 100k+')),
    { texto: 'até $2,50 + $3,20 5k+ $5,40 12k + $10,8 100k+', vazia: false, proibido: false, livre: false, teto: 2.5,
      degraus: [{ buyin: 3.2, gtd: 5000 }, { buyin: 5.4, gtd: 12000 }, { buyin: 10.8, gtd: 100000 }], liberados: [], obs: '' });
  const bb = J(E.lerCelulaGrade('$1.10 + Bounty Builder até $3.30'));
  assert.strictEqual(bb.teto, 1.1); assert.deepStrictEqual(bb.liberados, [{ nome: 'Bounty Builder', ate: 3.3 }]);
  assert.deepStrictEqual(J(E.lerCelulaGrade('Bounty Hunters $5,40 Mini Main')).liberados, [{ nome: 'Bounty Hunters Mini Main', ate: 5.4 }]);
  assert.strictEqual(E.lerCelulaGrade('Até $2 (somente vanilla)').obs, 'somente vanilla');
  assert.strictEqual(E.lerCelulaGrade('Não').proibido, true);
  assert.strictEqual(E.lerCelulaGrade('ok').livre, true);
  assert.strictEqual(E.lerCelulaGrade('-').vazia, true);
  assert.strictEqual(E.lerCelulaGrade('').vazia, true);
  assert.strictEqual(E.lerCelulaGrade('3.3').teto, 3.3);
  assert.deepStrictEqual(J(E.lerCelulaGrade('$2,50 5k+')).degraus, [{ buyin: 2.5, gtd: 5000 }]);
});

test('garantido pelo nome, sala e tipo do torneio', () => {
  assert.strictEqual(E.gtdDoNome('Turbo $2.50 5K GTD'), 5000);
  assert.strictEqual(E.gtdDoNome('Daily $100,000 Flipout'), 100000);
  assert.strictEqual(E.gtdDoNome('Sunday $1M'), 1000000);
  assert.strictEqual(E.gtdDoNome('Daily Main $5.40'), null);
  assert.strictEqual(E.gradeSala('GG Poker'), E.gradeSala('GGpoker'));
  assert.strictEqual(E.gradeSala('PokerStars'), E.gradeSala('PS'));
  assert.notStrictEqual(E.gradeSala('PS.es'), E.gradeSala('PS'));
  const tp = E.gradeTipoTorneio(T('Bounty Hunters Turbo', 'GG Poker', 2, DOM));
  assert.deepStrictEqual([tp.tipo, tp.linha], ['prog_ko', 'turbo/fast'], 'turbo no domingo usa a linha de turbo (Sunday não engloba turbo)');
  assert.strictEqual(E.gradeTipoTorneio(T('Daily Main', 'GG Poker', 2, QUA, { bounty: 1.5 })).tipo, 'prog_ko', 'bounty ganho marca PKO');
  assert.strictEqual(E.gradeTipoTorneio(T('Mini Supersonic', 'PokerStars', 2, QUA)).tipo, 'hyper');
});

test('dentro: teto, degrau com garantido no nome, liberado pelo nome, apelido Bh, domingo e SNG', () => {
  const casos = [
    [T('Daily Main', 'GG Poker', 2.5, QUA), /semanal Regular: até \$2,50/],
    [T('Daily $3K', 'GG Poker', 3, QUA), /\$3,00 com garantido 2k\+/],
    [T('Bounty Builder $3.30', 'PokerStars', 3.3, QUA), /liberado: Bounty Builder/],
    [T('Bounty Hunters Mini Main', 'GG Poker', 5.4, QUA), /^extra: liberado: Bounty Hunters Mini Main/],
    [T('Bounty Hunters Sunday Special', 'GG Poker', 2.5, QUA), /liberado: Bh Sunday Special/],
    [T('Sunday Storm', 'PokerStars', 11, DOM), /liberado: sunday storm/i],
    [T('Bounty Hunters Sunday $100K', 'GG Poker', 10.8, DOM), /domingo Prog KO: \$10,80 com garantido 100k\+/],
    [T('Daily Main', 'GG Poker', 3.3, DOM), /domingo Regular: até \$3,30/],
    [T('Daily Main', 'GG Poker', 2.5, DOM, { reentries: 1 }), /domingo Regular/],
    [T('Sit & Go', 'PokerStars', 1, QUA, { modality: 'Sit & Go' }), /SNG Regular/],
    [T('Daily Hyper', 'GG Poker', 2, QUA), /semanal Hyper: até \$2,00/],
  ];
  for (const [t, re] of casos) { const r = C(t); assert.strictEqual(r.status, 'dentro', t.tournament_name + ': ' + r.motivo); assert.match(r.motivo, re); }
});

test('fora: acima do teto, sala fora da grade, proibições, reentry, hyper com bounty', () => {
  const casos = [
    [T('Hot $44', 'GG Poker', 44, QUA), /semanal Regular: buy-in \$44,00 acima do teto/],
    [T('Daily Main', 'GG Poker', 3.3, QUA), /acima do teto \$3,00/],
    [T('Party Main', 'Party Poker', 1, QUA), /não está na grade/],
    [T('$1 Satellite to Sunday', 'PokerStars', 1, QUA), /satélite/],
    [T('Rebuy Madness', 'PokerStars', 1, QUA), /rebuy/],
    [T('Heads-Up Championship', 'GG Poker', 1, QUA), /heads-up/],
    [T('Daily 3-Max', 'GG Poker', 1, QUA), /3-max/],
    [T('Turbo $5K', 'GG Poker', 2.5, QUA, { reentries: 1 }), /reentry turbo: não liberado/],
    [T('Daily Main', 'PokerStars', 3.3, QUA, { reentries: 2 }), /2 reentries: a regra é no máximo 1/],
    [T('Bounty Hyper', 'GG Poker', 2, QUA), /hyper com bounty/],
    [T('Daily Hyper', 'GG Poker', 2, DOM), /domingo Hyper: não liberado/],
    [T('Bounty Hunters Sunday $25K', 'GG Poker', 5.4, DOM), /domingo Prog KO: \$5,40 só com garantido 100k\+ \(este tem 25k\)/],
    [T('Bounty Turbo', 'GG Poker', 1, QUA), /turbo Prog KO: não liberado/],
  ];
  for (const [t, re] of casos) { const r = C(t); assert.strictEqual(r.status, 'fora', t.tournament_name + ': ' + r.motivo); assert.match(r.motivo, re); }
});

test('atenção: degrau sem garantido no nome e moeda que não é dólar', () => {
  const a = C(T('Daily Main', 'GG Poker', 3, QUA));
  assert.strictEqual(a.status, 'atencao'); assert.match(a.motivo, /só vale com garantido 2k\+ e o nome não traz o garantido/);
  const b = C(T('Daily Main', 'GG Poker', 2, QUA, { currency: 'CNY' }));
  assert.strictEqual(b.status, 'atencao'); assert.match(b.motivo, /moeda CNY/);
  assert.strictEqual(E.classificarTorneioGrade(T('x', 'GG Poker', 1, QUA), { celulas: [] }), null, 'sem grade: sem selo');
});

test('grade que vale: a da unidade do torneio ou a mais próxima acima, vigente na data', () => {
  const U = [{ id: 'r', caminho: '/r/' }, { id: 'b', caminho: '/r/b/' }, { id: 'r1', caminho: '/r/b/r1/' }, { id: 'r2', caminho: '/r/b/r2/' }];
  const GR = [{ id: 'gb', unidade_id: 'b', vigente_desde: '2026-01-01' }, { id: 'g1a', unidade_id: 'r1', vigente_desde: '2026-01-01' },
              { id: 'g1b', unidade_id: 'r1', vigente_desde: '2026-11-01' }];
  const g = (u, d) => (E.gradeDoTorneio({ unidade_id: u, entry_date: d }, U, GR) || {}).id;
  assert.strictEqual(g('r1', '2026-10-15'), 'g1a', 'grade antiga vale pro torneio antigo');
  assert.strictEqual(g('r1', '2026-11-15'), 'g1b', 'a mais nova vale depois da data');
  assert.strictEqual(g('r2', '2026-11-15'), 'gb', 'sem grade própria: herda a da Base');
  assert.strictEqual(g('r', '2026-11-15'), undefined, 'acima da Base não tem grade');
  assert.strictEqual(E.gradeDoTorneio({ unidade_id: null, entry_date: '2026-11-15' }, U, GR), null, 'torneio sem unidade (pool/solo): sem grade');
});
