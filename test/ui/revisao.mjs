// Revisão por conta (Samba Demo, 21/11): o que a revisão apontou e foi corrigido, conferido na tela.
//   · financeiro não vê desempenho falso (A-044/A-045/A-048); "ver quais" leva pra lista filtrada (A-009);
//   · renomear só convidado (A-006); mover de reta começa na atual (A-011); stop batido vira pendência (A-060);
//   · sininho: sem repetido, "1 aviso novo", Esc fecha e o aviso leva à tela (A-021);
//   · Início do jogador: pedido e planilha em aberto (A-014/A-051/A-052/A-055); stop pela banca do começo da semana (A-050);
//   · Banca: o dinheiro do time (A-058) e o histórico de capital e reload (A-018/A-062/A-069).
import { abrirApp } from './harness.mjs';
import { samba, D } from './fixture_time.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
async function cenario(nome, db, fn, opts) {
  const { page, erros, escritas, fechar } = await abrirApp(db, opts);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(500); };
const corpo = async page => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

// 1) financeiro: o servidor não manda desempenho (torneios nulos): nada de "todos lançando" nem "0 fora da grade"
const dbFin = samba('fin');
dbFin.__rpc = { ...dbFin.__rpc, resumo_time: dbFin.__rpc.resumo_time.map(l => ({ ...l, torneios: null, investido: null, lucro: null, roi: null, abi: null, ultimo_lancamento: null })) };
await cenario('financeiro sem desempenho', dbFin, async page => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  const t = await corpo(page);
  ok(!/todos lançando/.test(t) && await page.locator('[data-kpi-fora]').count() === 0, 'Visão geral: sem "todos lançando" e sem o cartão de fora da grade (A-044)');
  ok(/Banca dos alunos/i.test(t) && /Em MK/i.test(t), '…e com os cartões de dinheiro, que o papel vê');
  ok(!/Fora da grade/.test(await page.locator('[data-por-reta]').innerText()), 'Por reta sem a coluna de fora da grade');
  await aba(page, 'Jogadores');
  ok(await page.locator('[data-filtro-sit="fora"]').count() === 0 && await page.locator('[data-filtro-sit="parados"]').count() === 0, 'Jogadores: sem os filtros de desempenho (A-045)');
  ok(!/nunca lançou/.test(await corpo(page)) && !/GRADE 7 DIAS/i.test(await page.locator('[data-jogadores]').innerText()), '…e sem "nunca lançou" nem a coluna de grade');
  await aba(page, 'Grades');
  ok(!/Conferência dos últimos 7 dias/.test(await corpo(page)), 'Grades: sem a conferência (o papel não vê torneio) (A-048)');
});

// 2) admin: ver quais, renomear, mover de reta, pendência de stop
const dbAdm = samba('admin');
dbAdm.__rpc = { ...dbAdm.__rpc, stop_semana_do_time: [{ pessoa_id: 'p2', resultado: -80, bateu: true }], renomear_pessoa: null };
await cenario('admin: gestão', dbAdm, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  ok(await page.locator('[data-pendencia^="Bateram o stop loss"]').count() === 1 && /Caio R\./.test(await page.locator('[data-pendencia^="Bateram o stop loss"]').innerText()),
    'quem bateu o stop da semana vira pendência, com o nome (A-060)');
  await page.locator('[data-kpi-fora]').click(); await page.waitForTimeout(600);
  ok(await page.locator('[data-filtro-sit="fora"][aria-pressed="true"]').count() === 1 && await page.locator('[data-jogador]').count() >= 1
    && await page.locator('[data-jogador="Caio R."]').count() === 0, '"ver quais" abre Jogadores filtrado em fora da grade (A-009)');
  await page.locator('[data-filtro-sit="fora"]').click(); await page.waitForTimeout(300);
  await page.locator('[data-acoes="Bruno T."]').click();
  ok(await page.locator('[data-acoes-modal]').getByRole('menuitem', { name: 'Renomear' }).count() === 0, 'quem tem conta não aparece pra renomear (o nome é dele) (A-006)');
  await page.locator('[data-acoes-modal]').getByRole('menuitem', { name: 'Mover de reta (promover)' }).click(); await page.waitForTimeout(300);
  const sel = page.locator('select').last();
  ok(/\(atual\)/.test(await sel.inputValue()) && await page.getByRole('button', { name: 'Salvar', exact: true }).isDisabled(), 'mover de reta começa na reta atual e o Salvar fica desligado (A-011)');
  const outra = (await sel.locator('option').allInnerTexts()).find(o => !/\(atual\)/.test(o)); await sel.selectOption({ label: outra });
  ok(!(await page.getByRole('button', { name: 'Salvar', exact: true }).isDisabled()), '…e liga quando escolhe outra');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.getByRole('button', { name: 'Salvar', exact: true }).count() === 0, 'Esc fecha a janela');
  await page.locator('[data-acoes="Iza N."]').click();
  ok(await page.locator('[data-acoes-modal]').getByRole('menuitem', { name: 'Renomear' }).count() === 1, 'convidada (sem conta) ainda pode ser renomeada');
  await page.keyboard.press('Escape');
});

