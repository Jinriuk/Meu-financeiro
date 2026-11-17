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

export async function abrirApp(db, { largura = 1280, altura = 900 } = {}) {
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
  await page.routeWebSocket(/supabase\.co/, ws => ws.close());
  await page.route(/supabase\.co\//, async route => {
    const req = route.request(); const url = new URL(req.url());
    if (url.pathname.startsWith('/auth/v1/user')) return route.fulfill({ json: user });
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ json: null });
    if (url.pathname.startsWith('/functions/v1/')) return route.fulfill({ json: {} });
    const tabela = url.pathname.replace('/rest/v1/', '');
    if (req.method() !== 'GET') { escritas.push({ tabela, metodo: req.method(), corpo: req.postData() }); return route.fulfill({ status: 201, json: [] }); }
    const linhas = (db[tabela] || []).map(r => ({ ...r }));
    const umSo = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    return route.fulfill({ json: umSo ? (linhas[0] || null) : linhas, headers: { 'content-range': `0-${Math.max(0, linhas.length - 1)}/${linhas.length}` } });
  });
  await page.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('gb_install', '1'); }, [`sb-${ref}-auth-token`, JSON.stringify(sessao)]);
  await page.goto(`http://localhost:${srv.address().port}/`);
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
