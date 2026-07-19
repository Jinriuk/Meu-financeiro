// #4: login/reset por APELIDO sem vazar o e-mail. O cliente manda apelido+senha;
// aqui dentro (com service role) resolvemos o e-mail e autenticamos — o e-mail nunca
// volta pro navegador. Fecha a deanonimização apelido->e-mail que a RPC pública tinha.
// Deploy: supabase functions deploy auth-alias --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// resolve apelido/CPF -> e-mail (server-side, com service role). Nunca devolvido ao cliente.
async function resolveEmail(identifier: string): Promise<string | null> {
  const id = (identifier || '').trim();
  if (!id) return null;
  if (id.includes('@')) return id.toLowerCase();
  const admin = createClient(URL, SERVICE);
  const { data } = await admin
    .from('player_profiles')
    .select('email')
    .ilike('nickname', id)
    .limit(1)
    .maybeSingle();
  return data?.email ? String(data.email).toLowerCase() : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'json' }, 400); }
  const action = String(body?.action || 'login');

  if (action === 'login') {
    const email = await resolveEmail(String(body?.identifier || ''));
    // resposta genérica pra não confirmar existência de conta (anti-enumeração)
    if (!email) return json({ error: 'invalid' }, 401);
    const pub = createClient(URL, ANON);
    const { data, error } = await pub.auth.signInWithPassword({ email, password: String(body?.password || '') });
    if (error || !data?.session) return json({ error: 'invalid' }, 401);
    // devolve só os tokens; o cliente faz setSession — o e-mail não trafega de volta
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  }

  if (action === 'reset') {
    const email = await resolveEmail(String(body?.identifier || ''));
    if (email) {
      const pub = createClient(URL, ANON);
      try { await pub.auth.resetPasswordForEmail(email, { redirectTo: String(body?.redirectTo || '') }); } catch (_) {}
    }
    // sempre genérico: não revela se o e-mail existe
    return json({ ok: true });
  }

  return json({ error: 'action' }, 400);
});
