// Proteções achadas na varredura de produção (pool de 2):
//  1) mãos de torneios que já estão lançados no nome do OUTRO jogador: o import pergunta antes de gravar;
//  2) dia com mãos importadas e nenhum torneio lançado: aviso no sininho (o resultado desse dia não está na banca).
import { abrirApp, dbBase } from './harness.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
async function cenario(nome, db, fn) {
  const { page, erros, escritas, fechar } = await abrirApp(db);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const irPara = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(300); };
const tour = (id, player, d, x = {}) => ({ id, workspace_id: 'w1', entry_date: d, player, site: 'GG Poker', tournament_name: 'Daily ' + id, modality: 'MTT', buyin: 2, prize: 0, reentries: 0, field_size: 100, bounty: 0, currency: 'USD', created_at: d + 'T10:00:00Z', ...x });
const pool = (extra = {}) => dbBase({
  workspaces: [{ id: 'w1', name: 'Pool', kind: 'team', plan: 'team', trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' }],
  pool_config: [{ ...dbBase().pool_config[0], player1_name: 'Ana', player2_name: 'Beto' }], ...extra });

// 1) mãos da Ana importadas com "de quem" = Beto: os torneios delas já estão lançados no nome da Ana
const maos = zlib.gunzipSync(fs.readFileSync(new URL('../fixtures/amostra_maos.txt.gz', import.meta.url))).toString('utf8')
  .split(/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m).filter(h => /^Poker Hand #\S+: Tournament #(900000002|900000004),/.test(h));   // o mesmo corte do app
const dois = [...maos.filter(h => /#900000002,/.test(h)).slice(0, 4), ...maos.filter(h => /#900000004,/.test(h)).slice(0, 4)].join('\n');
const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gb-maos-')), 'maos.txt'); fs.writeFileSync(arq, dois);
await cenario('mãos no jogador errado', pool({ tournaments: [tour('t1', 'Ana', '2026-11-10', { site_tournament_id: '900000002' }), tour('t2', 'Ana', '2026-11-10', { site_tournament_id: '900000004' })] }),
  async (page, escritas) => {
    await irPara(page, 'Stats');
    await page.getByRole('button', { name: 'Beto', exact: true }).first().click();
    await page.locator('#hhfile').setInputFiles(arq);
    await page.locator('[data-hh-dono]').waitFor({ timeout: 15000 });
    const t = await page.locator('[data-hh-dono]').innerText();
    ok(/2 dos 2 torneios dessas mãos já estão lançados no nome de Ana/.test(t) && /no nome de Beto/.test(t), 'pergunta antes de gravar: os torneios são da Ana, o import está no Beto');
    ok(!escritas.some(e => e.tabela === 'hh_tournament_stats'), '…e nada foi gravado ainda');
    await page.getByRole('button', { name: 'Importar no nome de Ana' }).click();
    await page.locator('label[for="hhfile"]', { hasText: 'Escolher arquivos' }).waitFor({ timeout: 30000 });   // terminou (CSP do app proíbe waitForFunction)
    const gravadas = escritas.filter(e => e.tabela === 'hh_tournament_stats' && e.metodo === 'POST').flatMap(e => JSON.parse(e.corpo || '[]'));
    ok(gravadas.length === 2 && gravadas.every(r => r.player === 'Ana'), 'grava as mãos dos 2 torneios no nome da Ana');
  });

// 1b) cancelar não grava nada; e mãos do próprio jogador não perguntam nada
await cenario('cancelar e mãos certas', pool({ tournaments: [tour('t1', 'Ana', '2026-11-10', { site_tournament_id: '900000002' }), tour('t2', 'Ana', '2026-11-10', { site_tournament_id: '900000004' })] }),
  async (page, escritas) => {
    await irPara(page, 'Stats');
    await page.getByRole('button', { name: 'Beto', exact: true }).first().click();
    await page.locator('#hhfile').setInputFiles(arq);
    await page.locator('[data-hh-dono]').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Cancelar o import' }).click();
    await page.waitForTimeout(800);
    ok(!escritas.some(e => e.tabela === 'hh_tournament_stats') && await page.locator('[data-hh-dono]').count() === 0, 'cancelar: nada gravado');
    await page.getByRole('button', { name: 'Ana', exact: true }).first().click();
    await page.locator('#hhfile').setInputFiles(arq);
    await page.locator('label[for="hhfile"]', { hasText: 'Escolher arquivos' }).waitFor({ timeout: 30000 });   // terminou (CSP do app proíbe waitForFunction)
    ok(await page.locator('[data-hh-dono]').count() === 0 && escritas.some(e => e.tabela === 'hh_tournament_stats'), 'no nome certo (Ana) importa direto, sem perguntar');
  });

// 2) sininho: a Ana tem mãos em 11/11 e nenhum torneio lançado nesse dia
const hhRow = (id, player, d, tid) => ({ id, workspace_id: 'w1', player, site: 'GG Poker', site_tournament_id: tid, tournament_name: 'x', entry_date: d, buyin: 2, hands: 10, created_at: d + 'T10:00:00Z' });
await cenario('dia sem resultado', pool({
  tournaments: [tour('t1', 'Ana', '2026-11-10', { site_tournament_id: 'A1' }), tour('t2', 'Ana', '2026-11-12', { site_tournament_id: 'A2' })],
  hh_tournament_stats: [hhRow('h1', 'Ana', '2026-11-11', 'X9'), hhRow('h2', 'Ana', '2026-11-12', 'A2'), hhRow('h3', 'Beto', '2026-11-11', 'A1'), hhRow('h4', 'Ana', '2026-11-01', 'X1')] }),
  async (page) => {
    await page.locator('[data-sininho]').waitFor({ timeout: 15000 });
    await page.locator('[data-sininho]').click(); await page.waitForTimeout(300);
    const lista = await page.locator('body').innerText();
    ok(/Ana tem mãos importadas em 1 dia sem nenhum torneio lançado \(11\/11\)/.test(lista), 'avisa o dia da Ana com mãos e sem torneio (11/11)');
    ok(!/Beto tem mãos importadas/.test(lista), 'Beto: mão de torneio já lançado (no nome da Ana) não vira "resultado faltando"');
    ok(!/01\/11/.test(lista), 'antes do 1º torneio da Ana não conta (mãos antigas, de antes de usar a banca)');
  });

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