// 3) sininho: repetido vira um só, texto certo, Esc fecha, aviso leva à tela
const dbSino = samba('admin', { aviso: [
  { id: 'av1', tipo: 'planilha', titulo: 'Enzo P. enviou a planilha pra conferir', texto: 'MU US$ 700,00', ref_id: 'a1', criado_em: D(1) + 'T10:00:00Z', lido_em: null },
  { id: 'av2', tipo: 'planilha', titulo: 'Enzo P. enviou a planilha pra conferir', texto: 'MU US$ 700,00', ref_id: 'a1', criado_em: D(1) + 'T09:00:00Z', lido_em: null }] });
await cenario('sininho', dbSino, async page => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  const lbl = await page.locator('[data-sininho]').getAttribute('aria-label');
  ok(/aviso novo|avisos novos/.test(lbl) && !/novos\)/.test(lbl), 'o botão diz "N aviso(s) novo(s)" no singular/plural certo: ' + lbl);
  await page.locator('[data-sininho]').click(); await page.waitForTimeout(300);
  ok(await page.locator('[data-avisos] [data-aviso="planilha"]').count() === 1, 'os dois avisos iguais viram um só (A-021)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.locator('[data-avisos]').count() === 0, 'Esc fecha o sininho');
  await page.locator('[data-sininho]').click(); await page.locator('[data-aviso-ir]').first().click(); await page.waitForTimeout(600);
  ok(/Financeiro/.test(await page.locator('main h2').first().innerText()), 'o aviso da planilha leva ao Financeiro');
});

// 4) jogador: Início com o que está em aberto, stop pela banca do começo da semana, Banca com o dinheiro do time
const dbAluno = samba('aluno', {
  aporte: [{ id: 'ap1', pessoa_id: 'p0', valor: 100, data: D(5), sala: 'GG Poker', criado_em: D(5) + 'T10:00:00Z' }, { id: 'ap2', pessoa_id: 'p0', valor: 200, data: D(3), sala: 'PokerStars', criado_em: D(3) + 'T10:00:00Z' }],
  reload: [{ id: 'r2', pessoa_id: 'p0', unidade_id: 'u2', status: 'enviado', valor: 200, sala: 'PokerStars', enviado_valor: 200, enviado_em: D(3) + 'T10:00:00Z', aporte_id: 'ap2', solicitado_em: D(4) + 'T10:00:00Z' }] });
dbAluno.__rpc = { ...dbAluno.__rpc, salas_jogador: { salas: [{ chave: 'gg', sala: 'GG Poker', saldo: 253.5 }, { chave: 'ps', sala: 'PokerStars', saldo: 100 }], total: 353.5, banca: 353.5, sem_sala: 0 },
  situacao_jogador: { ...dbAluno.__rpc.situacao_jogador, banca: 353.5, banca_inicio_semana: 1000,
  saque_aberto: { status: 'solicitado', total_time: 265, parte_jogador: 35, cashout: 100, devolucao: 200, solicitado_em: D(0) + 'T10:00:00Z' } } };
