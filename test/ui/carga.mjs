// Carga dos dados: o servidor devolve no máximo 1.000 linhas por consulta (o app pagina) e uma leitura que falha
// não pode trocar a lista da tela por vazia (banca errada sem aviso).
import { abrirApp, dbBase } from './harness.mjs';
const falhas = []; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) falhas.push(m); };
async function cenario(nome, db, fn) {
  const { page, erros, fechar } = await abrirApp(db);
  try { await fn(page); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('✗', nome, e.message); }
  const errosReais = erros.filter(e => !/500|lista não carregou|Failed to load resource/.test(e));   // a falha simulada é esperada
  ok(errosReais.length === 0, nome + ': sem erro de página/console' + (errosReais.length ? ': ' + errosReais.join(' | ') : ''));
  await fechar();
}
const irPara = async (page, nome) => { await page.getByRole('button', { name: new RegExp('^' + nome + '$') }).first().click({ timeout: 15000 }); await page.waitForTimeout(300); };
const dia = i => { const d = new Date(Date.UTC(2026, 0, 5) + (i % 300) * 86400000); return d.toISOString().slice(0, 10); };
const muitos = n => Array.from({ length: n }, (_, i) => ({ id: 't' + String(i).padStart(5, '0'), workspace_id: 'w1', entry_date: dia(i), player: 'Hero', site: 'GG Poker',
  tournament_name: 'Daily ' + i, modality: 'MTT', buyin: 1, prize: 2, reentries: 0, field_size: 100, bounty: 0, currency: 'USD', created_at: dia(i) + 'T10:00:00Z' }));

// 1) 1.500 torneios: antes o app via só 1.000 (banca 500 + 1.000 = 1.500); agora vê todos (500 + 1.500 = 2.000)
const db1 = dbBase({ tournaments: muitos(1500), __leituras: [] });
await cenario('1.500 torneios', db1, async (page) => {
  await irPara(page, 'Painel');
  const t = await page.locator('main').innerText();
  ok(/Minha banca\s*US\$\s2\.000,00/.test(t) && /Jogos \+US\$\s1\.500,00/.test(t), 'banca conta os 1.500 torneios (500 + 1.500 × US$ 1 = US$ 2.000,00)');
  const lt = db1.__leituras.filter(x => x.tabela === 'tournaments');
  ok(lt.length === 2 && lt[0].de === 0 && lt[1].de === 1000 && lt[1].n === 500, 'leu em 2 páginas (1.000 + 500)');
  await irPara(page, 'Torneios');
  ok(/TORNEIOS JOGADOS\s*1\.?500/i.test(await page.locator('main').innerText()), 'Torneios mostra os 1.500');
});

// 2) leitura dos torneios falha: aparece o aviso; tentar de novo carrega e o aviso some
const db2 = dbBase({ tournaments: muitos(3), __erroLeitura: { tournaments: 'canceling statement due to statement timeout' } });
await cenario('falha na carga', db2, async (page) => {
  await page.locator('[data-erro-carga]').waitFor({ timeout: 15000 });
  ok(/Não consegui atualizar tudo do servidor/.test(await page.locator('[data-erro-carga]').innerText()), 'avisa que os números podem estar desatualizados');
  delete db2.__erroLeitura;
  await page.locator('[data-erro-carga]').getByRole('button', { name: 'Tentar de novo' }).click();
  await page.locator('[data-erro-carga]').waitFor({ state: 'detached', timeout: 8000 });
  await irPara(page, 'Painel');
  ok(/Minha banca\s*US\$\s503,00/.test(await page.locator('main').innerText()), 'depois de tentar de novo: banca com os 3 torneios (500 + 3)');
});

// 3) a falha numa recarga NÃO apaga o que já estava na tela
const db3 = dbBase({ tournaments: muitos(3) });
await cenario('falha na recarga', db3, async (page) => {
  await irPara(page, 'Painel');
  ok(/Minha banca\s*US\$\s503,00/.test(await page.locator('main').innerText()), 'carregou a banca (500 + 3)');
  db3.__erroLeitura = { tournaments: 'Failed to fetch' };
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.locator('[data-erro-carga]').waitFor({ timeout: 8000 });
  ok(/Minha banca\s*US\$\s503,00/.test(await page.locator('main').innerText()), 'a recarga falhou e a banca continua a mesma (não virou US$ 500,00)');
});

console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo ok');
process.exit(falhas.length ? 1 : 0);
