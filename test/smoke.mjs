// Teste de fumaça portátil (roda no CI): sobe os arquivos do repo atrás da MESMA CSP de
// produção (vercel.json) e confirma que o app COMPILADO (app.js) inicia sem violação de CSP,
// sem erro de página, com o supabase-js self-hosted expondo createClient e a tela de login.
// Pré-requisito: `node build.js` (gera app.js). Uso: `node test/smoke.mjs`.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// mesma CSP do vercel.json (script-src 'self' — sem unsafe-inline/unsafe-eval)
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };

if (!fs.existsSync(path.join(ROOT, 'app.js'))) {
  console.error('app.js não existe — rode `node build.js` antes do teste.');
  process.exit(2);
}

const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  const fp = path.join(ROOT, u);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

// CI usa o Chromium do Playwright (npx playwright install); localmente dá pra apontar via env
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const p = await b.newPage();
const csp = [], perr = [];
p.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to|violates the following/i.test(t)) csp.push(t); });
p.on('pageerror', (e) => perr.push(e.message));
// a fonte do Google pode não resolver no runner — deixa falhar em silêncio (não é violação de CSP)
await p.route('**/fonts.googleapis.com/**', (r) => r.abort());
await p.route('**/fonts.gstatic.com/**', (r) => r.abort());
await p.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(2500);
const t = (await p.evaluate(() => document.body.innerText)).replace(/ /g, ' ');
const hasCreate = await p.evaluate(() => !!(window.supabase && typeof window.supabase.createClient === 'function'));
const cfg = await p.evaluate(() => !!window.SUPABASE_URL);

const R = []; const ck = (n, c) => R.push([n, c]);
ck('config.js carregou', cfg);
ck('supabase-js self-hosted expõe createClient', hasCreate);
ck('app.js compilado renderizou a tela de login', t.includes('GrinderBank') && t.includes('Entrar'));
ck('campo de login presente', t.toUpperCase().includes('E-MAIL, APELIDO OU CPF'));
ck('SEM violação de CSP', csp.length === 0);
ck('SEM erro de página', perr.length === 0);

console.log('=== SMOKE (build + CSP estrita) ===');
let ok = 0; R.forEach(([n, v]) => { console.log((v ? '✓' : '✗') + ' ' + n); if (v) ok++; });
if (csp.length) console.log('CSP:', csp.slice(0, 4));
if (perr.length) console.log('PAGEERR:', perr.slice(0, 4));
console.log(`${ok}/${R.length}`);
await b.close(); srv.close();
process.exit(ok === R.length ? 0 : 1);
