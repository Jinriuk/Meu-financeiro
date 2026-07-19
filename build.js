// Build de produção: compila o JSX (app.jsx) em JS puro (app.js) com @babel/preset-react.
// Assim o navegador NÃO carrega o Babel (2,9 MB) nem compila em runtime — e a CSP pode ser
// estrita (script-src 'self': sem unsafe-inline, sem unsafe-eval).
//
//   node build.js
//
// Fluxo: edite app.jsx (a fonte) e rode isto antes de commitar. index.html referencia app.js.
const fs = require('fs');
const path = require('path');

// @babel/core é instalado localmente (devDependency / npm i). Resolvido de node_modules.
let babel;
try { babel = require('@babel/core'); }
catch { console.error('Faltou @babel/core. Rode: npm install'); process.exit(1); }

const src = fs.readFileSync(path.join(__dirname, 'app.jsx'), 'utf8');
const out = babel.transformSync(src, {
  presets: [['@babel/preset-react', { runtime: 'classic' }]],
  compact: false,
  comments: true,
  filename: 'app.jsx',
});
fs.writeFileSync(path.join(__dirname, 'app.js'), '/* GERADO por build.js a partir de app.jsx — não edite à mão. */\n' + out.code);
console.log('app.js gerado:', out.code.length, 'chars');
