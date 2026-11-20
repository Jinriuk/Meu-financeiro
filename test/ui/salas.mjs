// Dinheiro por sala (pedido do dono, 20/11): Minhas salas e a conferência de saldos, reload e capital escolhendo a sala,
// saque por sala, abertura preenchida à mão (qualquer time), e o que o financeiro vê (cada sala no pedido, conferência).
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
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(400); };
const SALAS = { salas: [{ chave: 'gg', sala: 'GG Poker', saldo: 425 }, { chave: 'ps', sala: 'PokerStars', saldo: 200 }, { chave: null, sala: 'sem sala', saldo: -10 }],
  total: 615, banca: 615, sem_sala: -10, ultima_conferencia: null };

// 1) jogador: as salas pelo sistema, conferir os saldos, reload escolhendo a sala, saque que não deixa sacar mais do que a sala tem
const db1 = samba('aluno');
db1.__rpc = { ...db1.__rpc, salas_jogador: SALAS, pedir_reload: 'r9',
  conferir_saldos: { salas: [{ chave: 'gg', sala: 'GG Poker', informado: 425, sistema: 425, diferenca: 0 }, { chave: 'ps', sala: 'PokerStars', informado: 210, sistema: 200, diferenca: 10 }],
    total_informado: 635, total_sistema: 615, diferenca: 20, diverge: true } };
await cenario('jogador: salas', db1, async (page, escritas) => {
  await aba(page, 'Meu time');
  const card = page.locator('[data-minhas-salas]'); await card.waitFor({ timeout: 15000 });
  const t = (await card.innerText()).replace(/\s+/g, ' ');
  ok(/GG Poker sistema US\$ 425,00/.test(t) && /PokerStars sistema US\$ 200,00/.test(t) && /Sem sala .* [-−]US\$ 10,00/.test(t) && /Total \(banca\) US\$ 615,00/.test(t),
    'Minhas salas: cada sala pelo sistema, o que ficou sem sala e o total (= banca): ' + t.slice(0, 160));
  await card.getByRole('button', { name: 'Conferir saldos' }).click();
  await page.locator('[data-conferir-sala="GG Poker"]').fill('425'); await page.locator('[data-conferir-sala="PokerStars"]').fill('210');
  await card.getByRole('button', { name: 'Comparar com o sistema' }).click(); await page.waitForTimeout(500);
  ok(JSON.stringify(rpc(escritas, 'conferir_saldos').pop()?.p_saldos) === '[{"sala":"GG Poker","saldo":425},{"sala":"PokerStars","saldo":210}]', 'manda o saldo de cada sala pro servidor comparar');
  ok((await page.locator('[data-sala-diferenca="GG Poker"]').innerText()) === 'bateu' && /\+US\$\s10,00/.test(await page.locator('[data-sala-diferenca="PokerStars"]').innerText())
    && /O time foi avisado/.test(await page.locator('[data-conferencia-resultado]').innerText()), 'mostra o que bateu, a diferença da PokerStars e que o time foi avisado');
  await card.getByRole('button', { name: 'Fechar' }).click();
  // reload: a sala é obrigatória
  await page.locator('[data-pedir-reload]').click();
  await page.getByPlaceholder('ex.: 100').fill('100');
  const pedir = page.getByRole('button', { name: 'Pedir reload' }).last();
  ok(await pedir.isDisabled(), 'reload sem a sala não sai');
  await page.locator('[data-sala-escolha]').selectOption('PokerStars');
  await pedir.click(); await page.waitForTimeout(500);
  const r = rpc(escritas, 'pedir_reload').pop();
  ok(r && r.p_valor === 100 && r.p_sala === 'PokerStars', 'reload pedido na PokerStars');
  // saque: não dá pra sacar de uma sala mais do que ela tem; sala repetida
  await page.getByRole('button', { name: 'Pedir saque' }).first().click();
  await page.getByLabel('Saldo agora em GG Poker').fill('425'); await page.getByLabel('Sacar de GG Poker').fill('500');
  ok(/mais do que ela tem/.test(await page.locator('[data-saque-erro]').innerText()), 'sacar 500 de uma sala com 425: avisa');
  await page.getByLabel('Sacar de GG Poker').fill('100');
  await page.getByRole('button', { name: '+ outra sala' }).click(); await page.locator('[data-saque-sala-nome]').fill('GG');
  await page.getByLabel('Saldo agora em GG', { exact: true }).fill('5');
  ok(/Sala repetida/.test(await page.locator('[data-saque-erro]').innerText()), '"GG" e "GG Poker" são a mesma sala: avisa');
  await page.getByLabel('Saldo agora em GG Poker').fill('440');
  ok((await page.locator('[data-saque-modal] [data-saque-sala-diferente]').first().innerText()).includes('+US$'), 'saldo digitado 15 acima do sistema: avisa que o time vai ver');
});

