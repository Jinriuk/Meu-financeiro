// Regras por reta (plano 3.1/3.3): o cartão da gestão (valor, origem, mudar, herdar, contrato da reta), as regras no
// "Meu time" do aluno, a sugestão de saque com a reserva por sala e a regra da reta valendo no app de quem joga.
import { abrirApp, dbBase } from './harness.mjs';
import { samba } from './fixture_time.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
const EU = '00000000-0000-0000-0000-00000000aaaa';
async function cenario(nome, db, fn) {
  const { page, erros, escritas, fechar } = await abrirApp(db);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const rpc = (escritas, n) => escritas.filter(e => e.tabela === 'rpc.' + n).map(e => JSON.parse(e.corpo || '{}'));
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(400); };
const linha = (page, k) => page.locator(`[data-regras-reta] [data-regra="${k}"]`);
const digitar = async (page, txt) => { await page.keyboard.press('Control+A'); await page.keyboard.type(txt); await page.getByRole('button', { name: 'Salvar', exact: true }).click(); await page.waitForTimeout(500); };

// 1) admin: Cavaquinho herda a reserva da Base, tem stop próprio; muda ABI, sites, MK e contrato; volta a herdar o stop
const regras = [{ id: 'rg1', workspace_id: 'w1', unidade_id: 'ub', chave: 'reserva_por_sala', valor: 50, vigente_desde: '2026-01-01' },
  { id: 'rg2', workspace_id: 'w1', unidade_id: 'u4', chave: 'stop_dia_buyins', valor: 8, vigente_desde: '2026-01-01' }];
await cenario('admin: regras por reta', samba('admin', { regra_unidade: regras }), async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Regras do time');
  await page.locator('[data-regras-reta] [data-regra-unidade]').selectOption('u4');
  await page.waitForTimeout(300);
  const t = async k => (await linha(page, k).innerText()).replace(/\s+/g, ' ');
  ok(/US\$ 3,00 · padrão do time/.test(await t('abi_max')), 'ABI sem regra: o padrão do time (3), com a origem');
  ok(/US\$ 50,00 por sala · herdado de Base/.test(await t('reserva_por_sala')), 'reserva herdada da Base');
  ok(/8 buy-ins · desta unidade/.test(await t('stop_dia_buyins')), 'stop diário próprio da Cavaquinho');
  ok(/35%.*· do time/.test(await t('contrato')), 'contrato: o do time');
  await linha(page, 'stop_dia_buyins').getByRole('button', { name: 'Herdar' }).click(); await page.waitForTimeout(500);
  const h = rpc(escritas, 'limpar_regra').pop();
  ok(h && h.p_unidade === 'u4' && h.p_chave === 'stop_dia_buyins', '"Herdar" apaga a regra da unidade (volta a herdar)');
  ok(await linha(page, 'reserva_por_sala').getByRole('button', { name: 'Herdar' }).count() === 0, 'regra herdada não tem "Herdar" (é da Base)');
  await linha(page, 'abi_max').getByRole('button', { name: 'Mudar' }).click(); await digitar(page, '5');
  const a = rpc(escritas, 'definir_regra').pop();
  ok(a && a.p_unidade === 'u4' && a.p_chave === 'abi_max' && a.p_valor === 5, 'muda o ABI da Cavaquinho pra 5');
  await linha(page, 'sites').getByRole('button', { name: 'Mudar' }).click(); await digitar(page, 'GG Poker, ACR');
  const s = rpc(escritas, 'definir_regra').pop();
  ok(s && s.p_chave === 'sites' && JSON.stringify(s.p_valor) === '["GG Poker","ACR"]', 'sites da reta como lista');
  await linha(page, 'bloquear_promocao_com_mk').getByRole('button', { name: 'Mudar' }).click(); await page.waitForTimeout(500);
  const m = rpc(escritas, 'definir_regra').pop();
  ok(m && m.p_chave === 'bloquear_promocao_com_mk' && m.p_valor === true, 'liga "não promover com MK" só na Cavaquinho');
  await linha(page, 'contrato').getByRole('button', { name: 'Mudar' }).click();
  await page.locator('[data-contrato-modal]').waitFor({ timeout: 5000 });
  ok(/Contrato da Cavaquinho/.test(await page.locator('[data-contrato-modal]').innerText()), 'contrato da reta: o modal diz de qual reta');
  await page.getByRole('button', { name: 'Salvar contrato' }).click(); await page.waitForTimeout(500);
  ok(rpc(escritas, 'definir_contrato').pop()?.p_unidade === 'u4', '…e grava o contrato na Cavaquinho');
  await page.locator('[data-regras-reta] [data-regra-unidade]').selectOption('u0'); await page.waitForTimeout(300);
  ok(await linha(page, 'abi_max').getByRole('button', { name: 'Mudar' }).count() === 1 && await linha(page, 'reserva_por_sala').getByRole('button', { name: 'Mudar' }).count() === 1,
    'Time inteiro: um bloco só, o padrão do time (ABI, stop) e a reserva mudam aqui');
  ok(!/Regras de jogo/.test(await page.locator('main').innerText()), '…sem o bloco "Regras de jogo" repetido');
  await linha(page, 'abi_max').getByRole('button', { name: 'Mudar' }).click(); await digitar(page, '4');
  await page.getByRole('button', { name: 'Confirmar' }).click(); await page.waitForTimeout(500);
  const cfg = escritas.filter(e => e.tabela === 'pool_config' && e.metodo !== 'GET').pop();
  ok(cfg && /"abi_max_player1":4/.test(cfg.corpo || ''), 'ABI do Time inteiro grava o padrão do time (a configuração): ' + JSON.stringify(cfg || {}).slice(0, 120));
  ok(/desligado · padrão do time/.test(await t('stop_dia_buyins')) && /desligado · padrão do time/.test(await t('stop_semana_pct')),
    'Time inteiro: stop loss desligado por padrão (o time segue a grade)');
  await linha(page, 'stop_dia_buyins').getByRole('button', { name: 'Mudar' }).click(); await digitar(page, '6');
  const sd = rpc(escritas, 'definir_regra').pop();
  ok(sd && sd.p_unidade === 'u0' && sd.p_chave === 'stop_dia_buyins' && sd.p_valor === 6, 'ligar o stop do time inteiro grava uma regra do time (não a configuração)');
});

