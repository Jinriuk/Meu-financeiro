// Time (fase 1): jogador vê a conta em Meu time e pede saque com prévia; gestor aprova no Financeiro, gera link pelo convite único,
// vê a visão geral; conta individual não tem nada de time.
import { abrirApp, dbBase } from './harness.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
const EU = '00000000-0000-0000-0000-00000000aaaa';
async function cenario(nome, db, fn) {
  const { page, erros, escritas, fechar } = await abrirApp(db);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const rpc = (escritas, n) => escritas.filter(e => e.tabela === 'rpc.' + n).map(e => JSON.parse(e.corpo || '{}'));
const CONTRATO = [{ ate: 10000, jogador: 0.35 }, { ate: null, jogador: 0.40 }];
const estrutura = (extra = {}) => dbBase({
  workspaces: [{ id: 'w1', name: 'Samba', kind: 'time', plan: 'team', trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' }],
  pool_config: [{ ...dbBase().pool_config[0], player1_name: '', player2_name: '' }],
  unidade: [
    { id: 'u1', workspace_id: 'w1', mae_id: null, nome: 'Samba', rotulo: 'Time', caminho: '/u1/', arquivada: false },
    { id: 'u2', workspace_id: 'w1', mae_id: 'u1', nome: 'Base', rotulo: 'Base', caminho: '/u1/u2/', arquivada: false },
    { id: 'u3', workspace_id: 'w1', mae_id: 'u2', nome: 'Pandeiro', rotulo: 'Reta', caminho: '/u1/u2/u3/', arquivada: false },
  ],
  pessoa: [
    { id: 'p1', workspace_id: 'w1', user_id: EU, nome: 'Hero', status: 'ativo' },
    { id: 'p2', workspace_id: 'w1', user_id: null, nome: 'João', status: 'convidado' },
    { id: 'p3', workspace_id: 'w1', user_id: 'x3', nome: 'Maria', status: 'ativo' },
  ],
  vinculo: [
    { id: 'v1', pessoa_id: 'p1', unidade_id: 'u3', inicio: '2026-01-01', fim: null },
    { id: 'v2', pessoa_id: 'p2', unidade_id: 'u3', inicio: '2026-01-01', fim: null },
    { id: 'v3', pessoa_id: 'p3', unidade_id: 'u3', inicio: '2026-01-01', fim: null },
  ],
  acesso: [], convite: [], saque: [], contrato: [{ id: 'c1', workspace_id: 'w1', unidade_id: 'u1', pessoa_id: null, faixas: CONTRATO, inicio: '2026-01-01', criado_em: '2026-01-01T00:00:00Z' }],
  ...extra,
});
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(400); };
const abrirTime = async (page) => { await aba(page, 'Banca'); await page.getByText('Seu dinheiro no time').waitFor({ timeout: 10000 }); };

// 1) jogador: vê MU, contrato e pede saque com a prévia do servidor
await cenario('jogador', estrutura({ __rpc: {
  situacao_jogador: { mu: 310, lifetime: 200, contrato: CONTRATO },
  salas_jogador: { salas: [{ chave: 'gg', sala: 'GG Poker', saldo: 425 }, { chave: 'ps', sala: 'PokerStars', saldo: 200 }], total: 625, banca: 625, sem_sala: 0 },
  simular_saque: { parte_jogador: 57.75, parte_time: 107.25, total_time: 417.25, devolucao: 310, banca_depois: 150, mu_depois: 0 },
  solicitar_saque: 'novo-saque' } }), async (page, escritas) => {
  await abrirTime(page);
  const t = await page.locator('body').innerText();
  ok(/Seu dinheiro no time/.test(t) && /\$\s?310[.,]00/.test(await page.locator('[data-mu]').innerText()), 'mostra o MU');
  ok(/35% pro jogador/.test(t) && /40% pro jogador/.test(t), 'mostra o contrato');
  ok(!/Para resolver/.test(t) && await page.getByRole('button', { name: /^Financeiro$/ }).count() === 0, 'jogador não vê saques dos outros nem a aba Financeiro');
  ok(await page.locator('[data-convidar]').count() === 0 && await page.getByRole('button', { name: /^Equipe e convites$/ }).count() === 0, 'jogador não convida');
  ok(await page.locator('[data-modo]').count() === 0, 'sem chave Gestão/Meu jogo (não tem papel na gestão)');
  await page.getByRole('button', { name: 'Pedir saque' }).first().click();
  // por sala: quanto tem em cada uma agora e quanto sai; devolução de MU, o resto é cashout
  await page.getByLabel('Saldo agora em GG Poker').fill('425'); await page.getByLabel('Sacar de GG Poker').fill('300');
  await page.getByLabel('Saldo agora em PokerStars').fill('200'); await page.getByLabel('Sacar de PokerStars').fill('175');
  await page.locator('[data-saque-devolucao]').fill('310');
  await page.locator('[data-saque-previa]').waitFor({ timeout: 5000 });
  const sim = rpc(escritas, 'simular_saque').pop();
  ok(sim && sim.p_banca === 625 && sim.p_devolucao === 310 && sim.p_cashout === 165 && sim.p_pessoa === 'p1', 'prévia calculada no servidor com os valores digitados');
  ok(/57,75/.test(await page.locator('[data-saque-previa]').innerText()) && /417,25/.test(await page.locator('[data-saque-previa]').innerText()), 'prévia mostra a parte do jogador e do time');
  await page.locator('[data-saque-previa]').locator('xpath=..').getByRole('button', { name: 'Pedir saque' }).click();
  await page.waitForTimeout(500);
  const sol = rpc(escritas, 'solicitar_saque').pop();
  ok(sol && sol.p_banca === 625 && sol.p_devolucao === 310 && sol.p_cashout === 165, 'pedido enviado com os mesmos valores');
  ok(JSON.stringify(sol && sol.p_carteiras) === '[{"sala":"GG Poker","saldo":425,"valor":300},{"sala":"PokerStars","saldo":200,"valor":175}]', '…e com cada sala (saldo agora e quanto sai)');
});

// 2) admin que também joga: abre na gestão; aprova saque no Financeiro, gera link pelo convite único, contrato em Regras do time
await cenario('admin', estrutura({
  acesso: [{ id: 'a1', pessoa_id: 'p1', unidade_id: 'u1', capacidades: ['administrar'] }],
  saque: [{ id: 's1', workspace_id: 'w1', pessoa_id: 'p3', unidade_id: 'u3', status: 'solicitado', banca: 625, mu_antes: 310, devolucao: 310, cashout: 165,
    parte_jogador: 57.75, parte_time: 107.25, total_time: 417.25, banca_depois: 150, solicitado_em: '2026-10-25T20:21:00Z' }],
  __rpc: { situacao_jogador: { mu: 0, lifetime: 0, contrato: CONTRATO }, criar_convite: 'ab'.repeat(32), decidir_saque: null,
    resumo_time: [{ pessoa_id: 'p2', nome: 'João', unidade_id: 'u3', caminho: '/u1/u2/u3/', status: 'convidado', torneios: 0, investido: 0, lucro: 0, roi: null, abi: null, ultimo_lancamento: null, banca: 0, mu: 0, lucro_sacado: 0 }] } }), async (page, escritas) => {
  await page.getByRole('button', { name: /^Visão geral$/ }).first().waitFor({ timeout: 15000 });
  ok(await page.locator('[data-modo="gestao"]').count() >= 1, 'admin que também joga abre na gestão, com a chave Gestão/Meu jogo');
  await aba(page, 'Financeiro');
  const t = await page.locator('main').innerText();
  ok(/Para resolver/.test(t) && /Maria/.test(t) && /417,25/.test(t), 'vê o saque da Maria com o total do time');
  await page.locator('[data-saque="Maria"]').getByRole('button', { name: 'Aprovar' }).click();
  await page.waitForTimeout(400);
  const dec = rpc(escritas, 'decidir_saque').pop();
  ok(dec && dec.p_id === 's1' && dec.p_aprovar === true, 'aprovar chama o servidor');
  await aba(page, 'Regras do time');
  ok(/35% pro jogador/.test(await page.locator('[data-contrato]').innerText()), 'contrato em Regras do time');
  await aba(page, 'Jogadores');
  await page.locator('[data-acoes="João"]').click();
  ok(await page.getByRole('menuitem', { name: 'Link pessoal' }).count() === 1, 'jogador sem conta tem link pessoal no menu');
  await page.keyboard.press('Escape');
  ok(await page.locator('[data-acoes-modal]').count() === 0, 'Esc fecha o painel de ações');
  await aba(page, 'Equipe e convites');
  await page.locator('[data-convidar]').first().click();
  await page.locator('[data-link-aberto]').check();
  await page.locator('[data-gerar-link]').click();
  await page.locator('[data-link-convite]').waitFor({ timeout: 5000 });
  const url = await page.locator('[data-link-convite]').inputValue();
  ok(url.endsWith('/?convite=' + 'ab'.repeat(32)), 'link aberto da reta montado com o token');
  const cv = rpc(escritas, 'criar_convite').pop();
  ok(cv && cv.p_unidade === 'u3' && cv.p_pessoa === null, 'link pedido pra reta certa (a única reta)');
});

// 3) jogador importa a planilha do Samba: lê no aparelho, mostra a prévia e envia pro time conferir
await cenario('importar planilha', estrutura({ __rpc: { situacao_jogador: { mu: 0, lifetime: 0, contrato: CONTRATO, abertura: 'sem' }, enviar_planilha: 'ab1' } }), async (page, escritas) => {
  await abrirTime(page);
  await page.locator('[data-importar-planilha]').setInputFiles(new URL('../fixtures/planilha_samba_exemplo.xlsx', import.meta.url).pathname);
  await page.locator('[data-planilha-previa]').waitFor({ timeout: 5000 });
  const t = await page.locator('[data-planilha-previa]').innerText();
  ok(/200,00/.test(t) && /500,00/.test(t) && /250,00/.test(t) && /35% até 10k/.test(t) && /4 linhas/.test(t), 'prévia mostra MakeUp, Cashout, banca, contrato e grade');
  await page.getByRole('button', { name: 'Enviar pro time conferir' }).click();
  await page.waitForTimeout(500);
  const env = rpc(escritas, 'enviar_planilha').pop();
  ok(env && env.p_planilha.makeup === 200 && env.p_planilha.cashout === 500 && env.p_planilha.grade.length === 4, 'enviou a leitura completa');
});

// 4) quem aprova confere a planilha de outro jogador; jogador vê a própria grade
await cenario('conferir planilha', estrutura({
  acesso: [{ id: 'a1', pessoa_id: 'p1', unidade_id: 'u1', capacidades: ['administrar'] }],
  abertura: [
    { id: 'ab1', pessoa_id: 'p3', unidade_id: 'u3', status: 'enviada', mu: 200, cashout: 500, enviado_em: '2026-11-18T10:00:00Z', planilha: { banca: 250, lifetime: 550, contrato_texto: '35% até 10k', avisos: [] } },
    { id: 'ab2', pessoa_id: 'p1', unidade_id: 'u3', status: 'confirmada', mu: 0, cashout: 0, enviado_em: '2026-11-17T10:00:00Z', confirmado_em: '2026-11-17T12:00:00Z',
      planilha: { grade: [{ site: 'GGpoker', tipo: 'Semanal', regular: 'até $2,50', prog_ko: 'até $3,20', hyper: 'Até $2' }] } },
  ],
  __rpc: { situacao_jogador: { mu: 0, lifetime: 0, contrato: CONTRATO, abertura: 'confirmada' }, conferir_abertura: null } }), async (page, escritas) => {
  await aba(page, 'Financeiro');
  ok(await page.locator('[data-conferir="Maria"]').count() === 1, 'planilha da Maria pra conferir no Financeiro');
  await page.locator('[data-conferir="Maria"]').getByRole('button', { name: 'Conferir como está' }).click();
  await page.waitForTimeout(400);
  const c = rpc(escritas, 'conferir_abertura').pop();
  ok(c && c.p_pessoa === 'p3' && c.p_mu === 200 && c.p_cashout === 500, 'confere com os valores da planilha');
  await page.locator('[data-modo-btn="jogo"]').first().click();
  await abrirTime(page);
  ok(await page.locator('[data-abertura="confirmada"]').count() === 1, 'mostra que a própria planilha já foi conferida (Banca)');
  await aba(page, 'Meu time');
  ok(/até US\$\s3,20/.test(await page.locator('[data-grade]').innerText()), 'em Meu jogo, vê a própria grade (Meu time)');
});

// 5) gestor: visão do time por bloco (ROI ponderado, aluno parado), reloads e sininho
const recente = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
const RESUMO = [
  { pessoa_id: 'p3', nome: 'Maria', unidade_id: 'u3', unidade: 'Pandeiro', caminho: '/u1/u2/u3/', status: 'ativo', torneios: 40, investido: 100, lucro: 20, roi: 20, abi: 2.5, ultimo_lancamento: recente, banca: 300, mu: 100, lucro_sacado: 50, planilha: 'confirmada' },
  { pessoa_id: 'p4', nome: 'Ana', unidade_id: 'u3', unidade: 'Pandeiro', caminho: '/u1/u2/u3/', status: 'ativo', torneios: 10, investido: 100, lucro: -100, roi: -100, abi: 10, ultimo_lancamento: '2026-11-01', banca: 50, mu: 150, lucro_sacado: 0, planilha: 'sem' },
  { pessoa_id: 'p2', nome: 'João', unidade_id: 'u3', unidade: 'Pandeiro', caminho: '/u1/u2/u3/', status: 'convidado', torneios: 0, investido: 0, lucro: 0, roi: null, abi: null, ultimo_lancamento: null, banca: 0, mu: 0, lucro_sacado: 0, planilha: 'sem' },
];
await cenario('visão, reload e sininho', estrutura({
  acesso: [{ id: 'a1', pessoa_id: 'p1', unidade_id: 'u1', capacidades: ['administrar'] }],
  reload: [{ id: 'r1', pessoa_id: 'p3', unidade_id: 'u3', valor: 100, sala: 'GG', motivo: 'quebrei', status: 'solicitado', solicitado_em: '2026-11-18T10:00:00Z' },
           { id: 'r2', pessoa_id: 'p2', unidade_id: 'u3', valor: 50, sala: null, motivo: null, status: 'aprovado', solicitado_em: '2026-11-17T10:00:00Z' }],
  aviso: [{ id: 'av1', tipo: 'reload', titulo: 'Maria pediu reload de US$ 100,00', texto: 'GG · quebrei', criado_em: '2026-11-18T10:00:00Z', lido_em: null },
          { id: 'av2', tipo: 'entrada', titulo: 'João entrou no time', texto: null, criado_em: '2026-11-17T10:00:00Z', lido_em: '2026-11-17T11:00:00Z' }],
  __rpc: { situacao_jogador: { mu: 0, lifetime: 0, contrato: CONTRATO, abertura: 'confirmada' }, resumo_time: RESUMO } }), async (page, escritas) => {
  await page.locator('[data-sininho-novos]').waitFor({ timeout: 15000 });
  ok((await page.locator('[data-sininho-novos]').innerText()).trim() === '1', 'sininho mostra 1 aviso novo');
  await page.locator('[data-sininho]').click();
  await page.waitForTimeout(400);
  ok(await page.locator('[data-avisos] [data-aviso]').count() === 2, 'abre a lista com os 2 avisos');
  ok(rpc(escritas, 'marcar_avisos_lidos').length === 1 && await page.locator('[data-sininho-novos]').count() === 0, 'abrir marca como lido e zera o contador');
  await page.locator('[data-aviso="entrada"]').getByRole('button', { name: 'Apagar aviso' }).click();
  await page.waitForTimeout(400);
  ok(await page.locator('[data-avisos] [data-aviso]').count() === 1 && rpc(escritas, 'apagar_aviso').pop()?.p_id === 'av2', 'X apaga só aquele aviso');
  await page.getByRole('button', { name: 'Limpar tudo' }).click();
  await page.waitForTimeout(400);
  ok(rpc(escritas, 'apagar_avisos').length === 1 && /Nenhum aviso/.test(await page.locator('[data-avisos]').innerText()), 'limpar tudo');
  await page.locator('[data-sininho]').click();
  await aba(page, 'Visão geral');
  await page.locator('[data-por-reta]').waitFor({ timeout: 5000 });
  const cel = (await page.locator('[data-reta="Pandeiro"] td').allInnerTexts()).map(x => x.trim());
  ok(cel[1] === '2' && cel[2] === '50' && /^−40,0%$/.test(cel[4]) && /−US\$\s80,00/.test(cel[5]), 'Pandeiro: 2 alunos (o convidado não conta), 50 torneios, ROI pelo total investido -40% (não a média de 20% e -100%), resultado −80: ' + cel.join(' | '));
  ok(/1 sem lançar/.test(await page.locator('[data-kpis]').innerText()), 'conta quem está sem lançar há 7+ dias');
  await page.locator('[data-reta="Pandeiro"]').click();
  await page.locator('[data-jogadores]').waitFor({ timeout: 5000 });
  ok(/parado há \d+ dias/.test(await page.locator('[data-jogador="Ana"]').innerText()), 'clicar na reta abre os jogadores dela; a Ana aparece parada');
  ok(/MK −US\$\s100,00/.test(await page.locator('[data-jogador="Ana"]').innerText()) && /\+US\$\s200,00/.test(await page.locator('[data-jogador="Maria"]').innerText()), 'make-up por jogador com sinal: Ana em MK −100, Maria +200');
  await aba(page, 'Financeiro');
  await page.locator('[data-reload="Maria"]').getByRole('button', { name: 'Aprovar' }).click();
  await page.waitForTimeout(300);
  ok(rpc(escritas, 'decidir_reload').pop()?.p_id === 'r1', 'aprovar reload chama o servidor');
  await page.locator('[data-reload="João"]').getByRole('button', { name: 'Confirmar envio' }).click();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.waitForTimeout(300);
  const env = rpc(escritas, 'confirmar_envio_reload').pop();
  ok(env && env.p_id === 'r2' && env.p_valor === 50, 'confirmar envio com o valor pedido');
});

// 6) aluno pede reload
await cenario('aluno pede reload', estrutura({ __rpc: { situacao_jogador: { mu: 0, lifetime: 0, contrato: CONTRATO, abertura: 'confirmada' }, pedir_reload: 'r9' } }), async (page, escritas) => {
  await abrirTime(page);
  ok(await page.getByRole('button', { name: /^Visão geral$/ }).count() === 0, 'aluno não vê a visão do time');
  await page.locator('[data-pedir-reload]').click();
  const c = page.locator('input');
  await page.getByPlaceholder('ex.: 100').fill('100'); await page.getByPlaceholder('ex.: GG').fill('GG');
  await page.getByRole('button', { name: 'Pedir reload' }).last().click();
  await page.waitForTimeout(400);
  const r = rpc(escritas, 'pedir_reload').pop();
  ok(r && r.p_valor === 100 && r.p_sala === 'GG', 'pedido de reload enviado');
});

// 3) sem estrutura (solo/pool antigo): sem aba Time
await cenario('sem estrutura', dbBase(), async (page) => {
  await page.getByRole('button', { name: /^Ajustes$/ }).first().waitFor({ timeout: 15000 });
  ok(await page.getByRole('button', { name: /^(Time|Meu time|Visão geral)$/ }).count() === 0, 'conta individual: nada de time');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
