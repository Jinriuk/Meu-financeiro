// Webhook de cobrança do ASAAS -> libera/revoga o plano no GrinderBank.
//
// Diferença importante pra Hotmart/Kiwify: o payload do Asaas NÃO traz o e-mail do comprador,
// só o id do cliente (`payment.customer` = "cus_..."). Então aqui a gente busca o cliente na
// API pra descobrir o e-mail — que é a chave usada pra achar a conta no app. Sem ASAAS_API_KEY
// o webhook não consegue fazer nada, e falha fechado (503) em vez de fingir que deu certo.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   ASAAS_WEBHOOK_TOKEN = o mesmo token digitado no painel do Asaas ao criar o webhook
//   ASAAS_API_KEY       = a chave de API da conta ($aact_...)
//   ASAAS_PLAN_MAP      = JSON {"<id do link de pagamento>":"gestao", ...} — ver abaixo
//   ASAAS_API_BASE      = opcional; use https://api-sandbox.asaas.com/v3 pra testar
//
// Deploy: supabase functions deploy asaas-webhook --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN') || '';
const API_KEY = Deno.env.get('ASAAS_API_KEY') || '';
const API_BASE = Deno.env.get('ASAAS_API_BASE') || 'https://api.asaas.com/v3';
const PLAN_MAP: Record<string, string> = (() => {
  try { return JSON.parse(Deno.env.get('ASAAS_PLAN_MAP') || '{}'); } catch { return {}; }
})();

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// ATIVA: dinheiro entrou (ou o cartão foi confirmado, que pro cliente já é "paguei").
// REVOGA: devolveu, estornou, apagou a cobrança ou passou do vencimento.
// Sobre o OVERDUE: revoga sim. Se a pessoa pagar depois, o PAYMENT_RECEIVED reativa sozinho —
// então o pior caso é ela ficar algumas horas sem acesso, não perder a conta.
const ATIVA = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_APPROVED_BY_RISK_ANALYSIS'];
const REVOGA = ['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_DELETED', 'PAYMENT_REVERSED',
  'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_REPROVED_BY_RISK_ANALYSIS', 'SUBSCRIPTION_DELETED'];

// comparação em tempo constante (não vaza o token por diferença de tempo de resposta)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// o e-mail é a chave que liga o pagamento à conta — sem ele não dá pra liberar nada
async function buscarEmail(customerId: string): Promise<string> {
  const r = await fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}`, {
    headers: { 'access_token': API_KEY, 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error(`asaas customers ${r.status}`);
  const c = await r.json();
  return String(c?.email || '').toLowerCase().trim();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  // falha fechada: sem os secrets, não processa nada (melhor 503 do que liberar errado)
  if (!TOKEN) return json({ error: 'webhook não configurado (falta ASAAS_WEBHOOK_TOKEN)' }, 503);
  if (!API_KEY) return json({ error: 'webhook não configurado (falta ASAAS_API_KEY)' }, 503);

  // o Asaas manda o token que VOCÊ definiu no painel, neste header
  const recebido = req.headers.get('asaas-access-token') || '';
  if (!safeEqual(recebido, TOKEN)) return json({ error: 'unauthorized' }, 401);

  let ev: any;
  try { ev = await req.json(); } catch { return json({ error: 'json' }, 400); }

  const evento = String(ev?.event || '');
  const p = ev?.payment || ev?.subscription || {};
  const cobrancaId = String(p?.id || ev?.id || '');
  const customerId = String(p?.customer || '');
  if (!evento || !cobrancaId) return json({ error: 'payload sem event/id' }, 400);

  const admin = createClient(URL_SB, SERVICE);

  // idempotência: o Asaas reenvia até receber 200. Mesma cobrança + mesmo evento entra uma vez.
  const eid = cobrancaId + '|' + evento;
  const { error: dup } = await admin.from('webhook_events').insert({ provider: 'asaas', event_id: eid });
  if (dup) return json({ ok: true, deduped: true });

  const ativa = ATIVA.includes(evento);
  const revoga = REVOGA.includes(evento);
  if (!ativa && !revoga) return json({ ok: true, ignored: evento });

  if (!customerId) return json({ error: 'evento sem customer', evento }, 202);

  let email = '';
  try { email = await buscarEmail(customerId); }
  catch (e) {
    // 500 de propósito: o Asaas reenvia depois. Um erro de rede não pode virar "pagou e não recebeu".
    // O insert em webhook_events já ocorreu, então limpamos pra não bloquear a retentativa.
    await admin.from('webhook_events').delete().eq('provider', 'asaas').eq('event_id', eid);
    return json({ error: 'falha ao buscar cliente no Asaas: ' + (e as Error).message }, 500);
  }
  if (!email) return json({ error: 'cliente sem e-mail no Asaas', customerId }, 202);

  if (ativa) {
    // Qual plano? Na ordem: link de pagamento -> assinatura -> valor da cobrança.
    // O link é o mais estável: cada plano tem o seu, e o id não muda quando você edita o preço.
    const chaves = [String(p?.paymentLink || ''), String(p?.subscription || ''),
      String(p?.externalReference || ''), String(p?.value ?? '')].filter(Boolean);
    const chave = chaves.find((k) => PLAN_MAP[k]);
    const plan = chave ? PLAN_MAP[chave] : PLAN_MAP['default'];
    // 202 com as chaves no corpo: o Asaas para de reenviar e o log mostra QUAL id cadastrar.
    if (!plan) return json({ error: 'cobrança não está no ASAAS_PLAN_MAP', chaves }, 202);

    const { error } = await admin.rpc('webhook_ativar_plano',
      { p_email: email, p_plan: plan, p_source: 'asaas', p_order_id: cobrancaId });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action: 'ativado', plan, chave });
  }

  const { error } = await admin.rpc('webhook_revogar_plano', { p_email: email, p_order_id: cobrancaId });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, action: 'revogado', evento });
});
