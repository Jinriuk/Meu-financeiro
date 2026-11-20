// Marca do time (pedido do dono, 20/11): a logo e o nome do time no topo (GrinderBank em segundo plano), o admin troca em
// Regras do time (a imagem é reduzida no navegador), quem joga só vê, o convite mostra a marca e o gestor geral troca pela
// Plataforma (sem ver a imagem) e vê a mensalidade de US$ 5 por jogador.
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
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(500); };
const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
// uma imagem de verdade, 600×300, feita no próprio navegador (pra provar que o app reduz pra caber em 256)
const pngGrande = page => page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 300; const g = c.getContext('2d');
  g.fillStyle = '#c0392b'; g.fillRect(0, 0, 600, 300); g.fillStyle = '#fff'; g.fillRect(200, 100, 200, 100); return c.toDataURL('image/png').split(',')[1]; });
const tamanho = (page, url) => page.evaluate(u => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => r('erro'); i.src = u; }), url);

// 1) admin: a marca no topo, o cartão em Regras do time, a logo reduzida e o topo atualizado depois de salvar
const db1 = samba('admin');
db1.workspaces = [{ ...db1.workspaces[0], marca_nome: 'Samba Poker Team', marca_logo: PNG1 }];
db1.__rpc = { ...db1.__rpc, definir_marca: a => { const w = db1.workspaces[0];
  if (a.p_nome != null) w.marca_nome = a.p_nome || null; if (a.p_logo != null) w.marca_logo = a.p_logo || null; return null; } };
