// Guarda contra sombreamento de global nas Edge Functions.
//
// Por que este teste existe: o kiwify-webhook tinha `const URL = Deno.env.get('SUPABASE_URL')`
// no escopo do módulo. Isso sombreia o construtor `URL` global, e o `new URL(req.url)` do handler
// virava `TypeError: URL is not a constructor` — 500 em TODO POST, antes até de conferir o token.
// O bug sobreviveu a cinco commits e só apareceu quando a Kiwify disparou um evento de verdade,
// porque nada aqui roda Deno: o deploy publica sem executar. Um grep barato pega a classe inteira.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// globais que a gente usa como construtor/função e que um `const` de módulo apagaria
const GLOBAIS = ['URL', 'Response', 'Request', 'Headers', 'Error', 'Date', 'Deno', 'JSON', 'Map', 'Set'];

const base = 'supabase/functions';
const falhas = [];
let arquivos = 0;

for (const dir of readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const caminho = join(base, dir.name, 'index.ts');
  if (!existsSync(caminho)) continue;
  arquivos++;
  const linhas = readFileSync(caminho, 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    // só declaração no início da linha = escopo de módulo (dentro de função vem indentado)
    const m = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(linha);
    if (m && GLOBAIS.includes(m[1])) {
      falhas.push(`${caminho}:${i + 1}  declara "${m[1]}" no escopo do módulo e apaga o global de mesmo nome`);
    }
  });
}

if (!arquivos) {
  console.error('nenhuma edge function encontrada em ' + base + ' — teste não checou nada');
  process.exit(1);
}
if (falhas.length) {
  console.error('Global sombreado em edge function:\n' + falhas.map((f) => '  ' + f).join('\n'));
  console.error('\nRenomeie a variável (ex.: URL -> URL_SB). Isso quebra em runtime, não no deploy.');
  process.exit(1);
}
console.log(`ok — ${arquivos} edge functions, nenhum global sombreado`);
