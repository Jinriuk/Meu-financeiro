// #4: login/reset por APELIDO ou CPF sem vazar o e-mail. O cliente manda identificador+senha;
// aqui dentro (com service role) resolvemos o e-mail e autenticamos — o e-mail nunca volta pro
// navegador. Fecha a deanonimização pública que a RPC email_for_login tinha.
// Deploy: supabase functions deploy auth-alias --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

// CORS: ecoa os headers que o navegador pede no preflight (o supabase-js manda x-client-info,
// apikey, x-supabase-api-version etc.) — assim nenhum header novo do SDK quebra o login.
function corsHeaders(req: Request) {
  const reqH = req.headers.get('access-control-request-headers')
    || 'authorization, x-client-info, apikey, content-type, x-supabase-api-version';
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': reqH,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}
const json = (req: Request, b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });

// resolve apelido/CPF/e-mail -> e-mail (server-side, service role). Nunca devolvido ao cliente.
async function resolveEmail(identifier: string): Promise<string | null> {
  const id = (identifier || '').trim();
  if (!id) return null;
  if (id.includes('@')) return id.toLowerCase();
  const admin = createClient(URL, SERVICE);
  const digits = id.replace(/\D/g, '');
  // CPF: 11 dígitos e o texto é só número/pontuação (apelido nunca é só número)
  if (digits.length === 11 && /^[\d.\-\s]+$/.test(id)) {
    const { data } = await admin.from('player_profiles').select('email').eq('cpf', digits).limit(1).maybeSingle();
    return data?.email ? String(data.email).toLowerCase() : null;
  }
  const { data } = await admin.from('player_profiles').select('email').ilike('nickname', id).limit(1).maybeSingle();
  return data?.email ? String(data.email).toLowerCase() : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json(req, { error: 'json' }, 400); }
  const action = String(body?.action || 'login');

  if (action === 'login') {
    const email = await resolveEmail(String(body?.identifier || ''));
    if (!email) return json(req, { error: 'invalid' }, 401);   // genérico: não confirma existência
    const pub = createClient(URL, ANON);
    const { data, error } = await pub.auth.signInWithPassword({ email, password: String(body?.password || '') });
    if (error || !data?.session) return json(req, { error: 'invalid' }, 401);
    return json(req, { access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  }

  if (action === 'reset') {
    const email = await resolveEmail(String(body?.identifier || ''));
    if (email) {
      const pub = createClient(URL, ANON);
      try { await pub.auth.resetPasswordForEmail(email, { redirectTo: String(body?.redirectTo || '') }); } catch (_) {}
    }
    return json(req, { ok: true });   // sempre genérico: não revela se existe
  }

  return json(req, { error: 'action' }, 400);
});
