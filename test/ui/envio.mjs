// Envio mensal pro time (22/11): o time pede todo mês, por e-mail, o arquivo dos torneios da GG do mês anterior.
// Admin liga em Regras do time; o jogador que jogou na GG vê o lembrete com o passo a passo e o título pronto e marca
// "Já enviei"; a gestão vê quem falta.
import { abrirApp } from './harness.mjs';
import { samba } from './fixture_time.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
async function cenario(nome, db, fn) {
  const { page, erros, escritas, fechar } = await abrirApp(db);
  try { await fn(page, escritas); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(500); };
const rpcs = (escritas, nome) => escritas.filter(e => e.tabela === 'rpc.' + nome).map(e => JSON.parse(e.corpo || '{}'));
// mês passado (o cobrado) e um dia dentro dele
const hoje = new Date(); const mesPassado = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
const diaMesPassado = mesPassado.slice(0, 8) + '10';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = MESES[Number(mesPassado.slice(5, 7)) - 1];
const regras = [
  { id: 'e1', workspace_id: 'w1', unidade_id: 'u0', chave: 'envio_ligado', valor: true, vigente_desde: '2026-01-01' },
  { id: 'e2', workspace_id: 'w1', unidade_id: 'u0', chave: 'envio_email', valor: 'arquivos@time.test', vigente_desde: '2026-01-01' },
  { id: 'e3', workspace_id: 'w1', unidade_id: 'u0', chave: 'envio_prazo_dia', valor: 28, vigente_desde: '2026-01-01' },
  { id: 'e4', workspace_id: 'w1', unidade_id: 'ub', chave: 'envio_divisao', valor: 'Chorinho', vigente_desde: '2026-01-01' }];
const tGG = (id, player, pid, d) => ({ id, workspace_id: 'w1', entry_date: d, player, pessoa_id: pid, unidade_id: 'u2', site: 'GG Poker', tournament_name: 'Daily Main', modality: 'MTT',
  buyin: 2.5, prize: 0, reentries: 0, field_size: 100, bounty: 0, ticket: false, currency: 'USD', created_at: d + 'T10:00:00Z' });

// 1) admin liga o envio em Regras do time
await cenario('admin liga o envio mensal', samba('admin'), async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Regras do time');
  await page.locator('[data-envio-ligado]').check();
  ok(/PokerCraft/.test(await page.locator('[data-envio-instrucoes]').inputValue()), 'o passo a passo já vem com o modelo da GG (dá pra trocar)');
  await page.locator('[data-envio-email-in]').fill('arquivos@time.test');
  await page.locator('[data-envio-prazo]').fill('6');
  await page.locator('[data-envio-salvar]').click(); await page.waitForTimeout(800);
  const r = rpcs(escritas, 'definir_regra');
  const k = Object.fromEntries(r.map(x => [x.p_chave, x.p_valor]));
  ok(k.envio_ligado === true && k.envio_email === 'arquivos@time.test' && k.envio_prazo_dia === 6 && /PokerCraft/.test(k.envio_instrucoes || '') && r.every(x => x.p_unidade === 'u0'),
    'grava ligado, e-mail, prazo e passo a passo no time inteiro: ' + JSON.stringify(k).slice(0, 120));
});

// 2) jogador que jogou na GG no mês passado: lembrete, título pronto e "Já enviei"
const dbAluno = samba('aluno', { regra_unidade: regras, tournaments: [tGG('g1', 'Bruno T.', 'p0', diaMesPassado)] });
dbAluno.__rpc = { ...dbAluno.__rpc, marcar_envio_mensal: null };
await cenario('jogador: lembrete do envio', dbAluno, async (page, escritas) => {
  await page.locator('[data-faixa="envio"]').waitFor({ timeout: 15000 });
  ok(new RegExp('Envio de ' + nomeMes).test(await page.locator('[data-faixa="envio"]').innerText()), 'Início: "Envio de ' + nomeMes + '" com o prazo');
  await page.locator('[data-faixa="envio"]').getByRole('button', { name: 'Como fazer' }).click();
  await page.locator('[data-envio-modal]').waitFor({ timeout: 5000 });
  ok((await page.locator('[data-envio-titulo]').innerText()) === 'BRUNO T. - CHORINHO', 'título pronto: NOME - DIVISÃO (a divisão vem da Base)');
  ok((await page.locator('[data-envio-email]').innerText()) === 'arquivos@time.test' && /PokerCraft/.test(await page.locator('[data-envio-passos]').innerText()), 'e-mail do time e o passo a passo');
  ok(/mailto:arquivos@time\.test\?subject=BRUNO%20T\.%20-%20CHORINHO/.test(await page.getByRole('link', { name: 'Abrir o e-mail' }).getAttribute('href')), '"Abrir o e-mail" já com o título');
  await page.locator('[data-envio-enviei]').click(); await page.waitForTimeout(600);
  const m = rpcs(escritas, 'marcar_envio_mensal').pop();
  ok(m && m.p_mes === mesPassado && m.p_enviado === true, '"Já enviei" marca o mês passado: ' + JSON.stringify(m));
});

