// Grade da reta: cada torneio do aluno conferido com a grade da reta (selo fora/atenção com o motivo, aviso de grade
// simulada) e o editor de quem configura regras (modelo, leitura da célula, simulada, regra de MK). Grade INVENTADA.
import { abrirApp, dbBase } from './harness.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
const EU = '00000000-0000-0000-0000-00000000aaaa';
async function cenario(nome, db, fn) {
  const { page, erros, escritas, fechar } = await abrirApp(db);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const corpo = page => page.locator('body').innerText();
const rpcs = (escritas, nome) => escritas.filter(e => e.tabela === 'rpc.' + nome);
const irPara = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(300); };
const tour = (id, nome, site, buyin, d, x = {}) => ({ id, workspace_id: 'w1', entry_date: d, player: 'Hero', site, tournament_name: nome, modality: 'MTT', buyin, prize: 0,
  reentries: 0, field_size: 100, bounty: 0, currency: 'USD', created_at: d + 'T10:00:00Z', pessoa_id: 'p1', unidade_id: 'u2', ...x });
const GRADE = [
  { site: 'GGpoker', tipo: 'Semanal', regular: 'até $2,50 + $3 2k+', prog_ko: 'até $2', hyper: 'não' },
  { site: 'GGpoker', tipo: 'Reentry semanal', regular: 'até $2,50', prog_ko: 'ok', hyper: 'não' },
  { site: 'PokerStars', tipo: 'Semanal', regular: '3.3', prog_ko: '$1.10', hyper: 'não' },
  { site: 'PokerStars', tipo: 'Extra', regular: '$11 Sunday Storm', prog_ko: '', hyper: '' },
];
const time = (extra = {}) => dbBase({
  workspaces: [{ id: 'w1', name: 'Samba', kind: 'time', plan: 'team', trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' }],
  pool_config: [{ id: 'c1', workspace_id: 'w1', player1_name: '', player2_name: '', player_pct: 1, abi_max: 3, abi_max_player1: 3, abi_max_player2: 0, piso_minimo: 0, makeup_max_recomendado: 0, makeup_inicial_player1: 0, makeup_inicial_player2: 0, stoploss_daily_buyins: 10, stoploss_weekly_pct: 0.15, banca_inicial: 0, week_start_date: '2026-11-02', sites_permitidos: ['GG Poker', 'PokerStars'], modalidades_permitidas: ['MTT'], created_at: '2026-01-01T00:00:00Z' }],
  unidade: [{ id: 'u1', workspace_id: 'w1', mae_id: null, nome: 'Samba', caminho: '/u1/', arquivada: false }, { id: 'u2', workspace_id: 'w1', mae_id: 'u1', nome: 'Reta 2', caminho: '/u1/u2/', arquivada: false }],
  pessoa: [{ id: 'p1', workspace_id: 'w1', user_id: EU, nome: 'Hero', status: 'ativo' }],
  vinculo: [{ pessoa_id: 'p1', unidade_id: 'u2', fim: null }],
  acesso: [],
  ...extra,
});

// 1) aluno: selos pela grade (não pelo teto de ABI dos Ajustes), Diário e aviso de grade simulada
await cenario('aluno', time({
  grade: [{ id: 'g1', workspace_id: 'w1', unidade_id: 'u2', vigente_desde: '2026-11-01', simulada: true, celulas: GRADE }],
  tournaments: [tour('t1', 'Daily Main', 'GG Poker', 2.5, '2026-11-17'), tour('t2', 'Hot $44', 'GG Poker', 44, '2026-11-17'),
                tour('t3', 'Daily Main', 'GG Poker', 3, '2026-11-16'), tour('t4', 'Sunday Storm', 'PokerStars', 11, '2026-11-15'),
                tour('t5', 'Daily Main', 'GG Poker', 2.5, '2026-11-14', { reentries: 1 })],
}), async (page) => {
  await irPara(page, 'Torneios');
  await page.waitForTimeout(400);
  for (const b of await page.getByRole('button', { name: /^\d\d\/\d\d .*torneio/ }).all()) await b.click({ timeout: 4000 });  // abre os dias passados
  await page.waitForTimeout(300);
  const fora = page.locator('[data-selo-grade="fora"]'), at = page.locator('[data-selo-grade="atencao"]');
  ok(await fora.count() === 1 && /acima do teto \$3,00 · grade simulada/.test(await fora.first().innerText()), 'Hot $44: FORA com o motivo e o aviso de grade simulada');
  ok(await at.count() === 1 && /só vale com garantido 2k\+/.test(await at.first().innerText()), '$3 sem garantido no nome: ATENÇÃO com o motivo');
  const t = await page.locator('main').innerText();
  ok(/Sunday Storm/.test(t) && await page.locator('[data-selo-grade]').count() === 2, 'Sunday Storm de $11 (liberado pelo nome) e o $2,50 com 1 reentry não ganham selo, mesmo acima do teto de ABI $3 dos Ajustes');
  await page.getByRole('tab', { name: 'Diário', exact: true }).click(); await page.waitForTimeout(300);
  for (const b of await page.getByRole('button', { name: /^Hero · / }).all()) await b.click({ timeout: 4000 });
  ok(/Fora da grade — 1 torneio · semanal Regular: buy-in \$44,00 acima do teto \$3,00 · grade simulada/.test(await corpo(page)), 'Diário: o dia fica fora pela grade, com o motivo');
  await irPara(page, 'Meu time');
  ok(await page.locator('[data-grade-simulada]').count() === 1 && /Grade da Reta 2/.test(await corpo(page)), 'Meu time: grade da reta com o aviso de simulada');
  ok(/até \$2,50 \+ \$3 2k\+/.test(await page.locator('[data-grade]').innerText()), '…e o quadro como na planilha');
  ok(await page.getByRole('button', { name: /^Grades$/ }).count() === 0 && await page.locator('[data-editar-grade]').count() === 0, 'aluno não edita grade');
});

// 2) gestor: editor com modelo, leitura da célula, simulada, salvar e regra de MK; aviso de MK ao mover
await cenario('gestor', time({
  acesso: [{ pessoa_id: 'p1', unidade_id: 'u1', capacidades: ['administrar'] }],
  pessoa: [{ id: 'p1', workspace_id: 'w1', user_id: EU, nome: 'Hero', status: 'ativo' }, { id: 'p3', workspace_id: 'w1', user_id: 'x3', nome: 'Maria', status: 'ativo' }],
  vinculo: [{ pessoa_id: 'p3', unidade_id: 'u2', fim: null }],
  unidade: [{ id: 'u1', workspace_id: 'w1', mae_id: null, nome: 'Samba', caminho: '/u1/', arquivada: false }, { id: 'u2', workspace_id: 'w1', mae_id: 'u1', nome: 'Reta 2', caminho: '/u1/u2/', arquivada: false },
    { id: 'u3', workspace_id: 'w1', mae_id: 'u1', nome: 'Reta 3', caminho: '/u1/u3/', arquivada: false }],
  __rpc: { resumo_time: [{ pessoa_id: 'p3', nome: 'Maria', unidade_id: 'u2', caminho: '/u1/u2/', status: 'ativo', torneios: 1, investido: 10, lucro: -10, roi: -100, abi: 10, ultimo_lancamento: '2026-11-17', banca: 50, mu: 100, lucro_sacado: 0 }] },
}), async (page, escritas) => {
  await page.getByRole('button', { name: /^Visão geral$/ }).first().waitFor({ timeout: 15000 });
  await irPara(page, 'Grades');
  await page.locator('[data-grade-reta="Reta 2"]').click({ timeout: 8000 });
  await page.locator('[data-editar-grade]').click();
  await page.locator('[data-grade-editor]').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Começar do modelo' }).click();
  ok(await page.locator('[data-grade-linha]').count() === 25, 'modelo: 3 salas × 8 linhas + SNG');
  await page.locator('[data-grade-linha="0"] [data-celula="regular"]').fill('até $2,50 + $3 2k+');
  await page.locator('[data-grade-linha="0"] [data-celula="prog_ko"]').fill('$1.10 + Bounty Builder até $3.30');
  const ent = await page.locator('[data-grade-linha="0"] [data-entendi]').allInnerTexts();
  ok(ent[0] === 'até $2,50 · $3,00 com 2k+' && ent[1] === 'até $1,10 · Bounty Builder até $3,30', 'mostra o que entendeu de cada célula enquanto escreve');
  await page.locator('[data-grade-simulada-check]').check();
  await page.getByRole('button', { name: 'Salvar grade de Reta 2' }).click();
  await page.waitForTimeout(800);
  const sg = rpcs(escritas, 'salvar_grade'); const a = sg.length ? JSON.parse(sg[0].corpo) : {};
  ok(sg.length === 1 && a.p_unidade === 'u2' && a.p_simulada === true && a.p_celulas.length === 25 && a.p_celulas[0].regular === 'até $2,50 + $3 2k+' && a.p_celulas[0].site === 'GGpoker',
    'salva a grade da Reta 2 como simulada, com o texto digitado');
  await irPara(page, 'Regras do time');
  await page.locator('[data-regra-mk-time]').click();   // o banco simulado não grava a regra: a caixa volta, o que importa é o pedido
  await page.waitForTimeout(600);
  const rg = rpcs(escritas, 'definir_regra'); const b = rg.length ? JSON.parse(rg[0].corpo) : {};
  ok(rg.length === 1 && b.p_unidade === 'u1' && b.p_chave === 'bloquear_promocao_com_mk' && b.p_valor === true, 'liga "não promover com MK" pro time inteiro (Regras do time)');
  await irPara(page, 'Jogadores');
  await page.locator('[data-acoes="Maria"]').click({ timeout: 8000 });
  await page.getByRole('menuitem', { name: 'Mover de reta (promover)' }).click();
  ok(/Maria está em MK \(−US\$\s50,00\)/.test(await corpo(page)), 'mover quem está em MK mostra o aviso com o valor');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