await cenario('admin: marca do time', db1, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  const topo = page.locator('[data-marca]').first();
  ok(await topo.getAttribute('data-marca') === 'Samba Poker Team' && /por GrinderBank/.test(await topo.innerText()) && await topo.locator('[data-marca-logo]').count() === 1,
    'o topo mostra o nome e a logo do time, com "por GrinderBank" embaixo');
  await aba(page, 'Regras do time');
  const card = page.locator('[data-marca-time]'); await card.waitFor({ timeout: 8000 });
  ok(await card.locator('[data-marca-nome]').inputValue() === 'Samba Poker Team' && await card.locator('[data-marca-previa]').count() === 1, 'o cartão vem com o nome e a logo atuais');
  ok(await card.getByRole('button', { name: 'Salvar marca' }).isDisabled(), 'sem mudança, não salva');
  await card.locator('[data-marca-arquivo]').setInputFiles({ name: 'logo.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  ok(/PNG, JPG ou WebP/.test(await card.innerText()), 'GIF: avisa que só PNG, JPG ou WebP');
  await card.locator('[data-marca-arquivo]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(await pngGrande(page), 'base64') });
  await page.waitForFunction(() => { const i = document.querySelector('[data-marca-previa]'); return i && !/iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB/.test(i.src); }, null, { timeout: 5000 });
  await card.locator('[data-marca-nome]').fill('  Samba  ');
  await card.getByRole('button', { name: 'Salvar marca' }).click(); await page.waitForTimeout(800);
  const m = rpc(escritas, 'definir_marca').pop();
  ok(m && m.p_nome === 'Samba' && m.p_ws === null && /^data:image\/(webp|png);base64,/.test(m.p_logo) && m.p_logo.length < 400000, 'salva o nome (sem espaços) e a logo nova, no time de quem é admin');
  ok(m && await tamanho(page, m.p_logo) === '256x128', 'a logo de 600×300 foi reduzida pra 256×128 antes de ir: ' + (m && await tamanho(page, m.p_logo)));
  ok(/Marca do time salva/.test(await page.locator('main').innerText()), 'avisa que salvou');
  ok(await page.locator('[data-marca]').first().getAttribute('data-marca') === 'Samba' && await page.locator('[data-marca-logo]').first().getAttribute('src') === m.p_logo,
    'o topo já mostra o nome e a logo novos (recarregou)');
  await card.getByRole('button', { name: 'Tirar a logo' }).click();
  await card.locator('[data-marca-nome]').fill('');
  await card.getByRole('button', { name: 'Salvar marca' }).click(); await page.waitForTimeout(800);
  const t = rpc(escritas, 'definir_marca').pop();
  ok(t && t.p_logo === '' && t.p_nome === '', 'tirar a logo e apagar o nome: manda vazio (volta ao nome do time, sem logo)');
  ok(await page.locator('[data-marca]').first().getAttribute('data-marca') === 'Samba' && await page.locator('[data-marca-logo]').count() === 0, 'sem marca: o topo volta ao nome do time e à inicial');
});

// 2) quem joga vê a marca, mas não troca
const db2 = samba('aluno'); db2.workspaces = [{ ...db2.workspaces[0], marca_nome: 'Samba Poker Team', marca_logo: PNG1 }];
await cenario('aluno: só vê a marca', db2, async (page) => {
  await page.locator('[data-marca="Samba Poker Team"]').first().waitFor({ timeout: 15000 });
  ok(await page.locator('[data-marca-logo]').count() >= 1, 'o aluno vê a logo do time no topo');
  ok(await page.getByRole('button', { name: /^Regras do time$/ }).count() === 0 && await page.locator('[data-marca-editor]').count() === 0, 'e não tem onde trocar a marca');
});

// 3) professor: entra em Regras do time? mesmo se entrar, não vê o cartão da marca (é só do admin)
const db3 = samba('prof'); db3.workspaces = [{ ...db3.workspaces[0], marca_nome: 'Samba Poker Team', marca_logo: null }];
await cenario('professor: sem cartão da marca', db3, async (page) => {
  await page.locator('[data-marca="Samba Poker Team"]').first().waitFor({ timeout: 15000 });
  ok(await page.locator('[data-marca-logo]').count() === 0, 'sem logo: o topo mostra a inicial do time');
  const regras = page.getByRole('button', { name: /^Regras do time$/ });
  if (await regras.count()) { await regras.first().click(); await page.waitForTimeout(500); }
  ok(await page.locator('[data-marca-editor]').count() === 0, 'professor não troca a marca');
});

// 4) o convite mostra a marca antes do login
await cenario('convite com a marca', dbBase({ __rpc: { ver_convite: { valido: true, time: 'Samba', marca_nome: 'Samba Poker Team', marca_logo: PNG1, unidade: 'Pandeiro', pessoa: null, motivo: null } } }),
  async (page) => {
    await page.locator('[data-convite="ok"]').waitFor({ timeout: 15000 });
    ok(/Convite pro time Samba Poker Team/.test(await page.locator('body').innerText()) && await page.locator('[data-convite-logo]').count() === 1, 'o convite mostra o nome e a logo do time');
  }, { semSessao: true, caminho: '/?convite=' + 'ab'.repeat(32) });

// 5) gestor geral: a mensalidade (US$ 5 por jogador) e a marca de um time sem ver a imagem
const db5 = samba('admin');
db5.__rpc = { ...db5.__rpc, sou_gestor_geral: true, acoes_plataforma: [{ criado_em: '2026-11-20T11:00:00Z', acao: 'marca', time_nome: 'Samba', detalhes: { nome: 'Samba', logo: 'igual' } }], definir_marca: null,
  times_da_plataforma: [
    { id: 'w1', nome: 'Samba', tipo: 'time', criado_em: '2026-11-19T00:00:00Z', assentos: 30, pessoas: 25, jogadores: 20, convidados: 0, admins: 'Gabriel', tem_dono: true, admin_pendente: false, ultimo_lancamento: D(1), marca_nome: 'Samba Poker Team', tem_logo: true },
    { id: 'w2', nome: 'Time Dois', tipo: 'time', criado_em: '2026-11-20T00:00:00Z', assentos: null, pessoas: 4, jogadores: 3, convidados: 0, admins: 'Ana', tem_dono: true, admin_pendente: false, ultimo_lancamento: null, marca_nome: null, tem_logo: false }] };
await cenario('gestor geral: mensalidade e marca', db5, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Plataforma');
  await page.locator('[data-times]').waitFor({ timeout: 8000 });
  ok(/US\$ 115\/mês/.test(await page.locator('[data-mensalidade-total]').innerText()) && /23 jogadores ativos × US\$ 5/.test(await page.locator('[data-mensalidade-total]').innerText()),
    'total: 23 jogadores × US$ 5 = US$ 115/mês');
  ok(await page.locator('[data-time-plataforma="Samba"] [data-mensalidade]').innerText() === 'US$ 100' && await page.locator('[data-time-plataforma="Time Dois"] [data-mensalidade]').innerText() === 'US$ 15', 'por time: US$ 100 e US$ 15');
  ok(/aparece como Samba Poker Team · com logo/.test(await page.locator('[data-time-plataforma="Samba"]').innerText()), 'a linha diz o nome da marca e que tem logo');
  ok(/mudou a marca · Samba/.test(await page.locator('main').innerText()), 'registro: mudou a marca');
  await page.locator('[data-time-plataforma="Samba"]').getByRole('button', { name: 'Marca' }).click();
  const md = page.locator('[data-marca-modal]'); await md.waitFor({ timeout: 5000 });
  ok(await md.locator('[data-marca-sem-previa]').innerText() === 'tem logo' && await md.getByRole('button', { name: 'Tirar a logo' }).count() === 1, 'sem ver a imagem: "tem logo" e dá pra tirar');
  await md.locator('[data-marca-nome]').fill('Samba PT');
  await md.getByRole('button', { name: 'Salvar marca' }).click(); await page.waitForTimeout(800);
  const m = rpc(escritas, 'definir_marca').pop();
  ok(m && m.p_ws === 'w1' && m.p_nome === 'Samba PT' && m.p_logo === null, 'só o nome: manda o time e deixa a logo como está (null)');
  ok(await page.locator('[data-marca-modal]').count() === 0 && /Marca do Samba salva/.test(await page.locator('main').innerText()), 'fecha e avisa');
  await page.locator('[data-time-plataforma="Time Dois"]').getByRole('button', { name: 'Marca' }).click();
  ok(await page.locator('[data-marca-modal] [data-marca-sem-previa]').innerText() === 'sem logo' && await page.locator('[data-marca-modal]').getByRole('button', { name: 'Tirar a logo' }).count() === 0, 'time sem logo: "sem logo"');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
