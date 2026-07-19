// #2: webhook de cobrança da Kiwify. ESQUELETO PRONTO — falta só você:
//   1) criar os produtos na Kiwify e configurar o webhook apontando pra esta URL
//      https://pegrfpsyddzdvvuliugr.functions.supabase.co/kiwify-webhook?token=SEU_TOKEN
//   2) definir os secrets no Supabase (Edge Functions -> Secrets):
//      KIWIFY_WEBHOOK_TOKEN = o mesmo token que você põe na URL do webhook
//      KIWIFY_PLAN_MAP      = JSON {"<product_id_ou_offer>":"gestao","<outro>":"pro"}
//   Enquanto os secrets não existirem, o webhook responde 503 e não faz nada (fail-closed).
//
// Verificação: preferimos a ASSINATURA HMAC-SHA1 do corpo (?signature=, chave = KIWIFY_WEBHOOK_TOKEN)
// — mais segura que token na URL, que vaza em log/referer. Se a Kiwify mandar só ?token=, cai nele.
// Idempotência: cada order_id+status entra uma vez em webhook_events.
// Deploy: supabase functions deploy kiwify-webhook --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN = Deno.env.get('KIWIFY_WEBHOOK_TOKEN') || '';
const PLAN_MAP = (() => { try { return JSON.parse(Deno.env.get('KIWIFY_PLAN_MAP') || '{}'); } catch { return {}; } })();

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// eventos que ATIVAM vs REVOGAM (nomes comuns da Kiwify; confirme no seu painel e ajuste)
const ATIVA = ['order_approved', 'paid', 'approved', 'subscription_renewed', 'pix_paid'];
const REVOGA = ['order_refunded', 'refunded', 'chargeback', 'subscription_canceled', 'canceled', 'subscription_late'];

// HMAC-SHA1 do corpo com o token como chave (esquema de assinatura da Kiwify), em hex.
async function hmacSha1Hex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// comparação em tempo constante (evita timing attack)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  // fail-closed: sem os secrets configurados, não processa nada
  if (!TOKEN) return json({ error: 'webhook não configurado (defina KIWIFY_WEBHOOK_TOKEN)' }, 503);
  const url = new URL(req.url);
  const raw = await req.text();

  // Preferência: HMAC do CORPO (assinatura da Kiwify em ?signature=) — não vaza em log/referer
  // como o token na URL. Se não vier assinatura, cai no token (?token=) como MVP.
  const signature = url.searchParams.get('signature') || req.headers.get('x-kiwify-signature') || '';
  if (signature) {
    const expected = await hmacSha1Hex(TOKEN, raw);
    if (!safeEqual(signature.toLowerCase(), expected)) return json({ error: 'assinatura inválida' }, 401);
  } else {
    const token = url.searchParams.get('token') || req.headers.get('x-kiwify-token') || '';
    if (!safeEqual(token, TOKEN)) return json({ error: 'unauthorized' }, 401);
  }

  let ev: any;
  try { ev = JSON.parse(raw); } catch { return json({ error: 'json' }, 400); }

  // extração defensiva (a Kiwify varia o shape entre produtos; ajuste os caminhos se preciso)
  const status = String(ev?.order_status || ev?.webhook_event_type || ev?.event || ev?.status || '').toLowerCase();
  const email = String(ev?.Customer?.email || ev?.customer?.email || ev?.buyer?.email || ev?.email || '').toLowerCase();
  const orderId = String(ev?.order_id || ev?.order_ref || ev?.id || ev?.subscription_id || '');
  const productId = String(ev?.Product?.product_id || ev?.product_id || ev?.offer_id || ev?.plan_id || '');

  if (!email || !orderId) return json({ error: 'payload sem email/order_id' }, 400);

  const admin = createClient(URL, SERVICE);

  // idempotência: order+status só processa uma vez
  const eid = orderId + '|' + status;
  const { error: dup } = await admin.from('webhook_events').insert({ provider: 'kiwify', event_id: eid });
  if (dup) return json({ ok: true, deduped: true });   // conflito de PK = já processado

  const ativa = ATIVA.some((s) => status.includes(s));
  const revoga = REVOGA.some((s) => status.includes(s));

  if (ativa) {
    const plan = PLAN_MAP[productId] || PLAN_MAP['default'];
    if (!plan) return json({ error: 'produto sem plano no KIWIFY_PLAN_MAP', productId }, 202);
    const { error } = await admin.rpc('webhook_ativar_plano', { p_email: email, p_plan: plan, p_source: 'kiwify', p_order_id: orderId });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action: 'ativado', plan });
  }
  if (revoga) {
    const { error } = await admin.rpc('webhook_revogar_plano', { p_email: email, p_order_id: orderId });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action: 'revogado' });
  }
  return json({ ok: true, ignored: status });
});
