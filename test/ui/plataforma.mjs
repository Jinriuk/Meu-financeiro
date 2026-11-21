// Console da conta central (gestor geral da plataforma): abre direto no console, sem nada de jogador; visão geral com os
// totais e o que precisa de atenção; times por papel, situação, contrato e ações (suspender, reativar, convidar admin,
// vencimento, assentos, link do admin, erros); contas individuais (estender, liberar, encerrar); registro; time suspenso
// trava o app de quem é do time; quem não é gestor geral não vê nada disso.
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
const nav = async (page, nome) => { await page.locator('aside').getByRole('button', { name: new RegExp('^' + nome + '$') }).click({ timeout: 15000 }); await page.waitForTimeout(400); };
const txt = async l => (await l.innerText()).replace(/\s+/g, ' ');
const acaoDo = async (page, sel, item) => { await page.locator(sel).click(); await page.locator('[data-acoes-modal]').getByRole('menuitem', { name: item }).click(); await page.waitForTimeout(300); };
const salvar = async page => { await page.getByRole('button', { name: 'Salvar', exact: true }).click(); await page.waitForTimeout(600); };
const emDias = n => new Date(Date.now() + n * 86400000).toISOString();

const TIMES = [
  { id: 'w1', nome: 'Samba', tipo: 'time', criado_em: '2026-11-19T00:00:00Z', assentos: 30, pessoas: 25, jogadores: 20, convidados: 2, admins: 'Gabriel', tem_dono: true,
    admin_pendente: false, ultimo_lancamento: D(1), marca_nome: 'Samba Poker Team', tem_logo: true, com_conta: 23, jogadores_cadastrados: 22, jogando_7d: 15,
    n_admins: 1, n_professores: 2, n_financeiros: 1, n_outros: 0, contrato_fim: D(-20), suspenso_em: null, suspenso_motivo: null, erros_7d: 0 },
  { id: 'wn', nome: 'Time Novo', tipo: 'time', criado_em: '2026-11-20T00:00:00Z', assentos: null, pessoas: 1, jogadores: 0, convidados: 1, admins: 'Dona Nova', tem_dono: false,
    admin_pendente: true, ultimo_lancamento: null, marca_nome: null, tem_logo: false, com_conta: 0, jogadores_cadastrados: 0, jogando_7d: 0,
    n_admins: 1, n_professores: 0, n_financeiros: 0, n_outros: 0, contrato_fim: D(3), suspenso_em: null, suspenso_motivo: null, erros_7d: 2 },
  { id: 'w3', nome: 'Time Três', tipo: 'time', criado_em: '2026-10-01T00:00:00Z', assentos: 10, pessoas: 6, jogadores: 4, convidados: 0, admins: 'Rui', tem_dono: true,
    admin_pendente: false, ultimo_lancamento: D(9), marca_nome: null, tem_logo: false, com_conta: 6, jogadores_cadastrados: 4, jogando_7d: 0,
    n_admins: 1, n_professores: 1, n_financeiros: 0, n_outros: 0, contrato_fim: null, suspenso_em: '2026-11-15T10:00:00Z', suspenso_motivo: 'inadimplência', erros_7d: 0 }];
const CONTAS = [
  { id: 'c1', nome: 'SoloA', apelido: 'SoloA', email: 'a@exemplo.test', plano: 'pro', teste_ate: emDias(2), criado_em: '2026-11-10T00:00:00Z', torneios: 10, ultimo_lancamento: D(1), erros_7d: 0 },
  { id: 'c2', nome: 'SoloB', apelido: 'SoloB', email: 'b@exemplo.test', plano: 'gestao', teste_ate: emDias(-3), criado_em: '2026-10-20T00:00:00Z', torneios: 3, ultimo_lancamento: null, erros_7d: 0 },
  { id: 'c3', nome: 'SoloC', apelido: 'SoloC', email: 'c@exemplo.test', plano: 'founder', teste_ate: null, criado_em: '2026-07-18T00:00:00Z', torneios: 300, ultimo_lancamento: D(2), erros_7d: 1 }];
