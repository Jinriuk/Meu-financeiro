// Gestor geral da plataforma: a tela só aparece pra quem o servidor diz que é gestor geral; lista os times pelos números,
// cria time com o link do admin, muda assentos, gera link novo do admin e mostra o registro das ações.
import { abrirApp } from './harness.mjs';
import { samba, D } from './fixture_time.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
async function cenario(nome, db, fn) {
  const { page, erros, escritas, fechar } = await abrirApp(db);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const rpc = (escritas, n) => escritas.filter(e => e.tabela === 'rpc.' + n).map(e => JSON.parse(e.corpo || '{}'));
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(500); };

const db = samba('admin');
db.__rpc = { ...db.__rpc, sou_gestor_geral: true,
  times_da_plataforma: [
    { id: 'w1', nome: 'Samba', tipo: 'time', criado_em: '2026-11-19T00:00:00Z', assentos: 30, pessoas: 7, jogadores: 4, convidados: 2, admins: 'Gabriel', tem_dono: true, admin_pendente: false, ultimo_lancamento: D(1) },
    { id: 'wn', nome: 'Time Novo', tipo: 'time', criado_em: '2026-11-20T00:00:00Z', assentos: null, pessoas: 1, jogadores: 0, convidados: 1, admins: 'Dona Nova', tem_dono: false, admin_pendente: true, ultimo_lancamento: null }],
  acoes_plataforma: [{ criado_em: '2026-11-20T10:00:00Z', acao: 'criar_time', time_nome: 'Time Novo', detalhes: { nome: 'Time Novo' } },
    { criado_em: '2026-11-20T09:00:00Z', acao: 'mudar_assentos', time_nome: 'Samba', detalhes: { antes: 20, depois: 30 } }],
  criar_time_plataforma: { workspace_id: 'w3', convite: 'a'.repeat(64) }, novo_link_admin: 'b'.repeat(64) };
await cenario('gestor geral', db, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Plataforma');
  await page.locator('[data-times]').waitFor({ timeout: 8000 });
  const samba_ = (await page.locator('[data-time-plataforma="Samba"]').innerText()).replace(/\s+/g, ' ');
  ok(/Samba 7 \(2 convidados\) 4 US\$ 20 30 Gabriel/.test(samba_), 'lista o time pelos números: pessoas, jogadores, mensalidade (4 × US$ 5), assentos, admin: ' + samba_);
  const novo = await page.locator('[data-time-plataforma="Time Novo"]').innerText();
  ok(/sem limite/.test(novo) && /sem dono/.test(novo) && await page.locator('[data-time-plataforma="Time Novo"]').getByRole('button', { name: 'Link do admin' }).count() === 1,
    'time sem dono: aviso e o botão do link do admin');
  ok(/criou o time · Time Novo/.test(await page.locator('main').innerText()) && /mudou os assentos · Samba \(20 → 30\)/.test(await page.locator('main').innerText()), 'registro das ações');
  const btn = page.getByRole('button', { name: 'Criar time' });
  ok(await btn.isDisabled(), 'sem nome do time e do admin, não cria');
  await page.locator('[data-novo-time-nome]').fill('Time Três'); await page.locator('[data-novo-time-admin]').fill('Ana'); await page.locator('[data-novo-time-assentos]').fill('12x');
  await btn.click(); await page.waitForTimeout(600);
  const c = rpc(escritas, 'criar_time_plataforma').pop();
  ok(c && c.p_nome === 'Time Três' && c.p_admin_nome === 'Ana' && c.p_assentos === 12, 'cria o time com nome, admin e assentos (só números)');
  ok((await page.locator('[data-link-convite]').inputValue()).endsWith('?convite=' + 'a'.repeat(64)), 'mostra o link de admin pra mandar');
  await page.locator('[data-time-plataforma="Samba"]').getByRole('button', { name: 'Assentos' }).click();
  await page.keyboard.press('Control+A'); await page.keyboard.type('40'); await page.getByRole('button', { name: 'Salvar', exact: true }).click(); await page.waitForTimeout(500);
  const a = rpc(escritas, 'mudar_assentos').pop();
  ok(a && a.p_ws === 'w1' && a.p_assentos === 40, 'muda os assentos do Samba pra 40');
  await page.locator('[data-time-plataforma="Time Novo"]').getByRole('button', { name: 'Link do admin' }).click(); await page.waitForTimeout(600);
  ok(rpc(escritas, 'novo_link_admin').pop()?.p_ws === 'wn' && (await page.locator('[data-link-convite]').inputValue()).endsWith('b'.repeat(64)), 'gera link novo do admin do Time Novo');
});

await cenario('quem não é gestor geral', samba('admin'), async (page) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  ok(await page.getByRole('button', { name: /^Plataforma$/ }).count() === 0, 'admin de time não vê a Plataforma no menu');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
