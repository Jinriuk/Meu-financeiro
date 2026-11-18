// Webhook da Kiwify rodando em Node com Deno e supabase-js simulados: ativação e revogação com o plano do pedido.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const SRC = path.join(__dirname, '../../supabase/functions/kiwify-webhook/index.ts');
const TOKEN = 'token-de-teste';
const MAPA = { 'plano-gestao': 'gestao', 'plano-pro': 'pro', 'valor:4990': 'pro' };

function carregar() {
  const ts = fs.readFileSync(SRC, 'utf8').replace(/^import \{ createClient \} from .*$/m, '');
  const js = esbuild.transformSync(ts, { loader: 'ts', format: 'cjs' }).code;
  const chamadas = { rpc: [], insert: [] };
  const admin = {
    from: (t) => ({
      select: () => ({ in: async () => ({ data: [{ name: 'kiwify_webhook_token', value: TOKEN }, { name: 'kiwify_plan_map', value: JSON.stringify(MAPA) }] }) }),
      insert: async (row) => { chamadas.insert.push([t, row]); return { error: null }; },
    }),
    rpc: async (nome, args) => { chamadas.rpc.push([nome, args]); return { error: null }; },
  };
  let handler;
  const Deno = { env: { get: () => '' }, serve: (h) => { handler = h; } };
  new Function('Deno', 'createClient', js)(Deno, () => admin);
  return { handler, chamadas };
}
const post = (body) => new Request('https://x/kiwify-webhook', { method: 'POST', body: JSON.stringify({ secret: TOKEN, ...body }) });

test('reembolso de pedido do Gestão: revoga mandando o plano gestao', async () => {
  const { handler, chamadas } = carregar();
  const r = await handler(post({ order_status: 'refunded', order_id: 'K1', Customer: { email: 'A@B.com' }, subscription: { plan: { id: 'plano-gestao' } } }));
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(chamadas.rpc, [['webhook_revogar_plano', { p_email: 'a@b.com', p_order_id: 'K1', p_plan: 'gestao' }]]);
});

test('revogação com plano desconhecido: manda null (regra antiga), nunca o default', async () => {
  const { handler, chamadas } = carregar();
  await handler(post({ order_status: 'chargeback', order_id: 'K2', Customer: { email: 'c@d.com' } }));
  assert.deepStrictEqual(chamadas.rpc, [['webhook_revogar_plano', { p_email: 'c@d.com', p_order_id: 'K2', p_plan: null }]]);
});

test('compra aprovada pelo valor: ativa o Pro', async () => {
  const { handler, chamadas } = carregar();
  const r = await handler(post({ order_status: 'paid', order_id: 'K3', Customer: { email: 'e@f.com' }, Commissions: { charge_amount: 4990 } }));
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(chamadas.rpc, [['webhook_ativar_plano', { p_email: 'e@f.com', p_plan: 'pro', p_source: 'kiwify', p_order_id: 'K3' }]]);
});

test('token errado: 401 e nada acontece', async () => {
  const { handler, chamadas } = carregar();
  const r = await handler(new Request('https://x/kiwify-webhook', { method: 'POST', body: JSON.stringify({ secret: 'errado', order_status: 'paid' }) }));
  assert.strictEqual(r.status, 401);
  assert.strictEqual(chamadas.rpc.length, 0);
});
