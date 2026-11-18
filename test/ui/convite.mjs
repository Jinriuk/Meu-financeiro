// Convite de time na tela: link com ?convite=, cadastro sem conta individual, aceite antes de carregar e recusa.
import { abrirApp, dbBase } from './harness.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
const TK = 'ab'.repeat(32);
const corpo = (page) => page.locator('body').innerText();
const rpcs = (escritas, nome) => escritas.filter(e => e.tabela === 'rpc.' + nome);

async function cenario(nome, db, opcoes, fn) {
  const { page, erros, escritas, fechar } = await abrirApp(db, opcoes);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}

// 1) sem conta, link válido: mostra o time, abre no cadastro, sem escolha de plano, e tira o token da barra
await cenario('link válido', dbBase({ __rpc: { ver_convite: { valido: true, time: 'Samba', unidade: 'Pandeiro', pessoa: null, motivo: null } } }),
  { semSessao: true, caminho: '/?convite=' + TK }, async (page) => {
    await page.locator('[data-convite="ok"]').waitFor({ timeout: 15000 });
    const t = await corpo(page);
    ok(/Convite pro time Samba/.test(t) && /Pandeiro/.test(t), 'mostra o time e a reta');
    ok(/Confirmar senha/i.test(t), 'abre direto no cadastro');
    ok(!/Escolha seu plano/i.test(t) && !/Sua conta individual/i.test(t), 'sem escolha de plano nem texto de conta individual');
    ok(!page.url().includes('convite='), 'token saiu da barra de endereço');
    ok(await page.evaluate(() => localStorage.getItem('gb_convite')) === 'ab'.repeat(32), 'token guardado no aparelho');
  });

// 2) sem conta, link vencido: avisa e deixa seguir sem convite
await cenario('link vencido', dbBase({ __rpc: { ver_convite: { valido: false, motivo: 'Esse convite venceu. Pede um link novo pro gestor.' } } }),
  { semSessao: true, caminho: '/?convite=' + TK }, async (page) => {
    await page.locator('[data-convite="ruim"]').waitFor({ timeout: 15000 });
    ok(/Esse convite venceu/.test(await corpo(page)), 'mostra o motivo');
    await page.getByRole('button', { name: 'Seguir sem convite' }).click();
    ok(await page.locator('[data-convite]').count() === 0, 'aviso some');
    ok(await page.evaluate(() => localStorage.getItem('gb_convite')) === null, 'token esquecido');
    ok(/Escolha seu plano/i.test(await corpo(page)), 'cadastro normal volta (com plano)');
  });

// 3) cadastro com convite pendente: cria a conta SEM conta individual
await cenario('cadastro com convite', dbBase({ __signupSessao: true, __rpc: { ver_convite: { valido: true, time: 'Samba', unidade: 'Pandeiro' }, nickname_disponivel: true } }),
  { semSessao: true, caminho: '/?convite=' + TK }, async (page, escritas) => {
    await page.locator('[data-convite="ok"]').waitFor({ timeout: 15000 });
    const campos = page.locator('input');
    await campos.nth(0).fill('Novato'); await campos.nth(1).fill('novato@example.com');
    await campos.nth(3).fill('Banca2026xy'); await campos.nth(4).fill('Banca2026xy');
    await page.getByRole('button', { name: 'Criar minha conta' }).click();
    await page.waitForTimeout(2500);
    ok(escritas.some(e => e.tabela === 'auth.signup'), 'conta criada');
    ok(rpcs(escritas, 'create_solo_workspace').length === 0, 'NÃO criou conta individual');
    ok(rpcs(escritas, 'aceitar_convite').length >= 1, 'aceitou o convite ao entrar');
  });

// 4) logado, convite aceito: aceita antes de carregar e esquece o token
await cenario('logado aceita', dbBase(), { caminho: '/?convite=' + TK }, async (page, escritas) => {
  await page.getByRole('button', { name: /^Ajustes$/ }).first().waitFor({ timeout: 15000 });
  const ac = rpcs(escritas, 'aceitar_convite');
  ok(ac.length === 1 && JSON.parse(ac[0].corpo).p_token === TK, 'chamou aceitar_convite com o token');
  const iAc = escritas.indexOf(ac[0]);
  ok(iAc >= 0 && escritas.findIndex(e => e.tabela === 'rpc.meu_status') > iAc, 'aceitou antes de carregar o resto');
  ok(await page.evaluate(() => localStorage.getItem('gb_convite')) === null, 'token esquecido depois de aceitar');
});

// 5) logado, servidor recusa: tela explica e deixa seguir
await cenario('logado recusado', dbBase({ __rpcErro: { aceitar_convite: 'Tua conta já está em outro time ou numa conta individual.' } }),
  { caminho: '/?convite=' + TK }, async (page) => {
    await page.locator('[data-convite="erro"]').waitFor({ timeout: 15000 });
    ok(/Tua conta já está em outro time/.test(await corpo(page)), 'mostra o motivo do servidor');
    await page.getByRole('button', { name: 'Seguir sem aceitar o convite' }).click();
    await page.getByRole('button', { name: /^Ajustes$/ }).first().waitFor({ timeout: 15000 });
    ok(await page.evaluate(() => localStorage.getItem('gb_convite')) === null, 'segue pro app e esquece o token');
  });

// 6) sem convite: cadastro e login como antes (nada de rpc de convite)
await cenario('sem convite', dbBase(), { semSessao: true }, async (page, escritas) => {
  await page.getByRole('button', { name: 'Criar conta grátis' }).waitFor({ timeout: 15000 });
  ok(await page.locator('[data-convite]').count() === 0, 'nenhum aviso de convite');
  ok(rpcs(escritas, 'ver_convite').length === 0, 'não consulta convite');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
