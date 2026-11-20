// Saída do jogador (opção B do plano): a prévia do acerto no modal (o servidor refaz a conta com a banca corrigida),
// pendência que trava a saída, as Saídas no Financeiro com o recebido, e a faixa na conta individual nova de quem saiu.
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
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(400); };
const usd = v => 'US$ ' + v;   // como o app formata

// a conta do servidor (conta_acerto) pra MU 100, já sacado 20, contrato 35% até 10k: a prévia muda com a banca digitada
const acerto = banca => { const cashout = Math.max(banca - 100, 0), pj = Math.round(cashout * 35) / 100;
  return { banca_sistema: 110, banca, mu: 100, lifetime: 20, profit: banca - 100, mk_congelado: Math.max(100 - banca, 0), devolucao: Math.min(banca, 100),
    cashout, parte_jogador: pj, parte_time: Math.round((cashout - pj) * 100) / 100, total_time: Math.round((Math.min(banca, 100) + cashout - pj) * 100) / 100 }; };
const previa = (args, extra = {}) => ({ nome: 'Caio R.', unidade_id: 'u2', tem_conta: true, dono: false, eu: false, pendencias: [], entrada: D(30),
  acerto: acerto(args.p_banca ?? 110), resultado: { torneios: 2, lucro: 30 }, precisa_aprovar_saques: false, leva: { torneios: 3, maos: 2, movimentos: 1, salas: 1 }, ...extra });

// 1) admin: abre a saída pelo menu, confere o acerto, corrige a banca (o servidor refaz) e confirma com SAIU
const db1 = samba('admin');
db1.__rpc = { ...db1.__rpc, previa_saida: a => previa(a), registrar_saida: 'ac9' };
await cenario('admin registra a saída', db1, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Jogadores');
  await page.locator('[data-acoes="Caio R."]').click();
  await page.getByRole('menuitem', { name: 'Registrar saída' }).click();
  const m = page.locator('[data-saida-modal]'); await m.waitFor({ timeout: 5000 });
  ok(rpc(escritas, 'previa_saida').pop()?.p_pessoa === 'p2', 'abre a prévia do acerto do servidor');
  await page.waitForTimeout(600);   // a tela de fundo terminou de entrar
  const fundo = await m.evaluate(el => { const r = el.parentElement.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height), innerHeight]; });
  ok(fundo[0] === 0 && fundo[1] === fundo[2], 'o fundo do modal cobre a tela inteira (a animação da tela não prende mais o modal): ' + fundo.join('/'));
  const t = await m.innerText();
  ok(t.includes(`Caio R. fica com ${usd('3,50')}`) && /Total pro time\s+US\$\s106,50/.test(t), 'mostra a divisão: jogador 3,50 e o time recebe 106,50 (capital 100 + 65% de 10)');
  ok(/3 torneios, 2 registros de mãos, 1 sala/.test(t) && /O time fica com o acerto, os saques, o MU/.test(t), 'diz o que vai pra conta nova dele e o que fica com o time');
  const btn = m.getByRole('button', { name: 'Registrar saída' });
  ok(await btn.isDisabled(), 'sem digitar SAIU o botão fica travado');
  await m.locator('[data-saida-banca]').fill('112'); await m.locator('[data-saida-recebido]').click(); await page.waitForTimeout(500);
  ok(rpc(escritas, 'previa_saida').pop()?.p_banca === 112, 'banca corrigida: o servidor refaz a conta');
  ok((await m.locator('[data-saida-acerto]').innerText()).includes(usd('107,80')), '…e o total pro time vira 107,80');
  await m.locator('[data-saida-confirma]').fill('saiu');
  await btn.click(); await page.waitForTimeout(600);
  const r = rpc(escritas, 'registrar_saida').pop();
  ok(r && r.p_alvo === 'p2' && r.p_banca === 112 && r.p_recebido === null, 'registra a saída com a banca confirmada e o recebido em branco (fica a receber)');
  ok(await page.locator('[data-saida-modal]').count() === 0, 'fecha o modal depois de registrar');
});

