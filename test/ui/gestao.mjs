// Telas de gestão do time: menu por papel, visão geral, make-up por jogador, convite único, equipe e regras.
import { abrirApp } from './harness.mjs';
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
const nav = page => page.locator('aside').innerText();

// 1) admin: visão geral, make-up com sinal, filtro Em MK, convite único (jogador e professor que joga), equipe, contrato
const db = samba('admin');
db.__rpc = { ...db.__rpc, convidar_jogador: 'p-novo', criar_convite: 'cd'.repeat(32), convidar_equipe: 'p-prof', definir_papel: null, renomear_pessoa: null, definir_contrato: null };
await cenario('admin', db, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  const n = await nav(page);
  ok(/Visão geral/.test(n) && /Regras do time/.test(n) && /Minha conta/.test(n) && !/Torneios|Stats/.test(n) && await page.locator('[data-modo]').count() === 0, 'admin que não joga: só gestão, sem chave de modo');
  const k = await page.locator('[data-kpis]').innerText();
  ok(/ALUNOS ATIVOS\s*3/i.test(k) && /FORA DA GRADE · 7 DIAS\s*3 torneios/i.test(k) && !/MK/.test(k), 'números do time: 3 alunos (convidada não conta), 3 fora da grade; nada de "N em MK"');
  ok(await page.locator('[data-pendencia]').count() === 5, 'pendências: saque, reload, planilha, parado e convite');
  ok(!/MK/.test(await page.locator('[data-por-reta]').innerText()), 'tabela por reta sem coluna de MK');
  await aba(page, 'Jogadores');
  ok(/MK −US\$\s119,00/.test(await page.locator('[data-jogador="Caio R."]').innerText()) && /\+US\$\s112,00/.test(await page.locator('[data-jogador="Bruno T."]').innerText()), 'make-up por jogador com sinal (Caio em MK −119; Bruno +112)');
  await page.locator('[data-filtro-sit="mk"]').click();
  ok(await page.locator('[data-jogadores] tbody tr').count() === 1 && await page.locator('[data-jogador="Caio R."]').count() === 1, 'filtro Em MK: só o Caio');
  await page.locator('[data-filtro-sit="mk"]').click();
  // convite único: jogador com link pessoal na Cavaquinho
  await page.locator('[data-convidar]').first().click();
  const modal = page.locator('[data-convite-modal]');
  ok(/Reco-reco/.test(await modal.innerText()) && !/Base · Time de base/.test(await modal.innerText()), 'onde jogar: só as retas (a Base tem retas dentro)');
  await modal.getByRole('radio', { name: /Cavaquinho/ }).check();
  await page.locator('[data-conv-nome]').fill('Novo Aluno');
  await page.locator('[data-gerar-link]').click();
  await page.locator('[data-link-convite]').waitFor({ timeout: 5000 });
  const cj = rpc(escritas, 'convidar_jogador').pop(), cv = rpc(escritas, 'criar_convite').pop();
  ok(cj && cj.p_unidade === 'u4' && cj.p_nome === 'Novo Aluno' && cv && cv.p_pessoa === 'p-novo' && cv.p_unidade === 'u4', 'jogador: cadastra na reta e gera o link pessoal dele');
  ok((await page.locator('[data-link-convite]').inputValue()).endsWith('?convite=' + 'cd'.repeat(32)) && /wa\.me/.test(await modal.getByRole('link', { name: 'Mandar no WhatsApp' }).getAttribute('href')), 'link pronto, com botão de mandar no WhatsApp');
  await modal.getByRole('button', { name: 'Fechar' }).click();
  // professor de duas retas que também joga
  await aba(page, 'Equipe e convites');
  await page.locator('[data-convidar]').first().click();
  await page.locator('[data-quem="professor"]').click();
  ok(await page.locator('[data-link-aberto]').isDisabled(), 'link aberto só serve pra jogador');
  await page.locator('[data-onde="Reco-reco"] input').check(); await page.locator('[data-onde="Cavaquinho"] input').check();
  await page.locator('[data-tambem-joga]').check();
  await page.locator('[data-conv-nome]').fill('Prof. Marcos');
  await page.locator('[data-gerar-link]').click();
  await page.locator('[data-link-convite]').waitFor({ timeout: 5000 });
  const ce = rpc(escritas, 'convidar_equipe').pop(), cv2 = rpc(escritas, 'criar_convite').pop();
  ok(ce && ce.p_nome === 'Prof. Marcos' && JSON.stringify(ce.p_unidades) === '["u2","u4"]' && ce.p_caps.join(',') === 'promover,ver_desempenho,ver_financeiro' && ce.p_joga_em === 'u2'
    && cv2 && cv2.p_pessoa === 'p-prof' && cv2.p_unidade === 'u2', 'professor: duas retas, pacote de professor, também joga (Reco-reco), link pessoal');
  await page.locator('[data-convite-modal]').getByRole('button', { name: 'Fechar' }).click();
  // equipe: editar quem gere (nome + papel)
  ok(/Admin/.test(await page.locator('[data-gestor="Gabriel"]').innerText()) && /Professor/.test(await page.locator('[data-gestor="Prof. Rita"]').innerText()), 'pessoas da gestão com o papel em palavras');
  await page.locator('[data-editar-gestor="Prof. Rita"]').click();
  await page.locator('[data-ed-nome]').fill('Rita Souza');
  await page.locator('[data-pessoa-modal]').getByRole('button', { name: 'Financeiro' }).click();
  await page.locator('[data-pessoa-modal]').getByRole('button', { name: 'Salvar' }).click();
  await page.waitForTimeout(600);
  const rn = rpc(escritas, 'renomear_pessoa').pop(), dp = rpc(escritas, 'definir_papel').pop();
  ok(rn && rn.p_alvo === 'p9' && rn.p_nome === 'Rita Souza' && dp && dp.p_alvo === 'p9' && dp.p_caps.join(',') === 'aprovar_saques,ver_financeiro' && JSON.stringify(dp.p_unidades) === '["u4"]', 'editar: renomeia e troca o papel mantendo onde cuida');
  // regras: contrato num formulário
  await aba(page, 'Regras do time');
  await page.locator('[data-editar-contrato]').click();
  await page.locator('[data-ct-a]').fill('30'); await page.locator('[data-ct-lim]').fill('5000'); await page.locator('[data-ct-b]').fill('45');
  await page.getByRole('button', { name: 'Salvar contrato' }).click();
  await page.waitForTimeout(500);
  const ct = rpc(escritas, 'definir_contrato').pop();
  ok(ct && ct.p_unidade === 'u0' && JSON.stringify(ct.p_faixas) === '[{"ate":5000,"jogador":0.3},{"ate":null,"jogador":0.45}]', 'contrato do time: 30% até 5 mil, 45% depois');
});

