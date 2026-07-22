// Webhook de cobrança da HOTMART (Webhook/Postback 2.0.0).
// URL: https://pegrfpsyddzdvvuliugr.supabase.co/functions/v1/hotmart-webhook
//
// Verificação: a Hotmart manda o header X-HOTMART-HOTTOK em todo POST; comparamos (tempo
// constante) com o valor da tabela app_secrets (name='hotmart_hottok'), que o admin preenche
// por SQL quando o relatório da Hotmart chega. Sem hottok configurado -> 503 (fail-closed).
// Idempotência: cada (transação|evento) entra uma vez em webhook_events.
// Entitlement: produto -> plano por ID (estável); ativação/revogação pelas RPCs já auditadas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// produto Hotmart -> plano do GrinderBank (IDs dos produtos criados no painel)
const PLAN_MAP: Record<string, string> = {
  '8159932': 'gestao',   // GrinderBank Gestão (Y106811622J)
  '8172688': 'pro',      // GrinderBank Pro
};

// eventos que ATIVAM vs REVOGAM (nomes do webhook 2.0.0)
const ATIVA = ['PURCHASE_APPROVED', 'PURCHASE_COMPLETE', 'SWITCH_PLAN'];
const REVOGA = ['PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'PURCHASE_PROTEST',
  'PURCHASE_CANCELED', 'PURCHASE_DELAYED', 'SUBSCRIPTION_CANCELLATION'];

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const admin = createClient(URL, SERVICE);

  // hottok configurado? (fail-closed enquanto o painel da Hotmart não entregar o valor)
  const { data: sec } = await admin.from('app_secrets').select('value').eq('name', 'hotmart_hottok').maybeSingle();
  const HOTTOK = (sec?.value || '').trim();
  if (!HOTTOK) return json({ error: 'webhook ainda não configurado (hottok pendente)' }, 503);

  const got = (req.headers.get('x-hotmart-hottok') || '').trim();
  if (!safeEqual(got, HOTTOK)) return json({ error: 'unauthorized' }, 401);

  let ev: any;
  try { ev = await req.json(); } catch { return json({ error: 'json' }, 400); }

  const event = String(ev?.event || '').toUpperCase();
  const d = ev?.data || {};
  // extração defensiva: compra e assinatura têm shapes diferentes no 2.0.0
  const email = String(
    d?.buyer?.email || d?.subscriber?.email || d?.purchase?.buyer?.email || '',
  ).toLowerCase().trim();
  const orderId = String(
    d?.purchase?.transaction || d?.subscription?.subscriber?.code || d?.subscriber?.code || ev?.id || '',
  );
  const productId = String(d?.product?.id ?? d?.subscription?.product?.id ?? '');

  if (!event) return json({ error: 'payload sem event' }, 400);
  if (!email || !orderId) return json({ error: 'payload sem email/transação', event }, 400);

  // idempotência: (transação|evento) processa uma vez
  const eid = orderId + '|' + event;
  const { error: dup } = await admin.from('webhook_events').insert({ provider: 'hotmart', event_id: eid });
  if (dup) return json({ ok: true, deduped: true });

  if (ATIVA.includes(event)) {
    const plan = PLAN_MAP[productId];
    if (!plan) return json({ error: 'produto fora do PLAN_MAP', productId }, 202);
    const { error } = await admin.rpc('webhook_ativar_plano',
      { p_email: email, p_plan: plan, p_source: 'hotmart', p_order_id: orderId });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action: 'ativado', plan });
  }
  if (REVOGA.includes(event)) {
    const { error } = await admin.rpc('webhook_revogar_plano', { p_email: email, p_order_id: orderId });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action: 'revogado' });
  }
  return json({ ok: true, ignored: event });
});
