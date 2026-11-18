// Link do e-mail no próprio domínio: ?token_hash=…&type=… confirma no Supabase, entra logado e limpa a barra.
import { abrirApp, dbBase } from './harness.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
async function cenario(nome, db, opcoes, fn) {
  const { page, erros, escritas, fechar } = await abrirApp(db, opcoes);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const TH = 'pkce_0a1b2c3d4e5f60718293a4b5c6d7e8f9';

await cenario('confirmação de cadastro', dbBase(), { semSessao: true, caminho: `/?token_hash=${TH}&type=email` }, async (page, escritas) => {
  await page.getByRole('button', { name: /^Ajustes$/ }).first().waitFor({ timeout: 15000 });
  const v = escritas.find(e => e.tabela === 'auth.verify');
  ok(v && JSON.parse(v.corpo).token_hash === TH && JSON.parse(v.corpo).type === 'email', 'confirmou o código com o Supabase');
  ok(!page.url().includes('token_hash'), 'código saiu da barra de endereço');
});

await cenario('redefinir senha', dbBase(), { semSessao: true, caminho: `/?token_hash=${TH}&type=recovery` }, async (page) => {
  await page.getByText('Crie sua nova senha').waitFor({ timeout: 15000 });
  ok(true, 'link de senha abre direto a troca de senha');
});

await cenario('link vencido', dbBase({ __verify: 'erro' }), { semSessao: true, caminho: `/?token_hash=${TH}&type=email` }, async (page) => {
  await page.locator('[data-link-aviso]').waitFor({ timeout: 15000 });
  ok(/venceu ou já foi usado/.test(await page.locator('body').innerText()), 'avisa que o link venceu e mostra o login');
  ok(!page.url().includes('token_hash'), 'código saiu da barra de endereço');
});

await cenario('link quebrado', dbBase(), { semSessao: true, caminho: `/?token_hash=&type=xyz` }, async (page, escritas) => {
  await page.locator('[data-link-aviso]').waitFor({ timeout: 15000 });
  ok(!escritas.some(e => e.tabela === 'auth.verify'), 'nem chama o Supabase');
});

await cenario('sem link', dbBase(), { semSessao: true }, async (page, escritas) => {
  await page.getByRole('button', { name: 'Entrar' }).waitFor({ timeout: 15000 });
  ok(await page.locator('[data-link-aviso]').count() === 0, 'login normal, sem aviso');
  ok(!escritas.some(e => e.tabela === 'auth.verify'), 'não chama verificação');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
