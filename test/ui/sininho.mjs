// Avisos vão pro sininho, não pra tela: alerta do painel (banca abaixo do piso) em conta individual.
// Abrir zera o contador; apagar some e continua apagado depois de recarregar.
import { abrirApp, dbBase } from './harness.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
const db = dbBase({ pool_config: [{ ...dbBase().pool_config[0], piso_minimo: 1000 }] });   // banca 500 < piso 1000
const { page, erros, fechar } = await abrirApp(db);
try {
  await page.locator('[data-sininho-novos]').waitFor({ timeout: 15000 });
  ok(Number((await page.locator('[data-sininho-novos]').innerText()).trim()) >= 1, 'sininho mostra o alerta como novo');
  const fora = await page.locator('main').innerText();
  ok(!/abaixo do piso mínimo/.test(fora), 'o alerta NÃO aparece solto na tela');
  await page.locator('[data-sininho]').click(); await page.waitForTimeout(300);
  const lista = await page.locator('[data-avisos]').innerText();
  ok(/Atenção na banca/.test(lista) && /abaixo do piso mínimo/.test(lista), 'o alerta está dentro do sininho');
  ok(await page.locator('[data-sininho-novos]').count() === 0, 'abrir zera o contador');
  await page.locator('[data-aviso="painel"]').first().getByRole('button', { name: 'Apagar aviso' }).click(); await page.waitForTimeout(300);
  ok(!/abaixo do piso mínimo/.test(await page.locator('[data-avisos]').innerText()), 'X apaga o alerta');
  await page.reload(); await page.locator('[data-sininho]').waitFor({ timeout: 15000 }); await page.waitForTimeout(500);
  ok(await page.locator('[data-sininho-novos]').count() === 0, 'depois de recarregar, o alerta apagado não volta');
} catch (e) { falhas.push('erro: ' + e.message); console.log('✗', e.message); }
ok(erros.length === 0, 'sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
await fechar();
console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