// 2) pendência: o servidor diz o que falta e a tela trava
const db2 = samba('admin');
db2.__rpc = { ...db2.__rpc, previa_saida: a => previa(a, { pendencias: ['saque pendente'] }) };
await cenario('saída com pendência', db2, async (page) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Jogadores');
  await page.locator('[data-acoes="Caio R."]').click();
  await page.getByRole('menuitem', { name: 'Registrar saída' }).click();
  const m = page.locator('[data-saida-modal]'); await m.waitFor({ timeout: 5000 });
  ok(/Resolva antes da saída: saque pendente/.test(await m.locator('[data-saida-pendencias]').innerText()), 'mostra o que resolver antes');
  ok(await m.locator('[data-saida-confirma]').isDisabled() && await m.getByRole('button', { name: 'Registrar saída' }).isDisabled(), 'confirmação e botão travados');
});

// 3) financeiro: Saídas do time, com o MK congelado e o recebimento
const db3 = samba('fin', { acerto_saida: [
  { id: 'ac1', pessoa_id: 'p2', unidade_id: 'u2', saida: D(1), entrada: D(30), banca: 112, mu: 100, devolucao: 100, cashout: 12, parte_jogador: 4.2, parte_time: 7.8,
    total_time: 107.8, mk_congelado: 0, status: 'a_receber', resultado: { lucro: 30 }, registrado_em: D(1) + 'T10:00:00Z' },
  { id: 'ac2', pessoa_id: 'p3', unidade_id: 'u4', saida: D(5), entrada: D(60), banca: 50, mu: 200, devolucao: 50, cashout: 0, parte_jogador: 0, parte_time: 0,
    total_time: 50, mk_congelado: 150, status: 'recebido', recebido: 50, diferenca: 0, resultado: { lucro: -150 }, registrado_em: D(5) + 'T10:00:00Z' }] });
db3.__rpc = { ...db3.__rpc, confirmar_acerto: { recebido: 107.8, total_time: 107.8, diferenca: 0 } };
await cenario('financeiro vê as saídas', db3, async (page, escritas) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Financeiro');
  const a1 = await page.locator('[data-acerto="Caio R."]').innerText(), a2 = await page.locator('[data-acerto="Enzo P."]').innerText();
  ok(/a receber/.test(a1) && a1.includes(`time recebe ${usd('107,80')}`) && a1.includes(`jogador ${usd('4,20')}`), 'saída do Caio: a receber, com a divisão do lucro');
  ok(a2.includes(`MK congelado ${usd('150,00')}`) && /recebido/.test(a2), 'saída do Enzo em MK: o MK fica congelado e o recebido aparece');
  await page.locator('[data-acerto="Caio R."]').getByRole('button', { name: 'Confirmar recebimento' }).click();
  await page.getByRole('button', { name: 'Salvar' }).click(); await page.waitForTimeout(500);
  const c = rpc(escritas, 'confirmar_acerto').pop();
  ok(c && c.p_id === 'ac1' && c.p_recebido === 107.8, 'confirmar recebimento manda o valor do acerto');
});

// 4) a conta individual nova de quem saiu: a faixa com o acerto, que some ao fechar (e não volta)
const solo = dbBase({ acerto_saida: [{ id: 'ac7', time_nome: 'Samba', saida: '2026-11-20', banca: 50, mu: 200, mk_congelado: 150, devolucao: 50, parte_jogador: 0, total_time: 50 }] });
await cenario('conta nova de quem saiu', solo, async (page) => {
  const f = page.locator('[data-saida-time]'); await f.waitFor({ timeout: 15000 });
  const t = await f.innerText();
  ok(/Você saiu do time Samba em 20\/11\/2026/.test(t) && /veio com você/.test(t) && t.includes(`MK de ${usd('150,00')} congelado`), 'avisa a saída, que o histórico veio junto e o MK congelado');
  await f.getByRole('button', { name: 'Fechar' }).click(); await page.waitForTimeout(300);
  ok(await page.locator('[data-saida-time]').count() === 0, 'fechou, sumiu');
  await page.reload(); await page.waitForTimeout(2500);
  ok(await page.locator('[data-saida-time]').count() === 0, '…e não volta depois de recarregar');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
