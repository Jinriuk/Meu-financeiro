// Entrada no time pela tela: código do time (gerar, mostrar, mandar), pedidos de entrada (aprovar escolhendo a reta),
// conta individual pedindo pelo código em Ajustes, e o cadastro com o código do time.
import { abrirApp, dbBase } from './harness.mjs';
import { samba, D } from './fixture_time.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
async function cenario(nome, db, fn, opcoes) {
  const { page, erros, escritas, fechar } = await abrirApp(db, opcoes);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const rpc = (escritas, n) => escritas.filter(e => e.tabela === 'rpc.' + n).map(e => JSON.parse(e.corpo || '{}'));
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(400); };

// 1) admin sem código: gera; com pedido pendente: aparece na Visão geral e aprova na Cavaquinho
const db1 = samba('admin', { pedido_entrada: [{ id: 'pe1', workspace_id: 'w1', user_id: 'x9', nome: 'novato77', status: 'pendente', criado_em: D(0) + 'T12:00:00Z' }] });
db1.__rpc = { ...db1.__rpc, gerar_codigo_time: 'SAMBA-36510', decidir_entrada: 'p-novo' };
await cenario('admin: código e pedido', db1, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  ok(await page.locator('[data-pendencia="Pedidos pra entrar no time"]').count() === 1, 'Visão geral: pendência "Pedidos pra entrar no time"');
  await aba(page, 'Equipe e convites');
  await page.locator('[data-gerar-codigo]').click(); await page.waitForTimeout(500);
  ok(rpc(escritas, 'gerar_codigo_time').length === 1, 'sem código ainda: "Gerar código do time" chama o servidor');
  const p = page.locator('[data-pedido="novato77"]');
  ok(/pediu pelo código/.test(await p.innerText()), 'o pedido aparece com o nome de quem pediu');
  await p.locator('[data-pedido-nome]').fill('Novato Silva');
  await p.locator('[data-pedido-reta]').selectOption({ label: 'Cavaquinho · Reta 4' });
  await p.getByRole('button', { name: 'Aprovar' }).click(); await page.waitForTimeout(500);
  const de = rpc(escritas, 'decidir_entrada').pop();
  ok(de && de.p_pedido === 'pe1' && de.p_aprovar === true && de.p_unidade === 'u4' && de.p_nome === 'Novato Silva', 'aprovar manda a reta escolhida (Cavaquinho) e o nome no time');
});

// 2) admin com código: mostra, manda no WhatsApp com o texto, e a reta pode ficar pra depois
const db2 = samba('admin', { time_codigo: [{ workspace_id: 'w1', codigo: 'SAMBA-36510', ativo: true }],
  pedido_entrada: [{ id: 'pe2', workspace_id: 'w1', user_id: 'x8', nome: 'depois', status: 'pendente', criado_em: D(0) + 'T12:00:00Z' }] });
db2.__rpc = { ...db2.__rpc, decidir_entrada: 'p-x' };
await cenario('admin: código pronto', db2, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Equipe e convites');
  ok((await page.locator('[data-codigo]').innerText()).trim() === 'SAMBA-36510', 'mostra o código do time');
  const zap = await page.locator('[data-codigo-card]').getByRole('link', { name: 'Mandar no WhatsApp' }).getAttribute('href');
  ok(/wa\.me/.test(zap) && decodeURIComponent(zap).includes('use o código SAMBA-36510'), 'WhatsApp com o texto e o código');
  const p = page.locator('[data-pedido="depois"]');
  await p.locator('[data-pedido-reta]').selectOption({ label: 'Escolher a reta depois' });
  await p.getByRole('button', { name: 'Aprovar' }).click(); await page.waitForTimeout(500);
  ok(rpc(escritas, 'decidir_entrada').pop()?.p_unidade === 'u0', '"Escolher a reta depois" aprova na raiz do time');
});

// 3) conta individual: pede pelo código em Ajustes (o código é normalizado); com pedido pendente, a faixa avisa
const solo = dbBase(); solo.__rpc = { pedir_entrada_time: { pedido: 'pz', time: 'Samba', status: 'pendente' } };
await cenario('conta individual pede pelo código', solo, async (page, escritas) => {
  await aba(page, 'Ajustes');
  await page.locator('[data-codigo-time]').fill('samba 36510');
  await page.locator('[data-pedir-entrada]').click(); await page.waitForTimeout(500);
  ok(rpc(escritas, 'pedir_entrada_time').pop()?.p_codigo === 'SAMBA-36510', '"samba 36510" vira SAMBA-36510 e vai pro servidor');
});
await cenario('conta individual com pedido pendente', dbBase({ pedido_entrada: [{ id: 'pz', status: 'pendente', criado_em: '2026-11-20T10:00:00Z', time_nome: 'Samba' }] }), async (page, escritas) => {
  await page.locator('[data-pedido-pendente]').waitFor({ timeout: 15000 });
  ok(/Pedido pra entrar no time Samba enviado em 20\/11/.test(await page.locator('[data-pedido-pendente]').innerText()), 'faixa no topo: pedido enviado, aguardando a gestão');
  await aba(page, 'Ajustes');
  await page.locator('[data-entrar-time]').getByRole('button', { name: 'Cancelar pedido' }).click(); await page.waitForTimeout(500);
  ok(rpc(escritas, 'cancelar_pedido_entrada').pop()?.p_pedido === 'pz', 'dá pra cancelar o pedido');
});

// 4) cadastro com o código do time: a conta é criada e o pedido vai ao carregar o painel
const novo = dbBase(); novo.__signupSessao = true;
await cenario('cadastro com código', novo, async (page, escritas) => {
  await page.getByRole('button', { name: 'Criar conta grátis' }).click({ timeout: 15000 });
  await page.getByPlaceholder('Ex: rafa_grinder').fill('novato77');
  await page.locator('input[type="email"]').fill('novato77@example.com');
  await page.locator('[data-cadastro-codigo]').fill('Samba-36510');
  const senhas = page.locator('input[type="password"]');
  await senhas.nth(0).fill('Grind3rBank!2026'); await senhas.nth(1).fill('Grind3rBank!2026');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  for (let i = 0; i < 30 && !rpc(escritas, 'pedir_entrada_time').length; i++) await page.waitForTimeout(500);
  ok(rpc(escritas, 'create_solo_workspace').length === 1, 'a conta é criada normalmente (individual, enquanto o time não aprova)');
  ok(rpc(escritas, 'pedir_entrada_time').pop()?.p_codigo === 'SAMBA-36510', '…e o pedido pelo código vai sozinho assim que a conta existe');
}, { semSessao: true });

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
