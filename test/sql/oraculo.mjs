// Oráculo do dinheiro do time (verificação só matemática). Um modelo de referência escrito a partir das REGRAS (não
// copia o SQL) e históricos aleatórios com semente fixa. Pra cada aluno, banca, MU, lucro sacado, make-up, ABI e
// resultado que o banco calcula têm que bater com o modelo AO CENTAVO; e as invariantes têm que valer:
//   · reload (aporte) não muda o profit (banca − MU) de ninguém;
//   · MK do servidor = banca abaixo do MU;
//   · divisão do cashout (plano 3.3): o saque INTEIRO vai na faixa do lifetime do dia (abaixo do limite, a % da faixa;
//     a partir dele, a da seguinte); jogador + time = cashout.
// Regras (as mesmas do cabeçalho da migration 20261120200000):
//   foto com planilha conferida: corte = data escolhida na conferência, senão "atualizado em" da planilha, senão o dia
//   do envio; desde = hora da conferência. Sem planilha conferida: corte = véspera da entrada no time; desde = sempre.
//   banca  = salas + resultados e movimentos com data > corte + aportes com hora > desde − saques pagos com hora > desde
//   MU     = MU da planilha + aportes > desde − devoluções pagas > desde ;  lucro sacado = cashout da planilha + cashouts
// Uso (o test/sql/run.sh faz): node test/sql/oraculo.mjs > oraculo.sql ; psql -f oraculo.sql
'use strict';
const SEMENTE = Number(process.env.SEMENTE || 20261120), N = Number(process.env.ALUNOS || 80);
let st = SEMENTE >>> 0;
const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));            // inteiro em [a, b]
const um = arr => arr[Math.floor(rnd() * arr.length)];
const chance = p => rnd() < p;
const soma = arr => arr.reduce((a, b) => a + b, 0);
// dinheiro em CENTAVOS (inteiro): sem float no modelo
const $ = c => { const s = c < 0 ? '-' : ''; const a = Math.abs(c); return s + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0'); };
const dia = d => `current_date - ${-d}`;                                  // d = dias a partir de hoje (negativo = passado)
const hora = m => `now() - interval '${-m} minutes'`;                    // m = minutos a partir de agora (negativo)
const txt = s => `'${String(s).replace(/'/g, "''")}'`;
// round(x, 2) do Postgres com x = a/b (positivo): meio centavo pra cima
const divCent = (a, b) => { const q = Math.floor(a / b), r = a - q * b; return 2 * r >= b ? q + 1 : q; };

const WS = 'ae000000-0000-0000-0000-000000000001', RAIZ = 'ae000000-0000-0000-0000-0000000000f0', RETA = 'ae000000-0000-0000-0000-0000000000f1';
const ADM = 'ae000000-0000-0000-0000-0000000000aa';
const out = [];
const sql = s => out.push(s);
sql(`-- gerado por test/sql/oraculo.mjs (semente ${SEMENTE}, ${N} alunos): não editar à mão
\\set ON_ERROR_STOP 1
reset role;
begin;
insert into auth.users(id, email, email_confirmed_at) values ('${ADM}', 'admin@oraculo.test', now());
insert into public.workspaces(id, name, kind, plan) values ('${WS}', 'Oráculo', 'time', 'team');
insert into public.workspace_members(workspace_id, user_id, role) values ('${WS}', '${ADM}', 'owner');
insert into public.unidade(id, workspace_id, nome) values ('${RAIZ}', '${WS}', 'Oráculo');
insert into public.unidade(id, workspace_id, mae_id, nome) values ('${RETA}', '${WS}', '${RAIZ}', 'Reta');
insert into public.pessoa(workspace_id, user_id, nome, status) values ('${WS}', '${ADM}', 'Admin O', 'ativo');
insert into public.acesso(pessoa_id, unidade_id, capacidades) select id, '${RAIZ}', array['administrar'] from public.pessoa where user_id = '${ADM}';
create temp table esperado(nome text primary key, banca text, mu text, lifetime text, torneios text, entradas text, investido text, lucro text, abi text);
grant select on esperado to authenticated;
`);

const BUYINS = [50, 100, 110, 220, 250, 330, 540, 550, 1100, 2200, 3333];   // centavos (inclui 33,33)
const pid = i => `ae000000-0000-0000-0000-${String(100000 + i).padStart(12, '0')}`;
for (let i = 0; i < N; i++) {
  const nome = `Aluno ${String(i).padStart(3, '0')}`, id = pid(i);
  const entrada = -ri(10, 120);                                           // dias: entrou no time
  sql(`insert into public.pessoa(id, workspace_id, nome, status) values ('${id}', '${WS}', ${txt(nome)}, 'ativo');
insert into public.vinculo(pessoa_id, unidade_id, inicio) values ('${id}', '${RETA}', ${dia(entrada)});`);
  // planilha: 55% conferida, 15% só enviada (não vale), 30% sem
  const tipo = rnd(); let ab = null;
  if (tipo < 0.70) {
    const diasEnvio = ri(Math.max(entrada - 5, -125), -1);
    const tEnv = diasEnvio * 1440 + ri(0, 600);                          // minutos (passado), mesmo dia do envio
    const confirmada = tipo < 0.55;
    const tConf = confirmada ? Math.min(-1, tEnv + ri(30, 3 * 1440)) : null;
    const atualizado = chance(0.5) ? diasEnvio - ri(0, 3) : null;
    const dataCorte = confirmada && chance(0.3) ? diasEnvio - ri(0, 5) : null;
    ab = { confirmada, tEnv, tConf, diaEnvio: Math.floor(tEnv / 1440), atualizado, dataCorte, mu: ri(0, 200000), cashout: ri(0, 300000) };
    const planilha = `jsonb_build_object('makeup', ${$(ab.mu)}, 'cashout', ${$(ab.cashout)}${atualizado != null ? `, 'atualizado_em', (${dia(atualizado)})::text` : ''})`;
    sql(`insert into public.abertura(workspace_id, pessoa_id, unidade_id, status, mu, cashout, planilha, enviado_em, confirmado_em, data_corte) values
 ('${WS}', '${id}', '${RETA}', '${confirmada ? 'confirmada' : 'enviada'}', ${$(ab.mu)}, ${$(ab.cashout)}, ${planilha}, ${hora(tEnv)}, ${confirmada ? hora(tConf) : 'null'}, ${dataCorte != null ? dia(dataCorte) : 'null'});`);
  }
  // o "agora" do envio em dias: o banco usa enviado_em::date; tEnv cai no dia diasEnvio (até 10h depois da meia-noite de hoje - N)
  const corte = ab && ab.confirmada ? (ab.dataCorte ?? ab.atualizado ?? ab.diaEnvio) : entrada - 1;
  const desde = ab && ab.confirmada ? ab.tConf : -Infinity;
  // salas
  const salas = Array.from({ length: ri(0, 3) }, (_, k) => ({ sala: ['GG Poker', 'PokerStars', 'WPT', 'Outros'][k], saldo: ri(0, 100000) }));
  for (const w of salas) sql(`insert into public.player_wallets(workspace_id, player, wallet, saldo_inicial) values ('${WS}', ${txt(nome)}, ${txt(w.sala)}, ${$(w.saldo)});`);
  // torneios (inclui o limite: um NO dia do corte, que não entra, e um no dia seguinte, que entra)
  const tours = Array.from({ length: ri(0, 25) }, () => ({ d: ri(Math.max(entrada - 30, -150), 0), b: um(BUYINS), r: chance(0.7) ? 0 : ri(1, 3),
    p: chance(0.7) ? 0 : ri(1, 50000), bo: chance(0.2) ? ri(1, 2000) : 0, tk: chance(0.1) }));
  if (isFinite(corte) && corte < 0 && chance(0.5)) tours.push({ d: corte, b: 110, r: 0, p: 0, bo: 0, tk: false }, { d: corte + 1, b: 220, r: 1, p: 1000, bo: 0, tk: false });
  for (const t of tours) sql(`insert into public.tournaments(workspace_id, entry_date, player, buyin, reentries, prize, bounty, ticket) values ('${WS}', ${dia(t.d)}, ${txt(nome)}, ${$(t.b)}, ${t.r}, ${$(t.p)}, ${$(t.bo)}, ${t.tk});`);
  // movimentos
  const mov = Array.from({ length: ri(0, 4) }, () => ({ d: ri(Math.max(entrada - 20, -140), 0), e: chance(0.5) ? ri(1, 30000) : 0, s: 0 })).map(m => m.e ? m : { ...m, s: ri(1, 30000) });
  for (const m of mov) sql(`insert into public.bankroll_ledger(workspace_id, entry_date, wallet, entrada, saida, player) values ('${WS}', ${dia(m.d)}, 'GG Poker', ${$(m.e)}, ${$(m.s)}, ${txt(nome)});`);
  // aportes (inclui um exatamente na hora da conferência: não entra, a planilha já tem)
  const ini = entrada * 1440;
  const aportes = Array.from({ length: ri(0, 3) }, () => ({ t: ri(ini, -1), v: (chance(0.1) ? -1 : 1) * ri(1, 100000) }));
  if (ab && ab.confirmada && chance(0.4)) aportes.push({ t: ab.tConf, v: 12345 });
  for (const a of aportes) sql(`insert into public.aporte(workspace_id, pessoa_id, unidade_id, valor, criado_em) values ('${WS}', '${id}', '${RETA}', ${$(a.v)}, ${hora(a.t)});`);
  // saques pagos (e às vezes um em aberto, que não conta)
  const saques = Array.from({ length: ri(0, 2) }, () => { const d = chance(0.5) ? ri(0, 50000) : 0; return { t: ri(ini, -1), d, c: d ? ri(0, 50000) : ri(1, 50000) }; });
  for (const q of saques) sql(`insert into public.saque(workspace_id, pessoa_id, unidade_id, status, banca, mu_antes, lifetime_antes, devolucao, cashout, parte_jogador, parte_time, total_time, divisao, banca_depois, pago_em)
 values ('${WS}', '${id}', '${RETA}', 'pago', 0, 0, 0, ${$(q.d)}, ${$(q.c)}, 0, 0, 0, '{}', 0, ${hora(q.t)});`);
  if (chance(0.3)) sql(`insert into public.saque(workspace_id, pessoa_id, unidade_id, status, banca, mu_antes, lifetime_antes, devolucao, cashout, parte_jogador, parte_time, total_time, divisao, banca_depois)
 values ('${WS}', '${id}', '${RETA}', 'solicitado', 999, 0, 0, 0, 777, 0, 0, 0, '{}', 0);`);

  // ---------- o modelo (centavos) ----------
  const res = t => t.p + t.bo - (t.tk ? 0 : t.b * (1 + t.r));
  const pagosDepois = saques.filter(q => q.t > desde);
  const banca = soma(salas.map(w => w.saldo)) + soma(tours.filter(t => t.d > corte).map(res)) + soma(mov.filter(m => m.d > corte).map(m => m.e - m.s))
    + soma(aportes.filter(a => a.t > desde).map(a => a.v)) - soma(pagosDepois.map(q => q.d + q.c));
  const mu = (ab && ab.confirmada ? ab.mu : 0) + soma(aportes.filter(a => a.t > desde).map(a => a.v)) - soma(pagosDepois.map(q => q.d));
  const lifetime = (ab && ab.confirmada ? ab.cashout : 0) + soma(pagosDepois.map(q => q.c));
  const ent = soma(tours.map(t => 1 + t.r)), nominal = soma(tours.map(t => t.b * (1 + t.r)));
  const investido = soma(tours.map(t => t.tk ? 0 : t.b * (1 + t.r))), lucro = soma(tours.map(res));
  sql(`insert into esperado values (${txt(nome)}, '${$(banca)}', '${$(mu)}', '${$(lifetime)}', '${tours.length}', '${ent}', '${$(investido)}', '${$(lucro)}', ${ent ? `'${$(divCent(nominal, ent))}'` : 'null'});`);
}

// ---------- divisão do cashout: o saque inteiro na faixa do lifetime do dia ----------
sql(`create temp table divisao_esperada(n int primary key, faixas jsonb, lifetime numeric, cashout numeric, jogador text, time text);`);
const PCTS = [300, 333, 350, 400, 450, 500];                               // por mil (0,333 = 333)
for (let k = 0; k < 150; k++) {
  const n = ri(1, 3), limites = [...new Set(Array.from({ length: n - 1 }, () => ri(1, 20000) * 100))].sort((a, b) => a - b);
  const faixas = [...limites.map(l => ({ ate: l, pct: um(PCTS) })), { ate: null, pct: um(PCTS) }];
  const lt = ri(0, 2500000), co = ri(1, 600000);
  const faixa = faixas.find(f => (f.ate ?? Infinity) > lt);               // a 1ª cujo limite o lifetime ainda não alcançou
  const jogC = divCent(co * faixa.pct, 1000);                              // pct por mil: centavos × pct / 1000
  const fx = '[' + faixas.map(f => `{"ate": ${f.ate == null ? 'null' : $(f.ate)}, "jogador": ${(f.pct / 1000).toString()}}`).join(', ') + ']';
  sql(`insert into divisao_esperada values (${k}, '${fx}', ${$(lt)}, ${$(co)}, '${$(jogC)}', '${$(co - jogC)}');`);
}

// ---------- conferências ----------
sql(`
select teste.igual('oráculo: banca, MU e lucro sacado de ${N} alunos batem com o modelo ao centavo',
  $q$select coalesce(string_agg(e.nome||' veio '||(b->>'banca')||'/'||m.mu||'/'||m.lifetime||' esperado '||e.banca||'/'||e.mu||'/'||e.lifetime, '; '), 'todos iguais')
     from esperado e join public.pessoa p on p.nome = e.nome and p.workspace_id = '${WS}'
     cross join lateral (select public.banca_de(p.id) b) x cross join lateral public.mu_de(p.id) m
    where (b->>'banca')::numeric <> e.banca::numeric or m.mu <> e.mu::numeric or m.lifetime <> e.lifetime::numeric$q$, 'todos iguais');
select teste.igual('oráculo: MK do servidor = banca abaixo do MU, pra todos',
  $q$select count(*)::text from esperado e join public.pessoa p on p.nome = e.nome and p.workspace_id = '${WS}'
    where public.em_mk(p.id) <> (e.banca::numeric < e.mu::numeric)$q$, '0');
set role authenticated;
select teste.como('${ADM}');
select teste.igual('oráculo: a lista de jogadores (resumo_time) traz a mesma banca, MU e lucro sacado, e torneios, entradas, investido, resultado e ABI por entrada',
  $q$select coalesce(string_agg(e.nome||' veio '||concat_ws('/', r.banca, r.mu, r.lucro_sacado, r.torneios, r.entradas, r.investido, r.lucro, r.abi)
       ||' esperado '||concat_ws('/', e.banca, e.mu, e.lifetime, e.torneios, e.entradas, e.investido, e.lucro, e.abi), '; '), 'todos iguais')
     from esperado e join public.resumo_time() r on r.nome = e.nome
    where r.banca <> e.banca::numeric or r.mu <> e.mu::numeric or r.lucro_sacado <> e.lifetime::numeric or r.torneios <> e.torneios::int
       or r.entradas <> e.entradas::int or r.investido <> e.investido::numeric or r.lucro <> e.lucro::numeric or r.abi is distinct from e.abi::numeric$q$, 'todos iguais');
select teste.igual('oráculo: …e ninguém da lista ficou de fora', $q$select (select count(*) from public.resumo_time() where nome like 'Aluno %')::text$q$, '${N}');
reset role;
create temp table lucro_antes as select p.id, (public.banca_de(p.id)->>'banca')::numeric - (select m.mu from public.mu_de(p.id) m) lucro
  from public.pessoa p where p.workspace_id = '${WS}' and p.nome like 'Aluno %';
insert into public.aporte(workspace_id, pessoa_id, unidade_id, valor) select '${WS}', id, '${RETA}', 333.33 from lucro_antes;
select teste.igual('oráculo: um reload de 333,33 pra cada um não muda o profit (banca − MU) de ninguém',
  $q$select count(*)::text from lucro_antes a where a.lucro <> (public.banca_de(a.id)->>'banca')::numeric - (select m.mu from public.mu_de(a.id) m)$q$, '0');
select teste.igual('oráculo: divisão do cashout em 150 contratos aleatórios (saque inteiro na faixa do lifetime do dia) bate com o modelo; jogador + time = cashout',
  $q$select coalesce(string_agg(n||': veio '||(d->>'jogador')||'/'||(d->>'time')||' esperado '||jogador||'/'||time, '; '), 'todos iguais')
     from divisao_esperada, lateral (select public.dividir_cashout(faixas, lifetime, cashout) d) x
    where (d->>'jogador')::numeric <> jogador::numeric or (d->>'time')::numeric <> time::numeric or (d->>'jogador')::numeric + (d->>'time')::numeric <> cashout$q$, 'todos iguais');
commit;
`);
process.stdout.write(out.join('\n') + '\n');
