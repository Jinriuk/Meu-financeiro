// F0.9 na tela: o resumo do site não troca prêmio digitado nem desmarca bilhete sem o jogador escolher.
// Uso: node test/ui/resumos.mjs [saida.png]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirApp, dbBase } from './harness.mjs';

const hoje = new Date(); const iso = d => d.toISOString().slice(0, 10);
const dia = iso(new Date(hoje.getTime() - 86400000));
const manual = { id: 'm1', workspace_id: 'w1', entry_date: dia, player: 'Hero', site: 'GG Poker', tournament_name: 'Bounty Hunters Special $5.40', modality: 'MTT',
  buyin: 5.4, reentries: 0, field_size: 0, final_position: null, prize: 50, bounty: 0, ticket: true, currency: 'USD', created_at: dia + 'T20:00:00Z' };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-resumo-'));
const arq = path.join(dir, 'GG20261101 - Tournament #77 - Bounty Hunters Special.txt');
fs.writeFileSync(arq, `Tournament #77, Bounty Hunters Special $5.40, Hold'em No Limit
Buy-in: $2.5+$0.4+$2.5
800 Players
Total Prize Pool: $4,000
Tournament started ${dia.replace(/-/g, '/')} 20:00:00
You finished the tournament in 12th place.
You received a total of $45.
`);

const { page, erros, escritas, fechar } = await abrirApp(dbBase({ tournaments: [manual] }));
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
try {
  await page.getByRole('button', { name: /^Torneios$/ }).first().click({ timeout: 15000 });
  await page.locator('#tsfile').setInputFiles(arq);
  await page.getByText('Confere antes de salvar').waitFor({ timeout: 10000 });
  const txt = await page.locator('body').innerText();
  ok(/completa o seu/.test(txt), 'casou com o lançamento manual');
  ok(/Prêmio: você digitou US\$\s?50,00 · arquivo US\$\s?45,00/.test(txt), 'mostra a diferença do prêmio');
  ok(/mantém o digitado/.test(txt), 'padrão é manter o digitado');
  ok(/BILHETE · não saiu dinheiro/.test(txt), 'bilhete marcado à mão continua marcado');
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
  // 1) salva sem escolher: o update NÃO leva prize
  await page.getByRole('button', { name: /^Salvar 1 torneio$/ }).click();
  await page.waitForTimeout(800);
  const up = escritas.find(e => e.tabela === 'tournaments' && e.metodo === 'PATCH');
  ok(!!up, 'gravou a mescla (PATCH)');
  const corpo = up ? JSON.parse(up.corpo) : {};
  ok(!('prize' in corpo), 'prêmio digitado NÃO foi enviado no update');
  ok(corpo.ticket === true, 'bilhete enviado como true');
  ok(corpo.final_position === 12 && corpo.site_tournament_id === '77', 'dados descritivos completados');
} catch (e) { falhas.push('erro: ' + e.message); console.log('✗', e.message); }
ok(erros.length === 0, 'sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
await fechar();

// 2) o jogador escolhe "usar o do arquivo": aí sim o prêmio do arquivo vai no update
{
  const { page, erros, escritas, fechar } = await abrirApp(dbBase({ tournaments: [manual] }));
  try {
    await page.getByRole('button', { name: /^Torneios$/ }).first().click({ timeout: 15000 });
    await page.locator('#tsfile').setInputFiles(arq);
    await page.getByText('Confere antes de salvar').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'mantém o digitado' }).click();
    ok(await page.getByRole('button', { name: 'vai usar o do arquivo' }).count() === 1, 'botão vira "vai usar o do arquivo"');
    await page.getByRole('button', { name: /^Salvar 1 torneio$/ }).click();
    await page.waitForTimeout(800);
    const up = escritas.find(e => e.tabela === 'tournaments' && e.metodo === 'PATCH');
    ok(up && JSON.parse(up.corpo).prize === 45, 'com a escolha, o prêmio do arquivo (45) foi enviado');
  } catch (e) { falhas.push('erro: ' + e.message); console.log('✗', e.message); }
  ok(erros.length === 0, 'sem erro de página/console (cenário 2)' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
