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
const ATIVA = ['order_approved', 'paid', 'approved', 'subscription_renewed', 'pix_paid', 'renewed'];
const REVOGA = ['order_refunded', 'refunded', 'chargeback', 'subscription_canceled', 'canceled',
  'subscription_late', 'billet_expired', 'subscription_expired'];

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

// Varre o payload e devolve os campos que parecem identificador (curtos, alfanuméricos),
// com o caminho completo de cada um. NUNCA inclui dado pessoal: nome, e-mail, telefone, CPF,
// endereço e afins são pulados por nome de campo, e valores com "@" ou muito longos ficam fora.
const PESSOAL = /(email|mail|name|nome|phone|fone|cel|cpf|cnpj|doc|address|endereco|cep|street|card|token|secret|signature|ip)/i;
function idsCandidatos(obj: unknown, caminho = '', out: Record<string, string> = {}, nivel = 0): Record<string, string> {
  if (nivel > 5 || out['__truncado'] || Object.keys(out).length > 60) return out;
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (PESSOAL.test(k)) continue;
      idsCandidatos(v, caminho ? `${caminho}.${k}` : k, out, nivel + 1);
    }
    return out;
  }
  const s = String(obj ?? '');
  // id típico: 4 a 40 caracteres, sem espaço nem arroba, e não é só pontuação
  if (s && s.length >= 4 && s.length <= 40 && !/[\s@]/.test(s) && /[A-Za-z0-9]/.test(s)) out[caminho] = s;
  return out;
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
  // ATENÇÃO: com VÁRIOS planos no MESMO produto (Gestão + Pro na mesma ficha), o product_id é
  // IGUAL pros quatro — mapear por ele entregaria Pro pra quem pagou Gestão. Então a ordem é:
  // plano da assinatura -> oferta -> produto. O product_id só serve de último recurso.
  const planoId = String(
    ev?.subscription?.plan?.id ?? ev?.Subscription?.plan?.id ??
    ev?.subscription?.plan_id ?? ev?.Subscription?.plan_id ??
    ev?.plan_id ?? ev?.Plan?.id ?? '');
  const ofertaId = String(
    ev?.Commissions?.product_base_price_offer?.id ?? ev?.offer_id ??
    ev?.Product?.offer_id ?? ev?.checkout_link ?? '');
  const productId = String(ev?.Product?.product_id || ev?.product_id || '');
  // tenta cada chave na ordem; a primeira que estiver no mapa vence
  const chaves = [planoId, ofertaId, productId].filter(Boolean);

  if (!email || !orderId) return json({ error: 'payload sem email/order_id' }, 400);

  const admin = createClient(URL, SERVICE);

  // idempotência: order+status só processa uma vez
  const eid = orderId + '|' + status;
  const { error: dup } = await admin.from('webhook_events').insert({ provider: 'kiwify', event_id: eid });
  if (dup) return json({ ok: true, deduped: true });   // conflito de PK = já processado

  const ativa = ATIVA.some((s) => status.includes(s));
  const revoga = REVOGA.some((s) => status.includes(s));

  if (ativa) {
    const chave = chaves.find((k) => PLAN_MAP[k]);
    const plan = chave ? PLAN_MAP[chave] : PLAN_MAP['default'];
    // 202 (não 500) de propósito: a Kiwify não fica reenviando, e a resposta mostra QUAIS ids
    // chegaram — é assim que se descobre o identificador do plano quando o painel não exibe.
    // Junto vai um mapa de TODOS os campos com cara de id, com o caminho de cada um: sem isso,
    // um painel que esconde o plan_id deixaria a integração emperrada sem pista nenhuma.
    if (!plan) return json({
      error: 'plano não está no KIWIFY_PLAN_MAP',
      candidatos: { planoId, ofertaId, productId },
      // varre o payload e devolve tudo que PARECE identificador, sem dado pessoal
      todosOsIds: idsCandidatos(ev),
      comoUsar: 'escolha o campo que MUDA entre Gestão e Pro e use como chave do KIWIFY_PLAN_MAP',
    }, 202);
    const { error } = await admin.rpc('webhook_ativar_plano', { p_email: email, p_plan: plan, p_source: 'kiwify', p_order_id: orderId });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action: 'ativado', plan, chave });
  }
  if (revoga) {
    const { error } = await admin.rpc('webhook_revogar_plano', { p_email: email, p_order_id: orderId });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action: 'revogado' });
  }
  return json({ ok: true, ignored: status });
});
