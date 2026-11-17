// Tela Stats com dados: motor v2 (VPIP sem walks, squeeze, RFI, ajustado, fold do BB por open),
// aviso de linha antiga e leituras em uma linha com "ver mais". Uso: node test/ui/stats.mjs [saida.png]
import { createRequire } from 'node:module';
import { abrirApp, dbBase } from './harness.mjs';
const require = createRequire(import.meta.url);
const E = require('../lib/engine.cjs');
const { H } = require('../lib/hands.cjs');

// 30 cópias das mãos sintéticas, em torneios diferentes (amostra grande o bastante pras leituras)
const maos = [];
for (let i = 0; i < 30; i++) for (const k of Object.keys(H)) { const h = E.hhParseHand(H[k], {}); maos.push({ ...h, tid: 'T' + i, hid: h.hid + '-' + i, date: '2026-11-01' }); }
const linhas = E.hhAggregate(maos, 'Hero').map((r, i) => ({ ...r, id: 'h' + i, workspace_id: 'w1' }));
// uma linha antiga (motor 1): sem contadores novos
linhas.push({ id: 'old', workspace_id: 'w1', player: 'Hero', site: 'PokerStars', site_tournament_id: 'OLD', entry_date: '2026-10-01', buyin: 1.5, hands: 50, net_bb: 10, vpip_cnt: 12, pfr_cnt: 9, sawflop_cnt: 10, wtsd_cnt: 3, pos_json: { BTN: { h: 50, v: 12, p: 9, net: 10, hn: 50 } } });

const { page, erros, fechar } = await abrirApp(dbBase({ hh_tournament_stats: linhas }));
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
try {
  await page.getByRole('button', { name: /^Stats$/ }).first().click({ timeout: 15000 });
  await page.getByText('Pré-flop', { exact: true }).waitFor({ timeout: 10000 });
  const corpo = await page.locator('body').innerText();
  const T = E.hhTotals(linhas);
  const pct = (a, b) => (a / b * 100).toFixed(1).replace('.', ',') + '%';
  ok(corpo.includes(`${T.vpip}/${T.vpipDen}`), `VPIP sem walks (${T.vpip}/${T.vpipDen})`);
  ok(corpo.includes(`${T.pfr}/${T.pfrOpp}`), `PFR sobre a oportunidade (${T.pfr}/${T.pfrOpp})`);
  ok(/SQUEEZE/i.test(corpo) && corpo.includes(`${T.sq}/${T.sqOpp}`), `tile de squeeze (${T.sq}/${T.sqOpp})`);
  ok(corpo.includes(`${T.wtsdNp}/${T.wtsdDen}`), `WTSD sem all-in pré-flop (${T.wtsdNp}/${T.wtsdDen})`);
  ok(/RFI/.test(corpo), 'RFI por posição');
  ok(/Ajust\./.test(corpo), 'bb/100 ajustado por posição');
  ok(/Fold contra roubo: vs BTN/.test(corpo), 'fold do BB por posição do open');
  ok(/1 torneio calculado pela versão antiga/.test(corpo), 'aviso de linha do motor antigo');
  // leituras: abre o card; o texto longo só aparece depois do "ver mais"
  await page.getByText('Leituras do jogo').click();
  const verMais = page.getByRole('button', { name: 'ver mais' });
  const n = await verMais.count();
  ok(n > 0, `leituras em uma linha com "ver mais" (${n})`);
  if (n) {
    const antes = (await page.locator('body').innerText()).length;
    await verMais.first().click();
    const depois = (await page.locator('body').innerText()).length;
    ok(depois > antes + 40, 'ver mais abre o texto da leitura');
  }
  if (process.argv[2]) await page.screenshot({ path: process.argv[2], fullPage: true });
} catch (e) { falhas.push('erro: ' + e.message); console.log('✗', e.message); }
ok(erros.length === 0, 'sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
await fechar();
console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