// 2) financeiro: menu sem estrutura nem regras; profit somado e a receber; saque com a banca do sistema; data da planilha
const dbFin = samba('fin');
dbFin.saque = dbFin.saque.map(q => q.id === 's1' ? { ...q, banca_sistema: 380 } : q);
await cenario('financeiro', dbFin, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  const n = await nav(page);
  ok(/Financeiro/.test(n) && /Visão geral/.test(n) && !/Equipe e convites|Regras do time/.test(n), 'financeiro do time inteiro: Visão geral e Financeiro, sem Equipe nem Regras');
  await aba(page, 'Financeiro');
  const t = await page.locator('main').innerText();
  ok(/US\$\s1\.650,00/.test(t) && /\+US\$\s350,00/.test(t), 'banca somada e profit sem contar a convidada');
  ok(await page.locator('[data-dinheiro-de="Iza N."]').count() === 0, 'convidada sem dinheiro no time não aparece na tabela');
  ok(/\+US\$\s10\.597,00\s*sacado US\$\s10\.240,00/.test(await page.locator('[data-lifetime-de="Enzo P."]').innerText()), 'lifetime como na planilha: já sacado 10.240 + profit 357 = 10.597');
  const sq = await page.locator('[data-saque="Bruno T."]').innerText();
  ok(/Banca:\s*informada US\$\s412,00 · no sistema US\$\s380,00/.test(sq) && /US\$\s32,00 acima da do sistema/.test(sq), 'saque mostra a banca digitada e a do sistema, e avisa a diferença');
  const corte = page.locator('[data-corte="Enzo P."]');
  ok(await corte.inputValue() === D(1), 'conferência: a data dos saldos começa no dia do envio (planilha sem "atualizado em")');
  await corte.fill(D(3));
  await page.locator('[data-conferir="Enzo P."]').getByRole('button', { name: 'Conferir como está' }).click();
  await page.waitForTimeout(500);
  const cf = rpc(escritas, 'conferir_abertura').pop();
  ok(cf && cf.p_pessoa === 'p3' && cf.p_corte === D(3) && cf.p_mu === 700, 'confere mandando a data escolhida (o que é até esse dia já está nos saldos)');
  await aba(page, 'Jogadores');
  ok(await page.locator('[data-jogador="Caio R."]').getByRole('button', { name: 'Caio R.', exact: true }).count() === 0, 'financeiro não abre o painel do aluno (é tela de desempenho; a banca dele está na lista)');
  await page.locator('[data-acoes="Caio R."]').click();
  ok(await page.getByRole('menuitem', { name: 'Ver painel do aluno' }).count() === 0, '…nem pelo menu ⋯');
});