await cenario('jogador: Início e Banca', dbAluno, async page => {
  await page.locator('[data-faixas-inicio]').waitFor({ timeout: 15000 });
  ok(/Saque aguardando aprovação/.test(await page.locator('[data-faixa="saque"]').innerText()) && /o time recebe US\$\s265,00/.test(await page.locator('[data-faixa="saque"]').innerText()),
    'Início mostra o saque aguardando aprovação, com o valor (A-014/A-055)');
  ok(/saque em andamento/.test(await page.locator('[data-painel-mk]').innerText()), '…e o MK não diz "pode pedir saque" com um saque aberto');
  const sem = page.locator('[data-stop-semana]');
  if (await sem.count()) ok(/banca no começo da semana: US\$\s1\.000,00/.test(await sem.innerText()), 'stop semanal pela banca do começo da semana (A-050)');
  else { await page.getByText('Stop loss').first().click(); await page.waitForTimeout(300);
    ok(/banca no começo da semana: US\$\s1\.000,00/.test(await page.locator('[data-stop-semana]').innerText()), 'stop semanal pela banca do começo da semana (A-050)'); }
  await aba(page, 'Banca');
  await page.locator('[data-meu-dinheiro]').waitFor({ timeout: 10000 });
  ok(await page.getByRole('button', { name: 'Pedir saque' }).count() === 1 && await page.locator('[data-minhas-salas]').count() === 1, 'Banca tem o dinheiro do time: pedir saque e salas (A-058)');
  const h = await page.locator('[data-historico-time]').innerText();
  ok(/Capital do time/.test(h) && /Reload/.test(h) && /\+US\$\s100,00/.test(h) && /\+US\$\s200,00/.test(h), 'histórico com o capital (+100) e o reload (+200), só leitura (A-018/A-062/A-069)');
  ok(/Saldo de entrada/.test(await page.locator('[data-salas-time]').innerText()), 'o bloco do saldo inicial se chama "Saldo de entrada"');
  await aba(page, 'Meu time');
  ok(await page.locator('[data-minha-reta]').count() === 1 && await page.getByRole('button', { name: 'Pedir saque' }).count() === 0, 'Meu time fica com a reta (regras e grade), sem as ações de dinheiro');
});

// 4b) o nome de quem tem conta é dele: o jogador muda o próprio nome em Meu time (A-006)
const dbNome = samba('aluno'); dbNome.__rpc = { ...dbNome.__rpc, renomear_pessoa: null };
await cenario('jogador muda o próprio nome', dbNome, async (page, escritas) => {
  await aba(page, 'Meu time');
  await page.locator('[data-meu-nome]').getByRole('button', { name: 'Mudar' }).click();
  await page.keyboard.press('Control+A'); await page.keyboard.type('Bruno Tavares');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click(); await page.waitForTimeout(600);
  const r = escritas.filter(e => e.tabela === 'rpc.renomear_pessoa').map(e => JSON.parse(e.corpo || '{}')).pop();
  ok(r && r.p_alvo === 'p0' && r.p_nome === 'Bruno Tavares', 'renomeia a própria pessoa');
});

// 5) jogador sem planilha: um caminho só, sem chamar de MK
const dbSem = samba('aluno');
dbSem.__rpc = { ...dbSem.__rpc, situacao_jogador: { ...dbSem.__rpc.situacao_jogador, abertura: 'sem', banca: -10.62 } };
await cenario('jogador sem planilha', dbSem, async page => {
  await page.locator('[data-faixa="planilha"]').waitFor({ timeout: 15000 });
  ok(/Mande a planilha de abertura/.test(await page.locator('[data-faixa="planilha"]').innerText()), 'Início: "Mande a planilha de abertura" (A-051)');
  ok(!/saque só depois de sair do MK/.test(await corpo(page)) && /Sem planilha de abertura/.test(await page.locator('[data-painel-mk]').innerText()), '…sem chamar de MK');
  await page.locator('[data-faixa="planilha"]').getByRole('button', { name: 'Mandar agora' }).click(); await page.waitForTimeout(800);
  ok(await page.locator('[data-abertura-manual]').count() === 1, '"Mandar agora" leva pra Banca, onde está a planilha');
});

// 6) celular: tabelas viram cartões e a barra tem a Banca
await cenario('celular', samba('admin'), async page => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  ok(await page.locator('[data-por-reta-cartoes]').count() === 1, 'Por reta em cartões no celular (A-034)');
  await page.locator('nav.bottomnav').getByRole('button', { name: 'Jogadores' }).click(); await page.waitForTimeout(500);
  ok(await page.locator('[data-jogadores-cartoes]').count() === 1 && await page.locator('table[data-jogadores]').count() === 0, 'Jogadores em cartões, sem rolar pro lado');
}, { largura: 390, altura: 844 });
await cenario('celular: jogador', samba('aluno'), async page => {
  await page.waitForTimeout(2500);
  const barra = await page.locator('nav.bottomnav').innerText();
  ok(/Banca/.test(barra) && !/Stats/.test(barra), 'barra de baixo do jogador com a Banca no lugar de Stats (A-059): ' + barra.replace(/\s+/g, ' '));
  await page.locator('nav.bottomnav').getByRole('button', { name: 'Mais' }).click(); await page.waitForTimeout(300);
  ok(await page.locator('[data-sair-mais]').count() === 1, '"Sair" fica no Mais, não no topo (A-038)');
}, { largura: 390, altura: 844 });

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