const db = samba('admin');
db.__rpc = { ...db.__rpc, sou_gestor_geral: true, times_da_plataforma: TIMES, contas_da_plataforma: CONTAS,
  acoes_plataforma: [{ criado_em: '2026-11-21T10:00:00Z', acao: 'mudar_assentos', time_nome: 'Samba', detalhes: { antes: 20, depois: 30 } },
    { criado_em: '2026-11-21T09:00:00Z', acao: 'suspender', time_nome: 'Time Três', detalhes: { motivo: 'inadimplência' } },
    { criado_em: '2026-11-21T08:00:00Z', acao: 'vencimento', time_nome: 'Samba', detalhes: { antes: null, depois: '2026-12-10' } },
    { criado_em: '2026-11-21T07:00:00Z', acao: 'acesso_conta', time_nome: 'SoloA', detalhes: { acao: 'estender', dias: 15 } },
    { criado_em: '2026-11-20T10:00:00Z', acao: 'criar_time', time_nome: 'Time Novo', detalhes: { nome: 'Time Novo' } }],
  criar_time_plataforma: { workspace_id: 'w4', convite: 'a'.repeat(64) }, novo_link_admin: 'b'.repeat(64), convidar_admin_plataforma: 'c'.repeat(64),
  erros_do_time: [{ criado_em: '2026-11-20T10:00:00Z', origem: 'app', mensagem: 'lista não carregou: timeout', versao: 'abc123' }] };