// 2) aluno: as regras da reta dele no "Meu time" e a sugestão de saque com a reserva
const dbAluno = samba('aluno', { regra_unidade: [{ id: 'rg3', workspace_id: 'w1', unidade_id: 'u2', chave: 'abi_max', valor: 2, vigente_desde: '2026-01-01' }, regras[0]] });
dbAluno.__rpc = { ...dbAluno.__rpc, salas_jogador: { salas: [{ chave: 'gg', sala: 'GG Poker', saldo: 250 }, { chave: 'ps', sala: 'PokerStars', saldo: 150 }], total: 400, banca: 400, sem_sala: 0 },
  sugerir_saque: { banca: 400, mu: 200, em_mk: false, reserva_por_sala: 50, salas: 2, reserva_total: 100, devolucao: 200, cashout: 100, banca_depois: 100, por_sala: true,
    de_onde: [{ sala: 'GG Poker', saldo: 250, sacar: 200 }, { sala: 'PokerStars', saldo: 150, sacar: 100 }] },
  simular_saque: { parte_jogador: 35, total_time: 265, devolucao: 200, parte_time: 65, banca_depois: 100, mu_depois: 0 } };
await cenario('aluno: regras da reta e sugestão de saque', dbAluno, async (page, escritas) => {
  await aba(page, 'Meu time');
  await page.locator('[data-secao-time="meu"]').waitFor({ timeout: 15000 });
  ok(await page.locator('[data-minhas-regras]').count() === 0, 'Meu time sem o bloco de regras (a reserva aparece na hora do saque)');
  await aba(page, 'Banca');   // o dinheiro (saque, reload, salas) fica na Banca
  await page.getByRole('button', { name: 'Pedir saque' }).click();
  const sg = page.locator('[data-saque-sugestao]'); await sg.waitFor({ timeout: 5000 });
  ok(/devolver US\$\s200,00 de MU e sacar US\$\s100,00 \(banca depois US\$\s100,00\)/.test(await sg.innerText())
    && /GG Poker: sai US\$\s200,00, fica US\$\s50,00/.test(await sg.innerText()) && /PokerStars: sai US\$\s100,00, fica US\$\s50,00/.test(await sg.innerText()),
    'sugestão do servidor: devolve o MU e saca, dizendo por sala quanto sai e quanto fica');
  await sg.getByRole('button', { name: 'Usar sugestão' }).click(); await page.waitForTimeout(800);
  const s = rpc(escritas, 'simular_saque').pop();
  ok(s && s.p_banca === 400 && s.p_devolucao === 200 && s.p_cashout === 100, '"Usar sugestão" preenche cada sala (saldo do sistema e quanto sai) e simula o saque');
});

