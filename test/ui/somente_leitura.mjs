// Só o aluno mexe na própria conta (pedido do dono, 21/11): admin, professor e financeiro abrem o painel do aluno e
// VEEM tudo, mas não há botão de lançar, editar, excluir, importar mãos nem mexer na banca; nada é gravado. O próprio
// aluno continua editando a conta dele.
import { abrirApp } from './harness.mjs';
import { samba, D } from './fixture_time.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
async function cenario(nome, db, fn) {
  const { page, erros, escritas, fechar } = await abrirApp(db);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(400); };
const gravacoes = escritas => escritas.filter(e => !e.tabela.startsWith('rpc.') && !e.tabela.startsWith('auth.') && e.metodo !== 'GET');
const abreTodos = async page => { for (const b of await page.getByRole('button', { name: /^\d\d\/\d\d .*torneio/ }).all()) await b.click({ timeout: 4000 }); await page.waitForTimeout(300); };
const comBanca = papel => samba(papel, { bankroll_ledger: [{ id: 'l1', workspace_id: 'w1', entry_date: D(3), wallet: 'GG Poker', entrada: 20, saida: 0, player: 'Caio R.', pessoa_id: 'p2', unidade_id: 'u2', observacao: 'rakeback' }] });

for (const [papel, rot] of [['admin', 'admin'], ['prof', 'professor'], ['fin', 'financeiro']]) {
  await cenario(`${rot} abre o painel do Caio`, comBanca(papel), async (page, escritas) => {
    await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
    await aba(page, 'Jogadores');
    const nome = page.locator('[data-jogador="Caio R."]').getByRole('button', { name: 'Caio R.', exact: true });
    if (!await nome.count()) { ok(true, `${rot}: não abre o painel do Caio (o papel não vê o aluno)`); return; }
    await nome.click();
    await page.locator('[data-aluno-aberto]').waitFor({ timeout: 8000 });
    ok(/só leitura: você vê tudo, só Caio R\. lança e muda/.test(await page.locator('[data-aluno-aberto]').innerText()), `${rot}: a faixa diz que é só leitura e que só o Caio lança e muda`);
    if (await page.getByRole('button', { name: /^Torneios$/ }).count()) {
      await aba(page, 'Torneios'); await abreTodos(page);
      ok(await page.getByRole('button', { name: 'Editar' }).count() === 0 && await page.getByRole('button', { name: 'Remover' }).count() === 0,
        `${rot}: nos torneios do Caio, sem editar nem excluir`);
      ok(await page.getByRole('button', { name: /Adicionar|Lançar/ }).count() === 0, `${rot}: sem lançar torneio pro Caio`);
      for (const sub of ['Diário', 'Semana', 'Mês']) {
        const t = page.getByRole('tab', { name: sub, exact: true }); if (await t.count()) { await t.click(); await page.waitForTimeout(250); await abreTodos(page); }
      }
      ok(await page.getByRole('button', { name: 'Editar' }).count() === 0 && await page.getByRole('button', { name: 'Remover' }).count() === 0, `${rot}: diário, semana e mês também sem editar`);
    }
    if (await page.getByRole('button', { name: /^Stats$/ }).count()) {
      await aba(page, 'Stats');
      ok(!/Importar hand histories/.test(await page.locator('main').innerText()) && await page.locator('#hhfile').count() === 0, `${rot}: em Stats, sem importar mãos pro Caio`);
    }
    if (await page.getByRole('button', { name: /^Banca$/ }).count()) {
      await aba(page, 'Banca');
      const t = await page.locator('main').innerText();
      ok(/rakeback/.test(t), `${rot}: vê o movimento da banca do Caio`);
      ok(await page.getByRole('button', { name: 'Editar' }).count() === 0 && await page.getByRole('button', { name: 'Remover' }).count() === 0
        && await page.getByRole('button', { name: /Adicionar|Novo/ }).count() === 0 && await page.locator('[data-sala]:not([disabled])').count() === 0,
        `${rot}: na banca do Caio, sem lançar, editar, excluir nem mudar sala`);
    }
    ok(gravacoes(escritas).length === 0, `${rot}: nada foi gravado na conta do Caio: ` + JSON.stringify(gravacoes(escritas)).slice(0, 120));
  });
}

// o próprio aluno continua mexendo na conta dele
await cenario('aluno na própria conta', samba('aluno'), async (page) => {
  await aba(page, 'Torneios'); await abreTodos(page);
  ok(await page.getByRole('button', { name: 'Editar' }).count() > 0 && await page.getByRole('button', { name: 'Remover' }).count() > 0, 'o aluno edita e exclui os próprios torneios');
  ok(await page.getByRole('button', { name: /Adicionar/ }).count() > 0, '…e lança torneio');
  await aba(page, 'Stats');
  ok(/Importar hand histories/.test(await page.locator('main').innerText()), '…e importa as próprias mãos');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