await cenario('conta central: console', db, async (page, escritas) => {
  await page.locator('[data-console-plataforma]').waitFor({ timeout: 15000 });
  ok(await page.locator('[data-kpis]').count() === 0 && await page.getByRole('button', { name: /^(Torneios|Banca|Jogadores|Meu time)$/ }).count() === 0,
    'abre o console: nada de jogador nem de time (sem torneios, banca, jogadores)');
  ok(await page.locator('aside').getByRole('button').allInnerTexts().then(l => l.join('|')) === 'Visão geral|Times|Contas|Registro|Sair', 'menu: Visão geral, Times, Contas, Registro e Sair');
  // visão geral
  const k = async n => txt(page.locator(`[data-kpi-plataforma="${n}"]`));
  ok(/Times 2 1 suspenso/i.test(await k('times')), 'times: 2 ativos e 1 suspenso');
  ok(/Jogadores ativos 20 15 jogaram nos últimos 7 dias/i.test(await k('jogadores')), 'jogadores ativos (sem o time suspenso) e quem jogou em 7 dias');
  ok(/US\$ 100\/mês/.test(await k('mensalidade')), 'mensalidade: 20 × US$ 5 (o suspenso não entra)');
  ok(/Contas individuais 3 1 em teste · 1 vencida · 1 sem prazo/i.test(await k('contas')), 'contas individuais por situação');
  ok(/Erros do app 3/i.test(await k('erros')), 'erros do app em 7 dias (times + contas)');
  const at = await txt(page.locator('[data-atencao]'));
  ok(/Time Três está suspenso desde 15\/11\/2026: inadimplência/.test(at) && /Time Novo: ainda sem dono/.test(at) && /Time Novo: contrato vencido há 3 dias/.test(at)
    && /Time Novo: 2 erros do app em 7 dias/.test(at) && /Conta SoloA: o teste acaba em 2 dias/.test(at), 'precisa de atenção: suspenso, sem dono, contrato vencido, erros e teste acabando: ' + at.slice(0, 200));
  ok(/Admins 3 Professores 3 Financeiros 1 Outros papéis 0 Jogadores ativos 24 Convidados \(ainda sem conta\) 3/.test(await txt(page.locator('[data-por-papel]'))), 'pessoas por papel somando todos os times');
  // times
  await nav(page, 'Times');
  const samba_ = await txt(page.locator('[data-time-plataforma="Samba"]'));
  ok(/aparece como Samba Poker Team · com logo/.test(samba_) && /ativo/.test(samba_) && /contrato até/.test(samba_) && /25 23 com conta · 2 convidados/.test(samba_)
    && /20 de 22 cadastrados/.test(samba_) && /1 admin · 2 professores · 1 financeiro/.test(samba_) && /25 de 30/.test(samba_) && /US\$ 100/.test(samba_), 'linha do Samba: marca, situação, pessoas, jogadores, papéis, assentos e mensalidade: ' + samba_);
  const novo = await txt(page.locator('[data-time-plataforma="Time Novo"]'));
  ok(/contrato vencido há 3 dias/.test(novo) && /sem dono/.test(novo) && /2 erros/.test(novo) && /1 · sem limite/.test(novo), 'Time Novo: contrato vencido, sem dono, erros, sem limite de assentos');
  ok(/suspenso/.test(await txt(page.locator('[data-time-plataforma="Time Três"] [data-situacao]'))) && (await page.locator('[data-time-plataforma="Time Três"] [data-mensalidade]').innerText()) === '—', 'Time Três suspenso: sem mensalidade');
  // ações do Samba
  await page.locator('[data-acoes-time="Samba"]').click();
  ok((await page.locator('[data-acoes-modal]').getByRole('menuitem').allInnerTexts()).join('|') === 'Convidar admin|Marca (logo e nome)|Assentos|Vencimento do contrato|Erros do app|Suspender o time', 'ações do time num painel (sem cortar na tabela): ' + (await page.locator('[data-acoes-modal]').getByRole('menuitem').allInnerTexts()).join('|'));
  await page.locator('[data-acoes-modal]').getByRole('menuitem', { name: 'Suspender o time' }).click();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click(); await page.waitForTimeout(300);
  ok(rpc(escritas, 'suspender_time').length === 0, 'suspender sem motivo não sai');
  await page.locator('input:not([type])').last().fill('inadimplência'); await salvar(page);
  const s = rpc(escritas, 'suspender_time').pop();
  ok(s && s.p_ws === 'w1' && s.p_suspender === true && s.p_motivo === 'inadimplência', 'suspende o Samba com o motivo');
  await acaoDo(page, '[data-acoes-time="Time Três"]', 'Reativar o time');
  await page.locator('[data-confirma]').getByRole('button', { name: 'Confirmar' }).click(); await page.waitForTimeout(600);
  const r = rpc(escritas, 'suspender_time').pop();
  ok(r && r.p_ws === 'w3' && r.p_suspender === false, 'reativa o Time Três (com confirmação)');
  await acaoDo(page, '[data-acoes-time="Samba"]', 'Convidar admin');
  await page.locator('input:not([type])').last().fill('Carla Nova'); await salvar(page);
  ok(rpc(escritas, 'convidar_admin_plataforma').pop()?.p_nome === 'Carla Nova' && (await page.locator('[data-link-convite]').inputValue()).endsWith('c'.repeat(64)), 'convida admin pro Samba e mostra o link pra mandar');
  await acaoDo(page, '[data-acoes-time="Time Novo"]', 'Vencimento do contrato');
  await page.locator('input[type="date"]').fill('2026-12-31'); await salvar(page);
  const v = rpc(escritas, 'definir_vencimento').pop();
  ok(v && v.p_ws === 'wn' && v.p_data === '2026-12-31', 'muda o vencimento do contrato do Time Novo');
  await acaoDo(page, '[data-acoes-time="Samba"]', 'Assentos');
  await page.keyboard.press('Control+A'); await page.keyboard.type('40'); await salvar(page);
  const a = rpc(escritas, 'mudar_assentos').pop();
  ok(a && a.p_ws === 'w1' && a.p_assentos === 40, 'muda os assentos do Samba pra 40');
  await acaoDo(page, '[data-acoes-time="Time Novo"]', 'Link novo do admin convidado');
  await page.waitForTimeout(400);
  ok(rpc(escritas, 'novo_link_admin').pop()?.p_ws === 'wn' && (await page.locator('[data-link-convite]').inputValue()).endsWith('b'.repeat(64)), 'link novo do admin convidado do Time Novo');
  await acaoDo(page, '[data-acoes-time="Time Novo"]', 'Erros do app');
  await page.locator('[data-erros-modal]').waitFor({ timeout: 5000 });
  ok(/lista não carregou: timeout/.test(await page.locator('[data-erros-modal]').innerText()) && rpc(escritas, 'erros_do_time').pop()?.p_ws === 'wn', 'erros do app do Time Novo');
  await page.locator('[data-erros-modal]').getByRole('button', { name: 'Fechar' }).click();
  // novo time
  await page.locator('[data-novo-time]').click();
  const criar = page.getByRole('button', { name: 'Criar time' });
  ok(await criar.isDisabled(), 'sem nome do time e do admin, não cria');
  await page.locator('[data-novo-time-nome]').fill('Time Quatro'); await page.locator('[data-novo-time-admin]').fill('Ana'); await page.locator('[data-novo-time-assentos]').fill('12x');
  await criar.click(); await page.waitForTimeout(600);
  const c = rpc(escritas, 'criar_time_plataforma').pop();
  ok(c && c.p_nome === 'Time Quatro' && c.p_admin_nome === 'Ana' && c.p_assentos === 12 && (await page.locator('[data-link-convite]').inputValue()).endsWith('a'.repeat(64)), 'cria o time e mostra o link do admin');
  // contas individuais
  await nav(page, 'Contas');
  const soloA = await txt(page.locator('[data-conta-plataforma="SoloA"]'));
  ok(await page.locator('[data-conta-plataforma]').count() === 3 && /SoloA a@exemplo\.test/.test(soloA) && /em teste · 2 dias/.test(soloA) && /Plano pro/.test(soloA) && /10 torneios/.test(soloA)
    && /sem prazo/.test(await txt(page.locator('[data-conta-plataforma="SoloC"]'))), 'contas: apelido, e-mail, plano e situação');
  await page.locator('[data-filtro-conta="vencida"]').click();
  ok(await page.locator('[data-conta-plataforma]').count() === 1 && /vencida em/.test(await txt(page.locator('[data-conta-plataforma="SoloB"]'))), 'filtro: só as vencidas');
  await page.locator('[data-acoes-conta="SoloB"]').click();
  ok((await page.locator('[data-acoes-modal]').getByRole('menuitem').allInnerTexts()).join('|') === 'Estender o teste|Liberar sem prazo', 'vencida: estender ou liberar (encerrar não faz sentido)');
  await page.locator('[data-acoes-modal]').getByRole('menuitem', { name: 'Estender o teste' }).click(); await salvar(page);
  const e = rpc(escritas, 'acesso_conta_plataforma').pop();
  ok(e && e.p_ws === 'c2' && e.p_acao === 'estender' && e.p_dias === 15, 'estende o teste da SoloB em 15 dias');
  await page.locator('[data-filtro-conta="todas"]').click();
  await acaoDo(page, '[data-acoes-conta="SoloA"]', 'Encerrar o acesso');
  await page.locator('[data-confirma]').getByRole('button', { name: 'Confirmar' }).click(); await page.waitForTimeout(600);
  const en = rpc(escritas, 'acesso_conta_plataforma').pop();
  ok(en && en.p_ws === 'c1' && en.p_acao === 'encerrar', 'encerra o acesso da SoloA (com confirmação)');
  // registro
  await nav(page, 'Registro');
  const reg = await txt(page.locator('main'));
  ok(/mudou os assentos · Samba \(20 → 30\)/.test(reg) && /suspendeu o time · Time Três: inadimplência/.test(reg) && /mudou o vencimento do contrato · Samba \(sem data → 10\/12\/2026\)/.test(reg)
    && /mudou o acesso da conta · SoloA: estendeu o teste \(15 dias\)/.test(reg) && /criou o time · Time Novo/.test(reg), 'registro com o detalhe de cada ação');
});