// 2) jogador sem planilha conferida: abertura preenchida à mão (qualquer time)
const db2 = samba('aluno');
db2.__rpc = { ...db2.__rpc, situacao_jogador: { ...db2.__rpc.situacao_jogador, abertura: 'sem' }, salas_jogador: { ...SALAS, salas: SALAS.salas.slice(0, 2), sem_sala: 0 }, enviar_planilha: 'a9' };
await cenario('abertura à mão', db2, async (page, escritas) => {
  await aba(page, 'Meu time');
  await page.locator('[data-abertura-manual]').click({ timeout: 15000 });
  const m = page.locator('[data-planilha-manual]'); await m.waitFor({ timeout: 5000 });
  ok((await m.locator('[data-manual-sala="0"]').inputValue()) === 'GG Poker' && (await m.locator('[data-manual-sala="1"]').inputValue()) === 'PokerStars', 'já vem com as salas do jogador');
  await m.locator('[data-manual-saldo="0"]').fill('300'); await m.locator('[data-manual-saldo="1"]').fill('100');
  await m.locator('[data-manual-makeup]').fill('350'); await m.locator('[data-manual-cashout]').fill('50');
  ok(/Banca \(soma das salas\): US\$\s400,00 · profit \+US\$\s50,00/.test(await m.innerText()), 'mostra a banca (soma) e o profit');
  await m.getByRole('button', { name: 'Conferir e enviar' }).click();
  await page.locator('[data-planilha-previa]').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Enviar pro time conferir' }).click(); await page.waitForTimeout(500);
  const p = rpc(escritas, 'enviar_planilha').pop()?.p_planilha;
  ok(p && p.makeup === 350 && p.cashout === 50 && JSON.stringify(p.saldos) === '[{"sala":"GG Poker","saldo":300},{"sala":"PokerStars","saldo":100}]', 'envia MU, cashout e o saldo de cada sala pro time conferir');
});

// 3) financeiro: o pedido de saque por sala, a conferência de cada jogador, as salas dele e o capital com a sala
const db3 = samba('fin', { conferencia_saldo: [
  { id: 'cf1', pessoa_id: 'p2', unidade_id: 'u2', diverge: true, diferenca: 15, total_informado: 196, total_sistema: 181, salas: [], criado_em: D(1) + 'T10:00:00Z' },
  { id: 'cf2', pessoa_id: 'p3', unidade_id: 'u4', diverge: false, diferenca: 0, total_informado: 1057, total_sistema: 1057, salas: [], criado_em: D(2) + 'T10:00:00Z' }] });
db3.saque = db3.saque.map(q => q.id === 's1' ? { ...q, carteiras: [{ sala: 'GG Poker', chave: 'gg', saldo: 300, sistema: 280, valor: 200 }, { sala: 'PokerStars', chave: 'ps', saldo: 112, sistema: 112, valor: 100 }] } : q);
db3.__rpc = { ...db3.__rpc, salas_jogador: { salas: [{ chave: 'gg', sala: 'GG Poker', saldo: 150 }, { chave: 'ps', sala: 'PokerStars', saldo: 31 }], total: 181, banca: 181, sem_sala: 0,
  ultima_conferencia: { criado_em: D(1) + 'T10:00:00Z', diverge: true, diferenca: 15, salas: [{ chave: 'gg', diferenca: 15 }, { chave: 'ps', diferenca: 0 }] } }, registrar_aporte: 'ap9' };
await cenario('financeiro: por sala', db3, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Financeiro');
  const sq = (await page.locator('[data-saque="Bruno T."] [data-saque-salas]').innerText()).replace(/\s+/g, ' ');
  ok(/GG Poker: informado US\$ 300,00 · sistema US\$ 280,00 \(\+US\$ 20,00\) · sai US\$ 200,00/.test(sq) && /PokerStars: informado US\$ 112,00 · sistema US\$ 112,00 · sai US\$ 100,00/.test(sq),
    'pedido de saque: cada sala com o informado, o sistema (a diferença em destaque) e quanto sai: ' + sq);
  ok(/diverge \+US\$\s15,00/.test(await page.locator('[data-salas-de="Caio R."]').innerText()) && /bateu/.test(await page.locator('[data-salas-de="Enzo P."]').innerText()),
    'Dinheiro por jogador: a última conferência de cada um (Caio diverge, Enzo bateu)');
  await page.locator('[data-salas-de="Caio R."]').getByRole('button', { name: 'Ver' }).click();
  const sm = page.locator('[data-salas-modal]'); await sm.waitFor({ timeout: 5000 });
  ok(/GG Poker\s*US\$\s150,00 · lançado \+US\$\s15,00/.test(await sm.innerText()) && /Total \(banca\)\s*US\$\s181,00/.test(await sm.innerText()), '"Ver": as salas dele, onde a conferência não bateu e o total');
  await sm.getByRole('button', { name: 'Fechar' }).click();
  await aba(page, 'Jogadores');
  await page.locator('[data-acoes="Caio R."]').click();
  await page.getByRole('menuitem', { name: 'Capital mandado (MU)' }).click();
  const cm = page.locator('[data-capital-modal]'); await cm.waitFor({ timeout: 5000 });
  await cm.locator('[data-capital-valor]').fill('150');
  ok(await cm.getByRole('button', { name: 'Registrar capital' }).isDisabled(), 'capital sem a sala não sai');
  await cm.locator('[data-sala-escolha]').selectOption('GG Poker');
  await cm.getByRole('button', { name: 'Registrar capital' }).click(); await page.waitForTimeout(500);
  const a = rpc(escritas, 'registrar_aporte').pop();
  ok(a && a.p_pessoa === 'p2' && a.p_valor === 150 && a.p_sala === 'GG Poker', 'capital de 150 registrado na GG Poker do Caio');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
