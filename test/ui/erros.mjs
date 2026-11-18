// F0.17 na tela: erro não tratado da página vai pro registrar_erro (1x por mensagem), sem dado digitado.
import { abrirApp, dbBase } from './harness.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
const { page, escritas, fechar } = await abrirApp(dbBase());
try {
  await page.getByRole('button', { name: /^Painel$/ }).first().waitFor({ timeout: 15000 });
  await page.evaluate(() => { for (let i = 0; i < 3; i++) setTimeout(() => { throw new Error('boom-de-teste'); }, 0); });
  await page.evaluate(() => { Promise.reject(new Error('promessa-rejeitada-teste')); });
  await page.waitForTimeout(800);
  const regs = escritas.filter(e => e.tabela === 'rpc.registrar_erro').map(e => JSON.parse(e.corpo));
  const boom = regs.filter(r => r.p_mensagem.includes('boom-de-teste'));
  ok(boom.length === 1, `erro da página registrado 1x (mesmo disparando 3x): ${boom.length}`);
  ok(boom[0] && boom[0].p_origem === 'app' && boom[0].p_build, 'origem app + build');
  ok(regs.some(r => r.p_mensagem.includes('promessa-rejeitada-teste')), 'promessa rejeitada também vai');
} catch (e) { falhas.push('erro: ' + e.message); console.log('✗', e.message); }
await fechar();
console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