// celular: o console tem o menu de baixo, sem nada de jogador
await cenario('conta central no celular', db, async (page) => {
  await page.locator('[data-console-plataforma]').waitFor({ timeout: 15000 });
  ok((await page.locator('nav.bottomnav').getByRole('button').allInnerTexts()).join('|') === 'Visão geral|Times|Contas|Registro', 'menu de baixo: as 4 telas do console');
  await page.locator('nav.bottomnav').getByRole('button', { name: 'Times' }).click(); await page.waitForTimeout(400);
  ok(await page.locator('[data-time-plataforma="Samba"]').count() === 1, 'times no celular');
}, { largura: 390, altura: 820 });

// time suspenso: quem é do time vê o aviso e nada mais (o motivo não aparece)
const dbS = samba('aluno');
dbS.__rpc = { ...dbS.__rpc, meu_status: { agora: new Date().toISOString(), suspenso: true, ativo: false, time: 'Samba Poker Team', plano: 'team', pode_stats: true } };
await cenario('jogador de time suspenso', dbS, async (page) => {
  await page.locator('[data-time-suspenso]').waitFor({ timeout: 15000 });
  const t = await txt(page.locator('[data-time-suspenso]'));
  ok(/O acesso do Samba Poker Team está suspenso/.test(t) && /fale com o admin do time/.test(t) && !/inadimpl/.test(t), 'aviso de time suspenso, sem o motivo: ' + t.slice(0, 120));
  ok(await page.getByRole('button', { name: /^Torneios$/ }).count() === 0, 'e o app não abre');
});

await cenario('quem não é gestor geral', samba('admin'), async (page) => {
  await page.locator('[data-kpis]').waitFor({ timeout: 15000 });
  ok(await page.locator('[data-console-plataforma]').count() === 0 && await page.getByRole('button', { name: /^Plataforma$/ }).count() === 0, 'admin de time não vê o console nem a Plataforma');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
