// F0.6 na tela: quem manda é o status do SERVIDOR (meu_status), não o relógio do aparelho.
import { abrirApp, dbBase } from './harness.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
const futuro = new Date(Date.now() + 5 * 86400000).toISOString(), passado = new Date(Date.now() - 86400000).toISOString();
async function cenario(rotulo, trialLocal, status, deveBloquear) {
  const db = dbBase({ __rpc: { meu_status: status } });
  db.workspaces[0] = { ...db.workspaces[0], plan: 'gestao', trial_ends_at: trialLocal };
  const { page, erros, fechar } = await abrirApp(db);
  try {
    await page.waitForSelector('text=/Painel|teste grátis de 15 dias acabou/', { timeout: 15000 });
    await page.waitForTimeout(500);
    const bloqueado = await page.getByText('Seu teste grátis de 15 dias acabou').count() > 0;
    ok(bloqueado === deveBloquear, `${rotulo}: ${deveBloquear ? 'bloqueia' : 'não bloqueia'}`);
  } catch (e) { ok(false, rotulo + ': ' + e.message); }
  ok(erros.length === 0, `${rotulo}: sem erro de página` + (erros.length ? ': ' + erros.join(' | ') : ''));
  await fechar();
}
// aparelho acha que ainda está no teste, servidor diz que venceu (data do aparelho atrasada de propósito)
await cenario('servidor vencido, aparelho em teste', futuro, { agora: new Date().toISOString(), ativo: false, pode_stats: false, trial_ends_at: passado }, true);
// aparelho com data adiantada acha que venceu; servidor diz que está ativo
await cenario('servidor ativo, aparelho acha vencido', passado, { agora: new Date().toISOString(), ativo: true, pode_stats: false, trial_ends_at: futuro }, false);
// banco antigo (sem meu_status): continua a regra local
await cenario('sem meu_status, teste local vencido', passado, null, true);
console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
