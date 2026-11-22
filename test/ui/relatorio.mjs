// Relatório do time (22/11): a gestão escolhe o mês (ou um intervalo) e o recorte; a tela mostra desempenho, grade,
// comprovação, envio do mês e dinheiro, e imprime/salva em PDF. Sem planilha: a ideia é o time parar de precisar dela.
import { abrirApp } from './harness.mjs';
import { samba } from './fixture_time.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
async function cenario(nome, db, fn) {
  const { page, erros, fechar } = await abrirApp(db);
  try { await fn(page); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  ok(erros.length === 0, nome + ': sem erro de página/console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
const aba = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(500); };
const txt = async (page, sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
// o relatório abre no mês passado (o do fechamento)
const hoje = new Date(); const mesPassado = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
const dm = n => mesPassado.slice(0, 8) + String(n).padStart(2, '0');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = MESES[Number(mesPassado.slice(5, 7)) - 1];
const T = (id, player, pid, uid, site, buyin, prize, d, x = {}) => ({ id, workspace_id: 'w1', entry_date: d, player, pessoa_id: pid, unidade_id: uid, site,
  tournament_name: 'Daily', modality: 'MTT', buyin, prize, reentries: 0, field_size: 100, bounty: 0, ticket: false, currency: 'USD', created_at: d + 'T10:00:00Z', ...x });
const dadosMes = papelAluno => ({
  tournaments: [
    T('m1', 'Bruno T.', papelAluno ? 'p0' : 'p1', 'u2', 'GG Poker', 2.5, 20, dm(5), { site_tournament_id: '11', comprovante: { buyin: 2.5, prize: 20, reentries: 0 } }),   // +17,50
    T('m2', 'Bruno T.', papelAluno ? 'p0' : 'p1', 'u2', 'GG Poker', 2.5, 0, dm(6)),                                                                                   // −2,50 · sem comprovação
    T('m3', 'Caio R.', 'p2', 'u2', 'GG Poker', 3, 0, dm(7), { site_tournament_id: '13', comprovante: { buyin: 3, prize: 9, reentries: 0 } }),                         // −3 · diverge
    T('m4', 'Enzo P.', 'p3', 'u4', 'PokerStars', 5.5, 40, dm(8), { site_tournament_id: '14', comprovante: { buyin: 5.5, prize: 40, reentries: 0 } })],              // +34,50
  saque: [{ id: 's9', pessoa_id: 'p3', unidade_id: 'u4', status: 'pago', solicitado_em: dm(9) + 'T10:00:00Z', pago_em: dm(10) + 'T15:00:00Z',
    devolucao: 100, cashout: 50, parte_jogador: 17.5, total_time: 132.5, recebido: 132.5, diferenca: 0 }],
  aporte: [{ id: 'ap1', pessoa_id: 'p2', unidade_id: 'u2', valor: 300, data: dm(4), sala: 'GG' }],
  regra_unidade: [{ id: 'e1', workspace_id: 'w1', unidade_id: 'u0', chave: 'envio_ligado', valor: true, vigente_desde: '2026-01-01' }],
  envio_mensal: [{ pessoa_id: 'p1', mes: mesPassado, enviado_em: dm(3) + 'T12:00:00Z' }]});

// 1) admin: o time inteiro no mês passado
await cenario('admin: relatório do mês', samba('admin', dadosMes(false)), async page => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Relatórios');
  await page.locator('[data-relatorio]').waitFor({ timeout: 5000 });
  ok(new RegExp('Time inteiro · ' + nomeMes + ' de ' + mesPassado.slice(0, 4)).test(await txt(page, '[data-rel-cabecalho]')), 'abre no mês passado, time inteiro');
  const nomes = await page.locator('[data-rel-de]').evaluateAll(es => es.map(e => e.getAttribute('data-rel-de')));
  ok(JSON.stringify(nomes) === JSON.stringify(['Bruno T.', 'Caio R.', 'Enzo P.']), 'jogadores em ordem de reta; a convidada não entra: ' + nomes.join(', '));
  const k = await txt(page, '[data-rel-kpis]');
  ok(/Torneios 4\b/i.test(k) && /Resultado \+US\$\s46,50/i.test(k) && /Fora da grade/i.test(k) && /Sem comprovação 2/i.test(k), 'KPIs: 4 torneios, +46,50, 2 sem comprovação: ' + k.slice(0, 160));
  ok(await page.locator('[data-rel-reta="Reco-reco"]').count() === 1 && await page.locator('[data-rel-reta="Cavaquinho"]').count() === 1, 'por reta: as duas retas');
  ok(/1 sem/.test(await txt(page, '[data-rel-comp="Bruno T."]')) && /1 diverge/.test(await txt(page, '[data-rel-comp="Caio R."]')) && /^ok$/.test(await txt(page, '[data-rel-comp="Enzo P."]')),
    'comprovação por jogador (sem / diverge / ok)');
  ok(/^enviado/.test(await txt(page, '[data-rel-envio="Bruno T."]')) && /não confirmado/.test(await txt(page, '[data-rel-envio="Caio R."]'))
    && /não jogou na GG/.test(await txt(page, '[data-rel-envio="Enzo P."]')), 'envio do mês: Bruno enviou, Caio não confirmou, Enzo não jogou na GG');
  const enzo = await txt(page, '[data-rel-din="Enzo P."]'), caio = await txt(page, '[data-rel-din="Caio R."]');
  ok(/1 · US\$\s150,00/.test(enzo) && /US\$\s132,50/.test(enzo) && /US\$\s17,50/.test(enzo), 'dinheiro: saque pago do Enzo (150 sacado, time 132,50, jogador 17,50): ' + enzo);
  ok(/\+US\$\s300,00/.test(caio), 'dinheiro: capital mandado pro Caio no mês: ' + caio);
  // imprimir: só o relatório, sem cópia duplicada na página
  await page.locator('[data-imprimir-relatorio]').click(); await page.waitForTimeout(300);
  ok(await page.locator('[data-rel-impressao] [data-relatorio]').count() === 1 && await page.locator('[data-relatorio]').count() === 1, 'Imprimir abre a versão de impressão (uma cópia só)');
  await page.getByRole('button', { name: '← Voltar' }).click(); await page.waitForTimeout(300);
  ok(await page.locator('[data-rel-impressao]').count() === 0, '← Voltar fecha a impressão');
  // intervalo: data inicial depois da final avisa e não monta relatório
  await page.getByRole('button', { name: 'Intervalo' }).click();
  await page.locator('[data-rel-de-in]').fill(dm(20)); await page.locator('[data-rel-ate-in]').fill(dm(2)); await page.waitForTimeout(300);
  ok(await page.getByText('A data inicial é depois da final.').count() === 1 && await page.locator('[data-rel-jogadores]').count() === 0, 'intervalo invertido: avisa e não monta');
  await page.locator('[data-rel-de-in]').fill(dm(6)); await page.locator('[data-rel-ate-in]').fill(dm(7)); await page.waitForTimeout(300);
  ok(/Torneios 2\b/i.test(await txt(page, '[data-rel-kpis]')), 'intervalo de 2 dias: só os 2 torneios dele');
  // recorte: só a Reco-reco
  await page.getByRole('button', { name: 'Mês' }).click();
  await page.locator('[data-rel-uni]').selectOption({ label: 'Base › Reco-reco' }); await page.waitForTimeout(300);
  const n2 = await page.locator('[data-rel-de]').evaluateAll(es => es.map(e => e.getAttribute('data-rel-de')));
  ok(JSON.stringify(n2) === JSON.stringify(['Bruno T.', 'Caio R.']) && await page.locator('[data-rel-retas]').count() === 0, 'recorte Reco-reco: só os dela, sem a tabela por reta');
});

// 2) professor da Reco-reco: só a reta dele (ele joga em outra reta e não aparece)
await cenario('professor: só a reta dele', samba('prof', dadosMes(false)), async page => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  await aba(page, 'Relatórios');
  await page.locator('[data-relatorio]').waitFor({ timeout: 5000 });
  const nomes = await page.locator('[data-rel-de]').evaluateAll(es => es.map(e => e.getAttribute('data-rel-de')));
  ok(JSON.stringify(nomes) === JSON.stringify(['Bruno T.', 'Caio R.']), 'só Bruno e Caio: ' + nomes.join(', '));
  ok(await page.locator('[data-rel-uni]').count() === 0 && /Reco-reco/.test(await txt(page, '[data-rel-cabecalho]')), 'sem escolha de recorte (só tem uma reta)');
});

// 3) financeiro: só o dinheiro (não vê desempenho)
await cenario('financeiro: só o dinheiro', samba('fin', dadosMes(false)), async page => {
  await page.locator('[data-kpis], [data-faixa], h1, h2').first().waitFor({ timeout: 15000 });
  await aba(page, 'Relatórios');
  await page.locator('[data-relatorio]').waitFor({ timeout: 5000 });
  ok(await page.locator('[data-rel-kpis]').count() === 0 && await page.locator('[data-rel-comp]').count() === 0, 'sem desempenho, grade nem comprovação');
  ok(await page.locator('[data-rel-dinheiro]').count() === 1 && /US\$\s132,50/.test(await txt(page, '[data-rel-din="Enzo P."]')), 'com a tabela do dinheiro');
});

// 4) aluno não tem relatório do time
await cenario('aluno: sem relatório', samba('aluno', dadosMes(true)), async page => {
  await page.waitForTimeout(2500);
  ok(await page.getByRole('button', { name: /^Relatórios$/ }).count() === 0, 'o menu do aluno não tem Relatórios');
});

// 5) relatório do jogador (Stats) num time: sai com a marca do time, não com "GrinderBank · banca de"
const hh = { id: 'h1', workspace_id: 'w1', player: 'Bruno T.', pessoa_id: 'p0', unidade_id: 'u2', site: 'GG Poker', site_tournament_id: '901', tournament_name: 'Daily',
  entry_date: dm(5), buyin: 2.5, hands: 120, net_bb: 15, vpip_cnt: 28, pfr_cnt: 22, pfr_opp: 110, rfi_cnt: 12, rfi_opp: 50, tb_cnt: 3, tb_opp: 30, f3b_cnt: 2, f3b_opp: 4,
  steal_cnt: 8, steal_opp: 20, bbdef_cnt: 5, bbdef_opp: 10, cbet_cnt: 6, cbet_opp: 9, fcbet_cnt: 2, fcbet_opp: 5, sawflop_cnt: 25, wwsf_cnt: 12, wtsd_cnt: 8, wsd_cnt: 4,
  af_bets: 14, af_calls: 7, allin_cnt: 2, allin_ev_bb: 5, allin_net_bb: 8, walk_cnt: 1, sq_cnt: 0, sq_opp: 3, sawflop_np_cnt: 24, wtsd_np_cnt: 7, engine_version: 2,
  pos_json: { BTN: { h: 20, w: 0, v: 8, p: 7, po: 20, ro: 15, r: 7, net: 10, adj: 10, hn: 20 } }, stack_json: { '40bb+': { h: 120, v: 28, p: 22, net: 15 } }, created_at: dm(5) + 'T23:30:00Z' };
await cenario('jogador: relatório com a marca do time', samba('aluno', { ...dadosMes(true), hh_tournament_stats: [hh] }), async page => {
  await aba(page, 'Stats');
  await page.getByRole('button', { name: /Relatório do jogador/ }).first().click(); await page.waitForTimeout(800);
  const cab = await txt(page, '.printrep');
  ok(/Samba por GrinderBank Relatório do jogador/.test(cab) && !/banca de/.test(cab), 'cabeçalho do PDF: o nome do time e "por GrinderBank": ' + cab.slice(0, 60));
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
