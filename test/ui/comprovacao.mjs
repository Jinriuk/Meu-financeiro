// Comprovação dos torneios (antifraude, plano seção 5): o import guarda o que o arquivo do site disse; no time, a lista
// marca o digitado sem arquivo e o que mudou depois do import; a gestão vê quem tem torneio sem comprovação.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirApp } from './harness.mjs';
import { samba, D } from './fixture_time.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
async function cenario(nome, db, fn) {
  const { page, erros, escritas, fechar } = await abrirApp(db);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(500); };
const T = (id, nome, buyin, prize, extra = {}) => ({ id, workspace_id: 'w1', entry_date: D(1), player: 'Bruno T.', pessoa_id: 'p0', unidade_id: 'u2', site: 'GG Poker',
  tournament_name: nome, modality: 'MTT', buyin, prize, reentries: 0, field_size: 100, bounty: 0, ticket: false, currency: 'USD', created_at: D(1) + 'T10:00:00Z', ...extra });
const torneios = [
  T('c1', 'Daily Main', 2.5, 30, { site_tournament_id: '901', comprovante: { fonte: 'resumo', buyin: 2.5, prize: 30, reentries: 0, em: D(1) + 'T11:00:00Z' } }),
  T('c2', 'Digitado sem arquivo', 2.5, 0),
  T('c3', 'Mudou depois', 2.5, 80, { site_tournament_id: '903', comprovante: { fonte: 'resumo', buyin: 2.5, prize: 30, reentries: 0 } })];

// 1) o jogador vê a marca na lista dele
await cenario('jogador: lista com a comprovação', samba('aluno', { tournaments: torneios }), async page => {
  await aba(page, 'Torneios');
  for (const b of await page.getByRole('button', { name: /^\d\d\/\d\d .*torneio/ }).all()) if (await b.isEnabled() && (await b.getAttribute('aria-expanded')) === 'false') await b.click();
  await page.waitForTimeout(300);
  ok(await page.locator('[data-comprovacao="sem"]').count() === 1, 'o digitado sem arquivo aparece "SEM COMPROVAÇÃO"');
  ok(await page.locator('[data-comprovacao="diverge"]').count() === 1 && /prêmio: arquivo US\$\s30,00, lançado US\$\s80,00/.test(await page.locator('[data-comprovacao="diverge"]').innerText()),
    'o que mudou depois do import diz o que diverge (prêmio 30 no arquivo, 80 lançado)');
});

// 2) o import do resumo da GG guarda o comprovante junto do torneio
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-comprova-'));
const arq = path.join(dir, 'GG20261101 - Tournament #77 - Daily Turbo.txt');
fs.writeFileSync(arq, `Tournament #77, Daily Turbo $5.40, Hold'em No Limit
Buy-in: $2.5+$0.4+$2.5
800 Players
Total Prize Pool: $4,000
Tournament started ${D(2).replace(/-/g, '/')} 20:00:00
You finished the tournament in 12th place.
You received a total of $45.
`);
await cenario('import do resumo', samba('aluno'), async (page, escritas) => {
  await aba(page, 'Torneios');
  await page.locator('#tsfile').setInputFiles(arq);
  await page.getByText('Confere antes de salvar').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /^Salvar 1 torneio$/ }).click(); await page.waitForTimeout(800);
  const ins = escritas.find(e => e.tabela === 'tournaments' && e.metodo === 'POST');
  const linhas = ins ? JSON.parse(ins.corpo) : []; const l = Array.isArray(linhas) ? linhas[0] : linhas;
  ok(l && l.comprovante && l.comprovante.fonte === 'resumo' && l.comprovante.prize === 45 && l.comprovante.buyin === 5.4 && l.site_tournament_id === '77',
    'grava o torneio com o que o resumo disse (fonte, buy-in 5,40, prêmio 45): ' + JSON.stringify(l && l.comprovante));
});

// 3) a gestão vê quem tem torneio sem comprovação
const dbAdm = samba('admin', { tournaments: torneios.map(t => ({ ...t, player: 'Bruno T.', pessoa_id: 'p1' })) });
await cenario('gestão: comprovação', dbAdm, async page => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  ok(await page.locator('[data-pendencia^="Torneios digitados sem comprovação"]').count() === 1, 'pendência dos torneios sem comprovação');
  ok(await page.locator('[data-pendencia^="Torneios que mudaram depois do import"]').count() === 1, 'pendência dos que divergem do arquivo');
  await page.locator('[data-pendencia^="Torneios digitados sem comprovação"]').click(); await page.waitForTimeout(500);
  ok(await page.locator('[data-filtro-sit="comp"][aria-pressed="true"]').count() === 1 && await page.locator('[data-jogador="Bruno T."]').count() === 1
    && await page.locator('[data-jogador="Caio R."]').count() === 0, '…leva pra Jogadores filtrado (só quem tem)');
  const c = await page.locator('[data-comp-de="Bruno T."]').innerText();
  ok(/1 sem comprov\./.test(c) && /1 diverge/.test(c), 'a coluna diz quantos sem comprovação e quantos divergem: ' + c);
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
