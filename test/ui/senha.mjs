// F0.4 na tela: trocar senha exige a senha ATUAL e recusa senha fraca, antes de chamar o servidor.
import { abrirApp, dbBase } from './harness.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
const { page, erros, escritas, fechar } = await abrirApp(dbBase({ __senha: 'Atual2026x' }));
const abrir = async () => {
  await page.getByRole('button', { name: /^Ajustes$/ }).first().click({ timeout: 15000 });
  await page.getByRole('button', { name: /Trocar minha senha/ }).click();
  await page.getByText('Trocar senha', { exact: true }).waitFor();
};
const preenche = async (atual, nova) => { const c = page.locator('h3', { hasText: 'Trocar senha' }).locator('xpath=../..').locator('input');
  await c.nth(0).fill(atual); await c.nth(1).fill(nova); await c.nth(2).fill(nova); await page.getByRole('button', { name: 'Salvar nova senha' }).click(); await page.waitForTimeout(500); };
try {
  await abrir();
  const trocas = () => escritas.filter(e => e.tabela === 'auth.user' && e.metodo === 'PUT').length;
  await preenche('Atual2026x', 'password');
  ok(/letras E números/.test(await page.locator('body').innerText()) && trocas() === 0, '"password" recusada sem chamar o servidor');
  await preenche('Atual2026x', 'password1');
  ok(/mais usadas/.test(await page.locator('body').innerText()) && trocas() === 0, '"password1" recusada (lista das mais usadas)');
  await preenche('errada123', 'NovaBanca2026');
  ok(/Senha atual incorreta/.test(await page.locator('body').innerText()) && trocas() === 0, 'senha atual errada: não troca');
  await preenche('Atual2026x', 'NovaBanca2026');
  ok(/Senha trocada/.test(await page.locator('body').innerText()) && trocas() === 1, 'com a senha atual certa: troca');
  const put = escritas.filter(e => e.tabela === 'auth.user' && e.metodo === 'PUT').pop();
  ok(put && JSON.parse(put.corpo).password === 'NovaBanca2026', 'servidor recebeu a senha nova');
} catch (e) { falhas.push('erro: ' + e.message); console.log('✗', e.message); }
ok(erros.length === 0, 'sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
await fechar();
console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
