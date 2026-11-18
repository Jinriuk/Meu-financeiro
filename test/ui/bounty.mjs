// F0.8 na tela: lançar torneio PKO à mão com bounty; o lucro do dia soma o bounty.
import { abrirApp, dbBase } from './harness.mjs';
const { page, erros, escritas, fechar } = await abrirApp(dbBase());
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
try {
  await page.getByRole('button', { name: /^Torneios$/ }).first().click({ timeout: 15000 });
  await page.getByRole('button', { name: /Adicionar/ }).first().click();
  const campo = rot => page.locator('label', { hasText: rot }).locator('xpath=following-sibling::*[1]');
  await campo('Buy-in (US$)').fill('5,50');
  await campo('Bounties PKO (US$)').fill('7,25');
  await page.getByRole('button', { name: /^(Salvar|Adicionar)$/ }).last().click();
  await page.waitForTimeout(800);
  const post = escritas.find(e => e.tabela === 'tournaments' && e.metodo === 'POST');
  const corpo = post ? JSON.parse(post.corpo) : null;
  const linha = Array.isArray(corpo) ? corpo[0] : corpo;
  ok(linha && linha.bounty === 7.25 && linha.buyin === 5.5, 'bounty gravado como número (7,25) junto do buy-in (5,50)');
  const txt = await page.locator('body').innerText();
  ok(/bounty US\$\s?7,25/.test(txt), 'linha do torneio mostra o bounty');
  ok(/\+US\$\s?1,75/.test(txt), 'resultado = 0 + 7,25 − 5,50 = +1,75');
} catch (e) { falhas.push('erro: ' + e.message); console.log('✗', e.message); }
ok(erros.length === 0, 'sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
await fechar();
console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