// 2b) planilha com saldos de antes da entrada: a data mínima é a da planilha e a tela explica o que passa a ser do time
const dbAnt = samba('fin');
dbAnt.abertura = dbAnt.abertura.map(a => a.id === 'a1' ? { ...a, planilha: { ...a.planilha, atualizado_em: D(5) } } : a);
dbAnt.vinculo = dbAnt.vinculo.map(v => v.pessoa_id === 'p3' ? { ...v, inicio: D(1) } : v);
const br = s => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
await cenario('planilha de antes da entrada', dbAnt, async (page) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Financeiro');
  const corte = page.locator('[data-corte="Enzo P."]');
  ok(await corte.inputValue() === D(5) && await corte.getAttribute('min') === D(5), 'saldos de 5 dias atrás: a data começa na da planilha e não vai antes dela');
  const av = page.locator('[data-antecipa="Enzo P."]');
  ok(await av.count() === 1 && (await av.innerText()).includes(`entrou no time em ${br(D(1))}`) && (await av.innerText()).includes(`a partir de ${br(D(4))} passa a ser do time`),
    'avisa que ele entrou ontem e que o jogado desde o dia seguinte aos saldos passa a ser do time');
  await corte.fill(D(1));
  ok(await av.count() === 0, 'com a data depois da entrada, nada muda de dono: o aviso some');
});

// 3) professor que joga: chave de modo e "Minhas retas"
await cenario('professor', samba('prof'), async (page) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  ok(/Minhas retas/.test(await nav(page)) && await page.locator('[data-modo="gestao"]').count() >= 1, 'professor abre em Minhas retas, com a chave Gestão | Meu jogo');
  await page.locator('[data-modo-btn="jogo"]').first().click();
  await page.waitForTimeout(500);
  ok(/Início/.test(await nav(page)) && /Meu time/.test(await nav(page)), 'Meu jogo: abas de jogador');
  await page.locator('[data-modo-btn="gestao"]').first().click();
  await page.waitForTimeout(500);
  ok(await page.locator('[data-kpis]').count() === 1, 'volta pra gestão');
});

// 3b) professor abre o painel do aluno: banca e MU do SERVIDOR (os mesmos da lista), não a soma do que ele consegue ler
await cenario('painel pelo professor', samba('prof'), async (page) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Jogadores');
  await page.locator('[data-jogador="Caio R."]').getByRole('button', { name: 'Caio R.', exact: true }).click();
  await page.locator('[data-aluno-aberto]').waitFor({ timeout: 8000 });
  ok(/Banca de Caio R\.\s*US\$\s181,00/.test(await page.locator('main').innerText()), 'banca do Caio = a da lista (US$ 181,00), mesmo sem as salas dele carregadas aqui');
  const mk = await page.locator('[data-painel-mk]').innerText();
  ok(/MU US\$\s300,00/.test(mk) && /MK −US\$\s119,00/.test(mk), 'MU e MK do servidor: 181 − 300 = MK −119 (o mesmo da lista)');
});

// 3c) quem vê só desempenho abre o painel sem dinheiro nenhum
const soDesempenho = samba('prof');
soDesempenho.acesso = [{ pessoa_id: 'p0', unidade_id: 'u2', capacidades: ['ver_desempenho'] }];
soDesempenho.__rpc.resumo_time = soDesempenho.__rpc.resumo_time.map(l => ({ ...l, banca: null, mu: null, lucro_sacado: null }));
soDesempenho.__rpcErro = { situacao_jogador: 'sem permissão' };
await cenario('painel só desempenho', soDesempenho, async (page) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Jogadores');
  await page.locator('[data-jogador="Caio R."]').getByRole('button', { name: 'Caio R.', exact: true }).click();
  await page.locator('[data-aluno-aberto]').waitFor({ timeout: 8000 });
  ok(await page.locator('[data-sem-dinheiro]').count() === 1 && await page.locator('[data-banca-hero]').count() === 0 && await page.locator('[data-painel-mk]').count() === 0,
    'sem permissão de ver o dinheiro: o painel diz isso em vez de mostrar uma banca montada pela metade');
  ok(await page.getByRole('button', { name: /^Banca$/ }).count() === 0, '…e não tem a aba Banca');
  ok(/TORNEIOS JOGADOS\s*1\s*1 dia de jogo/i.test(await page.locator('main').innerText()), 'o desempenho continua lá (o torneio do Caio)');
});

// 4) link de convite de gestão: a tela diz o papel
await cenario('link de professor', samba('admin', { __rpc: { ver_convite: { valido: true, time: 'Samba', unidade: 'Cavaquinho', pessoa: 'Prof. Rita', capacidades: ['promover', 'ver_desempenho', 'ver_financeiro'], joga_em: 'Cavaquinho' } } }), async (page) => {
  await page.locator('[data-convite="ok"]').waitFor({ timeout: 15000 });
  ok(/Você entra como Prof\. Rita, professor do time, e também joga na Cavaquinho/.test(await page.locator('[data-convite="ok"]').innerText()), 'mostra que entra como professor e que também joga');
}, { semSessao: true, caminho: '/?convite=' + 'ef'.repeat(32) });

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