// 3) quem não jogou na GG no mês passado não deve nada
await cenario('jogador sem GG no mês', samba('aluno', { regra_unidade: regras, tournaments: [] }), async page => {
  await page.waitForTimeout(2500);
  ok(await page.locator('[data-faixa="envio"]').count() === 0, 'sem torneio na GG no mês passado: sem lembrete');
});

// 4) gestão: quem já confirmou e quem falta
const dbAdm = samba('admin', { regra_unidade: regras,
  tournaments: [tGG('g1', 'Bruno T.', 'p1', diaMesPassado), tGG('g2', 'Caio R.', 'p2', diaMesPassado)],
  envio_mensal: [{ pessoa_id: 'p1', mes: mesPassado, enviado_em: mesPassado.slice(0, 8) + '05T10:00:00Z' }] });
await cenario('gestão: quem falta', dbAdm, async page => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  const pend = page.locator('[data-pendencia^="Envio de ' + nomeMes + '"]');
  ok(await pend.count() === 1 && /^1/.test((await pend.innerText()).trim()), 'pendência: 1 jogador sem confirmar (o Caio; o Enzo não jogou na GG)');
  await pend.click(); await page.waitForTimeout(500);
  ok(await page.locator('[data-jogador="Caio R."]').count() === 1 && await page.locator('[data-jogador="Bruno T."]').count() === 0, 'leva pra Jogadores filtrado: só o Caio');
  await page.locator('[data-filtro-sit="envio"]').click(); await page.waitForTimeout(300);
  ok(/enviado/.test(await page.locator('[data-envio-de="Bruno T."]').innerText()) && /pendente|atrasado/.test(await page.locator('[data-envio-de="Caio R."]').innerText())
    && /não jogou na GG/.test(await page.locator('[data-envio-de="Enzo P."]').innerText()), 'coluna do envio: Bruno enviou, Caio pendente, Enzo não jogou na GG');
});

// 5) financeiro: não vê os torneios, então não sabe quem jogou na GG. Mostra quem confirmou e "não confirmado", sem cobrar
const dbFin = samba('fin', { regra_unidade: regras, tournaments: [],
  envio_mensal: [{ pessoa_id: 'p1', mes: mesPassado, enviado_em: mesPassado.slice(0, 8) + '05T10:00:00Z' }] });
dbFin.__rpc = { ...dbFin.__rpc, resumo_time: dbFin.__rpc.resumo_time.map(r => ({ ...r, torneios: null, entradas: null, investido: null, lucro: null, roi: null, abi: null, ultimo_lancamento: null })) };
await cenario('financeiro: envio sem inventar', dbFin, async page => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  ok(await page.locator('[data-pendencia^="Envio de"]').count() === 0, 'sem pendência de envio (não dá pra saber quem jogou na GG)');
  await aba(page, 'Jogadores');
  ok(/enviado/.test(await page.locator('[data-envio-de="Bruno T."]').innerText()) && (await page.locator('[data-envio-de="Caio R."]').innerText()).trim() === 'não confirmado'
    && !/não jogou|pendente|atrasado/.test(await page.locator('[data-jogadores]').innerText()), 'coluna: Bruno enviou, os outros "não confirmado" (nem "pendente", nem "não jogou na GG")');
  ok(await page.locator('[data-filtro-sit="envio"]').count() === 0, 'sem o filtro "Envio pendente" (ninguém a cobrar)');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