// 3) a regra da reta vale no app de quem joga: ABI 5 da reta (o time diz 3) e stop diário de 2 buy-ins (o time diz 10)
const tour = (id, buyin, d) => ({ id, workspace_id: 'w1', entry_date: d, player: 'Hero', site: 'GG Poker', tournament_name: 'Daily ' + buyin, modality: 'MTT', buyin, prize: 0,
  reentries: 0, field_size: 100, bounty: 0, currency: 'USD', created_at: d + 'T10:00:00Z', pessoa_id: 'p1', unidade_id: 'u2' });
const dbJogo = dbBase({
  workspaces: [{ id: 'w1', name: 'Samba', kind: 'time', plan: 'team', trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' }],
  pool_config: [{ ...dbBase().pool_config[0], player1_name: '', player2_name: '', abi_max: 3, abi_max_player1: 3, stoploss_daily_buyins: 10 }],
  unidade: [{ id: 'u1', workspace_id: 'w1', mae_id: null, nome: 'Samba', caminho: '/u1/', arquivada: false }, { id: 'u2', workspace_id: 'w1', mae_id: 'u1', nome: 'Reta 2', caminho: '/u1/u2/', arquivada: false }],
  pessoa: [{ id: 'p1', workspace_id: 'w1', user_id: EU, nome: 'Hero', status: 'ativo' }],
  vinculo: [{ pessoa_id: 'p1', unidade_id: 'u2', fim: null }], acesso: [],
  regra_unidade: [{ id: 'rg4', workspace_id: 'w1', unidade_id: 'u2', chave: 'abi_max', valor: 5, vigente_desde: '2026-01-01' },
    { id: 'rg5', workspace_id: 'w1', unidade_id: 'u2', chave: 'stop_dia_buyins', valor: 2, vigente_desde: '2026-01-01' }],
  tournaments: [tour('t1', 4, '2026-11-17'), tour('t2', 6, '2026-11-16')],
});
await cenario('jogador: a regra da reta vale', dbJogo, async (page) => {
  await aba(page, 'Torneios');
  for (const b of await page.getByRole('button', { name: /^\d\d\/\d\d .*torneio/ }).all()) await b.click({ timeout: 4000 });
  await page.waitForTimeout(300);
  const fora = page.locator('[data-selo-grade="fora"]');
  ok(await fora.count() === 1 && /buy-in US\$\s6,00 · teto US\$\s5,00/.test(await fora.first().innerText()), 'o $4 passa (teto 5 da reta, não 3 do time) e o $6 fica fora com o teto da reta');
  await aba(page, 'Início');
  const sl = page.getByRole('button', { name: /Stop loss — a hora de parar/ });
  await sl.click(); await page.waitForTimeout(300);
  ok(/Hoje · limite 2 buy-ins/.test(await page.locator('main').innerText()), 'stop diário de 2 buy-ins da reta (o do time é 10)');
  ok(await page.locator('[data-stop-semana]').count() === 0, 'sem regra semanal: só o diário (os 15% da configuração não valem no time)');
});

// 4) jogador de time sem stop ligado: o Início não mostra o cartão (o padrão da configuração não vale pro time)
await cenario('jogador: sem stop ligado', samba('aluno'), async (page) => {
  await page.locator('[data-painel-mk], [data-faixas-inicio]').first().waitFor({ timeout: 15000 });
  ok(await page.getByRole('button', { name: /Stop loss — a hora de parar/ }).count() === 0, 'sem regra de stop: sem o cartão de stop loss no Início');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
