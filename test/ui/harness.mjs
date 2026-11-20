// Sobe o app COMPILADO atrás da CSP de produção com o Supabase SIMULADO (nenhuma requisição sai pra rede):
// sessão falsa no localStorage, respostas do PostgREST montadas a partir de `db`, Realtime fechado.
// Serve pra provar telas com dados sem tocar no banco de verdade.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };

export async function abrirApp(db, { largura = 1280, altura = 900, semSessao = false, caminho = '/' } = {}) {
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
    const fp = path.join(ROOT, u);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
    res.end(fs.readFileSync(fp));
  });
  await new Promise(r => srv.listen(0, r));
  const cfg = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
  const ref = cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
  const user = { id: '00000000-0000-0000-0000-00000000aaaa', email: 'teste@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const sessao = { access_token: 'x.eyJleHAiOjQxMDI0NDQ4MDB9.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user };
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await b.newPage({ viewport: { width: largura, height: altura } });
  const erros = [], escritas = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/WebSocket|realtime|Failed to load resource/i.test(m.text())) erros.push('console: ' + m.text()); });
  // Realtime fechado SEM page.routeWebSocket: no Playwright 1.49 o route de WebSocket chama ensureOpened() depois do
  // handler sem await nem catch; se o navegador fecha nessa hora, a promessa rejeitada (TargetClosedError) derruba o
  // processo do teste. Aqui o app recebe um socket falso que fecha sozinho, e nada passa pelo Playwright.
  await page.addInitScript(() => {
    const Nativo = window.WebSocket;
    class SemRealtime extends EventTarget {
      constructor(url) { super(); Object.assign(this, { url: String(url), readyState: 0, protocol: '', extensions: '', bufferedAmount: 0, binaryType: 'blob', onopen: null, onclose: null, onerror: null, onmessage: null });
        setTimeout(() => this.close(1006), 0); }
      send() {}
      close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3;
        const ev = new CloseEvent('close', { code, wasClean: code === 1000 }); this.dispatchEvent(ev); if (typeof this.onclose === 'function') this.onclose(ev); }
    }
    const WS = function (url, prot) { return /supabase\.co/.test(String(url)) ? new SemRealtime(url) : new Nativo(url, prot); };
    Object.assign(WS, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); WS.prototype = Nativo.prototype;
    window.WebSocket = WS;
  });
  await page.route(/supabase\.co\//, async route => {
    const req = route.request(); const url = new URL(req.url());
    if (url.pathname.startsWith('/auth/v1/user')) {
      if (req.method() === 'PUT') escritas.push({ tabela: 'auth.user', metodo: 'PUT', corpo: req.postData() });
      return route.fulfill({ json: user });
    }
    if (url.pathname.startsWith('/auth/v1/token')) {
      // login com senha: confere com db.__senha (quando o teste define uma)
      let corpo = {}; try { corpo = JSON.parse(req.postData() || '{}'); } catch (e) {}
      escritas.push({ tabela: 'auth.token', metodo: 'POST', corpo: req.postData() });
      if (db.__senha != null && corpo.password !== db.__senha) return route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } });
      return route.fulfill({ json: { ...sessao, user } });
    }
    // link do e-mail (verifyOtp com token_hash): db.__verify = 'erro' simula link vencido
    if (url.pathname.startsWith('/auth/v1/verify')) { escritas.push({ tabela: 'auth.verify', metodo: req.method(), corpo: req.postData() });
      if (db.__verify === 'erro') return route.fulfill({ status: 403, json: { code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' } });
      return route.fulfill({ json: { ...sessao, user } }); }
    // cadastro: com db.__signupSessao a conta já volta logada (projeto sem confirmação de e-mail)
    if (url.pathname.startsWith('/auth/v1/signup')) { escritas.push({ tabela: 'auth.signup', metodo: 'POST', corpo: req.postData() });
      return route.fulfill({ json: db.__signupSessao ? { ...sessao, user } : { user: { ...user, identities: [{}] }, session: null } }); }
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) { const nome = url.pathname.split('/').pop(); escritas.push({ tabela: 'rpc.' + nome, metodo: req.method(), corpo: req.postData() });
      const falha = (db.__rpcErro || {})[nome]; if (falha) return route.fulfill({ status: 400, json: { code: 'P0001', message: falha } });
      return route.fulfill({ json: (db.__rpc || {})[nome] ?? null }); }
    if (url.pathname.startsWith('/functions/v1/')) return route.fulfill({ json: {} });
    const tabela = url.pathname.replace('/rest/v1/', '');
    if (req.method() !== 'GET') {
      escritas.push({ tabela, metodo: req.method(), filtro: url.search, corpo: req.postData() });
      // devolve o que foi gravado (como o PostgREST com return=representation)
      let corpo = []; try { corpo = JSON.parse(req.postData() || '[]'); } catch (e) {}
      const lista = (Array.isArray(corpo) ? corpo : [corpo]).map((r, i) => ({ id: 'novo' + escritas.length + '_' + i, ...r }));
      const umSo = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
      return route.fulfill({ status: 200, json: umSo ? lista[0] : lista });
    }
    // db.__erroLeitura = { tabela: 'mensagem' } simula a leitura falhando (rede, tempo esgotado)
    const falhaLer = (db.__erroLeitura || {})[tabela]; if (falhaLer) return route.fulfill({ status: 500, json: { code: '57014', message: falhaLer } });
    // como o PostgREST: no máximo 1.000 linhas por consulta (teto padrão do projeto), com offset/limit da paginação
    const todas = (db[tabela] || []).map(r => ({ ...r }));
    const de = Number(url.searchParams.get('offset') || 0), lim = Math.min(Number(url.searchParams.get('limit') || 1000), 1000);
    const linhas = todas.slice(de, de + lim);
    if (db.__leituras) db.__leituras.push({ tabela, de, n: linhas.length });
    const umSo = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    return route.fulfill({ json: umSo ? (linhas[0] || null) : linhas, headers: { 'content-range': `${de}-${Math.max(de, de + linhas.length - 1)}/${todas.length}` } });
  });
  await page.addInitScript(([k, v, sem]) => { if (!sem) localStorage.setItem(k, v); localStorage.setItem('gb_install', '1'); }, [`sb-${ref}-auth-token`, JSON.stringify(sessao), semSessao]);
  await page.goto(`http://localhost:${srv.address().port}${caminho}`);
  return { page, erros, escritas, user, fechar: async () => { await b.close(); srv.close(); } };
}

export function dbBase(extra = {}) {
  const uid = '00000000-0000-0000-0000-00000000aaaa';
  return {
    player_profiles: [{ user_id: uid, email: 'teste@example.com', nickname: 'Hero', password_changed: true, role: 'solo' }],
    workspaces: [{ id: 'w1', name: 'Hero', kind: 'solo', plan: 'pro', trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' }],
    pool_config: [{ id: 'c1', workspace_id: 'w1', player1_name: 'Hero', player2_name: 'P2', player_pct: 0.5, abi_max: 10, abi_max_player1: 10, abi_max_player2: 10, piso_minimo: 0, makeup_max_recomendado: 100, makeup_inicial_player1: 0, makeup_inicial_player2: 0, stoploss_daily_buyins: 10, stoploss_weekly_pct: 0.15, banca_inicial: 500, week_start_date: '2026-01-05', sites_permitidos: ['PokerStars', 'GG Poker'], modalidades_permitidas: ['MTT', 'PKO'], created_at: '2026-01-01T00:00:00Z' }],
    tournaments: [], bankroll_ledger: [], player_wallets: [], withdrawals: [], hh_tournament_stats: [], config_changes: [],
    ...extra,
  };
}
