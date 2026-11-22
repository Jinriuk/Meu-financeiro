// Modo time (workspace 'time'): menu pelo papel. Gestor abre na gestão; quem também joga troca em "Meu jogo";
// o gestor abre o painel de um aluno só pra ler. O aluno vê só os dados dele. O pool de 2 ('team') não muda.
import { abrirApp, dbBase } from './harness.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
const EU = '00000000-0000-0000-0000-00000000aaaa';
async function cenario(nome, db, fn) {
  const { page, erros, fechar } = await abrirApp(db);
  try { await fn(page); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const corpo = page => page.locator('body').innerText();
const tour = (id, player, nome, buyin, prize, d) => ({ id, workspace_id: 'w1', entry_date: d, player, site: 'GG Poker', tournament_name: nome, modality: 'MTT', buyin, prize, reentries: 0, field_size: 100, bounty: 0, currency: 'USD', created_at: d + 'T10:00:00Z' });
const time = (extra = {}) => dbBase({
  workspaces: [{ id: 'w1', name: 'Samba', kind: 'time', plan: 'team', trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' }],
  pool_config: [{ id: 'c1', workspace_id: 'w1', player1_name: '', player2_name: '', player_pct: 1, abi_max: 3, abi_max_player1: 3, abi_max_player2: 0, piso_minimo: 0, makeup_max_recomendado: 0, makeup_inicial_player1: 0, makeup_inicial_player2: 0, stoploss_daily_buyins: 10, stoploss_weekly_pct: 0.15, banca_inicial: 999, week_start_date: '2026-11-02', sites_permitidos: ['GG Poker', 'PokerStars'], modalidades_permitidas: ['MTT'], created_at: '2026-01-01T00:00:00Z' }],
  unidade: [{ id: 'u1', workspace_id: 'w1', mae_id: null, nome: 'Samba', caminho: '/u1/', arquivada: false }],
  pessoa: [{ id: 'p1', workspace_id: 'w1', user_id: EU, nome: 'Hero', status: 'ativo' }, { id: 'p3', workspace_id: 'w1', user_id: 'x3', nome: 'Maria', status: 'ativo' }],
  vinculo: [{ pessoa_id: 'p1', unidade_id: 'u1', fim: null }, { pessoa_id: 'p3', unidade_id: 'u1', fim: null }],
  acesso: [{ pessoa_id: 'p1', unidade_id: 'u1', capacidades: ['administrar'] }],
  tournaments: [tour('t1', 'Hero', 'Torneio do Hero', 10, 30, '2026-11-16'), tour('t2', 'hero ', 'Outro do Hero', 5, 0, '2026-11-17'), tour('t3', 'Maria', 'Torneio da Maria', 20, 0, '2026-11-17')],
  player_wallets: [{ id: 'w-1', player: 'Hero', wallet: 'PS', saldo_inicial: 75 }, { id: 'w-2', player: 'Hero', wallet: 'GG Poker', saldo_inicial: 80 }, { id: 'w-3', player: 'Maria', wallet: 'GG Poker', saldo_inicial: 500 }],
  saque: [{ id: 's1', pessoa_id: 'p1', devolucao: 50, cashout: 20, pago_em: '2026-11-17T12:00:00Z', status: 'pago' }],
  __rpc: { resumo_time: [{ pessoa_id: 'p1', nome: 'Hero', unidade_id: 'u1', caminho: '/u1/', status: 'ativo', torneios: 2, investido: 15, lucro: 15, roi: 100, abi: 7.5, ultimo_lancamento: '2026-11-17', banca: 100, mu: 0, lucro_sacado: 0 },
                                 { pessoa_id: 'p3', nome: 'Maria', unidade_id: 'u1', caminho: '/u1/', status: 'ativo', torneios: 1, investido: 20, lucro: -20, roi: -100, abi: 20, ultimo_lancamento: '2026-11-17', banca: 480, mu: 600, lucro_sacado: 0 }],
           situacao_jogador: { mu: 60, lifetime: 0, contrato: null } },
  ...extra,
});
const irPara = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(300); };
const nav = page => page.locator('aside').innerText();

// 1) gestor que também joga: abre na gestão, abre o painel da Maria só pra ler, volta, troca pra Meu jogo
await cenario('gestor que joga', time(), async (page) => {
  await page.getByRole('button', { name: /^Visão geral$/ }).first().waitFor({ timeout: 15000 });
  let n = await nav(page);
  ok(/Visão geral/.test(n) && /Jogadores/.test(n) && /Grades/.test(n) && /Equipe e convites/.test(n) && !/Torneios|Diário|Stats/.test(n), 'gestão: só abas de gestão, nada de tela de jogador');
  ok(await page.locator('[data-seletor-jogador]').count() === 0, 'sem seletor solto de aluno');
  await irPara(page, 'Jogadores');
  await page.locator('[data-jogador="Maria"]').getByRole('button', { name: 'Maria', exact: true }).click({ timeout: 8000 });
  await page.waitForTimeout(400);
  ok(/Painel de Maria/.test(await page.locator('[data-aluno-aberto]').innerText()), 'abre o painel da Maria com a faixa "só leitura"');
  await irPara(page, 'Torneios');
  let t = await page.locator('main').innerText();
  ok(/TORNEIOS JOGADOS\s*1\s*1 dia de jogo/i.test(t) && /1 torneio · Maria/.test(t) && /−US\$\s20,00/.test(t), 'só os torneios da Maria');
  ok(await page.getByRole('button', { name: 'Adicionar' }).count() === 0 && !/Importar do site/.test(t), 'só leitura: sem lançar nem importar pelo aluno');
  ok(!/Meu time|Ajustes/.test(await nav(page)), 'no painel do aluno não aparece Meu time nem Ajustes');
  await page.getByRole('button', { name: 'Voltar para a gestão' }).click();
  await page.waitForTimeout(300);
  ok(await page.locator('[data-jogadores]').count() === 1 && await page.locator('[data-aluno-aberto]').count() === 0, 'voltar leva pra lista de jogadores');
  await page.locator('[data-modo-btn="jogo"]').first().click();
  await page.waitForTimeout(400);
  n = await nav(page);
  ok(/Início/.test(n) && /Torneios/.test(n) && /Meu time/.test(n) && !/Visão geral/.test(n), 'Meu jogo: abas de jogador');
  await irPara(page, 'Torneios');
  t = await page.locator('main').innerText();
  ok(/TORNEIOS JOGADOS\s*2\s*2 dias de jogo/i.test(t), 'Meu jogo: os 2 torneios dele (inclui "hero " com espaço e caixa diferentes), sem o da Maria');
  for (const sub of ['Diário', 'Semana', 'Mês', 'Lista']) { await page.getByRole('tab', { name: sub, exact: true }).click(); await page.waitForTimeout(250); }
  ok(await page.locator('[data-sub-torneios]').count() === 1, 'Diário, Semana e Mês ficam dentro de Torneios');
  for (const aba of ['Stats', 'Banca', 'Início']) await irPara(page, aba);
  ok(/MU\s*US\$\s60,00/.test(await page.locator('[data-painel-mk]').innerText()) && /Profit \+US\$\s40,00/.test(await page.locator('[data-painel-mk]').innerText()), 'Início mostra MU e profit (banca 100 − MU 60)');
  await irPara(page, 'Minha conta');
  t = await corpo(page);
  const conta = async k => (await page.locator(`[data-minha-conta] [data-conta="${k}"]`).innerText()).replace(/\s+/g, ' ');
  ok(!/Configurações do time/.test(t) && !/Seu plano/.test(t), 'Minha conta do time: sem configuração da pool e sem plano');
  ok(/Nome no time Hero/.test(await conta('nome')) && /Time Samba/.test(await conta('time')) && /Reta Time inteiro/.test(await conta('reta'))
    && /Jogador · Admin · time inteiro/.test(await conta('papel')), 'Minha conta: nome, time, reta e papéis (joga e administra)');
  ok(await page.getByRole('button', { name: /^Saques$/ }).count() === 0, 'sem a aba Saques do pool');
});

// 2) só jogador: sem chave de modo, banca = salas + resultados − saques pagos do time
await cenario('aluno', time({ acesso: [], pessoa: [{ id: 'p1', workspace_id: 'w1', user_id: EU, nome: 'Hero', status: 'ativo' }], vinculo: [{ pessoa_id: 'p1', unidade_id: 'u1', fim: null }],
  tournaments: [tour('t1', 'Hero', 'Torneio do Hero', 10, 30, '2026-11-16'), tour('t2', 'Hero', 'Outro do Hero', 5, 0, '2026-11-17')],
  __rpc: { situacao_jogador: { mu: 300, lifetime: 0, contrato: null } } }), async (page) => {
  await irPara(page, 'Início');
  ok(await page.locator('[data-modo]').count() === 0 && await page.locator('[data-seletor-jogador]').count() === 0, 'sem chave de modo nem seletor');
  const t = await corpo(page);
  ok(/Minha banca/.test(t), 'layout de um jogador');
  ok(/100,00/.test(t) && !/999/.test(t), 'banca = 75 + 80 (salas) + 15 (torneios) − 70 (saque do time) = 100; a banca inicial do time não entra');
  ok(/MK −US\$\s200,00/.test(await page.locator('[data-painel-mk]').innerText()), 'em MK: banca 100 − MU 300 = MK −200');
  await irPara(page, 'Banca');
  ok(await page.locator('[data-salas-travadas]').count() === 0 && !(await page.locator('[data-sala="GG Poker"]').isDisabled()), 'antes do 1º dinheiro do time, as salas ainda se editam');
  await page.locator('[data-sala="GG Poker"]').click();
  ok(/antes de qualquer reload/.test(await corpo(page)), '…e o aviso diz que é o saldo de quando entrou, antes de qualquer reload');
  await page.mouse.click(8, 8); await page.waitForTimeout(250);   // fecha o editor clicando fora
  await irPara(page, 'Meu time');
  await page.locator('[data-secao-time="meu"]').waitFor({ timeout: 8000 });
  ok(await page.locator('[data-minhas-regras]').count() === 0, 'Meu time sem o bloco "Regras da sua reta" (o aluno segue a grade)');
});

// 2b) a banca do aluno vem do SERVIDOR (a mesma da lista e do MK): salas + o que veio depois da foto + capital do time − saques
await cenario('aluno com a banca do servidor', time({ acesso: [], pessoa: [{ id: 'p1', workspace_id: 'w1', user_id: EU, nome: 'Hero', status: 'ativo' }], vinculo: [{ pessoa_id: 'p1', unidade_id: 'u1', fim: null }],
  tournaments: [tour('t1', 'Hero', 'Torneio do Hero', 10, 30, '2026-11-16'), tour('t2', 'Hero', 'Outro do Hero', 5, 0, '2026-11-17')],
  __rpc: { situacao_jogador: { mu: 300, lifetime: 0, contrato: null, abertura: 'confirmada', banca: 250.5,
    banca_partes: { salas: 155, resultados: 15, movimentos: 0, aportes: 150.5, saques: 70, banca: 250.5, corte: '2026-11-10' } } } }), async (page) => {
  await irPara(page, 'Início');
  await page.locator('[data-partes-banca]').waitFor({ timeout: 8000 });
  const t = await page.locator('main').innerText();
  ok(/Minha banca\s*US\$\s250,50/.test(t), 'banca = a do servidor (US$ 250,50), não a soma local');
  const pt = await page.locator('[data-partes-banca]').innerText();
  ok(/Salas US\$\s155,00/.test(pt) && /Reload e capital do time \+US\$\s150,50/.test(pt) && /Saques −US\$\s70,00/.test(pt) && /depois de 10\/11\/2026/.test(pt), 'mostra de onde vem: salas, capital do time (reload), saques e a data da foto');
  ok(/MK −US\$\s49,50/.test(await page.locator('[data-painel-mk]').innerText()), 'MK pela mesma conta: 250,50 − MU 300 = −49,50');
  await irPara(page, 'Banca');
  ok(/Reload e capital do time\s*\+US\$\s150,50/.test(await page.locator('main').innerText()), 'aba Banca com as mesmas partes');
  ok(/Reload e capital do time entram sozinhos/.test(await page.locator('main').innerText()), 'movimentos avisam que reload não se lança à mão (não conta duas vezes)');
  ok(await page.locator('[data-salas-travadas]').count() === 1 && await page.locator('[data-sala="GG Poker"]').isDisabled() && /US\$\s80,00/.test(await page.locator('[data-sala="GG Poker"]').innerText()),
    'BUG-10 salas travadas depois do reload: mostram o saldo da foto e não abrem pra editar');
  // o dinheiro do jogador no time fica na Banca (A-058)
  await page.locator('[data-lifetime]').waitFor({ timeout: 8000 });
  ok(/−US\$\s49,50/.test(await page.locator('[data-lifetime]').innerText()), 'Banca: lifetime = já sacado 0 + profit agora −49,50');
});

// 3) pool de 2 ('team'): nada muda
await cenario('pool de 2', dbBase({
  workspaces: [{ id: 'w1', name: 'Pool', kind: 'team', plan: 'team', trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' }],
  pool_config: [{ ...dbBase().pool_config[0], player1_name: 'Ana', player2_name: 'Beto' }],
  tournaments: [tour('t1', 'Ana', 'Torneio da Ana', 10, 30, '2026-11-16'), tour('t2', 'Beto', 'Torneio do Beto', 5, 0, '2026-11-17')] }), async (page) => {
  await irPara(page, 'Torneios');
  const t = await page.locator('main').innerText();
  ok(/1 torneio · Ana/.test(t) && /1 torneio · Beto/.test(t) && /DE QUEM/i.test(t), 'pool vê os torneios dos dois e escolhe "de quem" no import');
  ok(await page.locator('[data-modo]').count() === 0 && await page.locator('[data-sub-torneios]').count() === 0, 'sem chave de modo nem abas internas no pool');
  ok(await page.getByRole('button', { name: /^Saques$/ }).count() > 0 && await page.getByRole('button', { name: /^Diário$/ }).count() > 0, 'abas Saques e Diário do pool continuam');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
