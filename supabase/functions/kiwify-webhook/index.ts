// Webhook de cobrança da Kiwify -> libera/revoga o plano no GrinderBank.
// URL configurada no painel da Kiwify:
//   https://pegrfpsyddzdvvuliugr.supabase.co/functions/v1/kiwify-webhook
//
// Configuração fica em app_secrets (SQL), não em variável de ambiente:
//   kiwify_webhook_token = o mesmo token digitado no painel da Kiwify
//   kiwify_plan_map      = JSON {"<id do plano>":"gestao","<outro>":"pro"}
// Sem token configurado -> 503 e nada acontece (fail-closed).
//
// Verificação: aceita o segredo em três lugares — ?signature= (HMAC-SHA1 do corpo, o mais seguro),
// ?token= na URL, ou o campo "secret" DENTRO DO CORPO, que é onde a Kiwify de fato manda.
// ATENÇÃO: o token é gerado pela Kiwify e não pode ser escolhido — o campo do painel é readonly.
// Quem manda é o painel; aqui a gente só copia o valor pra kiwify_webhook_token.
// Idempotência: cada order_id+status entra uma vez em webhook_events.
// Deploy: supabase functions deploy kiwify-webhook --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// URL_SB, não URL: `const URL = ...` no escopo do módulo SOMBREIA o construtor global `URL`,
// e o `new URL(req.url)` lá embaixo virava `TypeError: URL is not a constructor` — 500 em todo
// POST, antes até de conferir o token. Foi assim desde a primeira versão. Não renomeie de volta.
const URL_SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Token e mapa de planos vivem na tabela app_secrets (mesmo lugar do hottok da Hotmart), não em
// variável de ambiente. Motivo prático: o mapa muda quando um plano novo entra, e por SQL isso é
// um UPDATE — por env exigiria mexer no painel e refazer o deploy da função a cada ajuste.
// O env continua valendo como fallback pra quem preferir configurar por lá.
const ENV_TOKEN = Deno.env.get('KIWIFY_WEBHOOK_TOKEN') || '';
const ENV_MAP = Deno.env.get('KIWIFY_PLAN_MAP') || '';
async function segredos(admin: any): Promise<{ token: string; map: Record<string, string> }> {
  const { data } = await admin.from('app_secrets').select('name,value')
    .in('name', ['kiwify_webhook_token', 'kiwify_plan_map']);
  const get = (n: string) => (data || []).find((r: any) => r.name === n)?.value || '';
  const token = (get('kiwify_webhook_token') || ENV_TOKEN).trim();
  let map: Record<string, string> = {};
  try { map = JSON.parse(get('kiwify_plan_map') || ENV_MAP || '{}'); } catch { map = {}; }
  return { token, map };
}

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
  const admin = createClient(URL_SB, SERVICE);
  const { token: TOKEN, map: PLAN_MAP } = await segredos(admin);
  // fail-closed: sem token configurado, não processa nada
  if (!TOKEN) return json({ error: 'webhook não configurado (falta kiwify_webhook_token)' }, 503);
  const url = new URL(req.url);
  const raw = await req.text();

  let ev: any;
  try { ev = JSON.parse(raw); } catch { return json({ error: 'json' }, 400); }

  // Onde a Kiwify põe o segredo, em ordem de preferência:
  //   1. ?signature= — HMAC-SHA1 do corpo com o token como chave. Melhor: não vaza em log/referer.
  //   2. ?token= / header — token cru na URL.
  //   3. corpo, campo "secret" — é ONDE A KIWIFY REALMENTE MANDA no evento de teste (confirmado
  //      capturando a requisição). Sem este terceiro caso a verificação nunca encontra o token
  //      e todo evento legítimo cai em 401.
  // Qualquer um que bata autoriza; nenhum bate, 401.
  const signature = url.searchParams.get('signature') || req.headers.get('x-kiwify-signature') || '';
  const tokenUrl = url.searchParams.get('token') || req.headers.get('x-kiwify-token') || '';
  const tokenCorpo = String(ev?.secret || ev?.token || '');
  let autorizado = false;
  if (signature) autorizado = safeEqual(signature.toLowerCase(), await hmacSha1Hex(TOKEN, raw));
  if (!autorizado && tokenUrl) autorizado = safeEqual(tokenUrl, TOKEN);
  if (!autorizado && tokenCorpo) autorizado = safeEqual(tokenCorpo, TOKEN);
  if (!autorizado) return json({
    error: 'unauthorized',
    // onde o segredo veio (sem revelar o valor) — diferencia "token diferente" de "não mandou token"
    recebeu: { assinatura: !!signature, tokenNaUrl: !!tokenUrl, secretNoCorpo: !!tokenCorpo },
  }, 401);

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

  // O evento de TESTE da Kiwify costuma vir sem comprador. Antes isso devolvia 400 seco e a
  // gente perdia a única chance de ver os ids — que é exatamente o que o teste serve pra revelar.
  if (!email || !orderId) return json({
    error: 'payload sem email/order_id (normal num evento de teste)',
    status,
    candidatos: { planoId, ofertaId, productId },
    todosOsIds: idsCandidatos(ev),
    comoUsar: 'compare o teste de um plano Gestão com o de um Pro: o campo que MUDA é a chave do kiwify_plan_map',
  }, 200);

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
      error: 'plano não está no kiwify_plan_map',
      candidatos: { planoId, ofertaId, productId },
      // varre o payload e devolve tudo que PARECE identificador, sem dado pessoal
      todosOsIds: idsCandidatos(ev),
      comoUsar: 'escolha o campo que MUDA entre Gestão e Pro e use como chave do kiwify_plan_map',
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
