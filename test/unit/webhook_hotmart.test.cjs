// Webhook da Hotmart rodando em Node com Deno e supabase-js simulados: confere o que cada evento faz.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const SRC = path.join(__dirname, '../../supabase/functions/hotmart-webhook/index.ts');
const HOTTOK = 'segredo-de-teste';

function carregar() {
  const ts = fs.readFileSync(SRC, 'utf8').replace(/^import \{ createClient \} from .*$/m, '');
  const js = esbuild.transformSync(ts, { loader: 'ts', format: 'cjs' }).code;
  const chamadas = { rpc: [], insert: [] };
  const admin = {
    from: (t) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === 'app_secrets' ? { value: HOTTOK } : null }) }) }),
      insert: async (row) => { chamadas.insert.push([t, row]); return { error: null }; },
    }),
    rpc: async (nome, args) => { chamadas.rpc.push([nome, args]); return { error: null }; },
  };
  let handler;
  const Deno = { env: { get: () => 'x' }, serve: (h) => { handler = h; } };
  new Function('Deno', 'createClient', js)(Deno, () => admin);
  return { handler, chamadas };
}
const post = (body, tok = HOTTOK) => new Request('https://x/hotmart-webhook', {
  method: 'POST', headers: { 'x-hotmart-hottok': tok, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('troca de plano: 200 sem mexer em plano (antes: 400 e retentativa sem fim)', async () => {
  const { handler, chamadas } = carregar();
  const r = await handler(post({ event: 'SWITCH_PLAN', data: { subscription: { subscriber_code: 'S1', user: { email: 'a@b.com' } }, plans: [] } }));
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { ok: true, ignored: 'SWITCH_PLAN' });
  assert.strictEqual(chamadas.rpc.length, 0);
});

test('compra cancelada: ignorada (nunca foi aprovada)', async () => {
  const { handler, chamadas } = carregar();
  const r = await handler(post({ event: 'PURCHASE_CANCELED', data: { buyer: { email: 'a@b.com' }, purchase: { transaction: 'T1' }, product: { id: 8172688 } } }));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(chamadas.rpc.length, 0);
});

test('cancelamento de assinatura: revoga mandando o plano do produto', async () => {
  const { handler, chamadas } = carregar();
  const r = await handler(post({ event: 'SUBSCRIPTION_CANCELLATION', data: { subscriber: { code: 'S9', email: 'A@B.com' }, product: { id: 8159932 } } }));
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(chamadas.rpc, [['webhook_revogar_plano', { p_email: 'a@b.com', p_order_id: 'S9', p_plan: 'gestao' }]]);
});

test('compra aprovada do Pro: ativa o Pro', async () => {
  const { handler, chamadas } = carregar();
  const r = await handler(post({ event: 'PURCHASE_APPROVED', data: { buyer: { email: 'c@d.com' }, purchase: { transaction: 'HP1' }, product: { id: 8172688 } } }));
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(chamadas.rpc, [['webhook_ativar_plano', { p_email: 'c@d.com', p_plan: 'pro', p_source: 'hotmart', p_order_id: 'HP1' }]]);
});

test('hottok errado: 401 e nada acontece', async () => {
  const { handler, chamadas } = carregar();
  const r = await handler(post({ event: 'PURCHASE_APPROVED', data: {} }, 'errado'));
  assert.strictEqual(r.status, 401);
  assert.strictEqual(chamadas.rpc.length + chamadas.insert.length, 0);
});
