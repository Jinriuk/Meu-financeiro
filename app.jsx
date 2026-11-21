const { useState, useMemo, useEffect } = React;

/* ---------- config / cliente ---------- */
const CONFIGURED = window.SUPABASE_URL && !window.SUPABASE_URL.startsWith("COLE_AQUI");
const sb = CONFIGURED ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;

/* ---------- convite de time: grinderbank.com/?convite=TOKEN ----------
   O token fica guardado no aparelho (sobrevive à criação da conta e à confirmação de e-mail) e sai da barra
   de endereço. Com convite pendente o cadastro NÃO cria conta individual; quem aceita é o servidor. */
/* ---------- link dos e-mails (confirmar cadastro / redefinir senha) no PRÓPRIO domínio ----------
   grinderbank.com/?token_hash=…&type=… : o app confirma o código com o Supabase e limpa a barra. Link apontando
   pro mesmo domínio do remetente (e não pra supabase.co) é um dos sinais que tira o e-mail do spam. */
const LINK_EMAIL=(()=>{ try{
  const u=new URL(window.location.href); const th=u.searchParams.get('token_hash'); const tp=u.searchParams.get('type');
  if(!u.searchParams.has('token_hash')) return null;
  u.searchParams.delete('token_hash'); u.searchParams.delete('type');
  window.history.replaceState(null,'',u.pathname+u.search+u.hash);
  const tipos=['email','signup','recovery','invite','magiclink','email_change'];
  return th&&/^[A-Za-z0-9_-]{6,200}$/.test(th)&&tipos.includes(tp)?{token_hash:th,type:tp}:{invalido:true};
}catch(e){ return null; } })();
const CONVITE_KEY='gb_convite';
const conviteGuardado=()=>{ try{ return localStorage.getItem(CONVITE_KEY)||null; }catch(e){ return null; } };
const esquecerConvite=()=>{ try{ localStorage.removeItem(CONVITE_KEY); }catch(e){} };
// código do time digitado no cadastro: guardado até a conta existir (sobrevive à confirmação do e-mail)
const CODIGO_KEY='gb_codigo_time';
const codigoGuardado=()=>{ try{ return localStorage.getItem(CODIGO_KEY)||''; }catch(e){ return ''; } };
const guardarCodigo=c=>{ try{ if(c) localStorage.setItem(CODIGO_KEY,c); }catch(e){} };
const esquecerCodigo=()=>{ try{ localStorage.removeItem(CODIGO_KEY); }catch(e){} };
// "time 12345", "TIME12345" e "Time-12345" viram TIME-12345
const normCodigo=c=>String(c||'').toUpperCase().replace(/\s+/g,'').replace(/^([A-Z0-9]+?)-?(\d{5})$/,'$1-$2');
const codigoValido=c=>/^[A-Z0-9]{2,10}-\d{5}$/.test(c);
(()=>{ try{
  const u=new URL(window.location.href); const t=(u.searchParams.get('convite')||'').trim().toLowerCase();
  if(!u.searchParams.has('convite')) return;
  if(/^[0-9a-f]{64}$/.test(t)) localStorage.setItem(CONVITE_KEY,t);
  u.searchParams.delete('convite');
  window.history.replaceState(null,'',u.pathname+u.search+u.hash);
}catch(e){} })();

/* ---------- F0.17: erro em produção vai pro banco (app_erros) e vira aviso pro responsável ----------
   Só a mensagem e um pedaço da pilha; nada de dado digitado. Mesma mensagem 1x por carregamento. */
const ERROS_VISTOS=new Set();
function registrarErro(origem,mensagem,detalhe){
  try{
    const msg=String(mensagem||'').slice(0,500);
    if(!sb||!msg||ERROS_VISTOS.has(origem+'|'+msg)||ERROS_VISTOS.size>20) return;
    if(/ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:/i.test(msg)) return;   // ruído do navegador
    ERROS_VISTOS.add(origem+'|'+msg);
    sb.rpc('registrar_erro',{p_origem:origem,p_mensagem:msg,p_detalhe:detalhe||null,p_build:typeof HH_BUILD!=='undefined'?HH_BUILD:null}).then(()=>{},()=>{});
  }catch(e){}
}
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('error',e=>registrarErro('app',e&&e.message,{onde:String((e&&e.filename)||'').split('/').pop()+':'+(e&&e.lineno),pilha:String(e&&e.error&&e.error.stack||'').slice(0,600),tela:location.pathname}));
  window.addEventListener('unhandledrejection',e=>{ const r=e&&e.reason; registrarErro('app',(r&&r.message)||String(r),{pilha:String(r&&r.stack||'').slice(0,600),tela:location.pathname}); });
}

/* ---------- constantes ---------- */
const C = {
  bg:'#F5F0E6', surface:'#fff', warm:'#FCFAF3', ink:'#19231D', inkSoft:'#57645A',
  green:'#16513F', greenMid:'#1F7355', greenSoft:'#E5EDE6', gold:'#A5782C',
  goldSoft:'#F1E6CD', red:'#AE472E', redSoft:'#F5E3DC', border:'#E7DFCC',
  plum:'#4C3E92', plumSoft:'#EAE7F8',
};
const P = C.plum; // cor primária da "pool" (diferencia do app financeiro pessoal)
const WALLETS = ['PokerStars','GG Poker','Reserva','Outros'];
// GrinderBank: checkouts reais da Hotmart (produto Gestão Y106811622J · Pro K106838001X).
// O e-mail da conta vai pré-preenchido: comprar com o MESMO e-mail é o que faz o webhook
// ativar o plano sozinho na conta.
const CHECKOUT={
  gestao:{mensal:'https://pay.hotmart.com/Y106811622J?off=8yvvehri',anual:'https://pay.hotmart.com/Y106811622J?off=zzmz1hue'},
  pro:{mensal:'https://pay.hotmart.com/K106838001X?off=rpo4cutz',anual:'https://pay.hotmart.com/K106838001X?off=qkhobsay'},
};
// Pré-preenche o e-mail no checkout — é ele que liga o pagamento à conta no app.
// O separador tem que ser "?" quando a URL ainda não tem query: os links da Hotmart vinham com
// ?off=..., mas os da Kiwify são limpos (pay.kiwify.com.br/BCrSogz). Com "&" fixo, o e-mail
// virava parte do caminho e não chegava — a pessoa pagaria com outro e-mail e não receberia acesso.
const abrirCheckout=(plano,ciclo,email)=>{
  const c=CHECKOUT[plano==='gestao'?'gestao':'pro'];
  const url=c[ciclo]||c.mensal;
  const sep=url.includes('?')?'&':'?';
  window.open(url+(email?`${sep}email=${encodeURIComponent(email)}`:''),'_blank');
};
const PLAN_LABEL={free:'Grátis',gestao:'Gestão (R$ 19,90/mês)',pro:'Pro (R$ 49,90/mês)',founder:'Fundador (tudo liberado)',team:'Time'};
// tour guiado do 1º acesso: navega tela a tela com um cartão explicando cada parte
const TOUR_STEPS=[
  {v:'painel',t:'Painel — a foto geral',x:'Sua banca atual, o resultado da semana e o lucro acumulado. É a primeira tela de todo dia.'},
  {v:'torneios',t:'Torneios — a fonte de tudo',x:'Lança cada torneio aqui (buy-in, posição, prêmio). Diário, Semanal e a banca se atualizam sozinhos a partir disso.'},
  {v:'diario',t:'Diário — o dia consolidado',x:'Quantos torneios, ABI médio e resultado de cada dia — com alerta de stop loss quando o dia passa do limite que você definiu.'},
  {v:'semanal',t:'Semanal — o fechamento',x:'Resultado semana a semana e a régua do ABI: a disciplina que separa reg de degen.'},
  {v:'banca',t:'Banca — o dinheiro',x:'Saldos separados por sala (adicione as salas que você joga nos Ajustes), aportes, retiradas e transferências.'},
  {v:'stats',t:'Stats — suas estatísticas',x:'Importa suas mãos (zip do PokerCraft da GG ou .txt do PokerStars) e vê VPIP, bb/100 por posição, a sorte nos all-ins e as leituras automáticas em português.'},
  {v:'config',t:'Ajustes — suas regras',x:'Seu nome, grade de buy-in, stop loss, salas e seu plano. Toda mudança fica registrada no histórico. Fim do tour — bom grind! 🃏'},
];
// "Outros" é o coringa: qualquer site/carteira que não seja um dos nomeados (inclusive null/desconhecido)
// cai em "Outros" — assim nenhum torneio/movimento/saque some da visão por jogador/plataforma.
const WALLET_NAMED = ['PokerStars','GG Poker','Reserva'];
const walletBucket = x => WALLET_NAMED.includes(x) ? x : 'Outros';
const PLAYER_COLORS = [P, C.gold]; // jogador 1 / jogador 2
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const num = v => Number(v)||0;
// dinheiro no centavo: soma de float deixa resto (0,1+0,2 = 0,30000000000000004) e um make-up de 0,000…04 já muda
// status ("Bloqueado por make-up" com US$ 0,00). Meio centavo vai pra longe do zero, igual ao round() do banco.
const cent = v => { const n=Number(v); if(!Number.isFinite(n)) return 0; const r=Math.sign(n)*Math.round(Math.abs(n)*100+1e-6)/100; return r===0?0:r; };
// um formatador só (A-026): US$ 1.234,56, e o negativo com o sinal de menos tipográfico (−US$), igual ao fmtSinal
// valor curto de eixo de gráfico: US$ 1.234 (sem centavos), negativo com o sinal antes do US$
const fmtEixo=v=>{ const r=Math.round(Number(v)||0); return (r<0?'−':'')+'US$ '+Math.abs(r).toLocaleString('pt-BR'); };
const fmt = n => { const v=cent(Number(n)||0), t=Math.abs(v).toLocaleString('pt-BR',{style:'currency',currency:'USD'}); return v<0?'−'+t:t; };
const pctFmt = n => `${((Number(n)||0)).toFixed(1).replace('.',',')}%`;
const mKey = d => (d||'').slice(0,7);
const mLabel = k => { const [y,m]=k.split('-'); return `${MONTHS[+m-1]} de ${y}`; };
const dLabel = d => { if(!d) return ''; const [,m,day]=d.split('-'); return `${day}/${m}`; };
// data LOCAL (não UTC): no Brasil, depois das 21h o toISOString() já viraria "amanhã"
const todayISO = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
// PWA: já está rodando instalado na tela inicial? · é iPhone/iPad (instalação é manual)?
const isStandalone = () => { try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true; } catch(e){ return false; } };
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent||'') && !window.MSStream;
// soma n dias a uma data ISO (via UTC, sem depender do relógio) — usado no filtro "últimos N dias" do Diário
const addDaysISO = (iso,n) => { const [y,m,d]=(iso||todayISO()).split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d)); dt.setUTCDate(dt.getUTCDate()+n); return dt.toISOString().slice(0,10); };
function parseValor(s){
  if(typeof s==='number') return s;
  s=String(s||'').trim().replace(/[R$US\s]/g,'');
  if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
  const n=parseFloat(s); return isNaN(n)?0:n;
}
// domingo que FECHA a semana (semana = seg..dom). Usa UTC pra não escorregar fuso.
function weekEnding(dateStr){
  const [y,m,d]=(dateStr||todayISO()).split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  const day=dt.getUTCDay();           // 0 domingo ... 6 sábado
  dt.setUTCDate(dt.getUTCDate()+((7-day)%7));
  return dt.toISOString().slice(0,10);
}
// segunda que ABRE a semana fechada por `wk` (domingo)
const weekStart = wk => addDaysISO(wk,-6);
// rótulo da semana com os dois extremos — "27/07 a 02/08" deixa claro quando ela pula o mês
const weekLabel = wk => `${dLabel(weekStart(wk))} a ${dLabel(wk)}`;
// a semana encosta neste mês? (vale tanto pela segunda que abre quanto pelo domingo que fecha)
const weekInMonth = (wk,m) => mKey(wk)===m || mKey(weekStart(wk))===m;

/* F0.4: regra de senha igual em todo lugar (cadastro, troca, recuperação, primeiro acesso).
   Mínimo 8, letras E números, fora da lista das mais usadas e sem o próprio apelido/e-mail.
   O servidor também precisa barrar (painel do Supabase: senha vazada + requisitos) — isto é a 1ª linha. */
const SENHAS_COMUNS=['password','password1','passw0rd','senha123','senha1234','12345678','123456789','1234567890','qwerty123',
  'abc12345','abcd1234','a1234567','11111111','iloveyou1','admin123','poker123','pokerstars1','ggpoker1','grinderbank1','mudar123'];
function senhaFraca(p,extras){
  const s=String(p||'');
  if(s.length<8) return 'A senha precisa de pelo menos 8 caracteres.';
  if(!/[A-Za-zÀ-ÿ]/.test(s)||!/\d/.test(s)) return 'Use letras E números na senha.';
  const low=s.toLowerCase();
  if(SENHAS_COMUNS.includes(low)||/^(.)\1+$/.test(s)) return 'Essa senha é das mais usadas — escolhe outra.';
  for(const x of (extras||[])){ const e=String(x||'').toLowerCase().split('@')[0]; if(e.length>=4&&low.includes(e)) return 'A senha não pode conter seu apelido ou e-mail.'; }
  return null;
}
/* ---------- regras de negócio (seção 4) ---------- */
// normaliza antes de salvar: semana do saque vira domingo; "pool/não informar" viram null (não atribuído)
function normalizeRow(type,d){
  d={...d};
  if(type==='wd' && d.week_ending_date) d.week_ending_date=weekEnding(d.week_ending_date);
  if(type==='wd' && (d.wallet==='Não informar'||!d.wallet)) d.wallet=null;
  if(type==='bank' && (d.player==='Pool / Reserva'||!d.player)) d.player=null;
  return d;
}

/* ---------- backup CSV (separador ; e BOM pra abrir certo no Excel pt-BR) ---------- */
function toCSV(rows){
  if(!rows.length) return '';
  const cols=Object.keys(rows[0]);
  const esc=v=>{ if(v==null) v=''; if(Array.isArray(v)) v=v.join(', '); v=String(v); return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
  return [cols.join(';'), ...rows.map(r=>cols.map(c=>esc(r[c])).join(';'))].join('\n');
}
function downloadCSV(name,rows){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+toCSV(rows)],{type:'text/csv;charset=utf-8'}));
  a.download=`${name}-${todayISO()}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}
// resultado do dia: se veio derivado dos torneios usa e.resultado; senão cai na fórmula antiga (compat)
const resultadoDia = e => e.resultado!=null ? num(e.resultado) : num(e.saldo_final)+num(e.saque)-num(e.saldo_inicial)-num(e.deposito);
// ABI médio = investido / nº de entradas (re-entry conta como entrada); mede o nível de buy-in
// ABI = nível médio enfrentado -> usa o buy-in NOMINAL (bilhete conta o valor cheio).
// O ||total_buyins é compatibilidade com linha antiga do Diário, que só tinha o campo de dinheiro.
const abiMedioDia  = e => { const ent=num(e.qtd_entradas)||num(e.qtd_torneios); return ent>0 ? (num(e.buyins_nominal)||num(e.total_buyins))/ent : 0; };
function gradeStatus(e, abiMax){
  if(num(e.maior_buyin) > abiMax) return 'FORA DA GRADE';
  if((num(e.qtd_entradas)||num(e.qtd_torneios))>0 && abiMedioDia(e) >= abiMax*0.9) return 'ATENÇÃO';
  return 'OK';
}
/* Dois números que costumavam ser um só:
   · NOMINAL = o nível que o jogador enfrentou (define ABI, grade e stop loss em buy-ins)
   · INVESTIDO = o dinheiro que realmente saiu da banca
   Entrada por BILHETE (ticket/T$ ganho num satélite) tem nominal cheio e investido zero — o
   custo já foi pago quando o satélite foi jogado; contar de novo seria cobrar duas vezes. */
const nominalTorneio = t => num(t.buyin)*(1+num(t.reentries));
const totalInvestido = t => t.ticket ? 0 : nominalTorneio(t);
// Bounty de PKO é dinheiro ganho À PARTE do prêmio por colocação (F0.8): entra no lucro, mas fica em
// campo próprio — relatório mostra prêmio e bounty separados, e ITM continua sendo só prêmio > 0.
const bountyTorneio  = t => num(t.bounty);
const lucroTorneio   = t => num(t.prize)+bountyTorneio(t)-totalInvestido(t);
// ABI máximo por jogador (cada um tem seu limite de grade); cai no padrão se não definido.
// Com `date`, devolve o ABI vigente NAQUELE dia: desfaz as mudanças registradas depois dele —
// torneio antigo é julgado pela grade da época, não pela atual.
let CONFIG_CHANGES=[];   // histórico de alterações dos Ajustes (carregado do banco pelo Dashboard)
const abiMaxFor = (config, player, date) => {
  const daReta = regraDoJogador('abi_max', player, date);            // time: a regra da reta do jogador
  if(daReta!=null && num(daReta)>0) return num(daReta);
  const key = player===config.player2_name ? 'abi_max_player2' : 'abi_max_player1';
  let v = num(config[key]);
  if(!(v>0)) v = num(config.abi_max)||2;
  if(date){
    const hist=CONFIG_CHANGES.filter(c=>c.field===key).sort((a,b)=>a.created_at<b.created_at?1:-1);
    for(const c of hist){ if(String(c.created_at).slice(0,10)>date && num(c.old_value)>0) v=num(c.old_value); }
  }
  return v;
};
// O Supabase devolve no máximo 1.000 linhas por consulta (teto padrão do projeto). Sem paginar, a conta com mais de
// 1.000 torneios via banca, Diário e Mês errados sem aviso. Lê de 1.000 em 1.000 até a última página; `montar` refaz a
// consulta a cada página, com ordem estável (a coluna única por último). Erro em qualquer página = erro: meia lista
// mostraria a banca errada como se estivesse certa.
async function lerTudo(montar, lote=1000){
  const out=[];
  for(let de=0;;de+=lote){
    const {data,error}=await montar().range(de,de+lote-1);
    if(error) return {data:null,error};
    const pg=data||[]; for(const x of pg) out.push(x);
    if(pg.length<lote) return {data:out,error:null};
  }
}
// monta o "Diário" a partir dos torneios: 1 linha por jogador por dia (fonte da verdade = torneios)
function deriveDaily(tours){
  const map={};
  tours.forEach(t=>{
    const k=String(t.player??'').trim().toLowerCase()+'|'+t.entry_date;   // "hero " e "Hero" são o mesmo jogador
    if(!map[k]) map[k]={id:k, entry_date:t.entry_date, player:String(t.player??'').trim(), qtd_torneios:0, qtd_entradas:0, total_buyins:0, buyins_nominal:0, tickets:0, maior_buyin:0, maior_premiacao:0, bounties:0, resultado:0};
    const m=map[k], inv=totalInvestido(t);
    m.qtd_torneios+=1;
    m.qtd_entradas+=1+num(t.reentries);
    m.total_buyins+=inv;                        // dinheiro que saiu (bilhete não soma)
    m.buyins_nominal+=nominalTorneio(t);        // nível enfrentado (bilhete soma cheio)
    if(t.ticket) m.tickets+=1;
    m.maior_buyin=Math.max(m.maior_buyin, num(t.buyin));   // grade julga pelo nível, não pelo custo
    m.maior_premiacao=Math.max(m.maior_premiacao, num(t.prize));
    m.bounties+=bountyTorneio(t);
    m.resultado+=lucroTorneio(t);
  });
  return Object.values(map).map(m=>({...m,total_buyins:cent(m.total_buyins),buyins_nominal:cent(m.buyins_nominal),bounties:cent(m.bounties),resultado:cent(m.resultado)}))
    .sort((a,b)=>a.entry_date<b.entry_date?1:-1);
}
// Processa as semanas em ordem cronológica, carregando o make-up de uma pra outra.
function computeWeeks(daily, config){
  const players=[config.player1_name, config.player2_name];
  const makeInit={[config.player1_name]:num(config.makeup_inicial_player1),[config.player2_name]:num(config.makeup_inicial_player2)};
  const out={};
  players.forEach(p=>{
    if(!String(p??'').trim()){ out[p]=[]; return; }   // pool sem 2º jogador / gestor que não joga
    const entries=daily.filter(e=>nomeIgual(e.player,p));
    const weeks=[...new Set(entries.map(e=>weekEnding(e.entry_date)))].sort();
    let makeUp=cent(makeInit[p]||0);
    // tudo no centavo: comparar "make-up > 0" ou "pago < autorizado" com resto de float dá status errado
    out[p]=weeks.map(wk=>{
      const wkEntries=entries.filter(e=>weekEnding(e.entry_date)===wk);
      const resultado=cent(wkEntries.reduce((s,e)=>s+resultadoDia(e),0));
      const makeAnterior=makeUp;
      const makeFinal=cent(Math.max(0, makeAnterior-resultado));
      const lucroDiv=cent(Math.max(0, resultado-makeAnterior));
      const parteJog=cent(lucroDiv*num(config.player_pct));
      const partePool=cent(lucroDiv-parteJog);            // o resto é da pool: as duas partes somam o lucro, sem centavo perdido
      const saqueAut=makeFinal===0 ? parteJog : 0;
      makeUp=makeFinal;
      return {week:wk, player:p, resultado, makeAnterior, makeFinal, lucroDiv, parteJog, partePool, saqueAut, entries:wkEntries};
    });
  });
  return out;
}
function saqueStatus(w, bancaAtual, piso, valorSacado){
  const aut=cent(w.saqueAut), pago=cent(valorSacado);
  if(cent(w.makeFinal)>0) return 'Bloqueado por make-up';
  if(aut===0) return 'Sem valor a sacar';
  if(cent(bancaAtual-aut) < cent(piso)) return 'Bloqueado por banca abaixo do piso';
  if(pago===0) return 'Autorizado';
  if(pago < aut) return 'Parcialmente autorizado';
  return 'Pago';
}
const STATUS_TONE = {
  'OK':{tone:C.greenMid,bg:C.greenSoft}, 'ATENÇÃO':{tone:C.gold,bg:C.goldSoft}, 'FORA DA GRADE':{tone:C.red,bg:C.redSoft},
  'Pago':{tone:C.greenMid,bg:C.greenSoft}, 'Autorizado':{tone:P,bg:C.plumSoft},
  'Parcialmente autorizado':{tone:C.gold,bg:C.goldSoft}, 'Sem valor a sacar':{tone:C.inkSoft,bg:C.bg},
  'Bloqueado por make-up':{tone:C.red,bg:C.redSoft}, 'Bloqueado por banca abaixo do piso':{tone:C.red,bg:C.redSoft},
};

/* ============================================================
   MOTOR DE ESTATÍSTICAS DE MÃOS (hand histories PokerStars / GG)
   Tudo roda no navegador; pro banco sobem SÓ agregados por torneio.
   ============================================================ */
const HH_RANKS='23456789TJQKA', HH_SUITS='cdhs';
const hhCard = s => { const r=HH_RANKS.indexOf((s||'')[0]), u=HH_SUITS.indexOf(((s||'')[1]||'').toLowerCase()); return r<0||u<0?-1:r*4+u; };
const hhNum  = s => Number(String(s==null?'':s).replace(/[,$\s]/g,''))||0;
// melhor mão de 5 entre 7 cartas -> número comparável (maior = melhor)
function hhScore(cs){
  const R=c=>c>>2, S=c=>c&3, byR=Array(13).fill(0); cs.forEach(c=>byR[R(c)]++);
  const uniq=[]; for(let r=12;r>=0;r--) if(byR[r]) uniq.push(r);
  const stTop=rs=>{ const set=new Set(rs); if(set.has(12)) set.add(-1); for(let h=12;h>=3;h--){ let ok=true; for(let k=0;k<5;k++) if(!set.has(h-k)){ok=false;break;} if(ok) return h; } return -1; };
  const sc=(cat,ts)=>{ let v=cat; for(let i=0;i<5;i++) v=v*15+((ts&&ts[i]!=null)?ts[i]+1:0); return v; };
  for(let s=0;s<4;s++){ const fr=cs.filter(c=>S(c)===s).map(R).sort((a,b)=>b-a); if(fr.length>=5){ const st=stTop([...new Set(fr)]); return st>=0?sc(9,[st]):sc(6,fr.slice(0,5)); } }
  const quad=uniq.find(r=>byR[r]===4);
  if(quad!=null) return sc(8,[quad,uniq.find(r=>r!==quad)]);
  const trips=uniq.filter(r=>byR[r]===3), pairs=uniq.filter(r=>byR[r]===2);
  if(trips.length&&(trips.length>1||pairs.length)) return sc(7,[trips[0],trips.length>1?trips[1]:pairs[0]]);
  const st=stTop(uniq); if(st>=0) return sc(5,[st]);
  if(trips.length) return sc(4,[trips[0],...uniq.filter(r=>r!==trips[0]).slice(0,2)]);
  if(pairs.length>=2) return sc(3,[pairs[0],pairs[1],uniq.find(r=>r!==pairs[0]&&r!==pairs[1])]);
  if(pairs.length===1) return sc(2,[pairs[0],...uniq.filter(r=>r!==pairs[0]).slice(0,3)]);
  return sc(1,uniq.slice(0,5));
}
// equity do herói vs vilões de cartas conhecidas; river/turn/flop = enumeração exata, pré-flop = Monte Carlo
function hhEquity(hero,vils,board){
  const dead=new Set([...hero,...vils.flat(),...board]);
  const deck=[]; for(let c=0;c<52;c++) if(!dead.has(c)) deck.push(c);
  const need=5-board.length; let win=0,tot=0;
  const run=ex=>{ const full=board.concat(ex);
    const hs=hhScore(hero.concat(full)); let best=hs,n=1,heroTop=true;
    for(const v of vils){ const vs=hhScore(v.concat(full)); if(vs>best){best=vs;heroTop=false;n=1;} else if(vs===best) n++; }
    tot++; if(heroTop) win+=1/n; };
  if(need<=0) run([]);
  else if(need===1) deck.forEach(c=>run([c]));
  else if(need===2){ for(let i=0;i<deck.length;i++) for(let j=i+1;j<deck.length;j++) run([deck[i],deck[j]]); }
  else { let seed=987654321; const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
    for(let k=0;k<1500;k++){ const d=deck.slice(), ex=[]; for(let m=0;m<need;m++) ex.push(d.splice(Math.floor(rnd()*d.length),1)[0]); run(ex); } }
  return tot?win/tot:0;
}
// parseia UMA mão (dialetos PokerStars e GG/PokerCraft, que imita o formato PS)
const HH_BUILD='2026-11-17.1';   // aparece no card de import e no diagnóstico (pra saber que versão a pessoa está rodando)
// Versão das DEFINIÇÕES do motor (gravada em cada agregado). Mudou a regra de alguma stat? Sobe o número:
// reimportar um torneio de versão antiga recalcula a linha inteira em vez de somar por cima (F0.15).
//  1 = motor até jul/2026 · 2 = definições do PT4 (anexo A do plano mestre, calibradas em 56.255 mãos)
const HH_ENGINE=2;
// posições no padrão do PT4: SB/BB por quem POSTOU; BTN pelo cabeçalho (no heads-up o botão é o SB);
// dos que sobram, o último antes do BTN é CO; EP = UTG (+UTG+1 com 8 ou 9 na mesa; nenhum com 5 ou menos); o resto é MP.
function hhPositions(order,button,sbP,bbP){
  const pos={}; const N=order.length; if(!N) return pos;
  const bi=order.findIndex(s=>s.seat===button);
  if(N===2){ const btn=sbP||(bi>=0?order[bi].n:null); if(btn) pos[btn]='SB'; const o=order.find(s=>s.n!==btn); if(o) pos[bbP||o.n]='BB'; return pos; }
  if(sbP) pos[sbP]='SB'; if(bbP) pos[bbP]='BB';
  if(bi>=0&&!pos[order[bi].n]) pos[order[bi].n]='BTN';
  // ordem de ação pré-flop dos que não são blind nem botão: do 1º depois do BB até o último antes do BTN
  const ib=bbP?order.findIndex(s=>s.n===bbP):(bi>=0?(bi+2)%N:-1);
  const resto=[];
  if(ib>=0) for(let k=1;k<N;k++){ const s=order[(ib+k)%N]; if(bi>=0&&s.seat===order[bi].seat) break; if(!pos[s.n]) resto.push(s.n); }
  const nEP=N>=8?2:N>=6?1:0;   // PT4: 5 jogadores não têm EP (o UTG é MP) — conferido mão a mão
  resto.forEach((n,i)=>{ pos[n]= i===resto.length-1?'CO': i<nEP?'EP':'MP'; });
  return pos;
}
function hhParseHand(block,why){
  const skip=r=>{ if(why) why.r=r; return null; };   // devolve null anotando o MOTIVO (pro relatório de import)
  const lines=block.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  // o transcript por e-mail do PS quebra o cabeçalho em 2 linhas — junta até achar os blinds "(600/1200)"
  let head=lines[0], hi=1;
  while(hi<lines.length&&hi<4&&!/\(\s*[\d,]+\/[\d,]+/.test(head)){ head+=' '+lines[hi]; hi++; }
  const site=head.includes('PokerStars')?'PokerStars':'GG Poker';
  if(!/Hold'em/.test(head)) return skip('modalidade');                                   // v1: só No-Limit Hold'em
  const mT=head.match(/(?:Tournament|Torneio) #([^,\s]+)/); if(!mT) return skip('cash');  // só torneios
  const tid=mT[1];
  // blinds: PS "(35/70)" ou "(50/100/10)" · GG "Level6(150/300(35))" com ante aninhado
  const mBB=head.match(/\(([\d,]+)\/([\d,]+)(?:[\/(]([\d,]+)\)?)?\)/); const bb=mBB?hhNum(mBB[2]):0; if(!bb) return skip('formato');
  const mD=head.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})/); const date=mD?`${mD[1]}-${mD[2]}-${mD[3]}`:null;
  const mH=head.match(/#([^:\s]+):/); const hid=mH?mH[1]:null;   // nº da mão (dedup)
  const seg=head.slice(0,Math.max(0,head.search(/Hold'em/)));
  // buy-in: o PS traz no cabeçalho ("$1.40+$0.10 USD"). A GG NÃO: o que tem lá é o NOME do torneio, e nome
  // tem garantido ("Daily $100,000 #ThanksGG Flipout" é freeroll). Na GG o buy-in vem do resumo (F0.11).
  const depois=(seg.split(/(?:Tournament|Torneio) #[^,]+,\s*/)[1]||'');
  let buyin=0, tname=null;
  if(site==='PokerStars'){ (seg.match(/\$\s?[\d.,]+/g)||[]).forEach(x=>buyin+=hhNum(x));
    tname=(depois.replace(/[$€£¥]\s?[\d.,]+/g,'').replace(/USD|EUR|CNY|\+/g,'').trim().replace(/[,\s]+$/,''))||null; }
  else tname=depois.trim().replace(/,$/,'')||null;

  let button=0; const seats=[]; let hero=null, heroCards=null;
  let street=0; const board=[]; const acts=[]; const invested={}, collected={}, shows={}, antes={}, blinds={};
  let commit={}; let showdown=false, inSummary=false; let sbP=null, bbP=null; const allinPost=new Set();
  const addInv=(n,x)=>{ invested[n]=(invested[n]||0)+x; };
  const ACT_PT={desiste:'folds',passa:'checks',iguala:'calls',aposta:'bets',aumenta:'raises'};
  const ALLIN=/and is all[- ]in|e está all-in/;
  for(let i=hi;i<lines.length;i++){
    const L=lines[i]; let m;
    if(/\*\*\* (SUMMARY|SUMÁRIO)/.test(L)){ inSummary=true; continue; }   // às vezes vem colado no fim de outra linha
    if(inSummary) continue;
    if(/^Hand #\d+:?$/.test(L)) break;   // transcript do PS: começo da próxima mão
    if(m=L.match(/(?:Seat|Lugar) #(\d+) (?:is the button|é o botão)/)){ button=+m[1]; continue; }
    if(m=L.match(/^(?:Seat|Lugar) (\d+): (.+?) \(\$?\s?([\d,.]+) (?:in chips|em fichas)/)){
      if(/out of hand|fora da mão/.test(L)) continue;   // sentou e não recebeu cartas nesta mão: não é jogador da mão
      seats.push({seat:+m[1],n:m[2],chips:hhNum(m[3])}); continue; }
    if(m=L.match(/^Dealt to (.+?) \[([^\]]+)\]/)){ hero=m[1]; heroCards=m[2].split(/\s+/).map(hhCard); continue; }
    if(m=L.match(/^(.+?) recebe \[([^\]]+)\]/)){ hero=m[1]; heroCards=m[2].split(/\s+/).map(hhCard); continue; }   // cliente PT
    if(/^\*\*\* FLOP/.test(L)){ street=1; commit={}; const mm=L.match(/\[([^\]]+)\]/); if(mm) mm[1].split(/\s+/).forEach(c=>{const k=hhCard(c); if(k>=0&&board.length<3) board.push(k);}); continue; }
    if(/^\*\*\* TURN/.test(L)){ street=2; commit={}; const mm=L.match(/\]\s*\[([^\]]+)\]/); if(mm){const k=hhCard(mm[1].trim()); if(k>=0) board[3]=k;} continue; }
    if(/^\*\*\* RIVER/.test(L)){ street=3; commit={}; const mm=L.match(/\]\s*\[([^\]]+)\]/); if(mm){const k=hhCard(mm[1].trim()); if(k>=0) board[4]=k;} continue; }
    if(/^\*\*\* SHOW ?DOWN/.test(L)){ showdown=true; continue; }   // PS "SHOW DOWN" · GG "SHOWDOWN"
    if(m=L.match(/^(?:Uncalled bet|Aposta não-igualada) \(?\$?\s?([\d,.]+)\)?\s+(?:returned to|voltou para) (.+)$/)){ addInv(m[2],-hhNum(m[1])); continue; }
    if(m=L.match(/^(.+?) collected \$?([\d,]+) from/)){ collected[m[1]]=(collected[m[1]]||0)+hhNum(m[2]); continue; }
    if(m=L.match(/^(.+?) recebeu \$?\s?([\d,.]+) do(?: \S+)? pote/)){ collected[m[1]]=(collected[m[1]]||0)+hhNum(m[2]); continue; }  // PT: pote / principal pote / secundário pote
    if(m=L.match(/^(.+?): (?:shows|mostra) \[([^\]]+)\]/)){ shows[m[1]]=m[2].split(/\s+/).map(hhCard).filter(c=>c>=0); continue; }
    if(m=L.match(/^(.+?): (?:posts (?:the )?ante|coloca ante) \$?\s?([\d,.]+)/)){ const x=hhNum(m[2]); addInv(m[1],x); antes[m[1]]=(antes[m[1]]||0)+x; if(ALLIN.test(L)) allinPost.add(m[1]); continue; }
    if(m=L.match(/^(.+?): (?:posts|paga o) (small|big) blind \$?\s?([\d,.]+)/)){ const x=hhNum(m[3]); addInv(m[1],x); commit[m[1]]=(commit[m[1]]||0)+x; blinds[m[1]]=(blinds[m[1]]||0)+x;
      if(m[2]==='small') sbP=sbP||m[1]; else bbP=bbP||m[1]; if(ALLIN.test(L)) allinPost.add(m[1]); continue; }
    if(m=L.match(/^(.+?): (?:posts|paga)\b.*?([\d,.]+)$/)){ addInv(m[1],hhNum(m[2])); continue; }   // straddle/dead blind
    if(m=L.match(/^(.+?): (folds|checks|calls|bets|raises|desiste|passa|iguala|aposta|aumenta)\b\s*\$?\s?([\d,.]*)(?:\s+(?:to|para)\s+\$?\s?([\d,.]+))?/)){
      const n=m[1],act=ACT_PT[m[2]]||m[2],allin=ALLIN.test(L);
      let to=0;
      if(act==='calls'||act==='bets'){ const x=hhNum(m[3]); addInv(n,x); commit[n]=(commit[n]||0)+x; to=commit[n]; }
      if(act==='raises'){ to=hhNum(m[4]||m[3]); addInv(n,Math.max(0,to-(commit[n]||0))); commit[n]=to; }
      acts.push({n,act,street,allin,to});
      continue;
    }
  }
  if(!hero||!heroCards||heroCards.length!==2||heroCards.some(c=>c<0)) return skip('incompleta');
  if(!seats.some(s=>s.n===hero)) return skip('incompleta');

  // a GG não escreve "and is all-in" quando o ante + blind levam o stack inteiro: detecta pelas fichas
  seats.forEach(s=>{ if(s.chips>0&&(antes[s.n]||0)+(blinds[s.n]||0)>=s.chips) allinPost.add(s.n); });
  const heroInv=invested[hero]||0, heroCol=collected[hero]||0, net=heroCol-heroInv;
  const order=seats.slice().sort((a,b)=>a.seat-b.seat);
  const nP=order.length;
  const posMap=hhPositions(order,button,sbP,bbP);
  const heroPos=posMap[hero]||'EP';
  const heroChips=(seats.find(s=>s.n===hero)||{}).chips||0;
  // ---------------- pré-flop ----------------
  const pre=acts.filter(a=>a.street===0);
  const heroPre=pre.filter(a=>a.n===hero);
  const walk=heroPre.length===0;     // PT4: nenhuma ação do herói no pré-flop (walk, ou all-in no blind/ante)
  let raises=0, firstRaiser=null, lastRaiser=null, lastRaiseTo=0, callersSinceRaise=0, limpers=0;
  let heroActedPre=false, heroFoldedPre=false, heroWasOpener=false;
  let vpip=false,pfr=false,pfrOpp=false,rfiOpp=false,rfi=false,tbOpp=false,tb=false,sqOpp=false,sq=false,f3bOpp=false,f3b=false;
  let stealOpp=false,steal=false,bbdefOpp=false,bbdef=false,bbVs=null;
  const stealPos=p=>p==='CO'||p==='BTN'||p==='SB';
  // o opener abriu com todos antes dele desistindo (roubo)
  const abriuLimpo=op=>{ for(const x of pre){ if(x.n===op) return x.act==='raises'; if(x.act!=='folds') return false; } return false; };
  // estado corrente do pré-flop: quanto cada um já pôs na rodada, quem foldou, quem está all-in
  const cm={}; Object.keys(blinds).forEach(n=>{ cm[n]=blinds[n]; });
  const foldou=new Set(), allinPre=new Set(allinPost);
  // dá pra AUMENTAR? (PT4: sem isso não há oportunidade de 3-bet/4-bet) — precisa sobrar ficha depois de pagar
  // e ter pelo menos um adversário vivo que não esteja all-in (contra quem só tem all-in na frente, só cabe call)
  const podeAumentarAgora=()=>{
    const nivel=Math.max(0,...Object.values(cm));
    const resta=heroChips-(antes[hero]||0)-(cm[hero]||0);
    return resta>nivel-(cm[hero]||0)&&order.some(s=>s.n!==hero&&!foldou.has(s.n)&&!allinPre.has(s.n));
  };
  let tbVisto=false;
  for(const a of pre){
    if(a.n===hero){
      if(!heroActedPre){
        heroActedPre=true;
        const openOpp=raises===0&&limpers===0;
        if(openOpp){ rfiOpp=true; rfi=a.act==='raises'; if(stealPos(heroPos)){ stealOpp=true; steal=rfi; } }
        // PFR com a oportunidade do PT4 (cnt_pfr_opp do relatório): 2+ ações no pré-flop, ou 1 ação podendo
        // aumentar (stack > BB + ante e o raise enfrentado menor que o que sobra) em open, limp, 3-bet ou 4-bet
        const sobra=heroChips-((blinds[hero]||0)+(antes[hero]||0));
        // "raise enfrentado" do PT4 (amt_p_raise_facing) = o que falta pagar, não o "to" do raise (conferido mão a mão)
        const podeAumentar=heroChips>bb+(antes[hero]||0)&&Math.max(0,lastRaiseTo-(blinds[hero]||0))<sobra;
        const spot=openOpp||(raises===0&&limpers>0)||(raises>=1&&podeAumentarAgora());
        if(heroPre.length>=2||(podeAumentar&&spot)) pfrOpp=true;
        // defesa do BB contra roubo de CO/BTN/SB; conta o spot mesmo com call do SB no meio (sem re-raise)
        if(heroPos==='BB'&&raises===1&&stealPos(posMap[firstRaiser])&&abriuLimpo(firstRaiser)){
          bbdefOpp=true; bbdef=a.act==='calls'||a.act==='raises'; bbVs=posMap[firstRaiser]; }
      } else if(heroWasOpener&&raises===2&&!f3bOpp){ f3bOpp=true; f3b=a.act==='folds'; }   // fold to 3-bet: só quem abriu
      // 3-bet do PT4 (flg_p_3bet_opp): a 1ª decisão do herói diante de exatamente 1 raise (vale depois de limp),
      // COM ou sem caller no meio — os 10,67% do relatório incluem o squeeze (conferido no export mão a mão).
      // Só conta se dava pra aumentar. Squeeze é o recorte com caller(s) entre o raise e o herói.
      if(!tbVisto&&raises===1&&lastRaiser!==hero){
        tbVisto=true;
        if(podeAumentarAgora()){ tbOpp=true; tb=a.act==='raises'; }
        // squeeze do PT4 conta o spot mesmo quando o herói só pode pagar/foldar (conferido mão a mão)
        if(callersSinceRaise>0){ sqOpp=true; sq=a.act==='raises'; }
      }
      // PT4: quem pagou no spot de squeeze e aumenta numa decisão seguinte também conta como squeeze
      if(sqOpp&&!sq&&a.act==='raises') sq=true;
      if(a.act==='calls'||a.act==='raises') vpip=true;
      if(a.act==='raises'){ pfr=true; if(raises===0) heroWasOpener=true; }
      if(a.act==='folds') heroFoldedPre=true;
    } else {
      if(a.act==='calls'){ if(raises===0) limpers++; else callersSinceRaise++; }
    }
    if(a.act==='folds') foldou.add(a.n);
    if(a.allin) allinPre.add(a.n);
    if(a.act==='calls'||a.act==='raises'||a.act==='bets') cm[a.n]=a.to;
    if(a.act==='raises'){ raises++; lastRaiser=a.n; lastRaiseTo=a.to; callersSinceRaise=0; if(!firstRaiser) firstRaiser=a.n; }
  }
  // ---------------- flop: c-bet / fold pra c-bet ----------------
  const sawflop=board.length>=3&&!heroFoldedPre;
  let cbetOpp=false,cbet=false,fcbOpp=false,fcb=false;
  if(sawflop&&raises>0){
    let betSeen=false, betBy=null, heroActed=false, raisedAfterBet=false;
    for(const a of acts.filter(x=>x.street===1)){
      if(a.n===hero){
        if(!heroActed&&lastRaiser===hero&&!betSeen){ cbetOpp=true; cbet=(a.act==='bets'); }
        // enfrenta a c-bet SEM raise entre a c-bet e o herói
        if(!fcbOpp&&lastRaiser!==hero&&betBy===lastRaiser&&!raisedAfterBet&&betSeen){ fcbOpp=true; fcb=(a.act==='folds'); }
        heroActed=true;
      }
      if(a.act==='bets'&&!betSeen){ betSeen=true; betBy=a.n; }
      else if(a.act==='raises'){ if(betBy) raisedAfterBet=true; betSeen=true; }
    }
  }
  const heroFolded=acts.some(a=>a.n===hero&&a.act==='folds');
  // showdown DE VERDADE exige cartas mostradas — a GG imprime o marcador SHOWDOWN em toda mão, até fold-win
  const wtsd=showdown&&!heroFolded&&Object.keys(shows).length>0, wsd=wtsd&&heroCol>0, wwsf=sawflop&&heroCol>0;
  // WTSD sem all-in pré-flop: só conta flop com alguma ação depois dele (F0.14)
  const sawflopNp=sawflop&&acts.some(a=>a.street>0);
  let afB=0,afC=0; acts.forEach(a=>{ if(a.n===hero&&a.street>0){ if(a.act==='bets'||a.act==='raises') afB++; if(a.act==='calls') afC++; } });
  // ---------------- all-in EV (Sorte), regra do PT4 ----------------
  // Potes por nível de contribuição, só jogadores vivos, equity na ÚLTIMA decisão do herói. Não ajusta quando
  // (a) alguém pagou/aumentou depois do 1º all-in e depois foldou, ou (b) houve ação depois da última decisão do herói.
  let allin=null;
  const folded=new Set(acts.filter(a=>a.act==='folds').map(a=>a.n));
  const live=order.map(s=>s.n).filter(n=>!folded.has(n));
  const anyAllin=allinPost.size>0||acts.some(a=>a.allin);
  if(anyAllin&&!heroFolded&&live.length>=2&&live.includes(hero)){
    const cardsOf=n=>n===hero?heroCards:shows[n];
    if(live.every(n=>{ const c=cardsOf(n); return c&&c.length===2; })){
      const heroActs=acts.filter(a=>a.n===hero);
      const heroLast=heroActs.length?Math.max(...heroActs.map(a=>a.street)):0;
      // 1º all-in: se alguém ficou all-in já no blind/ante, ele vem ANTES de toda ação
      const i0=allinPost.size>0?-1:acts.findIndex(a=>a.allin);
      const depois=(allinPost.size>0||i0>=0)?acts.slice(i0+1):[];
      const r1=depois.some(x=>x.act==='folds'&&depois.some(y=>y.n===x.n&&(y.act==='calls'||y.act==='raises')));
      const r2=acts.some(a=>a.street>heroLast);
      // (c) houve ação numa street DEPOIS da do 1º all-in (side pot disputado adiante) — conferido mão a mão
      const st0=allinPost.size>0?0:(i0>=0?acts[i0].street:0);
      const r3=acts.some(a=>a.street>st0);
      if(r1||r2||r3) allin={ev:net/bb,net:net/bb};
      else {
        const bAt=board.slice(0,[0,3,4,5][heroLast]).filter(c=>c!=null&&c>=0);
        const contrib=n=>invested[n]||0;
        const levels=[...new Set(live.map(contrib))].sort((a,b)=>a-b);
        const todos=Object.keys(invested);
        let prev=0, ev=0;
        for(const lv of levels){
          let pot=0; for(const k of todos) pot+=Math.max(0,Math.min(contrib(k),lv)-prev);
          const elig=live.filter(n=>contrib(n)>=lv);
          if(elig.includes(hero)){
            if(elig.length===1) ev+=pot;
            else ev+=hhEquity(heroCards,elig.filter(n=>n!==hero).map(cardsOf),bAt)*pot;
          }
          prev=lv;
        }
        allin={ev:(ev-heroInv)/bb,net:net/bb};
      }
    }
  }
  const stackBB=heroChips/bb;
  const bucket=stackBB<10?'<10bb':stackBB<20?'10-20bb':stackBB<40?'20-40bb':'40bb+';
  return {site,tid,tname,buyin,date,bb,hid,net_bb:net/bb,pos:heroPos,bucket,
    walk,vpip,pfr,pfrOpp,rfiOpp,rfi,tbOpp,tb,sqOpp,sq,f3bOpp,f3b,stealOpp,steal,bbdefOpp,bbdef,bbVs,cbetOpp,cbet,fcbOpp,fcb,
    sawflop,sawflopNp,wwsf,wtsd,wsd,afB,afC,allin};
}
// texto -> mãos parseadas
function parseHH(text){
  const issues=[]; let ignored=0; const hands=[]; const reasons={};
  // o transcript por e-mail do PS usa form-feed (\f) como quebra em alguns pontos — normaliza pra \n
  text=String(text||'').replace(/[\f]/g,'\n');
  // corta no INÍCIO de cada mão (funciona com o transcript por e-mail, que separa com "*** # N ***")
  const blocks=text.split(/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m)
    .filter(b=>/^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #/.test(b.trim()));
  for(const b of blocks){
    const why={r:null};
    try{ const h=hhParseHand(b.trim(),why); if(h) hands.push(h); else { ignored++; const r=why.r||'formato'; reasons[r]=(reasons[r]||0)+1; } }
    catch(e){ ignored++; reasons.formato=(reasons.formato||0)+1; if(issues.length<10) issues.push('mão ignorada: '+e.message); }
  }
  return {hands,ignored,issues,reasons};
}
// agrega mãos -> 1 linha por (site, torneio); player vem do seletor do import
function hhAggregate(hands,player){
  const agg={};
  for(const h of hands){
    const k=h.site+'|'+h.tid;
    if(!agg[k]) agg[k]={player,site:h.site,site_tournament_id:h.tid,tournament_name:h.tname,entry_date:h.date,buyin:h.buyin,
      hands:0,net_bb:0,vpip_cnt:0,pfr_cnt:0,tb_cnt:0,tb_opp:0,f3b_cnt:0,f3b_opp:0,steal_cnt:0,steal_opp:0,
      bbdef_cnt:0,bbdef_opp:0,cbet_cnt:0,cbet_opp:0,fcbet_cnt:0,fcbet_opp:0,sawflop_cnt:0,wwsf_cnt:0,wtsd_cnt:0,wsd_cnt:0,
      af_bets:0,af_calls:0,allin_cnt:0,allin_ev_bb:0,allin_net_bb:0,
      walk_cnt:0,pfr_opp:0,rfi_cnt:0,rfi_opp:0,sq_cnt:0,sq_opp:0,sawflop_np_cnt:0,wtsd_np_cnt:0,engine_version:HH_ENGINE,
      pos_json:{},stack_json:{},hand_ids:[]};
    const a=agg[k];
    if(h.hid) a.hand_ids.push(h.hid);
    if(h.date&&(!a.entry_date||h.date<a.entry_date)) a.entry_date=h.date;
    if(h.buyin>a.buyin) a.buyin=h.buyin;
    a.hands++; a.net_bb+=h.net_bb;
    if(h.walk)a.walk_cnt++;
    if(h.vpip)a.vpip_cnt++; if(h.pfr)a.pfr_cnt++; if(h.pfrOpp)a.pfr_opp++;
    if(h.rfiOpp)a.rfi_opp++; if(h.rfi)a.rfi_cnt++;
    if(h.tbOpp)a.tb_opp++; if(h.tb)a.tb_cnt++;
    if(h.sqOpp)a.sq_opp++; if(h.sq)a.sq_cnt++;
    if(h.f3bOpp)a.f3b_opp++; if(h.f3b)a.f3b_cnt++;
    if(h.stealOpp)a.steal_opp++; if(h.steal)a.steal_cnt++;
    if(h.bbdefOpp)a.bbdef_opp++; if(h.bbdef)a.bbdef_cnt++;
    if(h.cbetOpp)a.cbet_opp++; if(h.cbet)a.cbet_cnt++;
    if(h.fcbOpp)a.fcbet_opp++; if(h.fcb)a.fcbet_cnt++;
    if(h.sawflop)a.sawflop_cnt++; if(h.wwsf)a.wwsf_cnt++; if(h.wtsd)a.wtsd_cnt++; if(h.wsd)a.wsd_cnt++;
    if(h.sawflopNp){ a.sawflop_np_cnt++; if(h.wtsd) a.wtsd_np_cnt++; }
    a.af_bets+=h.afB; a.af_calls+=h.afC;
    if(h.allin){ a.allin_cnt++; a.allin_ev_bb+=h.allin.ev; a.allin_net_bb+=h.allin.net; }
    // por posição: h mãos · w walks · v/p vpip/pfr · po oportunidade de PFR · ro/r raise first in ·
    // net bb ganhos · adj bb com all-in ajustado · hn mãos com net rastreado (linhas antigas não têm) ·
    // no BB: vBTN_o/vBTN_f (e CO, SB) = enfrentou roubo daquela posição / foldou
    if(!a.pos_json[h.pos]) a.pos_json[h.pos]={h:0,w:0,v:0,p:0,po:0,ro:0,r:0,net:0,adj:0,hn:0};
    const pj=a.pos_json[h.pos];
    pj.h++; if(h.walk)pj.w++; if(h.vpip)pj.v++; if(h.pfr)pj.p++; if(h.pfrOpp)pj.po++; if(h.rfiOpp)pj.ro++; if(h.rfi)pj.r++;
    pj.net+=h.net_bb; pj.adj+=h.allin?h.allin.ev:h.net_bb; pj.hn++;
    if(h.bbVs){ pj['v'+h.bbVs+'_o']=(pj['v'+h.bbVs+'_o']||0)+1; if(!h.bbdef) pj['v'+h.bbVs+'_f']=(pj['v'+h.bbVs+'_f']||0)+1; }
    if(!a.stack_json[h.bucket]) a.stack_json[h.bucket]={h:0,v:0,p:0,net:0};
    const sb2=a.stack_json[h.bucket]; sb2.h++; if(h.vpip)sb2.v++; if(h.pfr)sb2.p++; sb2.net+=h.net_bb;
  }
  // arredonda numéricos UMA vez no fim (arredondar a cada mão acumularia deriva)
  const r2=x=>Math.round(x*100)/100;
  return Object.values(agg).map(a=>{
    const pj={}; Object.keys(a.pos_json).forEach(k=>{ pj[k]={...a.pos_json[k],net:r2(a.pos_json[k].net),adj:r2(a.pos_json[k].adj)}; });
    return {...a,pos_json:pj,net_bb:r2(a.net_bb),allin_ev_bb:r2(a.allin_ev_bb),allin_net_bb:r2(a.allin_net_bb)};
  });
}
// soma um agregado de mãos NOVAS numa linha já existente do banco (import incremental sem contar 2x)
const HH_SUM_KEYS=['hands','net_bb','vpip_cnt','pfr_cnt','tb_cnt','tb_opp','f3b_cnt','f3b_opp','steal_cnt','steal_opp',
  'bbdef_cnt','bbdef_opp','cbet_cnt','cbet_opp','fcbet_cnt','fcbet_opp','sawflop_cnt','wwsf_cnt','wtsd_cnt','wsd_cnt',
  'af_bets','af_calls','allin_cnt','allin_ev_bb','allin_net_bb',
  'walk_cnt','pfr_opp','rfi_cnt','rfi_opp','sq_cnt','sq_opp','sawflop_np_cnt','wtsd_np_cnt'];
// colunas que o app carrega ao abrir: TUDO menos hand_ids (lista de nº de mãos, que cresce com o volume e
// só serve pro dedup no import — com 200 mil mãos eram vários MB baixados a cada abertura). F0.18
const HH_COLS=['id','workspace_id','player','site','site_tournament_id','tournament_name','entry_date','buyin',
  ...HH_SUM_KEYS.filter(k=>k!=='hands'),'hands','engine_version','pos_json','stack_json','created_by','created_at'].join(',');
const semIds=r=>{ if(!r||!('hand_ids' in r)) return r; const {hand_ids,...x}=r; return x; };
function mergeHH(a,b){
  const out={...a};
  HH_SUM_KEYS.forEach(k=>out[k]=Math.round((num(a[k])+num(b[k]))*100)/100);
  out.entry_date=[a.entry_date,b.entry_date].filter(Boolean).sort()[0]||null;
  out.buyin=Math.max(num(a.buyin),num(b.buyin));
  out.tournament_name=a.tournament_name||b.tournament_name;
  // linha com mãos de versões diferentes do motor fica marcada com a MAIS ANTIGA (a tela pede reimport completo)
  out.engine_version=Math.min(num(a.engine_version)||1,num(b.engine_version)||1);
  const mj=(x,y)=>{ const o=JSON.parse(JSON.stringify(x||{})); Object.keys(y||{}).forEach(k=>{ if(!o[k]) o[k]={...y[k]}; else Object.keys(y[k]).forEach(kk=>o[k][kk]=num(o[k][kk])+num(y[k][kk])); }); return o; };
  out.pos_json=mj(a.pos_json,b.pos_json); out.stack_json=mj(a.stack_json,b.stack_json);
  out.hand_ids=[...new Set([...(a.hand_ids||[]),...(b.hand_ids||[])])];
  return out;
}
// decodifica dando conta de BOM/UTF-16 (arquivo salvo como "Unicode" no Windows/celular)
const decodeSmart=u=>{
  if(u[0]===0xFE&&u[1]===0xFF) return new TextDecoder('utf-16be').decode(u);
  if(u[0]===0xFF&&u[1]===0xFE) return new TextDecoder('utf-16le').decode(u);
  let nul=0; const n=Math.min(u.length,400); for(let i=0;i<n;i++) if(u[i]===0) nul++;
  if(nul>n/4) return new TextDecoder(u[0]===0?'utf-16be':'utf-16le').decode(u);   // UTF-16 sem BOM
  return new TextDecoder().decode(u);   // UTF-8 (o decoder já tira o BOM)
};
const isZip=u=>u.length>3&&u[0]===0x50&&u[1]===0x4B&&u[2]<=8;   // "PK…" mesmo se renomearam a extensão
/* ---------- resumo de torneio (Tournament Summary) ----------
   O caminho preguiçoso e certo de lançar torneio: em vez de digitar um a um, o jogador joga a
   pasta de resumos do dia (GG/PokerCraft ou PokerStars) e o sistema lê nome, buy-in, re-entries,
   field, posição e premiação de cada arquivo. Diferente do hand history, o resumo é UM torneio
   por arquivo e traz o resultado oficial do site — é a fonte da verdade do que aconteceu. */
const TS_START=/^(?:PokerStars |GGPoker )?Tournament #\d+[,\s]/m;
// "$9,815.75" -> 9815.75 (vírgula só é separador de milhar nesses arquivos, que são sempre en-US)
const pl=(n,um,varios)=>`${n} ${n===1?um:varios}`;   // plural certo: "1 torneio", "2 torneios" (A-064)
const tsMoney = s => { const n=parseFloat(String(s).replace(/[^\d.,-]/g,'').replace(/,(?=\d{3}(\D|$))/g,'').replace(',','.')); return isNaN(n)?0:n; };
function parseSummaries(text){
  const rows=[];
  // um arquivo pode trazer vários resumos colados (transcript por e-mail do PokerStars)
  const blocks=String(text||'').replace(/\f/g,'\n').split(/(?=^(?:PokerStars |GGPoker )?Tournament #\d+[,\s])/m).filter(b=>/Tournament #\d+/.test(b));
  for(const b of blocks){
    const head=b.match(/^(?:PokerStars |GGPoker )?Tournament #(\d+)(?:,\s*(.*))?$/m);
    if(!head) continue;
    // cabeçalho GG: "Bounty Hunters Special $5.40, Hold'em No Limit" · PS às vezes só traz o jogo.
    // Só a ÚLTIMA vírgula separa o jogo: "Daily $100,000 #ThanksGG Flipout" tem vírgula de milhar no nome (F0.11)
    const resto=String(head[2]||'').trim();
    const mg=resto.match(/^(.*\S)\s*,\s*([^,]*(?:hold\s*'?em|omaha|stud|razz|badugi|draw|\baof\b)[^,]*)$/i);
    const game=mg?mg[2].trim():null;
    const name=(mg?mg[1]:resto).trim()||null;
    const bi=b.match(/^Buy-?[Ii]n:\s*(.+)$/m);
    // GG separa por "+", PokerStars por "/" — somamos todas as parcelas (base, taxa e bounty), em qualquer moeda
    const MOEDA={'$':'USD','€':'EUR','£':'GBP','¥':'CNY'};
    const parcelas=bi?[...bi[1].matchAll(/([$€£¥])\s?([\d.,]+)/g)]:[];
    const pedacos=parcelas.map(m=>tsMoney(m[2]));
    const moeda=parcelas.length?MOEDA[parcelas[0][1]]:((b.match(/received a total of ([$€£¥])/i)||[])[1]?MOEDA[b.match(/received a total of ([$€£¥])/i)[1]]:'USD');
    const fld=b.match(/^([\d,]+)\s+[Pp]layers/m);
    const dt =b.match(/Tournament started\s+(\d{4})\/(\d{2})\/(\d{2})/);
    const pos=b.match(/You finished (?:the tournament )?in (\d+)(?:st|nd|rd|th)? place/i);
    const rec=b.match(/You (?:made (\d+) re-?(?:entries|entry|buys|buy) and )?received a total of [$€£¥]\s?([\d.,]+)/i);
    const re2=b.match(/You made (\d+) re-?(?:entries|entry|buys|buy)/i);
    // prêmio pago em BILHETE (satélite): não é dinheiro na banca — vira 0 e fica na observação.
    // Olha SÓ a linha do "You received": torneio chamado "... Ticket ..." não pode zerar prêmio.
    const linhaRec=(b.match(/^You .*received.*$/im)||[''])[0];
    const premioTicket=/ticket/i.test(linhaRec)&&!rec;
    // PKO: o buy-in vem em 3 parcelas ($prêmio + taxa + bounty) ou o nome anuncia a bounty
    const bounty=pedacos.length>=3||/bounty|knockout|\bko\b|progressive|mystery/i.test((name||'')+' '+(game||''));
    rows.push({
      tid:head[1], name, game, bounty, moeda,
      psite:/^PokerStars/.test(b.trim())?'PokerStars':null,
      buyin:Math.round(pedacos.reduce((s,x)=>s+x,0)*100)/100,
      reentries:rec&&rec[1]?parseInt(rec[1],10):(re2?parseInt(re2[1],10):0),
      field:fld?parseInt(fld[1].replace(/,/g,''),10):0,
      date:dt?`${dt[1]}-${dt[2]}-${dt[3]}`:null,
      position:pos?parseInt(pos[1],10):null,
      prize:rec?tsMoney(rec[2]):0,
      premioTicket, satelite:tsCheiroSatelite(name),
    });
  }
  return rows;
}
/* F0.10: torneios do PokerStars a partir do PRÓPRIO hand history (o PS não precisa de resumo separado).
   Por torneio: colocação ("finished the tournament in Nth place [and received $X]" ou "wins the tournament
   and receives $X"), prêmio, bounties ("wins $X for eliminating/splitting the elimination of …"), título,
   re-entries (cada "finished" é uma entrada que acabou) e buy-in do cabeçalho ($1.44+$1.50+$0.36).
   Torneio sem linha de fim no arquivo (ainda rodando) volta com fim:false e não é lançado. */
function psTorneiosDoHH(text){
  const t=String(text||'').replace(/\f/g,'\n');
  const blocos=t.split(/(?=^(?:PokerStars Hand|PokerStars Game) #)/m).filter(b=>/^PokerStars (?:Hand|Game) #/.test(b));
  const T={}; const cont={colocacoes:0,premios:0,bounties:0,titulos:0};
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const b of blocos){
    const head=b.split(/\r?\n/)[0];
    const mt=head.match(/Tournament #(\d+)/); if(!mt) continue;
    const hero=(b.match(/^Dealt to (.+?) \[/m)||[])[1]; if(!hero) continue;
    const tid=mt[1];
    if(!T[tid]){
      const seg=head.slice(0,Math.max(0,head.search(/Hold'em|Omaha|Stud|Razz|Draw/)));
      const parc=[...seg.matchAll(/([$€£])\s?([\d.,]+)/g)];
      const MOEDA={'$':'USD','€':'EUR','£':'GBP'};
      const md=head.match(/(\d{4})\/(\d{2})\/(\d{2})/);
      T[tid]={tid,name:null,game:"Hold'em No Limit",psite:'PokerStars',moeda:parc.length?MOEDA[parc[0][1]]:'USD',
        buyin:Math.round(parc.reduce((s,m)=>s+tsMoney(m[2]),0)*100)/100,freeroll:/Freeroll/i.test(seg),
        bounty:parc.length>=3, date:md?`${md[1]}-${md[2]}-${md[3]}`:null, field:0,
        fins:0, position:null, prize:0, bountyGanho:0, titulo:false, fim:false, premioTicket:false, satelite:false};
    }
    const x=T[tid], h=esc(hero);
    for(const m of b.matchAll(new RegExp('^'+h+' finished the tournament in (\\d+)(?:st|nd|rd|th) place(?: and received [$€£]([\\d.,]+))?','gm'))){
      x.fins++; x.position=parseInt(m[1],10); x.fim=true; cont.colocacoes++; if(m[2]){ x.prize+=tsMoney(m[2]); cont.premios++; } }
    for(const m of b.matchAll(new RegExp('^'+h+' wins the tournament and receives [$€£]([\\d.,]+)','gm'))){
      x.position=1; x.titulo=true; x.fim=true; x.prize+=tsMoney(m[1]); cont.titulos++; }
    for(const m of b.matchAll(new RegExp('^'+h+' wins (?:the )?[$€£]([\\d.,]+) (?:bounty )?for (?:eliminating|splitting the elimination of)','gm'))){
      x.bountyGanho+=tsMoney(m[1]); cont.bounties++; }
  }
  const rows=Object.values(T).map(x=>({...x,
    reentries:Math.max(0,x.fins+(x.titulo?1:0)-1),
    prize:Math.round(x.prize*100)/100, bountyGanho:Math.round(x.bountyGanho*100)/100}));
  return {rows,cont};
}
/* F0.9: o que um resumo do site pode mudar num torneio que o jogador JÁ lançou à mão.
   Dados descritivos (id do site, nome, field, posição) completam sem perguntar. Campos que mudam
   o dinheiro (prêmio, bounty, re-entries) NUNCA são trocados sem confirmação: se o arquivo diverge
   do digitado, vira um conflito que a prévia mostra; o padrão é manter o digitado.
   Bounty só é comparado quando o arquivo traz o valor (o resumo da GG não traz). */
const TS_DINHEIRO=['prize','bounty','reentries'];
function tsMesclar(manual,linha,escolhas){
  const upd={site_tournament_id:linha.site_tournament_id, tournament_name:linha.tournament_name, modality:linha.modality,
    site:linha.site, field_size:linha.field_size, final_position:linha.final_position, ticket:!!linha.ticket};
  const conflitos=[];
  for(const k of TS_DINHEIRO){
    if(linha[k]==null) continue;                       // o arquivo não informa
    const a=num(manual[k]), b=num(linha[k]);
    if(Math.abs(a-b)<=0.005) continue;
    conflitos.push({campo:k,digitado:a,arquivo:b});
    if(escolhas&&escolhas[k]==='arquivo') upd[k]=b;     // só com confirmação explícita
  }
  return {upd,conflitos};
}
// valores que valem pra um item da prévia (novo = do arquivo; completa = digitado salvo escolha contrária)
const tsEfetivo=x=>x.atual?{...x.linha,...Object.fromEntries(TS_DINHEIRO.map(k=>[k,num(x.atual[k])])),...tsMesclar(x.atual,x.linha,x.escolhas).upd}:x.linha;
// escolhe a modalidade do jogador (Ajustes) que combina com o torneio lido
const tsModalidade=(mods,bounty)=>{
  const m=(mods&&mods.length)?mods:['MTT'];
  const acha=re=>m.find(x=>re.test(x));
  if(bounty) return acha(/pko|bount|knock|\bko\b/i)||acha(/mtt|torneio|vanilla/i)||m[0];
  return acha(/vanilla/i)||acha(/^mtt$/i)||acha(/mtt|torneio/i)||m[0];
};
// torneio com CARA de satélite: é onde normalmente se entra (ou se ganha) bilhete. O arquivo do
// site NÃO diz se a entrada foi paga com ticket, então isso é só um palpite pra sugerir a marcação.
const tsCheiroSatelite = nome => /(^|\W)(step\s*\d|sat\b|satellite|sat[ée]lite|qualifier|classific|ticket|seat)/i.test(String(nome||''));
// nome comparável: "Daily Classic $3" e "daily classic 3" são o mesmo torneio
const tsNorm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
// faixas saudáveis de referência (MTT micro/low) — verde dentro, amarelo perto, vermelho fora
const HH_BANDS={vpip:[18,27],pfr:[14,22],tb:[5,10],f3b:[45,65],steal:[30,50],bbdef:[35,55],cbet:[50,75],fcbet:[40,60],wtsd:[28,36],wsd:[48,58],wwsf:[42,52]};
const fmtBB=n=>`${n>=0?'+':'−'}${Math.abs(n).toFixed(1).replace('.',',')} bb`;
// glossário das siglas (mostrado na tela Stats)
const HH_GLOSS=[
  ['VPIP','% de mãos em que você pôs ficha por vontade própria antes do flop (call ou raise; blind obrigatório não conta). Mede quantas mãos você joga.'],
  ['PFR','% de mãos em que você deu raise pré-flop. Quanto mais perto do VPIP, mais agressivo (e melhor) o estilo.'],
  ['3-bet','Re-raise em cima de quem abriu. Pouco 3-bet = os outros abrem de graça contra você.'],
  ['Fold pra 3-bet','Quantas vezes você desistiu depois de abrir e levar um re-raise. Muito baixo = paga demais; muito alto = vira alvo.'],
  ['Roubo de blinds','Abertura de CO, BTN ou SB quando todos foldaram antes — a jogada mais lucrativa do MTT com antes.'],
  ['BB defende','Quantas vezes você (no BB) pagou ou re-raisou contra um roubo, em vez de foldar.'],
  ['C-bet flop','Aposta de continuação: você abriu pré-flop e seguiu apostando no flop.'],
  ['Fold pra c-bet','Quantas vezes você desistiu no flop contra a c-bet do agressor. Alto demais = "fit-or-fold", fácil de explorar.'],
  ['WWSF','% das vezes que você viu o flop e LEVOU o pote, com ou sem showdown (potes ganhos ÷ flops vistos). Mede briga pós-flop.'],
  ['WTSD','% das vezes que, tendo visto o flop, você foi até o showdown (showdowns ÷ flops vistos — definição padrão de tracker). Atenção: o HUD da GG mostra o "WT" sobre TODAS as mãos, por isso o número de lá é bem menor que o daqui. Alto = paga muito; baixo = desiste muito.'],
  ['W$SD','% dos showdowns que você ganhou (showdowns ganhos ÷ showdowns disputados). Lido junto com o WTSD: ir muito ao showdown e ganhar pouco = vazamento clássico.'],
  ['AF (agressão)','(apostas + raises) ÷ calls no pós-flop. Abaixo de ~1,5 = passivo; acima de ~4 = hiperagressivo.'],
  ['bb/100','Resultado em big blinds a cada 100 mãos, em FICHAS de torneio — mede qualidade de jogo, não dinheiro direto.'],
  ['Sorte (all-in EV)','Explicada no card "Sorte nos all-ins" acima. Mede só os all-ins com cartas viradas — sorte pré-all-in (cooler, distribuição), bounty de PKO e ICM ficam fora da conta.'],
];
/* Totais das stats a partir das linhas agregadas (hh_tournament_stats). Fonte ÚNICA das contas da tela
   Stats e do relatório em PDF — e o que o teste de calibração confere contra o PT4.
   Linhas de versão antiga do motor (engine_version < HH_ENGINE) não têm os contadores novos: entram
   com a definição antiga (denominador = mãos) e a tela avisa pra reimportar. */
function hhTotals(rows){
  const S=k=>rows.reduce((s,r)=>s+num(r[k]),0);
  const nova=r=>(num(r.engine_version)||1)>=2;
  const Sn=(k,fb)=>rows.reduce((s,r)=>s+(nova(r)?num(r[k]):num(r[fb])),0);   // contador novo com fallback na linha antiga
  const hands=S('hands'), walks=S('walk_cnt');
  const pos={};
  rows.forEach(r=>{ const pj=r.pos_json||{}; Object.keys(pj).forEach(k=>{ const x=pj[k]||{};
    if(!pos[k]) pos[k]={h:0,w:0,v:0,p:0,po:0,ro:0,r:0,net:0,adj:0,hn:0,an:0};
    const o=pos[k]; o.h+=num(x.h); o.w+=num(x.w); o.v+=num(x.v); o.p+=num(x.p); o.ro+=num(x.ro); o.r+=num(x.r); o.net+=num(x.net); o.hn+=num(x.hn);
    o.po+=nova(r)?num(x.po):num(x.h);
    if(x.adj!=null){ o.adj+=num(x.adj); o.an+=num(x.hn); }   // all-in ajustado só existe nas linhas novas
    Object.keys(x).forEach(kk=>{ if(/^v(BTN|CO|SB)_[of]$/.test(kk)) o[kk]=(o[kk]||0)+num(x[kk]); });
  }); });
  const allinEv=S('allin_ev_bb'), allinNet=S('allin_net_bb'), net=S('net_bb');
  const T={hands,walks,vpip:S('vpip_cnt'),vpipDen:hands-walks,pfr:S('pfr_cnt'),pfrOpp:Sn('pfr_opp','hands'),
    rfi:S('rfi_cnt'),rfiOpp:S('rfi_opp'),tb:S('tb_cnt'),tbOpp:S('tb_opp'),sq:S('sq_cnt'),sqOpp:S('sq_opp'),
    f3b:S('f3b_cnt'),f3bOpp:S('f3b_opp'),steal:S('steal_cnt'),stealOpp:S('steal_opp'),bbdef:S('bbdef_cnt'),bbdefOpp:S('bbdef_opp'),
    cbet:S('cbet_cnt'),cbetOpp:S('cbet_opp'),fcb:S('fcbet_cnt'),fcbOpp:S('fcbet_opp'),
    sawflop:S('sawflop_cnt'),wwsf:S('wwsf_cnt'),wtsd:S('wtsd_cnt'),wsd:S('wsd_cnt'),
    // WTSD sem all-in pré-flop (F0.14): só flops com ação depois deles
    wtsdNp:Sn('wtsd_np_cnt','wtsd_cnt'),wtsdDen:Sn('sawflop_np_cnt','sawflop_cnt'),
    afB:S('af_bets'),afC:S('af_calls'),allinCnt:S('allin_cnt'),allinEv,allinNet,sorte:allinNet-allinEv,net,
    bb100:hands>0?net/hands*100:0, adjBb100:hands>0?(net-(allinNet-allinEv))/hands*100:0,
    pos, antigas:rows.filter(r=>!nova(r)).length};
  return T;
}
// entrada das leituras automáticas a partir dos totais
const hhInsightInput=T=>({hands:T.hands,vpip:T.vpip,vpipDen:T.vpipDen,pfr:T.pfr,pfrOpp:T.pfrOpp,tb:T.tb,tbOpp:T.tbOpp,f3b:T.f3b,f3bOpp:T.f3bOpp,
  steal:T.steal,stealOpp:T.stealOpp,bbdef:T.bbdef,bbdefOpp:T.bbdefOpp,cbet:T.cbet,cbetOpp:T.cbetOpp,fcb:T.fcb,fcbOpp:T.fcbOpp,
  wtsd:T.wtsd,wtsdNp:T.wtsdNp,wtsdDen:T.wtsdDen,wsd:T.wsd,wwsf:T.wwsf,sawflop:T.sawflop,afB:T.afB,afC:T.afC,sorte:T.sorte,allinCnt:T.allinCnt,pos:T.pos,bb100:T.bb100});
/* Leituras automáticas: compara as suas stats com as faixas de um reg de MTT micro/low e
   escreve o que precisa de atenção. Cada regra só dispara com amostra mínima. */
function hhInsights(d){
  // k (opcional) liga a leitura à stat que a gerou — a tela usa pra abrir a frase ao tocar no número
  const out=[]; const add=(tone,t,x,k)=>out.push({tone,t,x,k});
  const pct=(c,o)=>o>0?c/o*100:null;
  const p={vpip:pct(d.vpip,d.vpipDen!=null?d.vpipDen:d.hands),pfr:pct(d.pfr,d.pfrOpp!=null?d.pfrOpp:d.hands),tb:pct(d.tb,d.tbOpp),f3b:pct(d.f3b,d.f3bOpp),steal:pct(d.steal,d.stealOpp),bbdef:pct(d.bbdef,d.bbdefOpp),cbet:pct(d.cbet,d.cbetOpp),fcb:pct(d.fcb,d.fcbOpp),wtsd:d.wtsdDen!=null?pct(d.wtsdNp,d.wtsdDen):pct(d.wtsd,d.sawflop),wsd:pct(d.wsd,d.wtsd),wwsf:pct(d.wwsf,d.sawflop)};
  const f=n=>n==null?'—':n.toFixed(1).replace('.',',')+'%';
  const f1=n=>n.toFixed(1).replace('.',',');
  // VPIP/PFR/gap por posição — deixa as leituras cirúrgicas em vez de acusar a posição errada
  const pp=k=>{ const x=d.pos&&d.pos[k]; if(!x||!(num(x.h)>0)) return null; const h=num(x.h), hv=(h-num(x.w))||h, po=num(x.po)||h; return {h,v:num(x.v)/hv*100,pr:num(x.p)/po*100,gap:num(x.v)/hv*100-num(x.p)/po*100}; };
  // gap VPIP−PFR SEM os blinds: defesa de BB é call por natureza (e completar SB pode ser plano),
  // então contar blinds no gap acusaria "passividade" injustamente
  const nb=['EP','MP','CO','BTN'].reduce((a,k)=>{const x=d.pos&&d.pos[k]; if(x){a.h+=num(x.h);a.v+=num(x.v);a.p+=num(x.p);} return a;},{h:0,v:0,p:0});
  const gapNB=nb.h>=200?(nb.v-nb.p)/nb.h*100:null;
  if(d.hands<300) add('info','Amostra pequena',`Com ${pl(d.hands,'mão','mãos')}, as leituras são preliminares — padrão de verdade aparece a partir de ~1.000 mãos (ideal 5.000+). Importe mais sessões antes de mudar o jogo por causa delas.`);
  if(d.hands>=200){
    if(p.vpip>29){
      const ep=pp('EP'), mp=pp('MP');
      const earlyOk=ep&&ep.h>=60&&ep.v<=24&&(!mp||mp.h<60||mp.v<=28);
      if(earlyOk) add('red','Jogando mãos demais (nas posições finais)',`VPIP total ${f(p.vpip)} (reg: 18–27%), mas o EP tá controlado (${f1(ep.v)}%) — o excesso vem de CO/BTN e dos blinds: cold calls e defesas largas é que inflam o número. Corte os spots ruins de posição final (call atrás sem stack pra pagar quando acerta), não a categoria inteira de mãos.`,'vpip');
      else add('red','Jogando mãos demais',`VPIP ${f(p.vpip)} (reg: 18–27%). Mão fraca de mais vira prejuízo no pós-flop — aperte primeiro as aberturas de EP/MP.`,'vpip');
    }
    if(p.vpip!=null&&p.vpip<16) add('gold','Muito apertado',`VPIP ${f(p.vpip)} (reg: 18–27%). Dá pra abrir mais em CO/BTN sem virar aventura — hoje você deixa roubo fácil na mesa.`,'vpip');
    const gap=(p.vpip!=null&&p.pfr!=null)?p.vpip-p.pfr:null;
    if(gapNB!=null){
      if(gapNB>9) add('red','Passividade pré-flop (fora dos blinds)',`De EP a BTN, a diferença VPIP−PFR é de ${f1(gapNB)} pontos (ideal até ~8) — muito call/limp onde dava pra raise ou fold. Os blinds ficam fora dessa conta: defender o BB de call é normal.`,'pfr');
    } else if(gap!=null&&gap>9) add('red','Passividade pré-flop',`Diferença VPIP−PFR de ${f1(gap)} pontos (ideal até ~8). Você entra muito de call/limp: prefira raise ou fold. (Sem amostra por posição pra excluir os blinds — parte disso pode ser defesa normal de BB; reimporte as mãos pra refinar.)`,'pfr');
  }
  if(d.tbOpp>=40&&p.tb<4.5) add('gold','Pouco 3-bet',`3-bet ${f(p.tb)} (reg: 5–10%). Sem 3-bet, os regs abrem em cima de você de graça — adicione blefes tipo A5s.`,'tb');
  if(d.f3bOpp>=15){
    if(p.f3b<40) add('red','Pagando 3-bet demais',`Fold pra 3-bet ${f(p.f3b)} (reg: 45–65%). Defender toda abertura contra 3-bet queima stack — solte as marginais. Os piores candidatos: call fora de posição e call deep contra range forte de EP; reshove de short e min-3-bet de recreativo são outra conversa.`,'f3b');
    if(p.f3b>70) add('gold','Foldando demais pra 3-bet',`Fold pra 3-bet ${f(p.f3b)} (reg: 45–65%). Quando percebem, passam a 3-betar você sem mão.`,'f3b');
  }
  if(d.stealOpp>=30&&p.steal<28) add('gold','Roubando pouco',`Roubo de blinds ${f(p.steal)} (reg: 30–50%). Com antes em jogo, roubar de CO/BTN/SB é onde o MTT se ganha.`,'steal');
  if(d.bbdefOpp>=30&&p.bbdef<32) add('gold','Foldando o BB demais',`Defesa de BB ${f(p.bbdef)} (reg: 35–55%). Pelo preço que o BB paga pra ver, folda-se menos do que parece.`,'bbdef');
  if(d.cbetOpp>=30){
    if(p.cbet>78) add('gold','C-bet no automático',`C-bet ${f(p.cbet)} (reg: 50–75%). Mantenha a frequência alta heads-up, em posição e em board seco (A72r, K83r) — o corte é nos outros spots: multiway, fora de posição e board médio/conectado (T98, 876 com draw). São os últimos 10–15 pontos que viram rifa.`,'cbet');
    if(p.cbet<45) add('gold','Agressor passivo',`C-bet ${f(p.cbet)} (reg: 50–75%). Quem abriu o pote precisa continuar contando a história com mais frequência.`,'cbet');
  }
  if(d.fcbOpp>=30&&p.fcb>62) add('gold','Fold demais pra c-bet',`Fold pra c-bet ${f(p.fcb)} (reg: 40–60%). "Errou o flop, desistiu" é o vazamento mais explorado do micro.`,'fcb');
  if(d.sawflop>=100){
    if(p.wtsd>37&&p.wsd!=null&&p.wsd<47) add('red','Chegando ao showdown atrás',`WTSD ${f(p.wtsd)} com W$SD ${f(p.wsd)} (reg de MTT: 28–36% / 48–58%). Você paga até o fim e chega sem a melhor mão. A correção não é virar nit: é chegar ao river com range mais forte e escolher bluff catcher por blocker e sizing — não por "a linha do vilão não faz sentido".`,'wsd');
    else if(p.wtsd>38) add('gold','Showdown demais',`WTSD ${f(p.wtsd)} (reg de MTT: 28–36%, sem all-in pré-flop). Confira se os calls de turn/river têm equity de verdade.`,'wtsd');
    if(p.wwsf!=null&&p.wwsf<40) add('gold','Pouca briga pós-flop',`WWSF ${f(p.wwsf)} (reg: 42–52%). Ganhar pote sem showdown é obrigação no MTT — mais agressão em board seco.`,'wwsf');
  }
  const af=d.afC>0?d.afB/d.afC:null;
  if(af!=null&&(d.afB+d.afC)>=60&&af<1.3) add('gold','Passivo pós-flop',`Agressão (AF) ${af.toFixed(1).replace('.',',')} (reg: ~1,5–3). Mais bet/raise, menos call.`);
  // ---- bb/100 cruzado com a sorte: o lucro/prejuízo é jogo ou variância? ----
  if(d.hands>=300&&d.bb100!=null){
    const luck100=d.hands>0?d.sorte/d.hands*100:0, adj=d.bb100-luck100;
    const par=`bb/100 real ${fmtBB(d.bb100)} · sem a sorte dos all-ins ${fmtBB(adj)}`;
    // hedge honesto: a conta cobre só os all-ins de cartas viradas — não é sentença sobre o jogo todo
    const evNote=' (Conta feita só nos all-ins com cartas viradas — sorte pré-all-in, bounty de PKO e ICM ficam fora; é hipótese forte, não sentença.)';
    if(d.bb100>=0&&adj>=0) add('green','Winrate saudável',`${par}. O lucro não depende de rodar bem nos all-ins — é jogo, não moeda.${evNote}`,'bb100');
    else if(d.bb100>=0&&adj<0) add('gold','Lucro inflado pelos all-ins',`${par}. Nos all-ins medidos você recebeu acima do justo: não suba de grade por esse resultado e revise os spots antes que a variância cobre.${evNote}`,'bb100');
    else if(d.bb100<0&&adj>=0) add('info','Prejuízo com cara de variância',`${par}. Nos all-ins medidos o jogo gerou valor; o resultado é que ainda não mostrou. Mantém o plano, a grade e o volume.${evNote}`,'bb100');
    else add('red','Winrate negativo mesmo sem azar',`${par}. Nem o azar dos all-ins explica o prejuízo sozinho — prioridade é atacar os vazamentos apontados acima.${evNote}`,'bb100');
  }
  // ---- leituras COMBINADAS: dois números que, juntos, contam uma história ----
  // o perfil "entra bem mas não sai": paga 3-bet, gruda contra c-bet e vai demais ao showdown.
  // O leak não é abrir demais — é não ter ponto de saída quando o vilão mostra força.
  if(d.f3bOpp>=15&&d.fcbOpp>=30&&d.sawflop>=100&&p.f3b<40&&p.fcb<35&&p.wtsd>38)
    add('red','Resiste demais depois de entrar no pote',`Fold pra 3-bet ${f(p.f3b)} + fold pra c-bet ${f(p.fcb)} + WTSD ${f(p.wtsd)}: você entra no pote razoavelmente bem, mas não solta a mão quando o adversário mostra força — antes e depois do flop. A evolução não é abrir menos: é melhorar os pontos de saída (largar contra 3-bet fora de posição, abandonar o float que não melhorou, soltar o bluff catcher sem blocker).`);
  if(d.stealOpp>=30&&d.f3bOpp>=15&&p.steal>45&&p.f3b>70)
    add('gold','Rouba, mas não defende o roubo',`Roubo de blinds ${f(p.steal)} + fold pra 3-bet ${f(p.f3b)}: você abre muito de CO/BTN/SB e desiste quando reagem. Reg atento passa a 3-betar você sem mão — abra um pouco menos ou defenda mais as melhores.`);
  if(d.cbetOpp>=30&&d.sawflop>=100&&p.cbet>70&&p.wwsf<42)
    add('gold','Uma bala só',`C-bet ${f(p.cbet)} + WWSF ${f(p.wwsf)}: você atira quase sempre no flop mas raramente leva o pote sem showdown — sinal de barril único que desiste no turn. Planeje a mão inteira antes da primeira aposta.`);
  if(d.bbdefOpp>=30&&d.fcbOpp>=30&&p.bbdef>50&&p.fcb>60)
    add('gold','Defende o BB e larga no flop',`Defesa de BB ${f(p.bbdef)} + fold pra c-bet ${f(p.fcb)}: pagar pra ver e desistir na primeira aposta é doação em duas parcelas. Ou defenda menos mãos, ou brigue mais nos flops que tocam seu range.`);
  {const gap2=(p.vpip!=null&&p.pfr!=null)?p.vpip-p.pfr:null;
  if(d.hands>=200&&gap2!=null&&gap2>9&&af!=null&&(d.afB+d.afC)>=60&&af<1.3)
    add('red','Passivo pré e pós-flop',`VPIP−PFR de ${gap2.toFixed(1).replace('.',',')} pontos + AF ${af.toFixed(1).replace('.',',')}: o padrão completo é de jogo de call — entra pagando e segue pagando. É o perfil que mais perde no micro; a correção rende mais que qualquer ajuste fino.`);}
  if(d.allinCnt>=15){
    if(d.sorte<=-15) add('info','Rodando abaixo do EV',`${fmtBB(d.sorte)} de "sorte" em ${d.allinCnt} all-ins com cartas viradas: parte do resultado ruim é variância, não erro. Mantenha o plano, a grade e o volume. (Em PKO, lembre: o bounty não entra nessa conta.)`);
    if(d.sorte>=15) add('info','Rodando acima do EV',`${fmtBB(d.sorte)} em ${d.allinCnt} all-ins com cartas viradas: o resultado está inflado pela sorte — não suba de grade por causa dele.`);
  }
  const ep=d.pos&&d.pos.EP, btn=d.pos&&d.pos.BTN;
  if(ep&&ep.h>=60&&(ep.v/ep.h*100)>24) add('gold','Aberto demais de posição inicial',`VPIP de EP em ${(ep.v/ep.h*100).toFixed(1).replace('.',',')}% (reg: ~14–20%). Mão marginal de EP joga a mão toda fora de posição.`,'pos:EP');
  if(btn&&btn.h>=60&&(btn.v/btn.h*100)<30) add('gold','Botão subaproveitado',`VPIP no BTN em ${(btn.v/btn.h*100).toFixed(1).replace('.',',')}% (reg: ~35–55%). O botão é a cadeira mais lucrativa da mesa — abra mais.`,'pos:BTN');
  // cold call em excesso nas posições de raise (gap VPIP−PFR alto no BTN/SB)
  {const bp=pp('BTN');
  if(bp&&bp.h>=60&&bp.v>=30&&bp.gap>12) add('gold','Cold call demais no botão',`No BTN seu VPIP é ${f1(bp.v)}% mas o PFR é só ${f1(bp.pr)}% (gap de ${f1(bp.gap)} pontos). Botão é cadeira de raise: mão que não aguenta 3-bet nem domina o range do open costuma ser fold — transforme parte desses calls em 3-bet ou fold. Não corte a categoria (JTs, pares, suited aces); corte os spots sem stack ou sem plano.`,'pos:BTN');}
  {const sp2=pp('SB');
  if(sp2&&sp2.h>=60&&sp2.gap>18) add('gold','SB entrando de call demais',`No SB o gap VPIP−PFR é de ${f1(sp2.gap)} pontos. Completar SB pode ser plano em spot certo, mas call largo ali te deixa fora de posição o resto da mão contra os dois — raise ou fold resolve a maioria.`,'pos:SB');}
  // ---- bb/100 POR POSIÇÃO (e cruzado com as outras stats) ----
  const pb=(k,min)=>{ const x=d.pos&&d.pos[k]; return (x&&num(x.hn)>=(min||150)) ? num(x.net)/num(x.hn)*100 : null; };
  const fB=n=>`${fmtBB(n)}/100`;
  const btn100=pb('BTN',200);
  if(btn100!=null&&btn100<0) add('red','Perdendo na melhor cadeira',`BB/100 no BTN em ${fB(btn100)} — o botão é a posição que DEVERIA pagar a conta da mesa (reg: bem positivo). Ou você abre pouco do botão, ou abre e solta demais no pós-flop: cruze com o VPIP de BTN e o WWSF acima.`,'pos:BTN');
  const ep100=pb('EP',150);
  if(ep&&ep.h>=60&&ep100!=null&&ep100<-20&&(ep.v/ep.h*100)>22) add('gold','O prejuízo nasce cedo (EP)',`VPIP de EP em ${(ep.v/ep.h*100).toFixed(1).replace('.',',')}% + BB/100 de ${fB(ep100)} nessa posição: mão marginal aberta cedo joga a mão inteira fora de posição e a conta aparece aqui. Apertar EP é o ajuste mais barato do poker.`,'pos:EP');
  const bbp100=pb('BB',200);
  if(bbp100!=null&&bbp100<-50) add('gold','Sangrando demais no BB',`BB/100 no big blind em ${fB(bbp100)}. Perder no BB é normal (o blind sai antes de ver as cartas), mas a faixa saudável fica acima de −40: defesas largas demais ou desistências caras no pós-flop — casa com as leituras de defesa de BB e fold pra c-bet.`,'pos:BB');
  const co100=pb('CO',150), sb100=pb('SB',150);
  if(btn100!=null&&co100!=null&&sb100!=null&&bbp100!=null){
    const late=num(d.pos.BTN.net)+num(d.pos.CO.net), blinds=num(d.pos.SB.net)+num(d.pos.BB.net);
    if(late>0&&late+blinds<0) add('info','Late position ainda não paga as blinds',`CO+BTN somam ${fmtBB(late)}, mas SB+BB custam ${fmtBB(blinds)}: o lucro de posição final não cobre o pedágio das blinds. Mais roubo de CO/BTN e defesas mais seletivas fecham essa conta.`);
  }
  if(d.hands>=300&&!out.some(i=>i.tone==='red'||i.tone==='gold')) add('green','Perfil sólido','Nenhum vazamento gritante contra as faixas de reg. Agora o ganho está nos spots finos — revisão de mãos no Coach.');
  const ord={red:0,gold:1,green:2,info:3};
  return out.sort((a,b)=>ord[a.tone]-ord[b.tone]);
}

/* ---------- ícones ---------- */
/* ---------- planilha pessoal do Samba (.xlsx) -> abertura do jogador no time ----------
   Funções puras (testadas em test/unit/planilha.test.cjs). O .xlsx é um zip de XML; o app abre com o fflate
   e estas funções leem os valores JÁ CALCULADOS que a planilha salvou (não reexecutam fórmula).
   Os valores são achados pelo RÓTULO (MakeUp, Cashout, Contrato, %, Bankroll, Lifetime), não por posição fixa. */
const xmlTexto=s=>String(s??'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'")
  .replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(m,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/g,'&');
function xlsxShared(xml){
  const out=[]; const re=/<si>([\s\S]*?)<\/si>/g; let m;
  while((m=re.exec(String(xml||'')))) out.push(xmlTexto((m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g)||[]).map(t=>t.replace(/<t[^>]*>|<\/t>/g,'')).join('')));
  return out;
}
// caminho da aba pelo nome (workbook.xml + rels); sem nome, a primeira aba
function xlsxAba(workbookXml,relsXml,nome){
  const abas=[...String(workbookXml||'').matchAll(/<sheet\b[^>]*>/g)].map(m=>({nome:xmlTexto((m[0].match(/name="([^"]*)"/)||[])[1]),rid:(m[0].match(/r:id="([^"]*)"/)||[])[1]}));
  const aba=abas.find(a=>nome&&a.nome.toLowerCase()===String(nome).toLowerCase())||abas[0];
  if(!aba) return null;
  const rel=[...String(relsXml||'').matchAll(/<Relationship\b[^>]*>/g)].map(m=>m[0]).find(r=>r.includes(`Id="${aba.rid}"`));
  const alvo=rel&&(rel.match(/Target="([^"]*)"/)||[])[1];
  return alvo?(alvo.startsWith('/')?alvo.slice(1):'xl/'+alvo.replace(/^\.\//,'')):null;
}
// {A1: valor} com o valor salvo de cada célula (texto, número ou booleano)
function xlsxCelulas(sheetXml,shared){
  const out={}; const re=/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let m;
  while((m=re.exec(String(sheetXml||'')))){
    const at=m[1], corpo=m[2]||''; const ref=(at.match(/\br="([A-Z]+\d+)"/)||[])[1]; if(!ref) continue;
    const t=(at.match(/\bt="([^"]*)"/)||[])[1]; const v=(corpo.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
    let val=null;
    if(t==='s') val=v!=null?(shared||[])[+v]??null:null;
    else if(t==='inlineStr') val=xmlTexto((corpo.match(/<t[^>]*>([\s\S]*?)<\/t>/g)||[]).map(x=>x.replace(/<t[^>]*>|<\/t>/g,'')).join(''));
    else if(t==='str'||t==='e') val=v!=null?xmlTexto(v):null;
    else if(t==='b') val=v==='1';
    else if(v!=null&&v!=='') val=Number(v);
    if(val!==null&&val!=='') out[ref]=val;
  }
  return out;
}
const xlsxCol=ref=>ref.replace(/\d+/g,''); const xlsxLin=ref=>+ref.replace(/[A-Z]+/g,'');
const xlsxColNum=c=>[...c].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
const xlsxColLetra=n=>{ let s=''; while(n>0){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); } return s; };
const xlsxDesloca=(ref,dc,dl)=>xlsxColLetra(xlsxColNum(xlsxCol(ref))+dc)+(xlsxLin(ref)+dl);
const xlsxData=n=>{ if(typeof n!=='number'||!isFinite(n)||n<20000||n>80000) return null; const d=new Date(Date.UTC(1899,11,30)+Math.round(n*86400000)); return d.toISOString().slice(0,10); };
const numPlanilha=v=>typeof v==='number'?v:(v==null||v===''?0:parseValor(String(v)));
// "35% até 10k" -> {jogador:0.35, ate:10000}
function faixaPlanilha(txt){
  const m=String(txt||'').toLowerCase().replace(/\s+/g,' ').match(/(\d+(?:[.,]\d+)?)\s*%(?:\s*(?:até|ate)\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(k|mil)?)?/);
  if(!m) return null;
  const pct=parseValor(m[1])/100; let ate=m[2]?parseValor(m[2]):null; if(ate!=null&&m[3]) ate*=1000;
  return pct>0&&pct<=1?{jogador:pct,ate}:null;
}
const SAMBA_TIPOS=['semanal','reentry semanal','turbo/fast','reentry turbo','sunday','reentry sunday','extra','reentry extras','sng'];
// rótulo da linha da grade sem o comentário entre parênteses ("Sunday (não engloba turbo)" -> "sunday")
const gradeLinha=s=>String(s??'').replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
function lerPlanilhaSamba(cel){
  const avisos=[]; const refs=Object.keys(cel);
  const acha=rot=>refs.filter(r=>typeof cel[r]==='string'&&cel[r].trim().toLowerCase()===rot.toLowerCase()).sort((a,b)=>xlsxLin(a)-xlsxLin(b)||xlsxColNum(xlsxCol(a))-xlsxColNum(xlsxCol(b)))[0];
  const abaixo=rot=>{ const r=acha(rot); return r?cel[xlsxDesloca(r,0,1)]:undefined; };
  const direita=rot=>{ const r=acha(rot); return r?cel[xlsxDesloca(r,1,0)]:undefined; };
  const rMk=acha('MakeUp');
  if(!rMk) return {erro:'Não achei a célula "MakeUp". Essa é a planilha pessoal do Samba (aba Jogador)?'};
  const makeup=numPlanilha(abaixo('MakeUp')), cashout=numPlanilha(abaixo('Cashout'));
  // salas: rótulos na linha do MakeUp, à esquerda dele; saldo na linha de baixo
  const saldos=[]; const lin=xlsxLin(rMk), colMk=xlsxColNum(xlsxCol(rMk));
  for(let c=1;c<colMk;c++){ const rot=cel[xlsxColLetra(c)+lin]; if(rot==null||rot==='') continue;
    saldos.push({sala:String(rot).trim(),saldo:numPlanilha(cel[xlsxColLetra(c)+(lin+1)])}); }
  const banca=Math.round(saldos.reduce((a,b)=>a+b.saldo,0)*100)/100;
  const bancaPlanilha=direita('Bankroll'); const lifetimePlanilha=direita('Lifetime');
  const lucro=Math.round((banca-makeup)*100)/100; const lifetime=Math.round((cashout+lucro)*100)/100;
  if(typeof bancaPlanilha==='number'&&Math.abs(bancaPlanilha-banca)>0.01) avisos.push(`Bankroll da planilha (${bancaPlanilha}) diferente da soma das salas (${banca}).`);
  if(typeof lifetimePlanilha==='number'&&Math.abs(lifetimePlanilha-lifetime)>0.01) avisos.push(`Lifetime da planilha (${lifetimePlanilha}) diferente de Cashout + Profit (${lifetime}).`);
  const contratoRaw=abaixo('Contrato'); const contratoTexto=abaixo('%');
  const faixa=faixaPlanilha(contratoTexto); if(contratoTexto&&!faixa) avisos.push(`Não entendi o percentual "${contratoTexto}".`);
  // nome na primeira célula com texto; apelido e data de atualização logo abaixo dos saldos
  const nomeRef=refs.filter(r=>typeof cel[r]==='string').sort((a,b)=>xlsxLin(a)-xlsxLin(b)||xlsxColNum(xlsxCol(a))-xlsxColNum(xlsxCol(b)))[0];
  const nick=cel['A'+(lin+2)]; const atualizado=xlsxData(cel['A'+(lin+3)]);
  // grade: coluna dos tipos (Semanal, Sunday…); sala à esquerda (célula mesclada: vale até a próxima); 3 colunas de categoria à direita
  const grade=[]; const primeira=refs.filter(r=>String(cel[r]).trim().toLowerCase()==='semanal').sort((a,b)=>xlsxLin(a)-xlsxLin(b))[0];
  if(primeira){ const ct=xlsxColNum(xlsxCol(primeira)); let site='', vazias=0;
    for(let l=xlsxLin(primeira);l<xlsxLin(primeira)+80&&vazias<4;l++){
      const tipo=cel[xlsxColLetra(ct)+l]; const s=cel[xlsxColLetra(ct-1)+l]; if(typeof s==='string'&&s.trim()) site=s.trim();
      if(typeof tipo!=='string'||!SAMBA_TIPOS.includes(gradeLinha(tipo))){ vazias++; continue; } vazias=0;
      const v=k=>{ const x=cel[xlsxColLetra(ct+k)+l]; return x==null?'':String(x).trim(); };
      grade.push({site,tipo:tipo.trim(),regular:v(1),prog_ko:v(2),hyper:v(3)});
    } }
  return {nome:typeof cel[nomeRef]==='string'?cel[nomeRef].trim():'',nick:typeof nick==='string'?nick.trim():'',
    saldos,banca,makeup,cashout,lucro,lifetime,contrato_fim:xlsxData(contratoRaw),contrato_texto:contratoTexto==null?'':String(contratoTexto),
    faixa,atualizado_em:atualizado,grade,avisos};
}
// .xlsx inteiro (entradas do fflate) -> leitura da planilha
function lerXlsxSamba(entradas,decod){
  const txt=k=>entradas[k]?decod(entradas[k]):'';
  const aba=xlsxAba(txt('xl/workbook.xml'),txt('xl/_rels/workbook.xml.rels'),'Jogador');
  if(!aba||!entradas[aba]) return {erro:'Não achei a aba "Jogador" na planilha.'};
  return lerPlanilhaSamba(xlsxCelulas(txt(aba),xlsxShared(txt('xl/sharedStrings.xml'))));
}

// nome de jogador igual ao do banco (o gatilho liga fato à pessoa ignorando caixa e espaço nas pontas)
const nomeIgual=(a,b)=>String(a??'').trim().toLowerCase()===String(b??'').trim().toLowerCase();
// config padrão de um time de staking sem config gravada (só em memória; quem configura salva nos Ajustes)
const configPadraoTime=ws=>({id:null,workspace_id:ws,player1_name:'',player2_name:'',player_pct:1,abi_max:2,abi_max_player1:2,abi_max_player2:0,
  piso_minimo:0,makeup_max_recomendado:0,makeup_inicial_player1:0,makeup_inicial_player2:0,stoploss_daily_buyins:10,stoploss_weekly_pct:0.15,
  banca_inicial:0,week_start_date:todayISO(),sites_permitidos:['GG Poker','PokerStars'],modalidades_permitidas:['MTT','Spin','Cash','Sit & Go']});
/* ---------- grade da reta (mesmo formato da planilha do Samba) ----------
   Grade = linhas {site, tipo(linha), regular, prog_ko, hyper} com o TEXTO que o professor escreve hoje:
   "até $2,50 + $3 2k+" · "$2,50 5k+" · "não" · "ok" · "$1.10 + Bounty Builder até $3.30" · "Até $2 (somente vanilla)".
   lerCelulaGrade entende o texto; classificarTorneioGrade diz se um torneio está dentro, em atenção ou fora, com o motivo. */
const gradeValor=s=>{ const v=parseFloat(String(s).replace(/[$\s]/g,'').replace(',','.')); return Number.isFinite(v)?v:null; };
const GRADE_APELIDOS={bh:'bounty hunters',bb:'bounty builder',ko:'knockout'};
function lerCelulaGrade(txt){
  const t=String(txt??'').replace(/\s+/g,' ').trim();
  const r={texto:t,vazia:false,proibido:false,livre:false,teto:null,degraus:[],liberados:[],obs:''};
  if(!t||/^[-–—]+$/.test(t)){ r.vazia=true; return r; }
  if(/^n[aã]o\b/i.test(t)){ r.proibido=true; return r; }
  if(/^ok\b/i.test(t)){ r.livre=true; return r; }
  let s=t; const mObs=s.match(/\(([^)]*)\)/); if(mObs){ r.obs=mObs[1].trim(); s=s.replace(mObs[0],' '); }
  for(const pedaco of s.split('+')){
    let p=' '+pedaco.trim()+' '; if(!p.trim()) continue;
    p=p.replace(/(^|[^a-zà-ú])at[eé](?![a-zà-ú])/gi,'$1 ');   // \b não enxerga o "é"
    let gtd=null; const mG=p.match(/(\d+(?:[.,]\d+)?)\s*k(?![a-z])/i); if(mG){ gtd=gradeValor(mG[1])*1000; p=p.replace(mG[0],' '); }
    let val=null; const mV=p.match(/\$?\s*(\d+(?:[.,]\d+)?)/); if(mV){ val=gradeValor(mV[1]); p=p.replace(mV[0],' '); }
    const nome=p.replace(/[^0-9a-zà-ú ]/gi,' ').replace(/\s+/g,' ').trim();
    if(/[a-zà-ú]{2,}/i.test(nome)) r.liberados.push({nome,ate:val});
    else if(val!=null&&gtd!=null) r.degraus.push({buyin:val,gtd});
    else if(val!=null) r.teto=Math.max(r.teto??0,val);
  }
  if(r.teto==null&&!r.degraus.length&&!r.liberados.length) r.vazia=true;
  return r;
}
// sala do torneio e sala da grade na mesma chave ("GG Poker" = "GGpoker"; "PS" = "PokerStars")
const gradeSala=s=>{ const k=String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(/^gg/.test(k)) return 'gg'; if(k==='pses'||k==='pokerstarses') return 'pses'; if(k==='ps'||/stars/.test(k)) return 'ps';
  if(/^acr|americas|winning/.test(k)) return 'acr'; if(/^wpn/.test(k)) return 'wpn'; if(/party/.test(k)) return 'party'; return k; };
// sala do DINHEIRO numa chave só (igual a sala_chave do servidor): "GG" = "GG Poker", "PS" = "PokerStars", "WPN" = "ACR"
// (a grade separa ACR de WPN; o dinheiro do ACR sai da conta WPN)
const salaChave=s=>{ const k=String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); if(!k) return null;
  if(/^gg/.test(k)||k==='natural8'||k==='n8') return 'gg'; if(k==='pses'||k==='pokerstarses'||k==='starses') return 'pses';
  if(k==='ps'||/stars/.test(k)) return 'ps'; if(/^(acr|americas|winning|wpn)/.test(k)) return 'wpn'; if(/party/.test(k)) return 'party';
  if(/^888/.test(k)) return '888'; return k; };
// garantido pelo nome: "$5K", "100k GTD", "$100,000" (número com k/m, ou 1.000+ com $)
function gtdDoNome(nome){
  const n=String(nome||''); let m=n.match(/\$?\s?(\d+(?:[.,]\d+)?)\s?([km])\b/i);
  if(m){ return gradeValor(m[1])*(m[2].toLowerCase()==='m'?1e6:1e3); }
  m=n.match(/\$\s?(\d{1,3}(?:[.,]\d{3})+)/); if(m) return parseFloat(m[1].replace(/[.,]/g,''));
  return null;
}
// regular / prog KO / hyper e a linha da grade (semanal, turbo, sunday, sng) de um torneio
function gradeTipoTorneio(t){
  const n=String(t.tournament_name||'').toLowerCase(), mod=String(t.modality||'').toLowerCase();
  const hyper=/hyper|super ?sonic/.test(n);
  const ko=num(t.bounty)>0||/bount|\bpko\b|\bko\b|knock|hunters|progressive/.test(n)||/pko|bount|knock|\bko\b/.test(mod);
  const turbo=!hyper&&/turbo|\bfast\b|speed|rapid/.test(n);
  const sng=/sit|sng|spin/.test(mod)||/sit ?& ?go|\bsng\b|\bspin/.test(n);
  const domingo=!!t.entry_date&&new Date(String(t.entry_date).slice(0,10)+'T12:00:00Z').getUTCDay()===0;
  return {tipo:hyper?'hyper':ko?'prog_ko':'regular',ko,hyper,turbo,sng,domingo,linha:sng?'sng':turbo?'turbo/fast':domingo?'sunday':'semanal'};
}
const GRADE_TIPO_ROT={regular:'Regular',prog_ko:'Prog KO',hyper:'Hyper'};
const GRADE_LINHA_ROT={'semanal':'semanal','turbo/fast':'turbo','sunday':'domingo','extra':'extra','sng':'SNG'};
// o nome do torneio tem todas as palavras do liberado? ("Bh Sunday Special" casa com "Bounty Hunters Sunday Special")
const gradeNomeCasa=(lib,nome)=>{ const n=' '+String(nome||'').toLowerCase().replace(/[^0-9a-zà-ú]+/g,' ')+' ';
  const pal=String(lib||'').toLowerCase().split(/\s+/).flatMap(w=>(GRADE_APELIDOS[w]||w).split(' ')).filter(w=>w.length>=2);
  return pal.length>0&&pal.every(w=>n.includes(' '+w+' ')); };
// uma célula aceita o torneio? {ok, incerto, motivo}
function gradeCelulaAceita(c,buyin,gtd,nome){
  const eps=0.005;
  if(c.proibido) return {ok:false,motivo:'não liberado'};
  if(c.vazia) return {ok:false,motivo:'nada liberado'};
  if(c.livre) return {ok:true,motivo:'liberado'};
  const lib=c.liberados.find(l=>gradeNomeCasa(l.nome,nome)&&(l.ate==null||buyin<=l.ate+eps));
  if(lib) return {ok:true,motivo:`liberado: ${lib.nome}${lib.ate!=null?' até '+fmtGrade(lib.ate):''}`};
  if(c.teto!=null&&buyin<=c.teto+eps) return {ok:true,motivo:`até ${fmtGrade(c.teto)}`};
  const deg=c.degraus.filter(d=>buyin<=d.buyin+eps).sort((a,b)=>a.gtd-b.gtd);
  if(deg.length){ const d=deg[0];
    if(gtd==null) return {ok:false,incerto:true,motivo:`${fmtGrade(buyin)} só vale com garantido ${fmtGtd(d.gtd)}+ e o nome não traz o garantido`};
    const passa=deg.find(x=>gtd>=x.gtd); if(passa) return {ok:true,motivo:`${fmtGrade(passa.buyin)} com garantido ${fmtGtd(passa.gtd)}+`};
    return {ok:false,motivo:`${fmtGrade(buyin)} só com garantido ${fmtGtd(d.gtd)}+ (este tem ${fmtGtd(gtd)})`}; }
  const topo=Math.max(c.teto??0,...c.degraus.map(d=>d.buyin),...c.liberados.map(l=>l.ate??0));
  return {ok:false,motivo:topo>0?`buy-in ${fmtGrade(buyin)} acima do teto ${fmtGrade(topo)}`:'nada liberado'};
}
const fmtGrade=v=>'US$ '+(Math.round(v*100)/100).toFixed(2).replace('.',',');
// nome de sala do jeito que cada um escreve ("GGpoker", "gg") aparece de um jeito só (A-026, A-066)
const NOME_SALA={gg:'GG Poker',ps:'PokerStars',pses:'PokerStars.es',wpn:'WPN (ACR)',party:'partypoker','888':'888poker'};
const nomeSala=s=>NOME_SALA[salaChave(s)]||String(s||'').trim();
// valor escrito na grade ("$1.08", "$3,3") no formato do app: US$ 1,08. Só muda a tela: a célula guardada fica como foi escrita
const fmtGradeTexto=t=>String(t||'').replace(/\$\s?(\d+)(?:[.,](\d{1,2}))?(?![\d.,])/g,(m,i,d)=>'US$ '+i+(d!=null?','+(d.length===1?d+'0':d):''));
const fmtGtd=v=>v>=1e6?(v/1e6)+'M':v>=1000?(Math.round(v/100)/10)+'k':String(v);
// torneio x grade -> {status:'dentro'|'atencao'|'fora', motivo (1 linha)}
function classificarTorneioGrade(t,grade){
  const linhas=(grade&&Array.isArray(grade.celulas)?grade.celulas:Array.isArray(grade)?grade:[]);
  if(!linhas.length) return null;
  const nome=String(t.tournament_name||''), n=nome.toLowerCase(), buyin=num(t.buyin), re=num(t.reentries);
  const out=(status,motivo)=>({status,motivo});
  // proibições estruturais (valem em qualquer reta)
  if(/satellite|sat[eé]lite|\bsat\b|\bstep\b/.test(n)) return out('fora','satélite é proibido');
  if(/re-?buy/.test(n)) return out('fora','torneio com rebuy é proibido');
  if(/heads.?up|\bhu\b/.test(n)) return out('fora','heads-up é proibido');
  if(/\b[34][- ]?max\b/.test(n)) return out('fora','3-max e 4-max são proibidos');
  const sala=gradeSala(t.site), daSala=linhas.filter(l=>gradeSala(l.site)===sala);
  if(!daSala.length) return out('fora',`${t.site||'sala'} não está na grade`);
  const tp=gradeTipoTorneio(t), gtd=gtdDoNome(nome);
  const cel=(linha,tipo)=>{ const l=daSala.find(x=>gradeLinha(x.tipo)===linha); return l?lerCelulaGrade(l[tipo]):null; };
  // entrada: a linha do dia/velocidade; no domingo vale a linha Sunday (se ela não diz nada pro tipo, vale a semanal);
  // os "extras" liberados pelo nome valem sempre
  const domTemRegra=tp.domingo&&(()=>{ const c=cel('sunday',tp.tipo); return !!c&&!c.vazia; })();
  const linhasEntrada=tp.sng?['sng']:tp.turbo?['turbo/fast']:domTemRegra?['sunday']:['semanal'];
  let aceite=null, recusa=null, incerto=null, linhaUsada=null;
  for(const ln of [...linhasEntrada,'extra']){
    const tipos=ln==='extra'?['regular','prog_ko','hyper']:[tp.tipo];
    for(const tipo of tipos){ const c=cel(ln,tipo); if(!c) continue;
      if(ln==='extra'&&!c.liberados.length) continue;
      const a=gradeCelulaAceita(c,buyin,gtd,nome);
      if(ln==='extra'){ if(a.ok&&a.motivo.startsWith('liberado:')){ aceite=a; linhaUsada='extra'; } continue; }
      if(a.ok){ aceite=a; linhaUsada=ln; break; }
      if(a.incerto&&!incerto) incerto={...a,ln}; if(!recusa) recusa={...a,ln};
      // hyper "somente vanilla" não aceita bounty
    }
    if(aceite) break;
  }
  const rot=ln=>`${GRADE_LINHA_ROT[ln]||ln} ${GRADE_TIPO_ROT[tp.tipo]}`;
  if(aceite&&tp.hyper&&tp.ko){ const c=cel(linhaUsada,'hyper'); if(c&&/vanilla/i.test(c.obs)) return out('fora','hyper com bounty: a grade só libera hyper vanilla'); }
  if(!aceite&&!incerto){
    if(!recusa) return out('fora',`${rot(linhasEntrada[0])}: sem regra na grade`);
    return out('fora',`${rot(recusa.ln)}: ${recusa.motivo}`);
  }
  if(!aceite) linhaUsada=incerto.ln;   // entrada em dúvida (garantido): o reentry proibido ainda tira da grade
  // reentry: no máximo 1, e só onde a linha "Reentry …" libera
  if(re>0){
    if(re>1) return out('fora',`${re} reentries: a regra é no máximo 1`);
    const lr=linhaUsada==='extra'?'reentry extras':linhaUsada==='turbo/fast'?'reentry turbo':'reentry '+linhaUsada;
    const c=cel(lr,tp.tipo);
    if(c&&!c.vazia){ const a=c.livre?{ok:true}:c.proibido?{ok:false,motivo:'não liberado'}:gradeCelulaAceita(c,buyin,gtd,nome);
      if(!a.ok) return out('fora',`reentry ${GRADE_LINHA_ROT[linhaUsada]||linhaUsada}: ${a.motivo==='não liberado'?'não liberado':a.motivo}`); }
    else if(c&&c.vazia&&linhaUsada!=='extra') return out('fora',`reentry ${GRADE_LINHA_ROT[linhaUsada]||linhaUsada}: não liberado`);
  }
  if(!aceite) return out('atencao',`${rot(incerto.ln)}: ${incerto.motivo}`);
  if(t.currency&&t.currency!=='USD') return out('atencao',`moeda ${t.currency}: confira o buy-in em dólar`);
  return out('dentro',`${linhaUsada==='extra'?'extra':rot(linhaUsada)}: ${aceite.motivo}`);
}
// grade que vale pra um torneio: a da unidade dele (ou da mais próxima acima) vigente na data
function gradeDoTorneio(t,unidades,grades){
  if(!t||!t.unidade_id||!grades||!grades.length) return null;
  const U=Object.fromEntries((unidades||[]).map(u=>[u.id,u])); const u=U[t.unidade_id]; if(!u) return null;
  const d=String(t.entry_date||'').slice(0,10);
  const cand=grades.filter(g=>{ const gu=U[g.unidade_id]; return gu&&String(u.caminho).startsWith(gu.caminho)&&(!d||String(g.vigente_desde)<=d); })
    .sort((a,b)=>U[b.unidade_id].caminho.length-U[a.unidade_id].caminho.length||(a.vigente_desde<b.vigente_desde?1:-1));
  return cand[0]||null;
}
// o que o app entendeu da célula, em uma linha (o professor confere enquanto escreve)
function resumoCelulaGrade(txt){
  const c=lerCelulaGrade(txt); if(c.vazia) return '—'; if(c.proibido) return 'proibido'; if(c.livre) return 'liberado';
  const p=[]; if(c.teto!=null) p.push('até '+fmtGrade(c.teto));
  c.degraus.forEach(d=>p.push(`${fmtGrade(d.buyin)} com ${fmtGtd(d.gtd)}+`));
  c.liberados.forEach(l=>p.push(`${l.nome}${l.ate!=null?' até '+fmtGrade(l.ate):''}`));
  if(c.obs) p.push(c.obs); return p.join(' · ');
}
// grades do time carregadas pelo Dashboard (time de staking); vazio no pool e na conta individual
let GRADE_CTX={unidades:[],grades:[],unidadeDe:{},regras:[]};
// regra da unidade (fase 1): a da unidade mais funda com a chave (ela ou de cima), a mais nova até a data.
// null = nenhuma unidade tem a regra: vale a configuração do time
function regraDaUnidade(chave,unidadeId,data){
  const rs=GRADE_CTX.regras||[]; if(!unidadeId||!rs.length) return null;
  const U=Object.fromEntries((GRADE_CTX.unidades||[]).map(u=>[u.id,u])); const u=U[unidadeId]; if(!u) return null;
  const d=String(data||todayISO()).slice(0,10);
  const r=rs.filter(x=>x.chave===chave&&String(x.vigente_desde)<=d&&U[x.unidade_id]&&String(u.caminho).startsWith(U[x.unidade_id].caminho))
    .sort((a,b)=>U[b.unidade_id].caminho.length-U[a.unidade_id].caminho.length||(a.vigente_desde<b.vigente_desde?1:-1))[0];
  return r?r.valor:null;
}
function regraDoJogador(chave,player,data){ return regraDaUnidade(chave,(GRADE_CTX.unidadeDe||{})[String(player||'').trim().toLowerCase()],data); }
// stop loss do jogador: o da reta dele, ou o do time
function stopDe(config,player){
  const d=regraDoJogador('stop_dia_buyins',player), s=regraDoJogador('stop_semana_pct',player);
  return {dia:d!=null?num(d):num(config.stoploss_daily_buyins),semana:s!=null?num(s):num(config.stoploss_weekly_pct)};
}
// teto de ABI de um torneio sem grade: a regra da reta em que ele foi jogado, na data; senão a do jogador / do time
function tetoDoTorneio(t,config){
  const r=t.unidade_id?regraDaUnidade('abi_max',t.unidade_id,t.entry_date):null;
  return r!=null&&num(r)>0?num(r):abiMaxFor(config,t.player,t.entry_date);
}
// status de grade de um torneio: pela grade da reta (quando o time tem) ou pelo teto de ABI dos Ajustes
function statusGrade(t,config){
  // salvo com pessoa e sem unidade: é de antes da entrada no time, quando as regras do time não valiam (não ganha selo)
  if(t.pessoa_id&&!t.unidade_id) return {status:'dentro',motivo:''};
  const tt=t.unidade_id?t:{...t,unidade_id:GRADE_CTX.unidadeDe[String(t.player||'').trim().toLowerCase()]||null};
  const g=gradeDoTorneio(tt,GRADE_CTX.unidades,GRADE_CTX.grades);
  if(g){ const r=classificarTorneioGrade(tt,g); if(r) return {...r,simulada:!!g.simulada,porGrade:true}; }
  if(!config) return {status:'dentro',motivo:''};
  const mx=tetoDoTorneio(t,config);
  return num(t.buyin)>mx?{status:'fora',motivo:`buy-in ${fmt(t.buyin)} · teto ${fmt(mx)}`,teto:mx}:{status:'dentro',motivo:'',teto:mx};
}

const Svg = p => <svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={p.w||2} strokeLinecap="round" strokeLinejoin="round" style={p.style}>{p.children}</svg>;
const IcoPanel  = p => <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></Svg>;
const IcoDaily  = p => <Svg {...p}><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4"/><circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none"/></Svg>;
const IcoTrophy = p => <Svg {...p}><path d="M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/><path d="M9 15h6l1 5H8l1-5z"/></Svg>;
const IcoShield = p => <Svg {...p}><path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z"/><path d="M9.2 12l2 2 3.6-4.2"/></Svg>;
const IcoWeek   = p => <Svg {...p}><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M7 14h10"/></Svg>;
const IcoMonth  = p => <Svg {...p}><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4M7 13h3v3H7z"/></Svg>;
const IcoCashOut= p => <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2"/><path d="M12 15V7m0 0l-3 3m3-3l3 3"/></Svg>;
const IcoStack  = p => <Svg {...p}><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></Svg>;
const IcoGear   = p => <Svg {...p}><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></Svg>;
const IcoChip   = p => <Svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.2" strokeDasharray="1.5 2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></Svg>;
const IcoPlus   = p => <Svg {...p}><path d="M12 5v14M5 12h14"/></Svg>;
const IcoTrash  = p => <Svg {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></Svg>;
const IcoX      = p => <Svg {...p}><path d="M6 6l12 12M18 6L6 18"/></Svg>;
const IcoPencil = p => <Svg {...p}><path d="M16 3l5 5L8 21H3v-5L16 3z"/></Svg>;
const IcoUp     = p => <Svg {...p}><path d="M7 17L17 7M7 7h10v10"/></Svg>;
const IcoDown   = p => <Svg {...p}><path d="M7 7l10 10M17 7v10H7"/></Svg>;
const IcoBell   = p => <Svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></Svg>;
const IcoAlert  = p => <Svg {...p}><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4M12 17.5v.5"/></Svg>;
const IcoLogout = p => <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Svg>;
const IcoMenu   = p => <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16"/></Svg>;
const IcoStats  = p => <Svg {...p}><path d="M3 20h18"/><path d="M6 20v-6M11 20V5M16 20v-9M21 20v-4"/></Svg>;
const IcoUsers  = p => <Svg {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6 6 0 0 1 3.5 6"/></Svg>;
const IcoGrid   = p => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9h18M3 15h18M9 3v18"/></Svg>;
const IcoHome   = p => <Svg {...p}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></Svg>;
const IcoUser   = p => <Svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></Svg>;
const IcoEye    = p => <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></Svg>;
const IcoEyeOff = p => <Svg {...p}><path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.3 3.9M6.1 6.2A17 17 0 0 0 2 12s3.5 7 10 7a9.3 9.3 0 0 0 4.2-1"/><path d="M9.5 9.6a3 3 0 0 0 4.2 4.2"/></Svg>;

/* ---------- componentes base ---------- */
// repassa data-*, role e aria-* pro div (antes eram descartados: teste e leitor de tela não achavam o cartão)
const Card = ({children,style,className,onClick,...resto}) => <div {...resto} onClick={onClick} className={className} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:22,boxShadow:'0 1px 2px rgba(25,35,29,.05), 0 12px 32px -20px rgba(25,35,29,.28)',...style}}>{children}</div>;

function NavBtn({Icon,label,active,onClick,mobile}){
  return <button onClick={onClick} style={{display:'flex',flexDirection:mobile?'column':'row',alignItems:'center',gap:mobile?4:12,width:mobile?'auto':'100%',minWidth:0,flex:mobile?'1 1 0':'initial',justifyContent:mobile?'center':'flex-start',padding:mobile?'8px 4px':'12px 15px',borderRadius:14,border:'none',cursor:'pointer',background:active?P:'transparent',color:active?'#fff':C.inkSoft,fontWeight:active?700:600,fontSize:mobile?10.5:15,transition:'all .18s'}}>
    <Icon s={mobile?21:20} w={active?2.4:2}/>{label}
  </button>;
}
const RoundBtn = ({children,onClick,disabled}) => <button onClick={onClick} disabled={disabled} style={{width:44,height:44,borderRadius:14,border:`1px solid ${C.border}`,background:disabled?C.bg:C.surface,color:disabled?'#C3BBA9':P,fontSize:24,lineHeight:1,cursor:disabled?'default':'pointer',fontWeight:700}}>{children}</button>;
const Empty = ({children}) => <div style={{padding:'26px 0',textAlign:'center',color:C.inkSoft,fontSize:14}}>{children}</div>;
// marca do topo: no time, a logo e o nome DELE, com o GrinderBank pequeno embaixo; fora de time, o GrinderBank
const Brand = ({small,team,marca,sub}) => { const lado=small?34:38, nome=team?((marca&&marca.nome)||'Time'):'GrinderBank';
  return <div data-marca={team?nome:undefined} style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
  {team
    ? (marca&&marca.logo
      ? <img src={marca.logo} alt={nome} width={lado} height={lado} data-marca-logo style={{borderRadius:11,display:'block',objectFit:'contain',background:'#fff',boxShadow:'0 4px 12px -6px rgba(76,62,146,.5)',flexShrink:0}}/>
      : <div style={{width:lado,height:lado,borderRadius:12,flexShrink:0,background:'linear-gradient(135deg,#5D4DAF 0%,#4C3E92 55%,#332A69 100%)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.25), 0 4px 12px -6px rgba(76,62,146,.5)',display:'grid',placeItems:'center',color:'#fff',fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:small?16:18}}>{String(nome).trim().charAt(0).toUpperCase()||<IcoChip s={small?19:21}/>}</div>)
    : <img src="icon-192.png" alt="GrinderBank" width={lado} height={lado} style={{borderRadius:11,display:'block',boxShadow:'0 4px 12px -6px rgba(76,62,146,.5)'}}/>}
  <div style={{minWidth:0}}><div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:small?(nome.length>18?15:17):(nome.length>13?16:19),lineHeight:1.05,letterSpacing:'-0.02em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:170}}>{nome}</div>
    <div style={{fontSize:11.5,color:C.inkSoft,fontWeight:600,letterSpacing:'.01em'}}>{team?'por GrinderBank':(sub||'seu grind sob controle')}</div></div>
</div>; };
function Badge({text}){
  const t=STATUS_TONE[text]||{tone:C.inkSoft,bg:C.bg};
  return <span style={{padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:800,color:t.tone,background:t.bg,whiteSpace:'nowrap'}}>{text}</span>;
}
function Bar2({pct,color,track}){
  return <div style={{height:13,borderRadius:99,background:track||C.bg,overflow:'hidden'}}><div style={{width:`${Math.max(0,Math.min(100,pct))}%`,height:'100%',borderRadius:99,background:color,transition:'width .5s cubic-bezier(.2,.7,.3,1)'}}/></div>;
}
function Stat({Icon,tone,bg,label,value,sub}){
  return <Card style={{padding:18}}>
    <span style={{width:36,height:36,borderRadius:11,background:bg,display:'grid',placeItems:'center',color:tone}}><Icon s={19}/></span>
    <div style={{fontSize:13,color:C.inkSoft,fontWeight:600,marginTop:12}}>{label}</div>
    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:23,fontWeight:600,color:tone}}>{value}</div>
    {sub&&<div style={{fontSize:12,color:C.inkSoft,marginTop:2}}>{sub}</div>}
  </Card>;
}
// medidor de stop loss: mostra quanto do limite (diário em buy-ins, semanal em % da banca) já
// foi consumido HOJE / nesta semana — o valor de um stop loss é ser visto ANTES de estourar.
function SLMeter({label,used,limit,detail}){
  const pct=limit>0?used/limit*100:0;
  const col=pct>=100?C.red:pct>=70?C.gold:C.greenMid;
  return <div style={{minWidth:0}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:5}}>
      <span style={{fontSize:12.5,color:C.inkSoft,fontWeight:600}}>{label}</span>
      <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:13,color:col}}>{detail}</span>
    </div>
    <Bar2 pct={pct} color={col}/>
  </div>;
}
// buy-in de referência do stop diário ("10 buy-ins"): o teto da reta (regra abi_max); se a reta tem grade (um teto por
// tipo de torneio, não um só), o ABI do próprio jogador nos últimos 30 dias; sem nada disso, o ABI máximo do time
function abiDoStop(config,player,tours,data){
  const d=String(data||todayISO()).slice(0,10);
  const daReta=regraDoJogador('abi_max',player,d); if(daReta!=null&&num(daReta)>0) return {valor:num(daReta),origem:'teto da reta'};
  if(comGrade(player,d)){
    const desde=addDaysISO(d,-29); let bi=0,ent=0;
    (tours||[]).forEach(t=>{ if(!nomeIgual(t.player,player)||t.entry_date<desde||t.entry_date>d) return; const e=1+num(t.reentries); bi+=num(t.buyin)*e; ent+=e; });
    if(ent>0) return {valor:Math.round(bi/ent*100)/100,origem:'ABI dos últimos 30 dias'};
  }
  return {valor:abiMaxFor(config,player,d),origem:'ABI máximo do time'};
}
// a reta do jogador tem grade naquela data? (aí não existe um teto de ABI só: a grade confere torneio a torneio)
function comGrade(player,data){
  const u=(GRADE_CTX.unidadeDe||{})[String(player||'').trim().toLowerCase()];
  return !!(u&&gradeDoTorneio({unidade_id:u,entry_date:String(data||todayISO()).slice(0,10)},GRADE_CTX.unidades,GRADE_CTX.grades));
}
// stop semanal: % da banca do COMEÇO da semana (a de agora cai com um saque e faria o stop "estourar" sem ser verdade)
function StopLossCard({players,config,daily,curWeek,bancaSemana,tours,leitura}){
  const today=todayISO();
  const [open,setOpen]=useState(null);   // null = automático (abre sozinho se alguém passou de 70%)
  if(!players.some(p=>{ const s=stopDe(config,p); return s.dia>0||s.semana>0; })) return null;
  const rows=players.map((p,i)=>{
    const st=stopDe(config,p);                       // no time: o stop da reta do jogador
    const abi=abiDoStop(config,p,tours,today), abiMax=abi.valor;
    const slDay=st.dia*abiMax;
    const dayLoss=Math.max(0,-daily.filter(e=>e.player===p&&e.entry_date===today).reduce((s,e)=>s+resultadoDia(e),0));
    const wkLim=Math.max(0,st.semana*bancaSemana);
    const wkLoss=Math.max(0,-(curWeek[p]?curWeek[p].resultado:0));
    const pct=Math.max(slDay>0?dayLoss/slDay*100:0, wkLim>0?wkLoss/wkLim*100:0);
    return {p,i,abi,abiMax,slDay,dayLoss,wkLim,wkLoss,pct,st};
  });
  const worst=Math.max(0,...rows.map(r=>r.pct));
  const isOpen=open==null?worst>=70:open;
  const chip=worst>=100?{t:'estourou',c:C.red,bg:C.redSoft}
    :worst>=70?{t:`${Math.round(worst)}% usado`,c:C.gold,bg:C.goldSoft}
    :worst>0?{t:`${Math.round(worst)}% usado`,c:C.greenMid,bg:C.greenSoft}
    :{t:'em dia',c:C.greenMid,bg:C.greenSoft};
  return <Card style={{padding:0,overflow:'hidden'}}>
    <button onClick={()=>setOpen(o=>o==null?!(worst>=70):!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'15px 18px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
      <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,flex:1}}>Stop loss — a hora de parar</span>
      <span style={{padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:800,color:chip.c,background:chip.bg,whiteSpace:'nowrap'}}>{chip.t}</span>
      <span style={{color:C.inkSoft,fontSize:20,transform:isOpen?'rotate(90deg)':'none',transition:'transform .2s'}}>›</span>
    </button>
    {isOpen&&<div style={{padding:'0 18px 18px'}}>
      <div style={{fontSize:12.5,color:C.inkSoft,marginBottom:14}}>{leitura?`Quanto do limite de ${leitura} já foi usado. Quando a barra fica vermelha, o dia (ou a semana) dele acabou.`
        :<>Quanto do seu limite já foi usado. Ver <b>antes</b> de estourar é o ponto: quando a barra fica vermelha, o dia (ou a semana) acabou.</>}</div>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        {rows.map(r=><div key={r.p} style={{display:'flex',flexDirection:'column',gap:10}}>
          {rows.length>1&&<div style={{display:'flex',alignItems:'center',gap:7}}><span style={{width:9,height:9,borderRadius:99,background:PLAYER_COLORS[r.i]||C.inkSoft}}/><b style={{fontSize:13.5}}>{r.p.split(' ')[0]}</b></div>}
          {r.slDay>0&&<div data-stop-dia><SLMeter label={`Hoje · limite ${r.st.dia} buy-ins (${fmt(r.slDay)})`} used={r.dayLoss} limit={r.slDay} detail={`${(r.dayLoss/(r.abiMax||1)).toFixed(1).replace('.',',')} de ${r.st.dia} bi`}/>
            <div style={{fontSize:11.5,color:C.inkSoft,marginTop:4}}>1 buy-in = {fmt(r.abiMax)} ({r.abi.origem})</div></div>}
          {r.wkLim>0&&<div data-stop-semana><SLMeter label={`Semana · limite ${pctFmt(r.st.semana*100)} da banca`} used={r.wkLoss} limit={r.wkLim} detail={`${fmt(r.wkLoss)} de ${fmt(r.wkLim)}`}/>
            <div style={{fontSize:11.5,color:C.inkSoft,marginTop:4}}>banca no começo da semana: {fmt(bancaSemana)}</div></div>}
        </div>)}
      </div>
    </div>}
  </Card>;
}

/* barras multi-série (positivas ou divergentes se houver negativo); toque numa coluna mostra os valores */
function MultiBars({data, series}){
  const [act,setAct]=useState(null);
  const flat=data.flatMap(d=>d.vals);
  const hasNeg=flat.some(v=>num(v)<0);
  const max=Math.max(1,...flat.map(v=>Math.abs(num(v))));
  const H=150, half=(H-24)/2;
  if(!data.length) return <Empty>Ainda sem dados.</Empty>;
  return <div>
    <div style={{display:'flex',alignItems:'flex-end',gap:12,height:H,padding:'0 2px'}}>
      {data.map((d,i)=><div key={i} onClick={()=>setAct(a=>a===i?null:i)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:5,minWidth:0,cursor:'pointer'}}>
        <div style={{height:16,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',gap:1}}>
          {act===i&&d.vals.map((v,j)=><span key={j} style={{fontSize:9.5,fontWeight:800,lineHeight:1,color:series[j].color,whiteSpace:'nowrap'}}>{fmtSinal(num(v))}</span>)}
        </div>
        {hasNeg
          ? <div style={{display:'flex',gap:4,alignItems:'stretch',justifyContent:'center',width:'100%',height:H-40}}>
              {d.vals.map((v,j)=>{const h=(Math.abs(num(v))/max)*((H-40)/2); return <div key={j} title={fmt(v)} style={{width:'42%',maxWidth:16,display:'flex',flexDirection:'column',opacity:act==null||act===i?1:.4}}>
                <div style={{height:(H-40)/2,display:'flex',alignItems:'flex-end'}}><div style={{width:'100%',height:num(v)>0?h:0,background:series[j].color,borderRadius:'4px 4px 0 0',minHeight:num(v)>0?2:0}}/></div>
                <div style={{borderTop:`1px dashed ${C.border}`}}/>
                <div style={{height:(H-40)/2,display:'flex',alignItems:'flex-start'}}><div style={{width:'100%',height:num(v)<0?h:0,background:series[j].color,opacity:.55,borderRadius:'0 0 4px 4px',minHeight:num(v)<0?2:0}}/></div>
              </div>;})}
            </div>
          : <div style={{display:'flex',gap:4,alignItems:'flex-end',justifyContent:'center',width:'100%',height:H-40}}>
              {d.vals.map((v,j)=><div key={j} title={fmt(v)} style={{width:'42%',maxWidth:16,height:`${(Math.abs(num(v))/max)*100}%`,background:series[j].color,borderRadius:'5px 5px 0 0',minHeight:2,opacity:act==null||act===i?1:.4}}/>)}
            </div>}
        <span style={{fontSize:11.5,color:act===i?C.ink:C.inkSoft,fontWeight:act===i?800:600,whiteSpace:'nowrap'}}>{d.label}</span>
      </div>)}
    </div>
    <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:8,fontSize:12.5,color:C.inkSoft,fontWeight:600,flexWrap:'wrap'}}>
      {series.map((s,i)=><span key={i} style={{display:'flex',alignItems:'center',gap:6}}><i style={{width:9,height:9,borderRadius:99,background:s.color}}/>{s.name}</span>)}
    </div>
  </div>;
}
/* linha simples (evolução da banca) */
// gráfico de linha interativo: eixos X/Y, linha do piso e valor ao passar o dedo/mouse
function LineChart({data, color=P, ref_}){
  const [act,setAct]=useState(null);
  if(!data.length) return <Empty>Ainda sem movimentos na banca.</Empty>;
  const vals=data.map(d=>num(d.value));
  const lo=Math.min(...vals, ref_!=null?ref_:Infinity);
  const hi=Math.max(...vals, ref_!=null?ref_:-Infinity);
  const range=(hi-lo)||1;
  const n=data.length;
  const PADT=8, PADB=8;
  const xF=i=> n===1?0.5:i/(n-1);
  const yF=v=> PADT + (1-((v-lo)/range))*(100-PADT-PADB);
  const pts=data.map((d,i)=>`${(xF(i)*100).toFixed(2)},${yF(num(d.value)).toFixed(2)}`);
  const area=`0,100 ${pts.join(' ')} 100,100`;
  const ticks=[0,1,2,3].map(k=>lo+range*k/3);
  const compact=fmtEixo;
  const GUT=44;
  const track=(cx,el)=>{ const r=el.getBoundingClientRect(); const fr=Math.max(0,Math.min(1,(cx-r.left)/r.width)); setAct(Math.round(fr*(n-1))); };
  return <div style={{userSelect:'none'}}>
    <div style={{position:'relative',height:164,paddingLeft:GUT}}>
      {ticks.map((tv,k)=><div key={k} style={{position:'absolute',left:0,right:0,top:`${yF(tv)}%`,transform:'translateY(-50%)',display:'flex',alignItems:'center',pointerEvents:'none'}}>
        <span style={{width:GUT-6,textAlign:'right',fontSize:9.5,color:C.inkSoft,fontWeight:600,paddingRight:6}}>{compact(tv)}</span>
        <div style={{flex:1,borderTop:`1px solid ${C.border}`,opacity:.6}}/>
      </div>)}
      <div style={{position:'absolute',left:GUT,right:0,top:0,bottom:0}}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:'100%',height:'100%',display:'block',overflow:'visible'}}>
          {ref_!=null&&<line x1="0" x2="100" y1={yF(ref_)} y2={yF(ref_)} stroke={C.red} strokeWidth="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>}
          <polygon points={area} fill={color} opacity="0.12"/>
          <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
          {act!=null&&<line x1={xF(act)*100} x2={xF(act)*100} y1="0" y2="100" stroke={color} strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>}
        </svg>
        {/* marcador em HTML (círculo SVG esticaria com preserveAspectRatio="none" e virava elipse) */}
        {act!=null&&<span style={{position:'absolute',left:`${xF(act)*100}%`,top:`${yF(vals[act])}%`,transform:'translate(-50%,-50%)',width:11,height:11,borderRadius:99,background:color,border:'2px solid #fff',boxShadow:'0 1px 5px rgba(0,0,0,.3)',pointerEvents:'none'}}/>}
        {ref_!=null&&<span style={{position:'absolute',right:2,top:`${yF(ref_)}%`,transform:'translateY(-115%)',fontSize:9.5,color:C.red,fontWeight:700,pointerEvents:'none'}}>piso</span>}
        {act!=null&&<div style={{position:'absolute',left:`${xF(act)*100}%`,top:`${yF(vals[act])}%`,transform:`translate(${xF(act)>0.65?'-108%':'8%'},${yF(vals[act])<30?'30%':'-130%'})`,background:C.ink,color:'#fff',padding:'5px 9px',borderRadius:9,fontSize:12,fontWeight:700,whiteSpace:'nowrap',pointerEvents:'none',boxShadow:'0 4px 12px -4px rgba(0,0,0,.4)'}}>
          {fmt(vals[act])}<div style={{fontSize:10,opacity:.8,fontWeight:600}}>{data[act].label}</div>
        </div>}
        <div style={{position:'absolute',inset:0,cursor:'crosshair',touchAction:'none'}}
          onPointerDown={e=>{try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){} track(e.clientX,e.currentTarget);}}
          onPointerMove={e=>track(e.clientX,e.currentTarget)}
          onMouseLeave={()=>setAct(null)}/>
      </div>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:6,paddingLeft:GUT,fontSize:10.5,color:C.inkSoft,fontWeight:600}}>
      {(n<=1?[0]:[...new Set([0,Math.floor((n-1)/2),n-1])]).map(i=><span key={i}>{data[i].label}</span>)}
    </div>
  </div>;
}

// linha multi-série (curva de lucro acumulado por jogador): eixos, linha do zero e valores ao passar o dedo
function MultiLineChart({labels, series}){
  const [act,setAct]=useState(null);
  const n=labels.length;
  if(n<2) return <Empty>Lança alguns torneios pra ver a curva.</Empty>;
  const all=series.flatMap(s=>s.values.map(num));
  let lo=Math.min(0,...all), hi=Math.max(0,...all); if(lo===hi){lo-=1;hi+=1;}
  const range=hi-lo;
  const PADT=8,PADB=8;
  const xF=i=> n===1?0.5:i/(n-1);
  const yF=v=> PADT+(1-((v-lo)/range))*(100-PADT-PADB);
  const ticks=[0,1,2,3].map(k=>lo+range*k/3);
  const compact=v=>(v>0?'+':'')+fmtEixo(v);
  const GUT=46;
  const track=(cx,el)=>{const r=el.getBoundingClientRect();const fr=Math.max(0,Math.min(1,(cx-r.left)/r.width));setAct(Math.round(fr*(n-1)));};
  return <div style={{userSelect:'none'}}>
    <div style={{position:'relative',height:172,paddingLeft:GUT}}>
      {ticks.map((tv,k)=><div key={k} style={{position:'absolute',left:0,right:0,top:`${yF(tv)}%`,transform:'translateY(-50%)',display:'flex',alignItems:'center',pointerEvents:'none'}}>
        <span style={{width:GUT-6,textAlign:'right',fontSize:9.5,color:C.inkSoft,fontWeight:600,paddingRight:6}}>{compact(tv)}</span>
        <div style={{flex:1,borderTop:`1px solid ${C.border}`,opacity:.6}}/>
      </div>)}
      <div style={{position:'absolute',left:GUT,right:0,top:0,bottom:0}}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:'100%',height:'100%',display:'block',overflow:'visible'}}>
          <line x1="0" x2="100" y1={yF(0)} y2={yF(0)} stroke={C.inkSoft} strokeWidth="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>
          {series.map((s,si)=><polyline key={si} points={s.values.map((v,i)=>`${(xF(i)*100).toFixed(2)},${yF(num(v)).toFixed(2)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>)}
          {act!=null&&<line x1={xF(act)*100} x2={xF(act)*100} y1="0" y2="100" stroke={C.inkSoft} strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>}
        </svg>
        {/* marcadores em HTML (círculo SVG esticaria com preserveAspectRatio="none") */}
        {act!=null&&series.map((s,si)=><span key={si} style={{position:'absolute',left:`${xF(act)*100}%`,top:`${yF(num(s.values[act]))}%`,transform:'translate(-50%,-50%)',width:10,height:10,borderRadius:99,background:s.color,border:'2px solid #fff',boxShadow:'0 1px 4px rgba(0,0,0,.3)',pointerEvents:'none'}}/>)}
        {act!=null&&<div style={{position:'absolute',left:`${xF(act)*100}%`,top:'6%',transform:`translate(${xF(act)>0.6?'-106%':'6%'},0)`,background:C.ink,color:'#fff',padding:'6px 10px',borderRadius:10,fontSize:11.5,fontWeight:700,whiteSpace:'nowrap',pointerEvents:'none',boxShadow:'0 4px 12px -4px rgba(0,0,0,.4)'}}>
          <div style={{fontSize:10,opacity:.8,fontWeight:600,marginBottom:2}}>{labels[act]}</div>
          {series.map((s,si)=><div key={si} style={{display:'flex',alignItems:'center',gap:6}}><i style={{width:8,height:8,borderRadius:99,background:s.color}}/>{s.name.split(' ')[0]}: {fmt(num(s.values[act]))}</div>)}
        </div>}
        <div style={{position:'absolute',inset:0,cursor:'crosshair',touchAction:'none'}}
          onPointerDown={e=>{try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){} track(e.clientX,e.currentTarget);}}
          onPointerMove={e=>track(e.clientX,e.currentTarget)}
          onMouseLeave={()=>setAct(null)}/>
      </div>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:4,paddingLeft:GUT,fontSize:10.5,color:C.inkSoft,fontWeight:600}}>
      {(n<=1?[0]:[...new Set([0,Math.floor((n-1)/2),n-1])]).map(i=><span key={i}>{labels[i]}</span>)}
    </div>
    <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:8,fontSize:12.5,color:C.inkSoft,fontWeight:600,flexWrap:'wrap'}}>
      {series.map((s,i)=><span key={i} style={{display:'flex',alignItems:'center',gap:6}}><i style={{width:9,height:9,borderRadius:99,background:s.color}}/>{s.name}</span>)}
    </div>
  </div>;
}

/* ---------- Row com confirmação de exclusão inline ---------- */
function Row({left,right,onDelete,onEdit}){
  const [confirming,setConfirming]=useState(false);
  if(confirming) return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'13px 4px',borderBottom:`1px solid ${C.border}`}}>
      <div style={{flex:1,fontSize:14,fontWeight:600,color:C.ink}}>Remover este item?</div>
      <button onClick={()=>{setConfirming(false);onDelete();}} style={{padding:'7px 18px',borderRadius:10,border:'none',background:C.red,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer'}}>Sim</button>
      <button onClick={()=>setConfirming(false)} style={{padding:'7px 18px',borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.inkSoft,fontWeight:700,fontSize:14,cursor:'pointer'}}>Não</button>
    </div>
  );
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'13px 4px',borderBottom:`1px solid ${C.border}`}}>
      <div style={{display:'flex',alignItems:'center',gap:12,flex:1,minWidth:0}}>{left}</div>
      {right}
      {onEdit&&<button onClick={onEdit} aria-label="Editar" style={{width:34,height:34,borderRadius:10,border:'none',background:'transparent',color:'#C3BBA9',cursor:'pointer',display:'grid',placeItems:'center',flexShrink:0}}><IcoPencil s={16}/></button>}
      {onDelete&&<button onClick={()=>setConfirming(true)} aria-label="Remover" style={{width:34,height:34,borderRadius:10,border:'none',background:'transparent',color:'#C3BBA9',cursor:'pointer',display:'grid',placeItems:'center',flexShrink:0}}><IcoTrash s={17}/></button>}
    </div>
  );
}
function ListView({title,subtitle,onAdd,rows,renderRow,empty}){
  return <Card style={{padding:20}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8,gap:12}}>
      <div><h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,margin:0}}>{title}</h3>{subtitle&&<div style={{fontSize:13,color:C.inkSoft,marginTop:2}}>{subtitle}</div>}</div>
      {onAdd&&<button onClick={onAdd} style={{display:'flex',alignItems:'center',gap:6,background:P,color:'#fff',border:'none',padding:'11px 16px',borderRadius:13,fontWeight:700,fontSize:14.5,cursor:'pointer',flexShrink:0,boxShadow:'0 6px 16px -8px rgba(91,75,138,.7)'}}><IcoPlus s={18}/>Adicionar</button>}
    </div>
    {rows.length?rows.map(renderRow):<Empty>{empty}</Empty>}
  </Card>;
}

/* ---------- estilos de input ---------- */
const inputStyle={width:'100%',padding:'13px 14px',borderRadius:13,border:`1.5px solid ${C.border}`,background:C.warm,color:C.ink,fontSize:16,outline:'none',fontWeight:600};
const labelStyle={fontSize:11,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:C.gold,marginBottom:6,display:'block'};
function Select({value,onChange,opts}){
  return <div style={{position:'relative'}}>
    <select style={inputStyle} value={value} onChange={onChange}>{opts.map(o=><option key={o}>{o}</option>)}</select>
    <span style={{position:'absolute',right:14,top:16,pointerEvents:'none',color:C.inkSoft}}>▾</span>
  </div>;
}

/* ---------- modal rápido (config: texto, número, %, data, lista) ---------- */
function QuickEditModal({label,hint,currentValue,kind='money',opts,onClose,onSave,exigeMudar}){
  useEsc(onClose);
  const init = kind==='percent' ? String(((num(currentValue))*100)).replace('.',',')
    : kind==='list' ? (Array.isArray(currentValue)?currentValue.join(', '):String(currentValue||''))
    : kind==='text'||kind==='date' ? String(currentValue??'')
    : String(currentValue??0).replace('.',',');
  const [val,setVal]=useState(init);
  const travado=!!exigeMudar&&val===init;   // ex.: mover de reta começa na reta atual e só salva quando muda (A-011)
  const save=()=>{
    if(travado) return;
    if(kind==='text') return onSave(val.trim());
    if(kind==='date') return onSave(val);
    if(kind==='list') return onSave(val.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean));
    if(kind==='select') return onSave(val);
    let n=parseValor(val); if(kind==='percent') n=n/100;
    onSave(n);
  };
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50}}>
      <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:460,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>{label}</h3>
          <button aria-label="Fechar" onClick={onClose} style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
        </div>
        {hint&&<div style={{fontSize:13,color:C.inkSoft,marginBottom:14,lineHeight:1.6}}>{hint}</div>}
        {kind==='select'
          ? <div style={{marginBottom:16}}><Select value={val} onChange={e=>setVal(e.target.value)} opts={opts||[]}/></div>
          : kind==='date'
          ? <input type="date" style={{...inputStyle,marginBottom:16}} value={val} onChange={e=>setVal(e.target.value)}/>
          : kind==='text'||kind==='list'
          ? <input style={{...inputStyle,marginBottom:16}} value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()} autoFocus placeholder={kind==='list'?'Separe por vírgula':''}/>
          : <input style={{...inputStyle,fontSize:24,fontFamily:"'Space Grotesk',sans-serif",marginBottom:16}} inputMode="decimal" value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()} autoFocus/>}
        <button onClick={save} disabled={travado} style={{width:'100%',padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:travado?'not-allowed':'pointer',opacity:travado?.45:1}}>Salvar</button>
      </div>
    </div>
  );
}

/* ---------- modal adicionar / editar (genérico por schema de campos) ---------- */
function AddModal({title, fields, editing, initial, onClose, onSave, onEdit, aviso}){
  useEsc(onClose);
  const [f,setF]=useState(()=>{
    const o={};
    fields.forEach(fd=>{
      let v = editing ? editing[fd.k] : (initial && initial[fd.k]!=null ? initial[fd.k] : fd.def);
      if(v==null) v = fd.type==='select' ? (fd.opts[0]||'') : '';
      if(fd.type==='toggle') v=!!v;
      else if((fd.type==='money'||fd.type==='int') && typeof v==='number') v=String(v).replace('.',',');
      o[fd.k]=v;
    });
    return o;
  });
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=()=>{
    const out={};
    for(const fd of fields){
      let v=f[fd.k];
      if(fd.type==='toggle'){ out[fd.k]=!!v; continue; }
      if(fd.type==='money') v=parseValor(v);
      else if(fd.type==='int') v=Math.round(parseValor(v));
      else if(typeof v==='string') v=v.trim();
      out[fd.k]=v===''?null:v;
    }
    // validação mínima: selects e datas obrigatórios
    for(const fd of fields){ if((fd.type==='select'||fd.type==='date') && !out[fd.k]) return; }
    editing ? onEdit({...editing,...out}) : onSave(out);
  };
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50}}>
      <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:560,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',maxHeight:'92vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,margin:0}}>{title}</h3>
          <button onClick={onClose} aria-label="Fechar" style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
        </div>
        {aviso&&<div data-aviso-form role="alert" style={{background:C.redSoft,color:C.red,borderRadius:12,padding:'10px 13px',fontSize:13.5,fontWeight:700,lineHeight:1.45,marginBottom:14}}>{aviso}</div>}
        <div className="modalgrid">
          {fields.filter(fd=>!fd.oculto).map(fd=>fd.type==='toggle'
            ? <button key={fd.k} type="button" className={fd.full?'full':''} onClick={()=>set(fd.k,!f[fd.k])}
                style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:13,cursor:'pointer',textAlign:'left',
                  border:`1.5px solid ${f[fd.k]?P:C.border}`,background:f[fd.k]?C.plumSoft:C.surface}}>
                <span style={{width:20,height:20,borderRadius:6,flexShrink:0,display:'grid',placeItems:'center',fontSize:13,fontWeight:800,
                  border:`1.5px solid ${f[fd.k]?P:C.border}`,background:f[fd.k]?P:'transparent',color:'#fff'}}>{f[fd.k]?'✓':''}</span>
                <span style={{minWidth:0}}><span style={{fontWeight:700,fontSize:13.5,color:f[fd.k]?P:C.ink}}>{fd.label}</span>
                {fd.hint&&<span style={{display:'block',fontSize:11.5,color:C.inkSoft,lineHeight:1.4,marginTop:1}}>{fd.hint}</span>}</span>
              </button>
            : <div key={fd.k} className={fd.full?'full':''}>
            <label style={labelStyle}>{fd.label}</label>
            {fd.type==='select' ? <Select value={f[fd.k]} onChange={e=>set(fd.k,e.target.value)} opts={fd.opts}/>
              : fd.type==='date' ? <input type="date" style={inputStyle} value={f[fd.k]} onChange={e=>set(fd.k,e.target.value)}/>
              : fd.type==='textarea' ? <textarea rows={2} style={{...inputStyle,resize:'vertical'}} value={f[fd.k]} onChange={e=>set(fd.k,e.target.value)}/>
              : fd.type==='money' ? <input inputMode="decimal" placeholder="0,00" style={{...inputStyle,fontFamily:"'Space Grotesk',sans-serif"}} value={f[fd.k]} onChange={e=>set(fd.k,e.target.value)}/>
              : fd.type==='int' ? <input inputMode="numeric" placeholder="0" style={inputStyle} value={f[fd.k]} onChange={e=>set(fd.k,e.target.value)}/>
              : <input style={inputStyle} value={f[fd.k]} onChange={e=>set(fd.k,e.target.value)}/>}
          </div>)}
          <button className="full" onClick={save} style={{marginTop:4,padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer'}}>{editing?'Salvar alterações':'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- campo de senha com botão de mostrar (evita o "senha forte" fantasma do iPhone) ---------- */
function PassInput({value,onChange,onEnter,autoComplete,placeholder}){
  const [show,setShow]=useState(false);
  return <div style={{position:'relative'}}>
    <input style={{...inputStyle,paddingRight:46}} type={show?'text':'password'} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={placeholder} value={value} onChange={onChange} onKeyDown={e=>e.key==='Enter'&&onEnter&&onEnter()}/>
    <button type="button" tabIndex={-1} onClick={()=>setShow(s=>!s)} aria-label={show?'Ocultar senha':'Mostrar senha'} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',width:34,height:34,borderRadius:9,border:'none',background:'transparent',color:C.inkSoft,cursor:'pointer',display:'grid',placeItems:'center'}}>{show?<IcoEyeOff s={19}/>:<IcoEye s={19}/>}</button>
  </div>;
}

/* ---------- trocar senha (Ajustes) ---------- */
/* ---------- redefinição de senha (veio do link do e-mail) ----------
   Tela CHEIA e OBRIGATÓRIA: não dá pra fechar nem acessar o sistema sem criar a senha nova.
   Ao concluir, desloga — pra entrar, a pessoa tem que logar com a senha nova. Fecha a brecha
   de "clicou no link e entrou sem senha". */
function RecoveryReset(){
  const [p1,setP1]=useState(''); const [p2,setP2]=useState('');
  const [err,setErr]=useState(''); const [busy,setBusy]=useState(false); const [ok,setOk]=useState(false);
  const save=async()=>{
    setErr('');
    { const fr=senhaFraca(p1); if(fr) return setErr(fr); }
    if(p1!==p2) return setErr('As duas senhas não conferem.');
    setBusy(true);
    const {error}=await sb.auth.updateUser({password:p1});
    if(error){ setBusy(false); return setErr('Não consegui trocar a senha. O link pode ter expirado — peça outro pelo "Esqueci minha senha".'); }
    // encerra a sessão de recuperação: só entra quem souber a senha nova
    try{ await sb.auth.signOut(); }catch(e){}
    setBusy(false); setOk(true);
  };
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20}}>
    <Card style={{padding:30,width:'100%',maxWidth:400}} className="ftfade">
      <div style={{display:'flex',justifyContent:'center',marginBottom:12}}><Brand/></div>
      {ok
        ? <div style={{textAlign:'center'}}>
            <div style={{fontSize:40,marginBottom:6}}>🔒</div>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:700,margin:'0 0 8px'}}>Senha alterada!</h3>
            <p style={{fontSize:13.5,color:C.inkSoft,lineHeight:1.6,margin:'0 0 16px'}}>Agora entra com a <b>senha nova</b>. Por segurança, o acesso pelo link foi encerrado.</p>
            <button onClick={()=>window.location.replace(window.location.origin+window.location.pathname)} style={{width:'100%',padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer'}}>Ir para o login</button>
          </div>
        : <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:700,margin:0,textAlign:'center'}}>Crie sua nova senha</h3>
            <p style={{fontSize:13,color:C.inkSoft,textAlign:'center',margin:0,lineHeight:1.6}}>Pra proteger a conta, você precisa definir uma senha nova antes de entrar. Mínimo 8 caracteres.</p>
            <div><label style={labelStyle}>Nova senha</label><PassInput autoComplete="new-password" value={p1} onChange={e=>setP1(e.target.value)}/></div>
            <div><label style={labelStyle}>Confirmar nova senha</label><PassInput autoComplete="new-password" value={p2} onChange={e=>setP2(e.target.value)} onEnter={save}/></div>
            {err&&<div style={{color:C.red,fontSize:13.5,fontWeight:600}}>{err}</div>}
            <button onClick={save} disabled={busy} style={{padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',opacity:busy?.7:1}}>{busy?'Salvando...':'Salvar e continuar'}</button>
          </div>}
    </Card>
  </div>;
}

function ChangePassModal({onClose,email}){
  useEsc(onClose);
  const [p0,setP0]=useState(''); const [p1,setP1]=useState(''); const [p2,setP2]=useState('');
  const [err,setErr]=useState(''); const [busy,setBusy]=useState(false); const [ok,setOk]=useState(false);
  const save=async()=>{
    setErr('');
    { const fr=senhaFraca(p1,[email]); if(fr) return setErr(fr); }
    if(p1!==p2) return setErr('As duas senhas não conferem.');
    if(!p0) return setErr('Digite a senha atual.');
    setBusy(true);
    // F0.4: confirma a senha ATUAL antes de trocar (sessão aberta num aparelho emprestado não basta)
    const {error:e0}=await sb.auth.signInWithPassword({email,password:p0});
    if(e0){ setBusy(false); return setErr('Senha atual incorreta.'); }
    const {error}=await sb.auth.updateUser({password:p1});
    setBusy(false);
    if(error) return setErr('Não consegui trocar a senha. Tenta de novo.');
    setOk(true);
  };
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:55}}>
      <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:460,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>Trocar senha</h3>
          <button onClick={onClose} style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
        </div>
        {ok
          ? <div style={{textAlign:'center',padding:'8px 0 4px'}}>
              <div style={{fontSize:15,fontWeight:700,color:C.greenMid,marginBottom:10}}>Senha trocada! ✅</div>
              <div style={{fontSize:13.5,color:C.inkSoft,lineHeight:1.6,marginBottom:16}}>Guarda ela num lugar seguro. Da próxima vez, entra com a senha nova.</div>
              <button onClick={onClose} style={{width:'100%',padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer'}}>Fechar</button>
            </div>
          : <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div style={{fontSize:13,color:C.inkSoft,lineHeight:1.6}}>Escolhe uma senha só sua (mínimo 8 caracteres, com letras e números). Toque no 👁 pra conferir antes de salvar.</div>
              <div><label style={labelStyle}>Senha atual</label><PassInput autoComplete="current-password" value={p0} onChange={e=>setP0(e.target.value)}/></div>
              <div><label style={labelStyle}>Nova senha</label><PassInput autoComplete="off" value={p1} onChange={e=>setP1(e.target.value)}/></div>
              <div><label style={labelStyle}>Confirmar nova senha</label><PassInput autoComplete="off" value={p2} onChange={e=>setP2(e.target.value)} onEnter={save}/></div>
              {err&&<div style={{color:C.red,fontSize:13.5,fontWeight:600}}>{err}</div>}
              <button onClick={save} disabled={busy} style={{padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',opacity:busy?.7:1}}>{busy?'Salvando...':'Salvar nova senha'}</button>
            </div>}
      </div>
    </div>
  );
}

/* ---------- excluir conta (LGPD): apaga TUDO no servidor e desloga ---------- */
function DeleteAccountModal({nickname,onClose}){
  useEsc(onClose);
  const [txt,setTxt]=useState(''); const [busy,setBusy]=useState(false); const [err,setErr]=useState('');
  const alvo='EXCLUIR';
  const go=async()=>{
    setErr(''); setBusy(true);
    const {error}=await sb.rpc('excluir_minha_conta');
    if(error){ setBusy(false); return setErr('Não consegui excluir agora. Tenta de novo em instantes.'); }
    try{ localStorage.removeItem('gb_signup'); localStorage.removeItem('gb_tour'); }catch(e){}
    await sb.auth.signOut(); window.location.reload();
  };
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.55)',backdropFilter:'blur(3px)',display:'grid',placeItems:'center',zIndex:70,padding:18}}>
    <Card onClick={e=>e.stopPropagation()} className="ftfade" style={{padding:26,maxWidth:420,width:'100%'}}>
      <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:'0 0 8px',color:C.red}}>Excluir minha conta</h3>
      <p style={{fontSize:13.5,color:C.inkSoft,lineHeight:1.6,margin:'0 0 14px'}}>Isso apaga <b>de forma definitiva</b> tudo que é seu: banca, torneios, estatísticas, mãos importadas e o cadastro. <b>Não dá pra desfazer.</b> Se você paga um plano, cancele antes na Kiwify.</p>
      <label style={labelStyle}>Digite <b>{alvo}</b> pra confirmar</label>
      <input style={{...inputStyle,marginBottom:12}} value={txt} onChange={e=>setTxt(e.target.value)} autoCapitalize="characters" placeholder={alvo}/>
      {err&&<div style={{color:C.red,fontSize:13.5,fontWeight:600,marginBottom:10}}>{err}</div>}
      <div style={{display:'flex',gap:10}}>
        <button onClick={onClose} style={{flex:1,padding:'13px 0',borderRadius:13,border:`1.5px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:14.5,cursor:'pointer'}}>Cancelar</button>
        <button onClick={go} disabled={busy||txt.trim().toUpperCase()!==alvo} style={{flex:1,padding:'13px 0',borderRadius:13,border:'none',background:txt.trim().toUpperCase()===alvo?C.red:C.bg,color:txt.trim().toUpperCase()===alvo?'#fff':'#C3BBA9',fontWeight:700,fontSize:14.5,cursor:busy?'default':'pointer',opacity:busy?.7:1}}>{busy?'Excluindo…':'Excluir tudo'}</button>
      </div>
    </Card>
  </div>;
}

/* ---------- login / não configurado ---------- */
function Login({aviso}){
  const [ident,setIdent]=useState(''); const [pass,setPass]=useState('');
  const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  // criar conta (self-service do GrinderBank): nome + e-mail + senha -> workspace solo
  const [mode,setMode]=useState(conviteGuardado()?'signup':'login'); const [ok,setOk]=useState('');
  // convite de time pendente: mostra pra onde a pessoa vai entrar (o servidor responde sem login; o token é o segredo)
  const [conv,setConv]=useState(null);
  useEffect(()=>{ const tk=conviteGuardado(); if(!tk||!sb) return;
    sb.rpc('ver_convite',{p_token:tk}).then(({data})=>{ if(data&&typeof data==='object') setConv(data); }).catch(()=>{});
  },[]);
  const comConvite=!!(conv&&conv.valido);
  const largarConvite=()=>{ esquecerConvite(); setConv(null); };
  const [nNome,setNNome]=useState(''); const [nMail,setNMail]=useState(''); const [nZap,setNZap]=useState(''); const [nP1,setNP1]=useState(''); const [nP2,setNP2]=useState('');
  const [nPlan,setNPlan]=useState('pro');   // plano escolhido pro teste grátis de 15 dias
  const [nCod,setNCod]=useState('');         // código do time (opcional): a conta já pede pra entrar no time
  const criar=async()=>{
    setErr(''); setOk('');
    const nome=nNome.trim();
    const mail=nMail.trim().toLowerCase();
    const zap=nZap.replace(/\D/g,'');
    if(nome.length<2) return setErr('Diga seu nome ou apelido (pelo menos 2 letras).');
    if(nome.length>30) return setErr('Apelido muito longo — no máximo 30 caracteres.');
    // o apelido também é login: com @ confundiria com e-mail, e só números com CPF
    if(nome.includes('@')) return setErr('O apelido não pode ter @ (é ele que você usa pra entrar).');
    if(/^\d+$/.test(nome)) return setErr('O apelido não pode ser só números — mistura com letras.');
    if(!/^\S+@\S+\.\S+$/.test(mail)) return setErr('E-mail inválido.');
    if(zap&&(zap.length<10||zap.length>13)) return setErr('WhatsApp incompleto — usa DDD + número (ou deixa em branco).');
    { const fr=senhaFraca(nP1,[nome,mail]); if(fr) return setErr(fr); }
    if(nP1!==nP2) return setErr('As duas senhas não conferem.');
    const cod=normCodigo(nCod);
    if(nCod.trim()&&!codigoValido(cod)) return setErr('Código do time inválido: é tipo TIME-12345 (confira com o time).');
    setBusy(true);
    if(cod) guardarCodigo(cod);   // o pedido de entrada vai assim que a conta existir (o painel manda ao carregar)
    // apelido é ÚNICO (como numa sala de poker — ele também serve pra fazer login)
    try{ const {data:livre}=await sb.rpc('nickname_disponivel',{nick:nome});
      if(livre===false){ setBusy(false); return setErr('Esse apelido já está em uso — escolhe outro (é único, como numa sala de poker).'); } }catch(e){}
    // guarda o cadastro pendente ANTES: se a conta só ativar depois (confirmação de e-mail)
    // ou qualquer passo abaixo falhar, o próximo login completa perfil + workspace sozinho.
    // Inclui o plano escolhido: o teste grátis de 15 dias é DESSE plano.
    try{ localStorage.setItem('gb_signup',JSON.stringify({nickname:nome,whatsapp:zap||null,plan:nPlan})); }catch(e){}
    const {data,error}=await sb.auth.signUp({email:mail,password:nP1});
    if(error){ setBusy(false); try{ localStorage.removeItem('gb_signup'); }catch(e){}
      const m=`${error.message||''} ${error.code||''}`.toLowerCase();
      if(/registered|already/.test(m)) return setErr('Esse e-mail já tem conta — usa o "Entrar".');
      if(/invalid/.test(m)&&/email/.test(m)) return setErr('Esse e-mail parece inválido — confere se digitou certo (ex.: termina em .com, não .con).');
      if(/weak|password/.test(m)) return setErr('Senha muito fraca — tenta uma com mais letras e números.');
      return setErr('Não consegui criar a conta. Confere o e-mail e tenta de novo.'); }
    if(!data||!data.session){ setBusy(false); setMode('login'); setOk('Conta criada! Confirme no seu e-mail e depois entre aqui: seu apelido fica guardado.'); return; }
    // sessão já veio: cria perfil + workspace solo e recarrega limpo
    const {error:pe}=await sb.from('player_profiles').insert({user_id:data.session.user.id,email:data.session.user.email,nickname:nome,whatsapp:zap||null,password_changed:true,role:'solo'});
    if(pe&&pe.code==='23505'){ setBusy(false); return setErr('Esse apelido acabou de ser registrado por outra pessoa — escolhe outro.'); }
    if(!pe){ try{ localStorage.removeItem('gb_signup'); }catch(e){} }
    // com convite de time, a conta entra no time (o painel aceita o convite ao carregar); sem convite, conta individual
    if(!conviteGuardado()) try{ await sb.rpc('create_solo_workspace',{ws_name:nome,plan_escolhido:nPlan}); }catch(e){ console.error(e); }
    window.location.reload();
  };
  // reenviar o e-mail de confirmação (caso do login antes de confirmar)
  const [confirmMail,setConfirmMail]=useState('');
  const reenviarConfirm=async()=>{
    setBusy(true);
    try{ await sb.auth.resend({type:'signup',email:confirmMail}); }catch(e){}
    setBusy(false); setConfirmMail('');
    setOk('E-mail de confirmação reenviado! Confere a caixa de entrada (e o spam) e clica no link antes de entrar.');
  };
  const entrar=async()=>{
    setErr(''); setOk(''); setConfirmMail(''); setBusy(true);
    const id=ident.trim();
    if(id.includes('@')){
      const {error}=await sb.auth.signInWithPassword({email:id.toLowerCase(),password:pass});
      setBusy(false);
      if(error){
        // conta existe mas o e-mail ainda não foi confirmado -> mensagem certa + reenvio
        if(/confirm/i.test(`${error.message||''} ${error.code||''}`)) setConfirmMail(id.toLowerCase());
        else setErr('Usuário ou senha incorretos.');
      }
      return;
    }
    // login por apelido: a resolução apelido->e-mail e a autenticação acontecem NO SERVIDOR
    // (Edge Function) — o e-mail nunca volta pro navegador. Fecha a deanonimização apelido→e-mail.
    let data,error;
    try{ ({data,error}=await sb.functions.invoke('auth-alias',{body:{action:'login',identifier:id,password:pass}})); }
    catch(e){ error=e; }
    if(error||!data||!data.access_token){ setBusy(false); setErr('Usuário ou senha incorretos.'); return; }
    const {error:se}=await sb.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
    setBusy(false);
    if(se) setErr('Não consegui abrir a sessão. Tenta de novo.');
  };
  // esqueci a senha: manda o link de redefinição. Com apelido, a resolução é no servidor
  // (Edge Function) e a resposta é sempre genérica — não confirma se a conta existe.
  const esqueci=async()=>{
    setErr(''); setOk('');
    const id=ident.trim();
    if(!id) return setErr('Digite seu e-mail, apelido ou CPF no campo acima que o link vai pro seu e-mail.');
    setBusy(true);
    const redirectTo=window.location.origin+window.location.pathname;
    if(id.includes('@')){
      try{ await sb.auth.resetPasswordForEmail(id.toLowerCase(),{redirectTo}); }catch(e){}
    }else{
      try{ await sb.functions.invoke('auth-alias',{body:{action:'reset',identifier:id,redirectTo}}); }catch(e){}
    }
    setBusy(false);
    setOk('Se esse cadastro existir, o link de redefinição chega em instantes. Abre ele e escolhe a senha nova.');
  };
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20}}>
    <Card style={{padding:30,width:'100%',maxWidth:380}} className="ftfade">
      <div style={{display:'flex',justifyContent:'center',marginBottom:18}}><Brand/></div>
      {aviso&&<div data-link-aviso style={{background:C.goldSoft,borderRadius:12,padding:'12px 14px',marginBottom:14,fontSize:13,color:C.ink,lineHeight:1.5}}>{aviso}</div>}
      {conv&&(conv.valido
        ?<div data-convite="ok" style={{background:C.plumSoft,borderRadius:12,padding:'12px 14px',marginBottom:14}}>
          {conv.marca_logo&&<img src={conv.marca_logo} alt={conv.marca_nome||conv.time} data-convite-logo width={56} height={56} style={{display:'block',margin:'0 auto 8px',borderRadius:14,objectFit:'contain',background:'#fff'}}/>}
          <div style={{fontWeight:800,fontSize:14,color:P}}>Convite pro time {conv.marca_nome||conv.time}</div>
          <div style={{fontSize:12.5,color:C.ink,lineHeight:1.5,marginTop:3}}>{(()=>{ const pap=papelDe(conv.capacidades||[]);
            if(pap) return <>Você entra como <b>{conv.pessoa}</b>, <b>{(PAPEL_ROT[pap]||'gestão').toLowerCase()}</b> do time{conv.joga_em?<>, e também joga na <b>{conv.joga_em}</b></>:null}.</>;
            return conv.pessoa?<>Você entra como <b>{conv.pessoa}</b>, em <b>{conv.unidade}</b>.</>:<>Você entra em <b>{conv.unidade}</b>.</>; })()} Crie sua conta (ou entre, se já tiver uma) e o time aparece direto.</div>
        </div>
        :<div data-convite="ruim" style={{background:C.goldSoft,borderRadius:12,padding:'12px 14px',marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:13.5,color:C.gold}}>{conv.motivo||'Convite inválido.'}</div>
          <button onClick={largarConvite} style={{marginTop:8,padding:'8px 12px',borderRadius:10,border:'none',background:C.gold,color:'#fff',fontWeight:700,fontSize:12.5,cursor:'pointer'}}>Seguir sem convite</button>
        </div>)}
      {mode==='login'?<div style={{display:'flex',flexDirection:'column',gap:14}}>
        {ok&&<div style={{color:C.greenMid,fontSize:13.5,fontWeight:600,background:C.greenSoft,padding:'10px 12px',borderRadius:11}}>{ok}</div>}
        <div><label style={labelStyle}>E-mail, apelido ou CPF</label><input style={inputStyle} type="text" autoCapitalize="none" autoComplete="username" value={ident} onChange={e=>setIdent(e.target.value)} onKeyDown={e=>e.key==='Enter'&&entrar()}/></div>
        <div><label style={labelStyle}>Senha</label><PassInput autoComplete="current-password" value={pass} onChange={e=>setPass(e.target.value)} onEnter={entrar}/></div>
        {err&&<div style={{color:C.red,fontSize:13.5,fontWeight:600}}>{err}</div>}
        {confirmMail&&<div style={{background:C.goldSoft,borderRadius:11,padding:'12px 14px'}}>
          <div style={{color:C.gold,fontSize:13.5,fontWeight:700}}>Falta confirmar seu e-mail 📬</div>
          <div style={{fontSize:12.5,color:C.ink,lineHeight:1.5,marginTop:3}}>Tua conta existe, mas antes de entrar você precisa clicar no link que mandamos pra <b>{confirmMail}</b>. Não achou? Olha o spam — ou reenvia:</div>
          <button onClick={reenviarConfirm} disabled={busy} style={{marginTop:8,padding:'9px 14px',borderRadius:10,border:'none',background:C.gold,color:'#fff',fontWeight:700,fontSize:12.5,cursor:'pointer'}}>Reenviar e-mail de confirmação</button>
        </div>}
        <button onClick={entrar} disabled={busy} style={{padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',opacity:busy?.7:1}}>{busy?'Entrando...':'Entrar'}</button>
        <button onClick={esqueci} disabled={busy} style={{border:'none',background:'transparent',color:C.inkSoft,fontWeight:600,fontSize:13,cursor:'pointer',padding:'2px 0',textDecoration:'underline'}}>Esqueci minha senha</button>
        <button onClick={()=>{setMode('signup');setErr('');setOk('');}} style={{padding:'12px 0',borderRadius:14,border:`1.5px solid ${C.border}`,background:'transparent',color:P,fontWeight:700,fontSize:14,cursor:'pointer'}}>Criar conta grátis</button>
      </div>
      :<div style={{display:'flex',flexDirection:'column',gap:14}}>
        {!comConvite&&<div style={{fontSize:13,color:C.inkSoft,lineHeight:1.5,textAlign:'center'}}>Sua conta individual: banca, torneios e estatísticas — só seus, ninguém mais vê.</div>}
        <div><label style={labelStyle}>Nome ou apelido</label><input style={inputStyle} value={nNome} autoCapitalize="none" placeholder="Ex: rafa_grinder" onChange={e=>setNNome(e.target.value)}/></div>
        <div><label style={labelStyle}>E-mail</label><input style={inputStyle} type="email" autoCapitalize="none" autoComplete="email" value={nMail} onChange={e=>setNMail(e.target.value)}/></div>
        <div><label style={labelStyle}>WhatsApp (opcional)</label><input style={inputStyle} inputMode="tel" placeholder="DDD + número" value={nZap} onChange={e=>setNZap(e.target.value)}/></div>
        {!comConvite&&<div><label style={labelStyle}>Código do time (opcional)</label><input data-cadastro-codigo style={inputStyle} autoCapitalize="characters" placeholder="Ex: TIME-12345, se o seu time te passou" value={nCod} onChange={e=>setNCod(e.target.value)}/></div>}
        <div><label style={labelStyle}>Senha</label><PassInput autoComplete="new-password" value={nP1} onChange={e=>setNP1(e.target.value)}/></div>
        <div><label style={labelStyle}>Confirmar senha</label><PassInput autoComplete="new-password" value={nP2} onChange={e=>setNP2(e.target.value)} onEnter={criar}/></div>
        {/* escolha de plano: o teste grátis de 15 dias é do plano escolhido (quem entra por convite usa o plano do time) */}
        {!comConvite&&<div>
          <label style={labelStyle}>Escolha seu plano · 15 dias grátis</label>
          <div style={{display:'flex',gap:8}}>
            {[['gestao','Gestão','R$ 19,90/mês','banca, torneios e relatórios'],['pro','Pro','R$ 49,90/mês','tudo + stats das mãos e leituras']].map(([v,nm,pr,desc])=>
              <button key={v} type="button" onClick={()=>setNPlan(v)} style={{flex:1,padding:'12px 11px',borderRadius:13,border:`1.5px solid ${nPlan===v?P:C.border}`,background:nPlan===v?C.plumSoft:'transparent',cursor:'pointer',textAlign:'left'}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:14,height:14,borderRadius:99,border:`2px solid ${nPlan===v?P:C.border}`,background:nPlan===v?P:'transparent',flexShrink:0}}/><span style={{fontWeight:800,fontSize:14.5,color:nPlan===v?P:C.ink}}>{nm}</span></div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.ink,marginTop:4}}>{pr}</div>
                <div style={{fontSize:10.5,color:C.inkSoft,lineHeight:1.3,marginTop:2}}>{desc}</div>
              </button>)}
          </div>
          <div style={{fontSize:11,color:C.inkSoft,marginTop:7,lineHeight:1.45}}>Você testa <b>15 dias grátis</b>. Pra continuar depois disso, é só assinar — a gente te avisa antes de acabar. Sem assinar, o acesso é bloqueado ao fim do teste.</div>
        </div>}
        {err&&<div style={{color:C.red,fontSize:13.5,fontWeight:600}}>{err}</div>}
        <div style={{fontSize:11.5,color:C.inkSoft,lineHeight:1.5}}>Ao criar a conta você concorda com os <a href="termos.html" target="_blank" style={{color:P}}>Termos de Uso</a> e a <a href="privacidade.html" target="_blank" style={{color:P}}>Política de Privacidade</a>.</div>
        <button onClick={criar} disabled={busy} style={{padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',opacity:busy?.7:1}}>{busy?'Criando…':'Criar minha conta'}</button>
        <button onClick={()=>{setMode('login');setErr('');}} style={{padding:'12px 0',borderRadius:14,border:`1.5px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:14,cursor:'pointer'}}>Já tenho conta</button>
      </div>}
    </Card>
  </div>;
}
/* ---------- onboarding do usuário SOLO (3 passos: nome -> banca/sites -> pronto) ---------- */
function SetupSolo({profile,ws,onDone}){
  const [step,setStep]=useState(1);
  const [nome,setNome]=useState((profile&&profile.nickname)||'');
  const [banca,setBanca]=useState('');
  const [abi,setAbi]=useState('');            // teto de buy-in — SEM isso todo torneio vira "fora da grade"
  const [sites,setSites]=useState(['GG Poker','PokerStars']);
  const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  const toggleSite=s=>setSites(x=>x.includes(s)?x.filter(y=>y!==s):[...x,s]);
  const concluir=async()=>{
    setBusy(true); setErr('');
    try{
      // rpc pode acusar "já tem workspace" num retry após falha parcial — segue em frente.
      // plano do teste vem do cadastro (gb_signup); fallback 'gestao'.
      let plano='gestao'; try{ const s=JSON.parse(localStorage.getItem('gb_signup')||'null'); if(s&&s.plan) plano=s.plan; }catch(e){}
      if(!ws) try{ await sb.rpc('create_solo_workspace',{ws_name:nome.trim(),plan_escolhido:plano}); }catch(e){ console.error(e); }
      // NUNCA cria uma segunda config: se um retry chegar aqui com a config já salva, só conclui
      const {data:jaTem}=await sb.from('pool_config').select('id').limit(1);
      if(!jaTem||!jaTem.length){
        // o teto vem do que a pessoa respondeu; só cai no padrão se ela pulou a pergunta
        const teto=parseValor(abi)>0?parseValor(abi):2;
        const {error}=await sb.from('pool_config').insert({player1_name:nome.trim(),player2_name:'',player_pct:1,
          banca_inicial:parseValor(banca)||0,piso_minimo:0,makeup_max_recomendado:0,abi_max:teto,abi_max_player1:teto,abi_max_player2:0,
          week_start_date:todayISO(),sites_permitidos:sites.length?sites:['GG Poker'],modalidades_permitidas:['MTT','Spin','Cash','Sit & Go']});
        if(error) throw error;
      }
      onDone();
    }catch(e){ console.error(e); setBusy(false); setErr('Não consegui salvar. Tenta de novo.'); }
  };
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20}}>
    <Card style={{padding:30,width:'100%',maxWidth:420}} className="ftfade">
      <div style={{display:'flex',justifyContent:'center',marginBottom:12}}><Brand/></div>
      <div style={{fontSize:11,fontWeight:700,color:C.inkSoft,textTransform:'uppercase',letterSpacing:'.06em',textAlign:'center',marginBottom:6}}>Passo {step} de 4</div>
      {step===1&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0,textAlign:'center'}}>Como te chamamos?</h3>
        <div><label style={labelStyle}>Nome ou apelido</label><input style={inputStyle} value={nome} placeholder="Ex: rafa_grinder" onChange={e=>setNome(e.target.value)} autoFocus/></div>
        {err&&<div style={{color:C.red,fontSize:13.5,fontWeight:600}}>{err}</div>}
        <button onClick={()=>{ if(nome.trim().length<2){setErr('Pelo menos 2 letras.');return;} setErr(''); setStep(2); }} style={{padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer'}}>Continuar</button>
      </div>}
      {step===2&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0,textAlign:'center'}}>Sua banca hoje</h3>
        <div><label style={labelStyle}>Banca inicial (US$) — pode ser 0</label><input style={inputStyle} inputMode="decimal" value={banca} placeholder="Ex: 150" onChange={e=>setBanca(e.target.value)}/></div>
        <div><label style={labelStyle}>Onde você joga</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6}}>
            {['GG Poker','PokerStars','Outros'].map(s=><button key={s} onClick={()=>toggleSite(s)} style={{padding:'8px 13px',borderRadius:99,border:`1.5px solid ${sites.includes(s)?P:C.border}`,background:sites.includes(s)?C.plumSoft:'transparent',color:sites.includes(s)?P:C.inkSoft,fontWeight:700,fontSize:13,cursor:'pointer'}}>{s}</button>)}
          </div></div>
        <button onClick={()=>setStep(3)} style={{padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer'}}>Continuar</button>
      </div>}
      {step===3&&(()=>{
        // Pergunta DESCRITIVA ("qual você joga"), não prescritiva. A referência de 100 buy-ins
        // fica ao lado como informação de gestão — sem empurrar ninguém pra cima nem pra baixo.
        const b=parseValor(banca), ref=b>0?b/100:0;
        return <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0,textAlign:'center'}}>Sua grade</h3>
          <div style={{fontSize:13,color:C.inkSoft,lineHeight:1.6,textAlign:'center',marginTop:-6}}>Qual o <b>maior buy-in</b> que você joga hoje? É esse número que o app usa pra avisar quando um torneio passou do seu limite.</div>
          <div><label style={labelStyle}>Maior buy-in (US$)</label>
            <input style={inputStyle} inputMode="decimal" value={abi} placeholder="Ex: 5,50" onChange={e=>setAbi(e.target.value)} autoFocus/></div>
          <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
            {['2,50','3,20','5,50','11,00','22,00'].map(v=><button key={v} onClick={()=>setAbi(v)} style={{padding:'7px 12px',borderRadius:99,border:`1.5px solid ${abi===v?P:C.border}`,background:abi===v?C.plumSoft:'transparent',color:abi===v?P:C.inkSoft,fontWeight:700,fontSize:13,cursor:'pointer'}}>US$ {v}</button>)}
          </div>
          {ref>0&&<div style={{fontSize:12,color:C.inkSoft,lineHeight:1.5,padding:'9px 11px',borderRadius:10,background:C.bg}}>ℹ️ Só como referência: a régua clássica de MTT é ter <b>100 buy-ins</b> de banca. Com {fmt(b)}, isso daria <b>{fmt(ref)}</b>. Não é obrigação — é o número que costuma segurar a variância. Dá pra mudar quando quiser nos Ajustes.</div>}
          {err&&<div style={{color:C.red,fontSize:13.5,fontWeight:600}}>{err}</div>}
          <button onClick={()=>{ if(!(parseValor(abi)>0)){setErr('Preenche o maior buy-in que você joga.');return;} setErr(''); setStep(4); }} style={{padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer'}}>Continuar</button>
        </div>;
      })()}
      {step===4&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0,textAlign:'center'}}>Tudo pronto, {nome.trim().split(' ')[0]}!</h3>
        <div style={{fontSize:13.5,color:C.inkSoft,lineHeight:1.7}}>✓ Lança seus torneios na aba <b>Torneios</b><br/>✓ Acompanha banca e semana no <b>Painel</b><br/>✓ Importa suas mãos na aba <b>Stats</b> pra ver suas estatísticas e leituras</div>
        {err&&<div style={{color:C.red,fontSize:13.5,fontWeight:600}}>{err}</div>}
        <button onClick={concluir} disabled={busy} style={{padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer',opacity:busy?.7:1}}>{busy?'Preparando…':'Começar a usar'}</button>
      </div>}
    </Card>
  </div>;
}

/* ---------- primeiro acesso: troca de senha + cadastro ---------- */
function Onboarding({session,profile,onDone}){
  const [nick,setNick]=useState(profile?.nickname||'');
  const [cpf,setCpf]=useState(profile?.cpf||'');
  const [p1,setP1]=useState(''); const [p2,setP2]=useState('');
  const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  const save=async()=>{
    setErr('');
    const nickname=nick.trim();
    const cpfDigits=cpf.replace(/\D/g,'');
    if(nickname.length<2) return setErr('Escolhe um nickname com pelo menos 2 letras.');
    if(nickname.length>30) return setErr('Nickname muito longo — no máximo 30 caracteres.');
    if(nickname.includes('@')) return setErr('O nickname não pode ter @ (é ele que você usa pra entrar).');
    if(/^\d+$/.test(nickname)) return setErr('O nickname não pode ser só números — mistura com letras.');
    if(cpfDigits && cpfDigits.length!==11) return setErr('CPF precisa ter 11 números (ou deixa em branco).');
    { const fr=senhaFraca(p1,[nickname,session&&session.user&&session.user.email]); if(fr) return setErr(fr); }
    if(p1!==p2) return setErr('As duas senhas não conferem.');
    setBusy(true);
    // nickname é único como numa sala de poker — só checa se está trocando (o próprio não conta)
    if(!(profile&&profile.nickname&&profile.nickname.toLowerCase()===nickname.toLowerCase())){
      try{ const {data:livre}=await sb.rpc('nickname_disponivel',{nick:nickname});
        if(livre===false){ setBusy(false); return setErr('Esse nickname já está em uso — escolhe outro (é único, como numa sala de poker).'); } }catch(e){}
    }
    const {error:e1}=await sb.auth.updateUser({password:p1});
    if(e1){ setBusy(false); return setErr('Não consegui trocar a senha. Tenta de novo.'); }
    const row={user_id:session.user.id,email:session.user.email,nickname,cpf:cpfDigits||null,password_changed:true,...(profile?{}:{role:'solo'})};
    const {data,error:e2}=await sb.from('player_profiles').upsert(row).select().single();
    setBusy(false);
    if(e2) return setErr(e2.code==='23505'?'Esse nickname ou CPF já está em uso — confere e tenta outro.':'Não consegui salvar o cadastro. Tenta de novo.');
    onDone(data);
  };
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20}}>
    <Card style={{padding:30,width:'100%',maxWidth:420}} className="ftfade">
      <div style={{display:'flex',justifyContent:'center',marginBottom:12}}><Brand/></div>
      <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,margin:'0 0 6px',textAlign:'center'}}>Primeiro acesso</h3>
      <p style={{fontSize:13.5,color:C.inkSoft,textAlign:'center',margin:'0 0 18px',lineHeight:1.6}}>Troca a senha padrão e completa o cadastro. Depois dá pra entrar com <b>e-mail, apelido ou CPF</b>.</p>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div><label style={labelStyle}>Nickname</label><input style={inputStyle} value={nick} autoCapitalize="none" placeholder="Ex: gab_gg" onChange={e=>setNick(e.target.value)}/></div>
        <div><label style={labelStyle}>CPF (opcional, só números)</label><input style={inputStyle} inputMode="numeric" value={cpf} placeholder="00000000000" onChange={e=>setCpf(e.target.value)}/></div>
        <div><label style={labelStyle}>Nova senha</label><PassInput autoComplete="off" value={p1} onChange={e=>setP1(e.target.value)}/></div>
        <div><label style={labelStyle}>Confirmar nova senha</label><PassInput autoComplete="off" value={p2} onChange={e=>setP2(e.target.value)} onEnter={save}/></div>
        <div style={{fontSize:12,color:C.inkSoft,marginTop:-6,lineHeight:1.5}}>Toque no 👁 pra conferir a senha antes de salvar. Anote ou salve num lugar seguro.</div>
        {err&&<div style={{color:C.red,fontSize:13.5,fontWeight:600}}>{err}</div>}
        <button onClick={save} disabled={busy} style={{padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',opacity:busy?.7:1}}>{busy?'Salvando...':'Salvar e entrar'}</button>
      </div>
    </Card>
  </div>;
}
// teste grátis de 15 dias acabou: bloqueia o app inteiro até assinar (dados ficam guardados)
function TrialBlocked({plan,email,onLogout,onDelete}){
  const pro=plan==='pro';
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20}}>
    <Card style={{padding:30,width:'100%',maxWidth:430,textAlign:'center'}} className="ftfade">
      <div style={{display:'flex',justifyContent:'center',marginBottom:12}}><Brand/></div>
      <div style={{fontSize:42,marginBottom:6}}>⏳</div>
      <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:700,margin:'0 0 8px'}}>Seu teste grátis de 15 dias acabou</h3>
      <p style={{fontSize:14,color:C.inkSoft,lineHeight:1.65,margin:'0 0 18px'}}>Pra continuar com sua banca, torneios{pro?' e estatísticas':''}, é só assinar. <b>Seus dados estão guardados</b> — voltam na hora que o pagamento confirmar. Use <b>este mesmo e-mail</b> no checkout.</p>
      <button onClick={()=>abrirCheckout(pro?'pro':'gestao','mensal',email)} style={{width:'100%',padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer'}}>{pro?'Assinar o Pro — R$ 49,90/mês':'Assinar a Gestão — R$ 19,90/mês'}</button>
      <button onClick={()=>abrirCheckout(pro?'pro':'gestao','anual',email)} style={{width:'100%',marginTop:8,padding:'12px 0',borderRadius:13,border:`1.5px solid ${P}`,background:C.plumSoft,color:P,fontWeight:700,fontSize:14,cursor:'pointer'}}>{pro?'Plano anual — R$ 399 (2 meses grátis)':'Plano anual — R$ 149'}</button>
      <button onClick={()=>abrirCheckout(pro?'gestao':'pro','mensal',email)} style={{width:'100%',marginTop:8,border:'none',background:'transparent',color:C.inkSoft,fontWeight:600,fontSize:12.5,cursor:'pointer',textDecoration:'underline'}}>{pro?'Prefiro só a gestão de banca — R$ 19,90/mês':'Quero também as estatísticas (Pro) — R$ 49,90/mês'}</button>
      <button onClick={()=>window.location.reload()} style={{width:'100%',marginTop:10,padding:'12px 0',borderRadius:13,border:`1.5px solid ${C.border}`,background:'transparent',color:P,fontWeight:700,fontSize:14,cursor:'pointer'}}>Já paguei — atualizar</button>
      <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:16}}>
        <button onClick={onLogout} style={{border:'none',background:'transparent',color:C.inkSoft,fontWeight:600,fontSize:13,cursor:'pointer',textDecoration:'underline'}}>Sair</button>
        <button onClick={onDelete} style={{border:'none',background:'transparent',color:C.red,fontWeight:600,fontSize:13,cursor:'pointer',textDecoration:'underline'}}>Excluir minha conta</button>
      </div>
    </Card>
  </div>;
}
function NotConfigured(){
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24}}>
    <Card style={{padding:30,maxWidth:460}}>
      <div style={{display:'flex',justifyContent:'center',marginBottom:16}}><Brand/></div>
      <h3 style={{fontFamily:"'Space Grotesk',sans-serif",margin:'0 0 8px'}}>Falta conectar o banco de dados</h3>
      <p style={{color:C.inkSoft,fontSize:14.5,lineHeight:1.6,margin:0}}>Abra o <b>index.html</b> e cole a <b>URL</b> e a <b>chave anon</b> do projeto Supabase da pool no topo do arquivo. Depois recarregue.</p>
    </Card>
  </div>;
}

/* ---------- torneios: linha + card de dia (Torneios) + card por jogador (Diário) ---------- */
function TourRow({t,config,players,onEdit,onDelete}){
  // só sinaliza o que é grave (fora da grade DA ÉPOCA); OK/ATENÇÃO poluíam a lista
  const sg=statusGrade(t,config), lp=lucroTorneio(t);
  const col=PLAYER_COLORS[players.indexOf(t.player)]||C.inkSoft;
  return <Row onEdit={onEdit} onDelete={onDelete}
    left={<><span style={{width:38,height:38,borderRadius:11,background:C.goldSoft,display:'grid',placeItems:'center',flexShrink:0,color:C.gold}}><IcoTrophy s={18}/></span>
      <div style={{minWidth:0}}><div style={{fontWeight:700,fontSize:14.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.tournament_name||'Torneio'} <span style={{color:col,fontWeight:700}}>· {t.player}</span></div>
      <div style={{fontSize:12,color:C.inkSoft,display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginTop:2}}>buy-in {fmt(t.buyin)}{num(t.reentries)>0?` +${num(t.reentries)}re`:''}{t.final_position?` · ${t.final_position}º`:''}{bountyTorneio(t)>0?` · bounty ${fmt(bountyTorneio(t))}`:''}
        {t.ticket&&<span style={{padding:'1px 7px',borderRadius:99,background:C.plumSoft,color:P,fontWeight:800,fontSize:10.5,whiteSpace:'nowrap'}}>BILHETE</span>}
        {sg.status!=='dentro'&&<span data-selo-grade={sg.status} style={{display:'contents'}}><Badge text={sg.status==='fora'?'FORA DA GRADE':'ATENÇÃO'}/><span style={{color:sg.status==='fora'?C.red:C.gold,fontWeight:700}}>{sg.motivo}{sg.simulada?' · grade simulada':''}</span></span>}</div></div></>}
    right={<span style={{fontWeight:800,fontSize:15,color:lp>=0?C.greenMid:C.red,flexShrink:0}}>{lp>=0?'+':'−'}{fmt(Math.abs(lp))}</span>}/>;
}
const sortByCreated = arr => [...arr].sort((a,b)=>(a.created_at||'')<(b.created_at||'')?1:-1);
// seletor em pílulas (filtros do Diário e do Mensal)
function Seg({label,value,options,onChange}){
  return <div style={{minWidth:0}}>
    {label&&<div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em',marginBottom:4}}>{label}</div>}
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
      {options.map(o=><button key={o} onClick={()=>onChange(o)} style={{padding:'6px 11px',borderRadius:99,border:`1.5px solid ${value===o?P:C.border}`,background:value===o?C.plumSoft:C.surface,color:value===o?P:C.inkSoft,fontWeight:700,fontSize:12.5,cursor:'pointer'}}>{o}</button>)}
    </div>
  </div>;
}
// tile de estatística de poker com faixa saudável (verde dentro, amarelo perto, vermelho fora).
// Se a stat tem uma leitura associada (hint), o tile ganha um ⚠ discreto e vira clicável —
// a frase abre num box único embaixo do card (nada de texto fixo poluindo a grade).
function StatTile({label,cnt,opp,band,hint,open,onToggle}){
  const has=opp>0, pct=has?cnt/opp*100:0;
  let tone=C.inkSoft, bg=C.bg;
  if(has&&band){ const [lo,hi]=band;
    if(pct>=lo&&pct<=hi){tone=C.greenMid;bg=C.greenSoft;}
    else if(pct>=lo-5&&pct<=hi+5){tone=C.gold;bg=C.goldSoft;}
    else {tone=C.red;bg=C.redSoft;}
  }
  return <div onClick={hint?onToggle:undefined} style={{padding:'10px 12px',borderRadius:12,background:bg,minWidth:0,position:'relative',cursor:hint?'pointer':'default',outline:open?`2px solid ${tone}`:'none'}}>
    {hint&&<span style={{position:'absolute',top:7,right:8,color:tone,opacity:.85}}><IcoAlert s={13}/></span>}
    <div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em'}}>{label}</div>
    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:has?tone:C.inkSoft}}>{has?pctFmt(pct):'—'}</div>
    <div style={{fontSize:10.5,color:C.inkSoft}}>{has?`${cnt}/${opp}`:'sem amostra'}{band&&has?` · alvo ${band[0]}–${band[1]}`:''}{has&&opp<30?' · amostra curta':''}</div>
  </div>;
}
// box único da leitura aberta (por card): título + frase, fecha tocando no tile de novo ou no ×
function StatHintBox({i,onClose}){
  const T={red:{c:C.red,bg:C.redSoft},gold:{c:C.gold,bg:C.goldSoft},green:{c:C.greenMid,bg:C.greenSoft},info:{c:P,bg:C.plumSoft}}[i.tone];
  return <div style={{marginTop:10,padding:'11px 13px',borderRadius:12,background:T.bg,display:'flex',gap:10,alignItems:'flex-start'}}>
    <span style={{flexShrink:0,marginTop:1,color:T.c}}><IcoAlert s={15}/></span>
    <div style={{minWidth:0,flex:1}}><div style={{fontWeight:800,fontSize:13,color:T.c}}>{i.t}</div><div style={{fontSize:12.5,color:C.ink,lineHeight:1.5,marginTop:2}}>{i.x}</div></div>
    <button onClick={onClose} style={{flexShrink:0,background:'transparent',border:'none',color:C.inkSoft,cursor:'pointer',padding:2}}><IcoX s={14}/></button>
  </div>;
}
// mini-stat usado no Diário/Mensal — valor longo (ex: US$ 1.158,29) encolhe em vez de vazar do card
const MiniStat = ({label,value,tone}) =>{
  const s=String(value), fz=s.length>13?11.5:s.length>10?13:15.5;
  return <div style={{padding:'8px 10px',borderRadius:10,background:C.bg,minWidth:0}}><div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em'}}>{label}</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:fz,fontWeight:600,color:tone||C.ink,marginTop:1,whiteSpace:'nowrap'}}>{value}</div></div>;
};

function DayCard({date,dayTours,players,config,onAdd,onEdit,onDelete,today}){
  const [open,setOpen]=useState(!!today);
  const abre=dayTours.length>0||!!onAdd;   // dia vazio no painel só leitura: nada pra abrir
  const per=players.map((p,i)=>{const ts=dayTours.filter(t=>t.player===p);return {p,i,n:ts.length,res:ts.reduce((s,t)=>s+lucroTorneio(t),0)};}).filter(x=>x.n>0);
  const res=per.reduce((s,x)=>s+x.res,0);
  return <Card style={{padding:0,overflow:'hidden',border:today?`1.5px solid ${P}`:`1px solid ${C.border}`}}>
    <button onClick={()=>{ if(abre) setOpen(o=>!o); }} disabled={!abre} aria-expanded={abre?open:undefined} aria-label={`${dLabel(date)} · ${pl(dayTours.length,'torneio','torneios')}${today?' · hoje':''}`}
      style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'15px 18px',background:today?C.plumSoft:'transparent',border:'none',cursor:abre?'pointer':'default',textAlign:'left',color:'inherit'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16.5,fontWeight:600,color:today?P:C.ink}}>{today?'Hoje · ':''}{dLabel(date)}</div>
        <div style={{fontSize:12.5,color:C.inkSoft,marginTop:2}}>{dayTours.length} torneio{dayTours.length!==1?'s':''}{per.length?' · '+per.map(x=>x.p.split(' ')[0]).join(' + '):''}</div>
      </div>
      <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:17,color:res>=0?C.greenMid:C.red}}>{res>=0?'+':'−'}{fmt(Math.abs(res))}</span>
      {abre&&<span aria-hidden="true" style={{color:C.inkSoft,fontSize:20,transform:open?'rotate(90deg)':'none',transition:'transform .2s'}}>›</span>}
    </button>
    {open&&<div style={{padding:'0 18px 16px'}}>
      {per.length>0&&<div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'2px 0 6px'}}>
        {per.map(x=><span key={x.p} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:99,background:C.bg,fontSize:12,fontWeight:700,color:C.ink}}><span style={{width:8,height:8,borderRadius:99,background:PLAYER_COLORS[x.i]}}/>{x.p.split(' ')[0]}: {x.res>=0?'+':'−'}{fmt(Math.abs(x.res))} <span style={{color:C.inkSoft,fontWeight:600}}>({x.n})</span></span>)}
      </div>}
      {sortByCreated(dayTours).map(t=><TourRow key={t.id} t={t} config={config} players={players} onEdit={onEdit?()=>onEdit(t):null} onDelete={onDelete?()=>onDelete(t):null}/>)}
      {onAdd&&<button onClick={()=>onAdd(date)} style={{marginTop:12,display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'transparent',color:P,border:`1.5px dashed ${C.border}`,padding:'11px 14px',borderRadius:12,fontWeight:700,fontSize:13.5,cursor:'pointer',width:'100%'}}><IcoPlus s={16}/>Adicionar torneio {today?'de hoje':`em ${dLabel(date)}`}</button>}
    </div>}
  </Card>;
}

function DiaryCard({entry,dayTours,players,config,onAdd,onEdit,onDelete}){
  const [open,setOpen]=useState(false);
  const abiMax=abiMaxFor(config,entry.player,entry.entry_date);
  const sgs=dayTours.map(t=>statusGrade(t,config)), porGrade=sgs.some(s=>s.porGrade), foraGr=sgs.filter(s=>s.status==='fora');
  const st=porGrade?(foraGr.length?'FORA DA GRADE':'OK'):gradeStatus(entry,abiMax), r=resultadoDia(entry), i=players.indexOf(entry.player);
  const ent=num(entry.qtd_entradas)||num(entry.qtd_torneios);
  const premios=dayTours.reduce((s,t)=>s+num(t.prize),0);
  const bounties=dayTours.reduce((s,t)=>s+bountyTorneio(t),0);
  const cashes=dayTours.filter(t=>num(t.prize)>0).length;
  const roi=num(entry.total_buyins)>0?(r/num(entry.total_buyins))*100:0;
  const fora=st==='FORA DA GRADE';
  return <Card style={{padding:0,overflow:'hidden',border:fora?`1.5px solid ${C.red}`:`1px solid ${C.border}`}}>
    <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'14px 18px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
      <span style={{width:10,height:10,borderRadius:99,background:PLAYER_COLORS[i]||C.inkSoft,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:700,fontSize:15}}>{entry.player} <span style={{color:C.inkSoft,fontWeight:600}}>· {dLabel(entry.entry_date)}</span></div>
        <div style={{fontSize:12,color:C.inkSoft,display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginTop:2}}>{num(entry.qtd_torneios)} torneios{ent!==num(entry.qtd_torneios)?` (${ent} entradas)`:''} · ABI {fmt(abiMedioDia(entry))} {st==='FORA DA GRADE'&&<Badge text={st}/>}</div>
      </div>
      <span style={{fontWeight:800,fontSize:16,color:r>=0?C.greenMid:C.red}}>{r>=0?'+':'−'}{fmt(Math.abs(r))}</span>
      <span style={{color:C.inkSoft,fontSize:20,transform:open?'rotate(90deg)':'none',transition:'transform .2s'}}>›</span>
    </button>
    {fora&&<div style={{display:'flex',alignItems:'center',gap:7,padding:'9px 18px',background:C.redSoft,color:C.red,fontSize:12.5,fontWeight:700,borderTop:`1px solid ${C.red}33`}}><IcoAlert s={15}/>{porGrade?`Fora da grade — ${foraGr.length} torneio${foraGr.length!==1?'s':''} · ${foraGr[0].motivo}${foraGr[0].simulada?' · grade simulada':''}`:<>Fora da grade — maior buy-in {fmt(entry.maior_buyin)} · teto {fmt(abiMax)} na data (passou {fmt(num(entry.maior_buyin)-abiMax)})</>}</div>}
    {open&&<div style={{padding:'0 18px 16px'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(88px,1fr))',gap:8,marginBottom:12}}>
        <MiniStat label="ABI médio" value={fmt(abiMedioDia(entry))}/>
        <MiniStat label={`ABI máx (${entry.player.split(' ')[0]})`} value={fmt(abiMax)}/>
        <MiniStat label="Investido" value={fmt(entry.total_buyins)}/>
        <MiniStat label="Premiação" value={fmt(premios)} tone={C.greenMid}/>
        {bounties>0&&<MiniStat label="Bounties" value={fmt(bounties)} tone={C.greenMid}/>}
        <MiniStat label="Cashes (ITM)" value={`${cashes}/${num(entry.qtd_torneios)}`}/>
        <MiniStat label="ROI do dia" value={pctFmt(roi)} tone={r>=0?C.greenMid:C.red}/>
      </div>
      {onEdit&&<div style={{fontSize:12,color:C.inkSoft,marginBottom:4}}>Corrija editando os torneios abaixo:</div>}
      {sortByCreated(dayTours).map(t=><TourRow key={t.id} t={t} config={config} players={players} onEdit={onEdit?()=>onEdit(t):null} onDelete={onDelete?()=>onDelete(t):null}/>)}
      {onAdd&&<button onClick={()=>onAdd(entry.entry_date,entry.player)} style={{marginTop:12,display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'transparent',color:P,border:`1.5px dashed ${C.border}`,padding:'11px 14px',borderRadius:12,fontWeight:700,fontSize:13.5,cursor:'pointer',width:'100%'}}><IcoPlus s={16}/>Adicionar torneio de {entry.player.split(' ')[0]}</button>}
    </div>}
  </Card>;
}

// linha de uma semana (por jogador) no Semanal — SEM status de saque (isso só aparece na aba Saques)
function WeekRow({w,player,config,solo}){
  const wkTorn=w.entries.reduce((s,e)=>s+num(e.qtd_torneios),0);
  const wkBuyins=w.entries.reduce((s,e)=>s+(num(e.buyins_nominal)||num(e.total_buyins)),0);  // nível, não dinheiro
  const wkEnt=w.entries.reduce((s,e)=>s+(num(e.qtd_entradas)||num(e.qtd_torneios)),0);
  const wkAbi=wkEnt>0?wkBuyins/wkEnt:0, pAbi=abiMaxFor(config,player,w.week);
  return <div style={{padding:'12px 0',borderBottom:`1px solid ${C.border}`}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
      <div style={{minWidth:0}}><div style={{fontWeight:700,fontSize:14.5}}>Semana {weekLabel(w.week)}</div>{mKey(weekStart(w.week))!==mKey(w.week)&&<div style={{fontSize:11,color:C.inkSoft,marginTop:1}}>semana que vira o mês · fecha em {dLabel(w.week)}</div>}</div>
      <span style={{fontWeight:800,fontSize:15,color:w.resultado>=0?C.greenMid:C.red}}>{w.resultado>=0?'+':'−'}{fmt(Math.abs(w.resultado))}</span>
    </div>
    {!solo&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8,marginTop:8,fontSize:12.5}}>
      <div style={{color:C.inkSoft}}>Make-up: <b style={{color:C.ink}}>{fmt(w.makeAnterior)} → {fmt(w.makeFinal)}</b></div>
      <div style={{color:C.inkSoft}}>Lucro divisível: <b style={{color:C.ink}}>{fmt(w.lucroDiv)}</b></div>
      <div style={{color:C.inkSoft}}>Parte do jogador: <b style={{color:C.ink}}>{fmt(w.parteJog)}</b></div>
      <div style={{color:C.inkSoft}}>Saque autorizado: <b style={{color:P}}>{fmt(w.saqueAut)}</b></div>
    </div>}
    {wkTorn>0&&(comGrade(player,w.week)
      ?<div data-abi-semana style={{marginTop:8,fontSize:11.5,color:C.inkSoft}}>ABI médio da semana {fmt(wkAbi)} · a grade da reta confere cada torneio</div>
      :<div style={{marginTop:8}}><div style={{fontSize:11.5,color:C.inkSoft,marginBottom:4}}>ABI médio da semana {fmt(wkAbi)} / máx {fmt(pAbi)}</div><Bar2 pct={pAbi>0?(wkAbi/pAbi)*100:0} color={wkAbi>=pAbi*0.9?C.red:wkAbi>=pAbi*0.7?C.gold:C.greenMid}/></div>)}
  </div>;
}
// bloco recolhível: o padrão pra tirar texto/gráfico da frente sem apagar a informação
function Recolhivel({titulo,sub,chip,children,aberto}){
  const [open,setOpen]=useState(!!aberto);
  return <Card style={{padding:0,overflow:'hidden'}}>
    <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'15px 18px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
      <span style={{minWidth:0,flex:1}}>
        <span style={{display:'block',fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:600}}>{titulo}</span>
        {sub&&<span style={{display:'block',fontSize:11.5,color:C.inkSoft,marginTop:1}}>{sub}</span>}
      </span>
      {chip&&<span style={{padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:800,color:C.inkSoft,background:C.bg,whiteSpace:'nowrap'}}>{chip}</span>}
      <span style={{color:C.inkSoft,fontSize:20,transform:open?'rotate(90deg)':'none',transition:'transform .2s'}}>›</span>
    </button>
    {open&&<div style={{padding:'0 18px 18px'}}>{children}</div>}
  </Card>;
}
// resuminho de torneios: total jogado e a divisão por pessoa. Sem números demais de propósito.
function ResumoTorneios({tours,players,solo,periodo,abi}){
  const porP=players.map((p,i)=>{
    const ts=tours.filter(t=>t.player===p);
    return {p,i,n:ts.length,res:ts.reduce((s,t)=>s+lucroTorneio(t),0)};
  });
  const datas=[...new Set(tours.map(t=>t.entry_date))].sort(), dias=datas.length;
  return <Card style={{padding:18}}>
    <div style={{display:'flex',alignItems:'flex-end',gap:12}}>
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:11,color:C.inkSoft,fontWeight:800,textTransform:'uppercase',letterSpacing:'.05em'}}>Torneios jogados{periodo?` · ${periodo}`:''}</div>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:34,fontWeight:600,lineHeight:1.1}}>{tours.length}</div>
      </div>
      <div data-dias-de-jogo style={{fontSize:12,color:C.inkSoft,textAlign:'right',flexShrink:0,lineHeight:1.5}}>{dias} dia{dias!==1?'s':''} de jogo{datas.length?` desde ${dataBR(datas[0])}`:''}{abi>0&&<><br/>ABI médio {fmt(abi)}</>}</div>
    </div>
    {!solo&&<div style={{marginTop:12,display:'flex',flexDirection:'column',gap:7}}>
      {porP.map(x=><div key={x.p} style={{display:'flex',alignItems:'center',gap:8,fontSize:13.5}}>
        <span style={{width:9,height:9,borderRadius:99,background:PLAYER_COLORS[x.i]||C.inkSoft,flexShrink:0}}/>
        <span style={{fontWeight:700,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{x.p}</span>
        <span style={{color:C.inkSoft,flexShrink:0}}>{x.n}</span>
        <span style={{marginLeft:'auto',fontWeight:800,color:x.res>=0?C.greenMid:C.red,whiteSpace:'nowrap'}}>{x.res>=0?'+':'−'}{fmt(Math.abs(x.res))}</span>
      </div>)}
    </div>}
  </Card>;
}
// "Ver mais": paginação das listas longas (Torneios/Diário) — mostra em blocos em vez do pancadão
function VerMais({resta,bloco,onClick,rotulo}){
  if(resta<=0) return null;
  return <button onClick={onClick} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'transparent',color:P,border:`1.5px dashed ${C.border}`,padding:'12px 14px',borderRadius:13,fontWeight:700,fontSize:13.5,cursor:'pointer',width:'100%'}}>
    Ver mais {Math.min(bloco,resta)} {rotulo} <span style={{color:C.inkSoft,fontWeight:600}}>({resta} restante{resta!==1?'s':''})</span>
  </button>;
}
// botão que abre/fecha o histórico de semanas de meses anteriores
function HistToggle({n,open,onClick}){
  return <button onClick={onClick} style={{marginTop:12,display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'transparent',color:P,border:`1.5px dashed ${C.border}`,padding:'10px 14px',borderRadius:12,fontWeight:700,fontSize:13,cursor:'pointer',width:'100%'}}>{open?'Ocultar':'Ver'} histórico de meses anteriores ({n} semana{n!==1?'s':''})</button>;
}
// card "geral da pool por semana" — mês atual aberto; meses anteriores viram histórico recolhível
function SemanalGeral({geral,curMonth}){
  const [hist,setHist]=useState(false);
  // "deste mês" = a semana encosta no mês corrente, mesmo que ela feche só no mês seguinte
  const atuais=geral.filter(g=>weekInMonth(g.week,curMonth)), antigas=geral.filter(g=>!weekInMonth(g.week,curMonth));
  const Row=g=><div key={g.week} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,padding:'11px 0',borderBottom:`1px solid ${C.border}`}}>
    <div style={{minWidth:0}}><div style={{fontWeight:700,fontSize:14}}>Semana {weekLabel(g.week)}</div><div style={{fontSize:11.5,color:C.inkSoft,marginTop:1}}>saque autorizado {fmt(g.saqueAut)} · pool ficou com {fmt(g.partePool)}</div></div>
    <span style={{fontWeight:800,fontSize:15.5,color:g.resultado>=0?C.greenMid:C.red,flexShrink:0}}>{g.resultado>=0?'+':'−'}{fmt(Math.abs(g.resultado))}</span>
  </div>;
  return <Card style={{padding:20}}>
    <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:'0 0 4px'}}>Resultado por semana (geral da pool)</h3>
    <div style={{fontSize:12.5,color:C.inkSoft,marginBottom:8}}>Os dois jogadores somados, semana a semana.</div>
    {atuais.length?atuais.map(Row):<Empty>Sem semanas neste mês ainda.</Empty>}
    {antigas.length>0&&<><HistToggle n={antigas.length} open={hist} onClick={()=>setHist(h=>!h)}/>{hist&&<div style={{marginTop:4}}>{antigas.map(Row)}</div>}</>}
  </Card>;
}
// card por jogador — semanas do mês atual abertas; meses anteriores em histórico recolhível
function SemanalPlayer({player,weeks,config,curMonth,makeUpAtual,solo}){
  const [hist,setHist]=useState(false);
  const arr=[...weeks].reverse();
  const atuais=arr.filter(w=>weekInMonth(w.week,curMonth)), antigas=arr.filter(w=>!weekInMonth(w.week,curMonth));
  return <Card style={{padding:20}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><span style={{width:12,height:12,borderRadius:99,background:PLAYER_COLORS[[config.player1_name,config.player2_name].indexOf(player)]||C.inkSoft}}/><h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:0}}>{player}</h3>{!solo&&<span style={{marginLeft:'auto',fontSize:13,color:C.inkSoft,fontWeight:600}}>make-up atual {fmt(makeUpAtual)}</span>}</div>
    {atuais.length?atuais.map(w=><WeekRow key={w.week} w={w} player={player} config={config} solo={solo}/>):<Empty>Sem semanas neste mês ainda.</Empty>}
    {antigas.length>0&&<><HistToggle n={antigas.length} open={hist} onClick={()=>setHist(h=>!h)}/>{hist&&<div style={{marginTop:4}}>{antigas.map(w=><WeekRow key={w.week} w={w} player={player} config={config} solo={solo}/>)}</div>}</>}
  </Card>;
}

/* ---------- app ---------- */
/* ---------- sininho: avisos do time (saque, reload, planilha, entrada). Cada um apaga os seus. ---------- */
function Sininho({avisos,onAbrir,onApagar,onLimpar,onIr}){
  const [aberto,setAberto]=useState(false);
  useEsc(()=>setAberto(false),aberto);
  const novos=avisos.filter(a=>!a.lido_em).length;
  const quando=t=>{ const m=Math.round((Date.now()-Date.parse(t))/60000); return m<1?'agora':m<60?`há ${m} min`:m<1440?`há ${Math.round(m/60)} h`:dataBR(t); };
  return <div style={{position:'relative'}}>
    <button data-sininho aria-label={`Avisos${novos?`: ${novos} ${novos===1?'aviso novo':'avisos novos'}`:''}`} aria-expanded={aberto} onClick={()=>{ const v=!aberto; setAberto(v); if(v&&novos) onAbrir(); }}
      style={{position:'relative',zIndex:aberto?42:'auto',width:40,height:40,borderRadius:12,border:`1px solid ${C.border}`,background:C.surface,color:novos?P:C.inkSoft,cursor:'pointer',display:'grid',placeItems:'center'}}>
      <IcoBell s={19}/>
      {novos>0&&<span data-sininho-novos style={{position:'absolute',top:-5,right:-5,minWidth:19,height:19,padding:'0 5px',borderRadius:99,background:C.red,color:'#fff',fontSize:11,fontWeight:800,display:'grid',placeItems:'center'}}>{novos>9?'9+':novos}</span>}
    </button>
    {aberto&&<>
      <div onClick={()=>setAberto(false)} style={{position:'fixed',inset:0,zIndex:40}}/>
      <div data-avisos className="ftfade" style={{position:'fixed',right:16,top:72,zIndex:41,width:'min(360px, calc(100vw - 32px))',maxHeight:'70vh',overflowY:'auto',background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,boxShadow:'0 16px 40px -18px rgba(25,35,29,.45)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderBottom:`1px solid ${C.border}`}}>
          <b style={{fontSize:14.5}}>Avisos{novos?<span style={{fontWeight:600,color:C.inkSoft,fontSize:12.5}}> · {novos} {novos===1?'novo':'novos'}</span>:null}</b>
          <span style={{display:'flex',gap:4}}>{avisos.length>0&&<button onClick={onLimpar} style={{border:'none',background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:12.5,cursor:'pointer'}}>Limpar tudo</button>}
            <button aria-label="Fechar avisos" onClick={()=>setAberto(false)} style={{width:28,height:28,borderRadius:8,border:'none',background:'transparent',color:C.inkSoft,cursor:'pointer',display:'grid',placeItems:'center'}}><IcoX s={15}/></button></span>
        </div>
        {avisos.length===0&&<div style={{padding:'22px 14px',textAlign:'center',color:C.inkSoft,fontSize:13.5}}>Nenhum aviso.</div>}
        {avisos.map(a=><div key={a.id} data-aviso={a.tipo} style={{display:'flex',gap:8,padding:'11px 14px',borderBottom:`1px solid ${C.border}`,background:a.lido_em?'transparent':C.plumSoft}}>
          <button data-aviso-ir onClick={()=>{ setAberto(false); onIr(a); }} style={{flex:1,minWidth:0,cursor:'pointer',textAlign:'left',border:'none',background:'transparent',padding:0,font:'inherit',color:'inherit'}}>
            <div style={{fontWeight:700,fontSize:13.5,color:a.tone===C.red?C.red:C.ink}}>{a.titulo}{a.vezes>1?<span style={{color:C.inkSoft,fontWeight:600}}> · {a.vezes}×</span>:null}</div>
            {a.texto&&<div style={{fontSize:12.5,color:C.inkSoft,marginTop:2,lineHeight:1.4}}>{a.texto}</div>}
            <div style={{fontSize:11,color:C.inkSoft,marginTop:3}}>{a.criado_em?quando(a.criado_em):'situação atual da banca'} · <span style={{color:P,fontWeight:700}}>ver ›</span></div>
          </button>
          <button aria-label="Apagar aviso" onClick={()=>onApagar(a)} style={{width:28,height:28,flexShrink:0,borderRadius:8,border:'none',background:'transparent',color:C.inkSoft,cursor:'pointer',display:'grid',placeItems:'center'}}><IcoX s={15}/></button>
        </div>)}
      </div>
    </>}
  </div>;
}

/* ---------- TIME (fase 1): estrutura, pessoas, convites, contrato e saques do time ----------
   Só aparece em workspace com estrutura. Tudo que grava passa por funções do servidor, que conferem a
   permissão de novo; aqui a permissão só decide o que MOSTRAR. */
const CAPS_ROTULO={ver_desempenho:'vê desempenho',ver_financeiro:'vê financeiro',gerir_pessoas:'gere pessoas',promover:'promove',
  configurar_regras:'configura regras',aprovar_saques:'aprova saques',administrar:'administra'};
const dataBR=s=>{ const t=String(s||''); return t.length>=10?`${t.slice(8,10)}/${t.slice(5,7)}/${t.slice(0,4)}`:t; };
const SAQUE_ROTULO={solicitado:'aguardando aprovação',aprovado:'aprovado · falta confirmar o recebimento',recusado:'recusado',cancelado:'cancelado',pago:'pago'};
function faixasTexto(f){
  if(!Array.isArray(f)||!f.length) return 'sem contrato definido';
  const o=[...f].sort((a,b)=>(a.ate==null?1e15:a.ate)-(b.ate==null?1e15:b.ate)); let ant=0;
  return o.map(x=>{ const pct=Math.round(Number(x.jogador)*1000)/10+'% pro jogador';
    const t=x.ate==null?(ant?`acima de ${fmt(ant)} sacados: ${pct}`:pct):`até ${fmt(x.ate)} sacados: ${pct}`; ant=x.ate||ant; return t; }).join(' · ');
}
/* ---------- papéis, make-up e selos do time ---------- */
// pacotes prontos de capacidades (o admin escolhe um; o banco guarda as capacidades)
const PACOTES={professor:['promover','ver_desempenho','ver_financeiro'],financeiro:['aprovar_saques','ver_financeiro'],admin:['administrar']};
const PAPEL_ROT={professor:'Professor',financeiro:'Financeiro',admin:'Admin',personalizado:'Personalizado'};
const papelDe=caps=>{ const c=[...new Set(caps||[])].sort(); if(!c.length) return null; if(c.includes('administrar')) return 'admin';
  for(const [k,v] of Object.entries(PACOTES)) if([...v].sort().join(',')===c.join(',')) return k; return 'personalizado'; };
const PAPEL_DICA={professor:'vê desempenho e dinheiro das retas dele e promove',financeiro:'vê o dinheiro, aprova saques e reloads, confere planilhas',
  admin:'tudo: estrutura, papéis, regras, grades e contrato'};
const fmtSinal=v=>(Number(v)<0?'−':'+')+fmt(Math.abs(Number(v)||0));
// make-up do jogador = banca − MU. Negativo: está em MK (mostra quanto). Positivo: profit.
const mkDe=(banca,mu)=>banca==null||mu==null?null:Math.round((Number(banca)-Number(mu))*100)/100;
const TONS={ok:[C.greenSoft,C.greenMid],warn:[C.goldSoft,'#7a5a1f'],bad:[C.redSoft,C.red],plum:[C.plumSoft,P],neutro:[C.bg,C.inkSoft]};
const Tag=({tom='neutro',children,...r})=>{ const t=TONS[tom]||TONS.neutro;
  return <span {...r} style={{display:'inline-block',padding:'2px 9px',borderRadius:99,fontSize:11.5,fontWeight:800,background:t[0],color:t[1],whiteSpace:'nowrap'}}>{children}</span>; };
const MkSelo=({v})=>v==null?<span style={{color:C.inkSoft}}>—</span>
  :v<0?<Tag tom="warn" data-mk="em">MK {fmtSinal(v)}</Tag>:<span data-mk="fora" style={{fontWeight:700,color:C.greenMid,whiteSpace:'nowrap'}}>{fmtSinal(v)}</span>;
const diasDesde=d=>d?Math.round((Date.parse(todayISO())-Date.parse(String(d).slice(0,10)))/86400000):null;
const linkWhats=(url,texto)=>`https://wa.me/?text=${encodeURIComponent(`${texto}\n${url}`)}`;
const thS={textAlign:'left',padding:'8px 10px',fontSize:11,textTransform:'uppercase',letterSpacing:'.04em',color:C.inkSoft,whiteSpace:'nowrap',borderBottom:`1px solid ${C.border}`,fontWeight:700};
const tdS={padding:'10px',fontSize:13.5,whiteSpace:'nowrap',borderBottom:`1px solid ${C.border}`};
const btnS={padding:'8px 12px',borderRadius:11,border:`1.5px solid ${C.border}`,background:C.surface,color:P,fontWeight:700,fontSize:13,cursor:'pointer'};
const btnP={...btnS,background:P,color:'#fff',border:`1.5px solid ${P}`};
const tituloS={fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:'0 0 10px'};
const Kpi=({rot,val,sub,tom,onClick,...r})=>{ const cor=tom==='ok'?C.greenMid:tom==='bad'?C.red:tom==='warn'?'#7a5a1f':C.ink;
  const corpo=<><div style={{fontSize:11,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:C.inkSoft}}>{rot}</div>
    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:'clamp(18px,5vw,24px)',fontWeight:700,marginTop:4,color:cor,overflowWrap:'anywhere',lineHeight:1.2}}>{val}</div>
    {sub&&<div style={{fontSize:12.5,color:C.inkSoft,marginTop:2}}>{sub}</div>}</>;
  const st={background:C.surface,border:`1px solid ${C.border}`,borderRadius:18,padding:'15px 17px',textAlign:'left',minWidth:0};
  return onClick?<button {...r} onClick={onClick} style={{...st,cursor:'pointer',font:'inherit',color:'inherit'}}>{corpo}</button>:<div {...r} style={st}>{corpo}</div>; };
const Chip=({on,onClick,children,disabled,...r})=><button {...r} onClick={onClick} disabled={disabled} aria-pressed={!!on} style={{padding:'6px 11px',borderRadius:99,border:`1.5px solid ${on?P:C.border}`,background:on?C.plumSoft:C.surface,color:on?P:C.inkSoft,fontWeight:700,fontSize:12.5,cursor:disabled?'not-allowed':'pointer',opacity:disabled?.45:1}}>{children}</button>;

/* chave Gestão | Meu jogo: só aparece pra quem tem papel na gestão e também joga */
function ModoSwitch({modo,onTrocar,compacto}){
  return <div role="group" aria-label="Modo" data-modo={modo} style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',border:`1.5px solid ${C.border}`,borderRadius:12,overflow:'hidden',background:C.surface,margin:compacto?0:'4px 0 8px'}}>
    {[['gestao','Gestão'],['jogo','Meu jogo']].map(([k,r])=><button key={k} aria-pressed={modo===k} data-modo-btn={k} onClick={()=>{ if(modo!==k) onTrocar(k); }}
      style={{padding:compacto?'7px 10px':'10px 8px',border:'none',background:modo===k?P:'transparent',color:modo===k?'#fff':C.inkSoft,fontWeight:800,fontSize:compacto?12:13,cursor:'pointer',whiteSpace:'nowrap'}}>{r}</button>)}
  </div>;
}
/* link pronto de convite: copiar ou mandar no WhatsApp */
function LinkPronto({titulo,url,texto,onFechar}){
  const [copiou,setCopiou]=useState(false);
  return <Card style={{padding:18}}>
    <div style={{fontWeight:800,fontSize:15,marginBottom:6}}>{titulo}</div>
    <input readOnly data-link-convite value={url} aria-label="Link do convite" style={{...inputStyle,fontSize:13}} onFocus={e=>e.target.select()}/>
    <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
      <button style={btnP} onClick={()=>{ try{ navigator.clipboard.writeText(url); setCopiou(true); }catch(e){} }}>{copiou?'Copiado':'Copiar link'}</button>
      <a href={linkWhats(url,texto||'Teu convite pro time no GrinderBank:')} target="_blank" rel="noopener noreferrer" style={{...btnS,textDecoration:'none',display:'inline-block'}}>Mandar no WhatsApp</a>
      {onFechar&&<button style={btnS} onClick={onFechar}>Fechar</button>}
    </div>
    <div style={{fontSize:12,color:C.inkSoft,marginTop:8,lineHeight:1.5}}>O link aparece só agora: mande já. Quem abrir cria a conta e entra direto no lugar certo. Vale 7 dias.</div>
  </Card>;
}

/* convite único: quem entra, onde e que link */
function ConviteModal({unidades,podeGerir,podeAdmin,inicial,nomeUnidade,onGerar,onClose}){
  useEsc(onClose);
  // onde se joga: as retas (unidades sem nada dentro); time só com a raiz joga na raiz
  const folha=u=>!unidades.some(x=>x.mae_id===u.id);
  const retas=unidades.filter(u=>folha(u)&&(u.mae_id||unidades.length===1)&&podeGerir(u.id));
  const raiz=unidades.find(u=>!u.mae_id);
  const gestaoOk=unidades.some(u=>podeAdmin(u.id));
  const [quem,setQuem]=useState(inicial?.quem||'jogador');
  const [reta,setReta]=useState(inicial?.unidade||(retas[0]?.id)||'');
  const [onde,setOnde]=useState(inicial?.unidade?[inicial.unidade]:[]);
  const [joga,setJoga]=useState(false);
  const [jogaEm,setJogaEm]=useState(retas[0]?.id||'');
  const [tipo,setTipo]=useState(inicial?.tipo||'pessoal');
  const [nome,setNome]=useState('');
  const [busy,setBusy]=useState(false); const [erro,setErro]=useState(''); const [pronto,setPronto]=useState(null);
  const staff=quem!=='jogador';
  const tipoEf=staff?'pessoal':tipo;
  const ondeEf=quem==='admin'&&raiz?[raiz.id]:onde;
  const valido=staff?(nome.trim()&&ondeEf.length&&(!joga||jogaEm)):(reta&&(tipoEf==='aberto'||nome.trim()));
  const alterna=id=>setOnde(o=>o.includes(id)?o.filter(x=>x!==id):[...o,id]);
  const legenda={fontSize:11,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:C.gold,marginBottom:8};
  const opc=(on)=>({display:'flex',alignItems:'center',gap:7,padding:'9px 12px',borderRadius:99,border:`1.5px solid ${on?P:C.border}`,background:on?C.plumSoft:C.surface,color:on?P:C.ink,fontSize:13.5,fontWeight:on?700:600,cursor:'pointer'});
  const gerar=async()=>{ setBusy(true); setErro('');
    const r=await onGerar({quem,reta,onde:ondeEf,joga,jogaEm,tipo:tipoEf,nome:nome.trim()});
    setBusy(false); if(r&&r.erro) setErro(r.erro); else if(r) setPronto(r); };
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50}}>
    <div onClick={e=>e.stopPropagation()} data-convite-modal className="ftfade" role="dialog" aria-label="Convidar" style={{background:C.surface,width:'100%',maxWidth:560,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:16,maxHeight:'92vh',overflowY:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,margin:0}}>Convidar</h3>
        <button onClick={onClose} aria-label="Fechar" style={{width:40,height:40,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
      </div>
      {pronto?<LinkPronto titulo={pronto.titulo} url={pronto.url} texto={pronto.texto}/>:<>
      <div>
        <div style={legenda}>1 · Quem vai entrar</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>
          {[['jogador','Jogador'],['professor','Professor'],['financeiro','Financeiro'],['admin','Admin']].map(([k,r])=>{ const off=k!=='jogador'&&!gestaoOk;
            return <button key={k} data-quem={k} disabled={off} onClick={()=>setQuem(k)} style={{padding:'11px 4px',borderRadius:12,border:`1.5px solid ${quem===k?P:C.border}`,background:quem===k?C.plumSoft:C.surface,color:quem===k?P:C.inkSoft,fontWeight:quem===k?800:700,fontSize:13.5,cursor:off?'default':'pointer',opacity:off?.45:1}}>{r}</button>; })}
        </div>
        <div style={{fontSize:12.5,color:C.inkSoft,marginTop:6,lineHeight:1.45}}>{quem==='jogador'?'Joga numa reta e vê só os próprios dados.':`${PAPEL_ROT[quem]}: ${PAPEL_DICA[quem]}.`}</div>
      </div>
      <div>
        <div style={legenda}>2 · Onde</div>
        {!staff&&<div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {retas.map(u=><label key={u.id} style={opc(reta===u.id)}><input type="radio" name="reta" checked={reta===u.id} onChange={()=>setReta(u.id)}/>{nomeUnidade(u)}</label>)}
          {!retas.length&&<div style={{fontSize:13,color:C.inkSoft}}>Crie uma reta em Equipe e convites → Editar estrutura.</div>}
        </div>}
        {staff&&quem==='admin'&&<div style={{fontSize:13.5}}>Admin cuida do time inteiro.</div>}
        {staff&&quem!=='admin'&&<div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {unidades.filter(u=>podeAdmin(u.id)).map(u=><label key={u.id} data-onde={u.nome} style={opc(onde.includes(u.id))}><input type="checkbox" checked={onde.includes(u.id)} onChange={()=>alterna(u.id)}/>{u.mae_id?nomeUnidade(u):`${u.nome} (time inteiro)`}</label>)}
        </div>}
        {staff&&<label style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginTop:12,padding:'11px 13px',borderRadius:14,background:C.warm,border:`1px solid ${C.border}`,fontSize:13.5,fontWeight:600}}>
          <input type="checkbox" data-tambem-joga checked={joga} onChange={e=>setJoga(e.target.checked)}/> Também joga no time, na reta
          <select aria-label="Reta em que joga" disabled={!joga} value={jogaEm} onChange={e=>setJogaEm(e.target.value)} style={{...inputStyle,width:'auto',padding:'8px 10px',fontSize:13.5,marginLeft:'auto'}}>
            {retas.map(u=><option key={u.id} value={u.id}>{nomeUnidade(u)}</option>)}
          </select>
        </label>}
      </div>
      <div>
        <div style={legenda}>3 · Que link</div>
        <label style={{...opc(tipoEf==='pessoal'),borderRadius:14,alignItems:'flex-start',marginBottom:8}}>
          <input type="radio" name="tipo" checked={tipoEf==='pessoal'} onChange={()=>setTipo('pessoal')} style={{marginTop:3}}/>
          <span><b>Link pessoal</b><br/><span style={{fontSize:12.5,color:C.inkSoft,fontWeight:500}}>Só essa pessoa entra.</span></span>
        </label>
        {tipoEf==='pessoal'&&<div style={{margin:'0 0 10px 4px'}}><label style={labelStyle} htmlFor="conv-nome">Nome como vai aparecer no time</label>
          <input id="conv-nome" data-conv-nome style={inputStyle} value={nome} placeholder={staff?'ex.: Prof. Marcos':'ex.: Bruno T. (como nos lançamentos)'} onChange={e=>setNome(e.target.value)}/></div>}
        <label style={{...opc(tipoEf==='aberto'),borderRadius:14,alignItems:'flex-start',opacity:staff?.5:1,cursor:staff?'default':'pointer'}}>
          <input type="radio" name="tipo" data-link-aberto disabled={staff} checked={tipoEf==='aberto'} onChange={()=>setTipo('aberto')} style={{marginTop:3}}/>
          <span><b>Link aberto da reta</b><br/><span style={{fontSize:12.5,color:C.inkSoft,fontWeight:500}}>Várias pessoas entram como jogador. Só para jogador.</span></span>
        </label>
      </div>
      {erro&&<div style={{color:C.red,fontSize:13,fontWeight:600}}>{erro}</div>}
      <button data-gerar-link disabled={!valido||busy} onClick={gerar} style={{padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:valido?'pointer':'default',opacity:valido&&!busy?1:.5}}>Gerar link</button>
      </>}
    </div>
  </div>;
}

/* editar alguém da gestão: nome, papel e onde */
function PessoaModal({p,unidades,podeAdmin,nomeUnidade,onSalvar,onRemover,onLink,onClose,souEu,ultimoAdmin}){
  useEsc(onClose);
  const [nome,setNome]=useState(p.nome);
  const nomeLivre=!p.user_id||souEu;   // o nome de quem já tem conta é dele: só ele muda
  const [papel,setPapel]=useState(p.papel==='personalizado'?'personalizado':(p.papel||'professor'));
  const [onde,setOnde]=useState(p.unidades);
  const raiz=unidades.find(u=>!u.mae_id);
  const alterna=id=>setOnde(o=>o.includes(id)?o.filter(x=>x!==id):[...o,id]);
  const ondeEf=papel==='admin'&&raiz?[raiz.id]:onde;
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50}}>
    <div onClick={e=>e.stopPropagation()} data-pessoa-modal className="ftfade" style={{background:C.surface,width:'100%',maxWidth:520,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:14,maxHeight:'92vh',overflowY:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>Editar {p.nome}</h3>
        <button onClick={onClose} aria-label="Fechar" style={{width:40,height:40,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
      </div>
      <div><label style={labelStyle} htmlFor="ed-nome">Nome no time</label><input id="ed-nome" data-ed-nome style={{...inputStyle,...(nomeLivre?{}:{background:C.bg,color:C.inkSoft})}} value={nome} disabled={!nomeLivre} onChange={e=>setNome(e.target.value)}/>
        {!nomeLivre&&<div data-nome-dele style={{fontSize:12.5,color:C.inkSoft,marginTop:6}}>O nome de quem já tem conta é dele: só ele muda.</div>}</div>
      <div><div style={labelStyle}>Papel</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {['professor','financeiro','admin',...(p.papel==='personalizado'?['personalizado']:[])].map(k=><Chip key={k} on={papel===k} disabled={ultimoAdmin&&k!=='admin'} onClick={()=>{ if(!(ultimoAdmin&&k!=='admin')) setPapel(k); }}>{PAPEL_ROT[k]}</Chip>)}
        </div>
        {ultimoAdmin&&<div data-ultimo-admin style={{fontSize:12.5,color:C.red,fontWeight:700,marginTop:6}}>Único admin do time: faça outra pessoa admin antes de mudar este papel ou tirar do time.</div>}
        {!ultimoAdmin&&papel!=='personalizado'&&<div style={{fontSize:12.5,color:C.inkSoft,marginTop:6}}>{PAPEL_DICA[papel]}.</div>}
      </div>
      {papel!=='admin'&&<div><div style={labelStyle}>Cuida de</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {unidades.filter(u=>podeAdmin(u.id)).map(u=><Chip key={u.id} on={onde.includes(u.id)} onClick={()=>alterna(u.id)}>{u.mae_id?nomeUnidade(u):`${u.nome} (time inteiro)`}</Chip>)}
        </div></div>}
      <button disabled={!nome.trim()||!ondeEf.length} onClick={()=>onSalvar({nome:nome.trim(),caps:papel==='personalizado'?p.caps:PACOTES[papel],unidades:ondeEf})}
        style={{padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer',opacity:nome.trim()&&ondeEf.length?1:.5}}>Salvar</button>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {onLink&&<button data-gerar-link-pessoal onClick={onLink} style={btnS}>Gerar link pessoal de novo</button>}
        {!ultimoAdmin&&<button onClick={onRemover} style={{...btnS,color:C.red}}>{p.joga?'Tirar da gestão (continua jogando)':'Tirar do time'}</button>}
      </div>
    </div>
  </div>;
}

/* estrutura: criar, renomear e arquivar unidades */
function EstruturaModal({unidades,podeAdmin,onCriar,onRenomear,onArquivar,onClose,ocupada}){
  useEsc(onClose);
  const nivel=u=>String(u.caminho).split('/').filter(Boolean).length-1;
  // arquivar só vale com a unidade vazia: sem unidade dentro e sem ninguém (ocupada diz quantos)
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50}}>
    <div onClick={e=>e.stopPropagation()} data-estrutura-modal className="ftfade" style={{background:C.surface,width:'100%',maxWidth:560,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:10,maxHeight:'92vh',overflowY:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>Editar estrutura</h3>
        <button onClick={onClose} aria-label="Fechar" style={{width:40,height:40,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
      </div>
      {unidades.map(u=><div key={u.id} data-unidade-ed={u.nome} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'8px 0',borderBottom:`1px solid ${C.border}`,paddingLeft:nivel(u)*16}}>
        <div style={{flex:1,minWidth:140,fontWeight:700,fontSize:14}}>{u.nome}{u.rotulo&&<span style={{fontWeight:500,color:C.inkSoft,fontSize:12.5}}> · {u.rotulo}</span>}</div>
        {podeAdmin(u.id)&&<button style={btnS} onClick={()=>onCriar(u)}>+ Nova unidade dentro</button>}
        {podeAdmin(u.id)&&<button style={btnS} onClick={()=>onRenomear(u)}>Renomear</button>}
        {u.mae_id&&podeAdmin(u.mae_id)&&(()=>{ const filhas=unidades.some(f=>f.mae_id===u.id), gente=ocupada?ocupada(u):0, vazia=!filhas&&!gente;
          return <button data-arquivar={u.nome} disabled={!vazia} title={vazia?undefined:filhas?'Tem unidade dentro':`Tem ${gente} pessoa${gente!==1?'s':''}`} style={{...btnS,color:C.red,opacity:vazia?1:.45,cursor:vazia?'pointer':'not-allowed'}} onClick={()=>{ if(vazia) onArquivar(u); }}>Arquivar</button>; })()}
      </div>)}
      <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.5}}>Arquivar só fica liberado com a unidade vazia (sem jogador, sem gestor e sem unidade dentro). O histórico fica.</div>
    </div>
  </div>;
}

/* contrato do time por faixas do lifetime (já sacado + profit): o saque inteiro vai na faixa do dia (plano 3.3) */
function ContratoModal({atual,titulo,onSalvar,onClose}){
  useEsc(onClose);
  const f=Array.isArray(atual)&&atual.length?[...atual].sort((a,b)=>(a.ate==null?1e15:a.ate)-(b.ate==null?1e15:b.ate)):[{ate:10000,jogador:.35},{ate:null,jogador:.4}];
  const [lim,setLim]=useState(String(f[0].ate??10000)); const [a,setA]=useState(String(Math.round(Number(f[0].jogador)*1000)/10));
  const [b,setB]=useState(String(Math.round(Number((f[1]||f[0]).jogador)*1000)/10)); const [ini,setIni]=useState(todayISO());
  const L=parseValor(lim), A=parseValor(a), B=parseValor(b); const ok=L>0&&A>=0&&A<=100&&B>=0&&B<=100;
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50}}>
    <div onClick={e=>e.stopPropagation()} data-contrato-modal className="ftfade" style={{background:C.surface,width:'100%',maxWidth:460,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>{titulo||'Contrato do time'}</h3>
        <button onClick={onClose} aria-label="Fechar" style={{width:40,height:40,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
      </div>
      <div><label style={labelStyle} htmlFor="ct-a">% do jogador até o limite</label><input id="ct-a" data-ct-a style={inputStyle} inputMode="decimal" value={a} onChange={e=>setA(e.target.value)}/></div>
      <div><label style={labelStyle} htmlFor="ct-lim">Limite do lifetime (US$)</label><input id="ct-lim" data-ct-lim style={inputStyle} inputMode="decimal" value={lim} onChange={e=>setLim(e.target.value)}/></div>
      <div><label style={labelStyle} htmlFor="ct-b">% do jogador depois do limite</label><input id="ct-b" data-ct-b style={inputStyle} inputMode="decimal" value={b} onChange={e=>setB(e.target.value)}/></div>
      <div><label style={labelStyle} htmlFor="ct-ini">Vale a partir de</label><input id="ct-ini" type="date" style={inputStyle} value={ini} onChange={e=>setIni(e.target.value)}/></div>
      {ok&&<div style={{background:C.plumSoft,borderRadius:12,padding:'10px 12px',fontSize:13.5}}>{A}% pro jogador com lifetime abaixo de {fmt(L)}, {B}% a partir daí. Vale a faixa do lifetime no dia do saque (já sacado + profit), pro saque inteiro; devolução de capital não conta.</div>}
      <button disabled={!ok} onClick={()=>onSalvar([{ate:L,jogador:A/100},{ate:null,jogador:B/100}],ini)} style={{padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer',opacity:ok?1:.5}}>Salvar contrato</button>
    </div>
  </div>;
}

// a logo enviada vira uma imagem pequena (cabe em 256×256) antes de ir pro servidor: WebP quando o navegador sabe, senão PNG
function reduzirLogo(file){ return new Promise((ok,erro)=>{
  if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)) return erro(new Error('Use uma imagem PNG, JPG ou WebP.'));
  const fr=new FileReader(); fr.onerror=()=>erro(new Error('Não consegui ler a imagem.'));
  fr.onload=()=>{ const img=new Image(); img.onerror=()=>erro(new Error('Não consegui abrir a imagem.'));
    img.onload=()=>{ const k=Math.min(1,256/Math.max(img.width||1,img.height||1)); const w=Math.max(1,Math.round(img.width*k)), h=Math.max(1,Math.round(img.height*k));
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(img,0,0,w,h);
      let url=cv.toDataURL('image/webp',0.9); if(!/^data:image\/webp/.test(url)) url=cv.toDataURL('image/png');
      if(url.length>400000) return erro(new Error('A imagem ficou grande demais. Tente uma mais simples.'));
      ok(url); };
    img.src=fr.result; };
  fr.readAsDataURL(file); }); }
// nome e logo do time (o admin em Regras do time; o gestor geral na Plataforma)
function MarcaEditor({nomeTime,atual,temLogo,onSalvar}){
  const logo0=(atual&&atual.logo)||(temLogo?'__atual':null);   // '__atual': o time tem logo mas quem edita não vê a imagem (gestor geral)
  const [nome,setNome]=useState((atual&&atual.nome)||''); const [logo,setLogo]=useState(logo0);
  const [erro,setErro]=useState(''); const [indo,setIndo]=useState(false);
  const mudou=nome.trim()!==((atual&&atual.nome)||'').trim()||logo!==logo0;
  return <div data-marca-editor style={{display:'flex',flexDirection:'column',gap:10}}>
    <div style={{display:'flex',alignItems:'center',gap:12}}>
      {logo&&logo!=='__atual'?<img src={logo} alt="Logo do time" data-marca-previa width={64} height={64} style={{borderRadius:14,objectFit:'contain',background:'#fff',border:`1px solid ${C.border}`}}/>
        :<div data-marca-sem-previa style={{width:64,height:64,borderRadius:14,border:`1.5px dashed ${C.border}`,display:'grid',placeItems:'center',color:C.inkSoft,fontSize:11,textAlign:'center'}}>{logo?'tem logo':'sem logo'}</div>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <label style={{...btnS,display:'inline-block'}}>{logo?'Trocar a logo':'Enviar a logo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" data-marca-arquivo style={{display:'none'}}
            onChange={async e=>{ const f=e.target.files&&e.target.files[0]; e.target.value=''; setErro(''); try{ setLogo(await reduzirLogo(f)); }catch(x){ setErro(x.message); } }}/></label>
        {logo&&<button style={btnS} onClick={()=>setLogo(null)}>Tirar a logo</button>}
      </div></div>
    <div><label style={labelStyle} htmlFor="mc-nome">Nome que aparece no app</label>
      <input id="mc-nome" data-marca-nome style={inputStyle} maxLength={40} value={nome} placeholder={nomeTime||'Nome do time'} onChange={e=>setNome(e.target.value)}/></div>
    <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.5}}>Aparece no topo do app pra todo mundo do time e no link de convite. O GrinderBank fica pequeno, embaixo do nome. A imagem é reduzida antes de ir (PNG, JPG ou WebP).</div>
    {erro&&<div style={{color:C.red,fontSize:13,fontWeight:600}}>{erro}</div>}
    <button disabled={!mudou||indo} style={{...btnP,alignSelf:'flex-start',opacity:mudou&&!indo?1:.5}}
      onClick={async()=>{ setIndo(true); await onSalvar({p_nome:nome.trim(),p_logo:logo==='__atual'?null:(logo||'')}); setIndo(false); }}>Salvar marca</button>
  </div>;
}

// conta central = gestor geral da plataforma (plano 3.4, 4.2 e 8): um console só de administração, sem nada de jogador.
// Times só pelos números (por papel, ativos, jogando, assentos, vencimento, suspensão), contas individuais (plano e
// teste) e o registro de cada ação. O servidor confere tudo e não deixa o gestor geral ver os dados de dentro de um time.
const ACAO_ROTULO={criar_time:'criou o time',mudar_assentos:'mudou os assentos',novo_link_admin:'gerou link novo do admin',marca:'mudou a marca',
  suspender:'suspendeu o time',reativar:'reativou o time',vencimento:'mudou o vencimento do contrato',convidar_admin:'convidou um admin',
  acesso_conta:'mudou o acesso da conta'};
const ACESSO_ROTULO={estender:'estendeu o teste',sem_prazo:'liberou sem prazo',encerrar:'encerrou o acesso'};
const PRECO_JOGADOR_USD=5;   // mensalidade por jogador ativo (preço do dono, 20/11); a cobrança é por fora, aqui é só a conta
const detalheAcao=a=>{ const d=a.detalhes||{};
  if(a.acao==='mudar_assentos') return ` (${d.antes??'sem limite'} → ${d.depois??'sem limite'})`;
  if(a.acao==='suspender') return d.motivo?`: ${d.motivo}`:'';
  if(a.acao==='vencimento') return ` (${d.antes?dataBR(d.antes):'sem data'} → ${d.depois?dataBR(d.depois):'sem data'})`;
  if(a.acao==='convidar_admin') return d.nome?`: ${d.nome}`:'';
  if(a.acao==='acesso_conta') return `: ${ACESSO_ROTULO[d.acao]||d.acao}${d.acao==='estender'&&d.dias?` (${d.dias} dias)`:''}`;
  return ''; };
// conta individual: sem prazo, em teste (quantos dias faltam) ou vencida
const situacaoConta=c=>{ if(!c.teste_ate) return {tom:'ok',txt:'sem prazo',tipo:'sem_prazo'};
  const dias=Math.ceil((Date.parse(c.teste_ate)-Date.now())/86400000);
  return dias>0?{tom:dias<=3?'warn':'plum',txt:`em teste · ${dias} dia${dias===1?'':'s'}`,tipo:'teste',dias}
    :{tom:'bad',txt:`vencida em ${dataBR(c.teste_ate)}`,tipo:'vencida'}; };
// contrato do time: vencido, vencendo (7 dias) ou em dia
const situacaoContrato=t=>{ if(!t.contrato_fim) return null; const dias=diasDesde(t.contrato_fim);
  return dias>0?{tom:'bad',txt:`vencido há ${dias} dia${dias===1?'':'s'}`}:dias>=-7?{tom:'warn',txt:`vence ${dataBR(t.contrato_fim)}`}:{tom:'neutro',txt:`até ${dataBR(t.contrato_fim)}`}; };
const papeisDe=t=>[['admin',t.n_admins],['professor',t.n_professores],['financeiro',t.n_financeiros],['outro',t.n_outros]]
  .filter(([,n])=>n>0).map(([p,n])=>`${n} ${p}${n>1?(p==='professor'?'es':'s'):''}`).join(' · ')||'—';

function ConsolePlataforma({session}){
  const [aba,setAba]=useState('visao');
  const [times,setTimes]=useState(null); const [contas,setContas]=useState(null); const [acoes,setAcoes]=useState([]);
  const [aviso,setAviso]=useState(null); const [link,setLink]=useState(null); const [perg,setPerg]=useState(null);
  const [marcaDe,setMarcaDe]=useState(null); const [acoesDe,setAcoesDe]=useState(null);
  const [confirma,setConfirma]=useState(null); const [criando,setCriando]=useState(false); const [filtro,setFiltro]=useState('todas');
  const [novo,setNovo]=useState({nome:'',assentos:'',admin:''});
  const carregar=async()=>{ const [t,c,a]=await Promise.all([sb.rpc('times_da_plataforma'),sb.rpc('contas_da_plataforma'),sb.rpc('acoes_plataforma',{p_limite:60})]);
    if(t.error||c.error) setAviso({erro:true,texto:(t.error||c.error).message||'Não consegui carregar os dados da plataforma.'});
    setTimes(t.error?[]:(t.data||[])); setContas(c.error?[]:(c.data||[])); setAcoes(a.error?[]:(a.data||[])); };
  useEffect(()=>{ carregar(); },[]);
  const rodar=async(fn,args,okTexto)=>{ setAviso(null); const {data,error}=await sb.rpc(fn,args);
    if(error){ setAviso({erro:true,texto:error.message||'Não deu certo.'}); return null; }
    if(okTexto) setAviso({erro:false,texto:okTexto}); await carregar(); return data??true; };
  const url=t=>`${window.location.origin}/?convite=${t}`;
  const sair=async()=>{ try{ await sb.auth.signOut(); }catch(e){} };
  const nomeOk=novo.nome.trim().length>0&&novo.admin.trim().length>0;
  const criar=async()=>{ const n=novo.nome.trim(), adm=novo.admin.trim(), as=parseInt(novo.assentos,10);
    const r=await rodar('criar_time_plataforma',{p_nome:n,p_assentos:as>0?as:null,p_admin_nome:adm},`Time ${n} criado. Mande o link pra ${adm}.`);
    if(r&&r.convite){ setLink({titulo:`Link de admin do ${n}`,url:url(r.convite),texto:`${adm}, seu acesso de admin ao time ${n} no GrinderBank:`}); setNovo({nome:'',assentos:'',admin:''}); setCriando(false); } };

  // ---------- números ----------
  const ts=times||[], cs=contas||[];
  const soma=(l,k)=>l.reduce((s,x)=>s+(Number(x[k])||0),0);
  const naoSusp=ts.filter(t=>!t.suspenso_em), susp=ts.length-naoSusp.length;
  const jogAtivos=soma(naoSusp,'jogadores'), jogando=soma(naoSusp,'jogando_7d'), mensal=jogAtivos*PRECO_JOGADOR_USD;
  const sits=cs.map(situacaoConta), nTeste=sits.filter(s=>s.tipo==='teste').length, nVenc=sits.filter(s=>s.tipo==='vencida').length, nSem=sits.filter(s=>s.tipo==='sem_prazo').length;
  const atencao=[
    ...ts.filter(t=>t.suspenso_em).map(t=>({k:'s'+t.id,tom:'bad',txt:`${t.nome} está suspenso desde ${dataBR(t.suspenso_em)}${t.suspenso_motivo?`: ${t.suspenso_motivo}`:''}`})),
    ...ts.filter(t=>!t.tem_dono||t.admin_pendente).map(t=>({k:'a'+t.id,tom:'warn',txt:`${t.nome}: ${!t.tem_dono?'ainda sem dono':'admin convidado ainda não entrou'}`})),
    ...ts.map(t=>({t,c:situacaoContrato(t)})).filter(x=>x.c&&x.c.tom!=='neutro').map(x=>({k:'c'+x.t.id,tom:x.c.tom,txt:`${x.t.nome}: contrato ${x.c.txt}`})),
    ...cs.map(c=>({c,s:situacaoConta(c)})).filter(x=>x.s.tipo==='teste'&&x.s.dias<=3)
      .map(x=>({k:'t'+x.c.id,tom:'warn',txt:`Conta ${x.c.apelido||x.c.nome}: o teste acaba em ${x.s.dias} dia${x.s.dias===1?'':'s'}`}))];
  const contasVis=cs.filter((c,i)=>filtro==='todas'||sits[i].tipo===filtro);

  // ---------- ações ----------
  const acoesTime=t=>{ const l=[];
    l.push(['Convidar admin',()=>setPerg({label:`Convidar admin pro ${t.nome}`,kind:'text',valor:'',
      hint:'Nome de quem vai administrar o time. Você recebe um link de uso único (vale 7 dias) pra mandar pra pessoa.',
      onSave:async v=>{ if(!v) return; setPerg(null); const tok=await rodar('convidar_admin_plataforma',{p_ws:t.id,p_nome:v},null);
        if(tok&&typeof tok==='string') setLink({titulo:`Link de admin do ${t.nome}`,url:url(tok),texto:`${v}, seu acesso de admin ao time ${t.nome} no GrinderBank:`}); }})]);
    if(t.admin_pendente) l.push(['Link novo do admin convidado',async()=>{ const tok=await rodar('novo_link_admin',{p_ws:t.id},null);
      if(tok&&typeof tok==='string') setLink({titulo:`Link novo de admin do ${t.nome}`,url:url(tok),texto:`Teu acesso de admin ao time ${t.nome} no GrinderBank:`}); }]);
    l.push(['Marca (logo e nome)',()=>setMarcaDe(t)]);
    l.push(['Assentos',()=>setPerg({label:`Assentos do ${t.nome}`,hint:'Convite além disso é recusado no servidor. 0 = sem limite.',kind:'money',valor:t.assentos??0,
      onSave:async v=>{ setPerg(null); const n=Math.round(Number(v)||0); await rodar('mudar_assentos',{p_ws:t.id,p_assentos:n>0?n:null},`Assentos do ${t.nome}: ${n>0?n:'sem limite'}.`); }})]);
    l.push(['Vencimento do contrato',()=>setPerg({label:`Vencimento do contrato do ${t.nome}`,kind:'date',valor:t.contrato_fim||'',
      hint:'Até quando o time está pago. Em branco: sem data. Não trava nada sozinho: quem decide suspender é você.',
      onSave:async v=>{ setPerg(null); await rodar('definir_vencimento',{p_ws:t.id,p_data:v||null},v?`Contrato do ${t.nome} até ${dataBR(v)}.`:`Contrato do ${t.nome} sem data.`); }})]);
    if(t.suspenso_em) l.push(['Reativar o time',()=>setConfirma({titulo:`Reativar o ${t.nome}?`,texto:'O app volta a funcionar na hora pra todo mundo do time.',
      ok:async()=>{ setConfirma(null); await rodar('suspender_time',{p_ws:t.id,p_suspender:false,p_motivo:null},`${t.nome} reativado.`); }})]);
    else l.push(['Suspender o time',()=>setPerg({label:`Suspender o ${t.nome}`,kind:'text',valor:'',
      hint:'O app de todo mundo do time trava com um aviso; os dados ficam guardados e dá pra reativar. Diga o motivo: ele fica só aqui na plataforma.',
      onSave:async v=>{ if(!v) return; setPerg(null); await rodar('suspender_time',{p_ws:t.id,p_suspender:true,p_motivo:v},`${t.nome} suspenso.`); }}),true]);
    return l; };
  const acoesConta=c=>{ const s=situacaoConta(c), nome=c.apelido||c.nome, l=[];
    l.push(['Estender o teste',()=>setPerg({label:`Estender o teste de ${nome}`,kind:'money',valor:15,
      hint:'Quantos dias a mais. Conta a partir do fim do teste (ou de hoje, se já venceu ou se a conta não tinha prazo).',
      onSave:async v=>{ const d=Math.round(Number(v)||0); if(d<1) return; setPerg(null); await rodar('acesso_conta_plataforma',{p_ws:c.id,p_acao:'estender',p_dias:d},`Teste de ${nome}: mais ${d} dias.`); }})]);
    if(s.tipo!=='sem_prazo') l.push(['Liberar sem prazo',()=>setConfirma({titulo:`Liberar ${nome} sem prazo?`,texto:'A conta para de ter data pra acabar (como uma assinatura ativa).',
      ok:async()=>{ setConfirma(null); await rodar('acesso_conta_plataforma',{p_ws:c.id,p_acao:'sem_prazo',p_dias:null},`${nome}: liberada sem prazo.`); }})]);
    if(s.tipo!=='vencida') l.push(['Encerrar o acesso',()=>setConfirma({titulo:`Encerrar o acesso de ${nome}?`,perigo:true,
      texto:'A conta trava na hora, com a tela de assinar. Os dados ficam guardados e dá pra liberar de novo. A assinatura na Kiwify/Hotmart, se houver, é cancelada lá.',
      ok:async()=>{ setConfirma(null); await rodar('acesso_conta_plataforma',{p_ws:c.id,p_acao:'encerrar',p_dias:null},`Acesso de ${nome} encerrado.`); }}),true]);
    return l; };

  // ---------- telas ----------
  const NAV=[{id:'visao',label:'Visão geral',Icon:IcoPanel},{id:'times',label:'Times',Icon:IcoUsers},{id:'contas',label:'Contas',Icon:IcoUser},{id:'registro',label:'Registro',Icon:IcoDaily}];
  const titulo={visao:'Visão geral',times:'Times',contas:'Contas individuais',registro:'Registro'}[aba];
  const Kpi=({rotulo,valor,sub,dataK})=><Card data-kpi-plataforma={dataK} style={{padding:'16px 18px'}}>
    <div style={{fontSize:11,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:C.inkSoft}}>{rotulo}</div>
    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:700,margin:'4px 0 2px',whiteSpace:'nowrap'}}>{valor}</div>
    <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.4}}>{sub}</div></Card>;
  const botaoAcoes=(rot,dataA,itens)=><button aria-label={`Ações de ${rot}`} {...dataA} onClick={()=>setAcoesDe({titulo:rot,itens})}
    style={{width:36,height:36,borderRadius:10,border:`1.5px solid ${C.border}`,background:C.surface,color:C.inkSoft,fontWeight:800,cursor:'pointer'}}>⋯</button>;
  const carregando=times==null||contas==null;

  const visao=<div style={{display:'flex',flexDirection:'column',gap:16}}>
    <div data-kpis-plataforma style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
      <Kpi dataK="times" rotulo="Times" valor={naoSusp.length} sub={susp?`${susp} suspenso${susp>1?'s':''}`:'nenhum suspenso'}/>
      <Kpi dataK="jogadores" rotulo="Jogadores ativos" valor={jogAtivos} sub={`${jogando} jogaram nos últimos 7 dias`}/>
      <Kpi dataK="mensalidade" rotulo="Mensalidade estimada" valor={<>US$ {mensal.toLocaleString('pt-BR')}<span style={{fontSize:14,fontWeight:600,color:C.inkSoft}}>/mês</span></>} sub={`US$ ${PRECO_JOGADOR_USD} × jogadores ativos dos times não suspensos`}/>
      <Kpi dataK="contas" rotulo="Contas individuais" valor={cs.length} sub={`${nTeste} em teste · ${nVenc} vencida${nVenc===1?'':'s'} · ${nSem} sem prazo`}/>
    </div>
    <Card style={{padding:20}} data-atencao>
      <h3 style={tituloS}>Precisa de atenção</h3>
      {!atencao.length?<div style={{fontSize:14,color:C.inkSoft}}>Nada pendente.</div>:atencao.map(a=><div key={a.k} style={{display:'flex',gap:10,alignItems:'center',padding:'8px 0',borderTop:`1px solid ${C.border}`,fontSize:13.5}}>
        <Tag tom={a.tom}>{a.tom==='bad'?'urgente':'atenção'}</Tag><span>{a.txt}</span></div>)}
    </Card>
    <Card style={{padding:20}} data-por-papel>
      <h3 style={tituloS}>Pessoas por papel (todos os times)</h3>
      <div style={{display:'flex',gap:22,flexWrap:'wrap',fontSize:14}}>
        {[['Admins','n_admins'],['Professores','n_professores'],['Financeiros','n_financeiros'],['Outros papéis','n_outros'],['Jogadores ativos','jogadores'],['Convidados (ainda sem conta)','convidados']]
          .map(([r,k])=><div key={k}><div style={{fontSize:12,color:C.inkSoft,fontWeight:600}}>{r}</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:700}}>{soma(ts,k)}</div></div>)}
      </div>
    </Card>
  </div>;

  const telaTimes=<div style={{display:'flex',flexDirection:'column',gap:16}}>
    {criando?<Card style={{padding:20}}>
      <h3 style={tituloS}>Novo time</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10}}>
        <div><label style={labelStyle} htmlFor="pl-nome">Nome do time</label><input id="pl-nome" data-novo-time-nome style={inputStyle} value={novo.nome} onChange={e=>setNovo(x=>({...x,nome:e.target.value}))}/></div>
        <div><label style={labelStyle} htmlFor="pl-adm">Nome de quem vai administrar</label><input id="pl-adm" data-novo-time-admin style={inputStyle} value={novo.admin} onChange={e=>setNovo(x=>({...x,admin:e.target.value}))}/></div>
        <div><label style={labelStyle} htmlFor="pl-ass">Assentos (em branco: sem limite)</label><input id="pl-ass" data-novo-time-assentos style={inputStyle} inputMode="numeric" value={novo.assentos} onChange={e=>setNovo(x=>({...x,assentos:e.target.value.replace(/\D/g,'')}))}/></div>
      </div>
      <div style={{fontSize:12.5,color:C.inkSoft,margin:'8px 0 10px',lineHeight:1.5}}>O time nasce com a raiz e a configuração padrão. Quem aceitar o link de admin vira o dono do time e monta a estrutura.</div>
      <div style={{display:'flex',gap:8}}><button disabled={!nomeOk} onClick={criar} style={{...btnP,opacity:nomeOk?1:.5}}>Criar time</button>
        <button style={btnS} onClick={()=>setCriando(false)}>Cancelar</button></div>
    </Card>:<div><button data-novo-time style={btnP} onClick={()=>setCriando(true)}>+ Novo time</button></div>}
    {!ts.length?<Card style={{padding:20}}><div style={{fontSize:14,color:C.inkSoft}}>Nenhum time ainda. Crie o primeiro em "+ Novo time".</div></Card>:
    <div data-times style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(330px,1fr))',gap:12}}>
      {ts.map(t=>{ const ct=situacaoContrato(t); return <Card key={t.id} data-time-plataforma={t.nome} style={{padding:18,display:'flex',flexDirection:'column',gap:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
          <div style={{minWidth:0}}><div style={{fontWeight:800,fontSize:16}}>{t.nome}{t.tipo!=='time'?<span style={{fontSize:12,color:C.inkSoft,fontWeight:500}}> · {t.tipo==='pool'?'pool':'formato antigo'}</span>:null}</div>
            {(t.marca_nome&&t.marca_nome!==t.nome)||t.tem_logo?<div style={{fontSize:12,color:C.inkSoft}}>{[t.marca_nome&&t.marca_nome!==t.nome?`aparece como ${t.marca_nome}`:null,t.tem_logo?'com logo':null].filter(Boolean).join(' · ')}</div>:null}</div>
          {botaoAcoes(t.nome,{'data-acoes-time':t.nome},acoesTime(t))}</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}} data-situacao>
          {t.suspenso_em?<Tag tom="bad">suspenso</Tag>:<Tag tom="ok">ativo</Tag>}
          {ct&&<Tag tom={ct.tom}>contrato {ct.txt}</Tag>}
          {!t.tem_dono?<Tag tom="warn">sem dono</Tag>:t.admin_pendente?<Tag tom="warn">admin convidado</Tag>:null}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:'10px 12px'}}>
          {[['Pessoas',t.pessoas,`${t.com_conta} com conta${t.convidados?` · ${t.convidados} convidado${t.convidados>1?'s':''}`:''}`,null],
            ['Jogadores',t.jogadores,`de ${t.jogadores_cadastrados} cadastrado${t.jogadores_cadastrados===1?'':'s'}`,'data-jogadores'],
            ['Jogaram 7 dias',t.jogando_7d,null,null],
            ['Assentos',t.assentos==null?`${t.pessoas} · sem limite`:`${t.pessoas} de ${t.assentos}`,null,null],
            ['Mensalidade',t.suspenso_em?'—':`US$ ${((t.jogadores||0)*PRECO_JOGADOR_USD).toLocaleString('pt-BR')}`,null,'data-mensalidade'],
            ['Último lançamento',t.ultimo_lancamento?dataBR(t.ultimo_lancamento):'—',null,null]].map(([r,v,sub,dk])=><div key={r} style={{minWidth:0}}>
              <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase',color:C.inkSoft}}>{r}</div>
              <div {...(dk?{[dk]:true}:{})} style={{fontWeight:700,fontSize:15}}>{v}</div>
              {sub&&<div style={{fontSize:11.5,color:C.inkSoft,lineHeight:1.35}}>{sub}</div>}</div>)}
        </div>
        <div data-papeis style={{fontSize:12.5,color:C.inkSoft,borderTop:`1px solid ${C.border}`,paddingTop:8}}>Papéis: {papeisDe(t)}</div>
      </Card>; })}
    </div>}
  </div>;

  const telaContas=<div style={{display:'flex',flexDirection:'column',gap:16}}>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      {[['todas',`Todas (${cs.length})`],['teste',`Em teste (${nTeste})`],['vencida',`Vencidas (${nVenc})`],['sem_prazo',`Sem prazo (${nSem})`]].map(([k,r])=>
        <button key={k} data-filtro-conta={k} onClick={()=>setFiltro(k)} style={{...btnS,background:filtro===k?C.plumSoft:C.surface,borderColor:filtro===k?P:C.border}}>{r}</button>)}
    </div>
    {!contasVis.length?<Card style={{padding:20}}><div style={{fontSize:14,color:C.inkSoft}}>Nenhuma conta aqui.</div></Card>:
    <div data-contas style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
      {contasVis.map(c=>{ const s=situacaoConta(c), nome=c.apelido||c.nome; return <Card key={c.id} data-conta-plataforma={nome} style={{padding:16,display:'flex',flexDirection:'column',gap:8}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
          <div style={{minWidth:0}}><div style={{fontWeight:800,fontSize:15}}>{nome}</div>
            <div style={{fontSize:12.5,color:C.inkSoft,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.email||'sem e-mail'}</div></div>
          {botaoAcoes(nome,{'data-acoes-conta':nome},acoesConta(c))}</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}><Tag tom={s.tom}>{s.txt}</Tag></div>
        <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.5}}>Plano {c.plano||'—'} · criada em {dataBR(c.criado_em)}<br/>{c.torneios} torneio{c.torneios===1?'':'s'} · último lançamento {c.ultimo_lancamento?dataBR(c.ultimo_lancamento):'—'}</div>
      </Card>; })}
    </div>}
  </div>;

  const telaRegistro=<Card style={{padding:20}}>
    {!acoes.length?<div style={{fontSize:14,color:C.inkSoft}}>Nenhuma ação ainda.</div>:acoes.map((a,i)=><div key={i} data-acao-plataforma style={{padding:'8px 0',borderTop:i?`1px solid ${C.border}`:'none',fontSize:13.5}}>
      <b>{dataBR(a.criado_em)}</b> · {ACAO_ROTULO[a.acao]||a.acao}{a.time_nome?` · ${a.time_nome}`:''}{detalheAcao(a)}</div>)}
  </Card>;

  return <div className="wrap" data-console-plataforma>
    <aside className="side" style={{flexDirection:'column',width:238,padding:20,borderRight:`1px solid ${C.border}`,position:'sticky',top:0,height:'100vh',gap:6}}>
      <Brand sub="gestão da plataforma"/><div style={{height:6}}/>
      {NAV.map(n=><NavBtn key={n.id} Icon={n.Icon} label={n.label} active={aba===n.id} onClick={()=>setAba(n.id)}/>)}
      <div style={{marginTop:'auto',display:'flex',flexDirection:'column',gap:10}}>
        <div style={{padding:14,borderRadius:16,background:C.plumSoft,fontSize:12.5,color:P,lineHeight:1.45}}>
          <div style={{fontWeight:800}}>Conta central</div>
          <div style={{color:C.inkSoft,marginTop:2,wordBreak:'break-all'}}>{session.user.email}</div></div>
        <button onClick={sair} style={{padding:'10px',borderRadius:12,border:`1px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:600,cursor:'pointer',fontSize:13.5}}>Sair</button>
      </div>
    </aside>
    <main style={{flex:1,padding:'22px 16px calc(112px + env(safe-area-inset-bottom))',maxWidth:'100%',minWidth:0}}>
      <div className="bottomnav" style={{alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
        <Brand small sub="gestão da plataforma"/>
        <button onClick={sair} style={{...btnS,display:'flex',alignItems:'center',gap:6}}><IcoLogout s={16}/>Sair</button></div>
      <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16,maxWidth:1180}}>
        <div><h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,margin:0}}>{titulo}</h2>
          <div style={{fontSize:13,color:C.inkSoft,marginTop:4}}>Você vê os times só pelos números. Os dados de cada time continuam só com quem é do time.</div></div>
        {aviso&&<div data-aviso-plataforma style={{padding:'11px 14px',borderRadius:13,background:aviso.erro?C.redSoft:C.greenSoft,color:aviso.erro?C.red:C.greenMid,fontWeight:600,fontSize:13.5}}>{aviso.texto}</div>}
        {link&&<LinkPronto titulo={link.titulo} url={link.url} texto={link.texto} onFechar={()=>setLink(null)}/>}
        {carregando?<div className="spin"/>:aba==='visao'?visao:aba==='times'?telaTimes:aba==='contas'?telaContas:telaRegistro}
      </div>
    </main>
    <nav className="bottomnav" style={{position:'fixed',bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,padding:'6px 8px calc(6px + env(safe-area-inset-bottom))',gap:2,boxShadow:'0 -8px 24px -16px rgba(0,0,0,.25)',zIndex:20}}>
      {NAV.map(n=><NavBtn key={n.id} Icon={n.Icon} label={n.label} active={aba===n.id} onClick={()=>setAba(n.id)} mobile/>)}
    </nav>

    {acoesDe&&<div onClick={()=>setAcoesDe(null)} style={fundoModal}><div onClick={e=>e.stopPropagation()} data-acoes-modal className="ftfade" style={caixaModal}>
      {topoModal(acoesDe.titulo,()=>setAcoesDe(null))}
      {acoesDe.itens.map(([r,fn,perigo])=><button key={r} role="menuitem" onClick={()=>{ setAcoesDe(null); fn(); }}
        style={{textAlign:'left',padding:'13px 14px',borderRadius:13,border:`1.5px solid ${perigo?C.redSoft:C.border}`,background:C.surface,color:perigo?C.red:C.ink,fontWeight:700,fontSize:14.5,cursor:'pointer'}}>{r}</button>)}
    </div></div>}
    {confirma&&<div onClick={()=>setConfirma(null)} style={fundoModal}><div onClick={e=>e.stopPropagation()} data-confirma className="ftfade" style={caixaModal}>
      {topoModal(confirma.titulo,()=>setConfirma(null))}
      <div style={{fontSize:13.5,color:C.inkSoft,lineHeight:1.55}}>{confirma.texto}</div>
      <div style={{display:'flex',gap:8}}><button style={{...btnP,flex:1,...(confirma.perigo?{background:C.red,borderColor:C.red}:{})}} onClick={confirma.ok}>Confirmar</button>
        <button style={{...btnS,flex:1}} onClick={()=>setConfirma(null)}>Cancelar</button></div>
    </div></div>}
    {perg&&<QuickEditModal label={perg.label} hint={perg.hint} kind={perg.kind} currentValue={perg.valor} onClose={()=>setPerg(null)} onSave={perg.onSave}/>}
    {marcaDe&&<div onClick={()=>setMarcaDe(null)} style={fundoModal}><div onClick={e=>e.stopPropagation()} data-marca-modal className="ftfade" style={caixaModal}>
      {topoModal(`Marca do ${marcaDe.nome}`,()=>setMarcaDe(null))}
      <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.5}}>Você não vê a logo atual (os dados do time são só do time). Pode trocar, tirar ou mudar o nome; fica no registro.</div>
      <MarcaEditor nomeTime={marcaDe.nome} atual={{nome:marcaDe.marca_nome||'',logo:null}} temLogo={!!marcaDe.tem_logo}
        onSalvar={async a=>{ const r=await rodar('definir_marca',{...a,p_ws:marcaDe.id},`Marca do ${marcaDe.nome} salva.`); if(r) setMarcaDe(null); }}/>
    </div></div>}
  </div>;
}

// time suspenso pela plataforma (contrato): o app de todo mundo do time trava com o aviso; os dados ficam guardados
function TimeSuspenso({nome,onLogout}){
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20}}>
    <Card data-time-suspenso style={{padding:30,width:'100%',maxWidth:430,textAlign:'center'}} className="ftfade">
      <div style={{display:'flex',justifyContent:'center',marginBottom:12}}><Brand/></div>
      <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:700,margin:'0 0 8px'}}>O acesso {nome?`do ${nome}`:'do seu time'} está suspenso</h3>
      <p style={{fontSize:14,color:C.inkSoft,lineHeight:1.65,margin:'0 0 18px'}}>Os seus dados estão guardados. Se você joga ou é da equipe, fale com o admin do time. Se você é o admin, fale com o GrinderBank pra reativar.</p>
      <button onClick={()=>window.location.reload()} style={{width:'100%',padding:'13px 0',borderRadius:13,border:`1.5px solid ${C.border}`,background:'transparent',color:P,fontWeight:700,fontSize:14,cursor:'pointer'}}>Já foi resolvido: atualizar</button>
      <button onClick={onLogout} style={{marginTop:12,border:'none',background:'transparent',color:C.inkSoft,fontWeight:600,fontSize:13,cursor:'pointer',textDecoration:'underline'}}>Sair</button>
    </Card>
  </div>;
}

// escolhe a sala: uma das que o jogador já tem, ou outra pelo nome (capital, reload)
function SalaCampo({salas,valor,onChange,rotulo='Sala'}){
  const nomes=[...new Set((salas||[]).filter(s=>s.chave).map(s=>s.sala))];
  const [outra,setOutra]=useState(!nomes.length||(!!valor&&!nomes.includes(valor)));
  return <div><label style={labelStyle}>{rotulo}</label>
    {nomes.length>0&&<select data-sala-escolha value={outra?'__outra':(valor||'')} onChange={e=>{ if(e.target.value==='__outra'){ setOutra(true); onChange(''); } else { setOutra(false); onChange(e.target.value); } }} style={inputStyle}>
      <option value="">Escolha a sala</option>{nomes.map(n=><option key={n} value={n}>{n}</option>)}<option value="__outra">Outra sala…</option></select>}
    {outra&&<input data-sala-outra style={{...inputStyle,marginTop:nomes.length?8:0}} value={valor||''} placeholder="ex.: GG, PokerStars, WPN" onChange={e=>onChange(e.target.value)}/>}
  </div>;
}
// janelas por cima de tudo vão direto pro body: dentro de um bloco com animação, filtro ou rolagem, uma janela "fixa"
// fica presa nele e abre fora da tela (A-010)
const Portal=({children})=>ReactDOM.createPortal(children,document.body);
// celular: as tabelas largas viram cartões (A-034)
function useCelular(max=640){
  const q=()=>typeof window!=='undefined'&&window.matchMedia?window.matchMedia(`(max-width: ${max}px)`).matches:false;
  const [m,setM]=useState(q);
  useEffect(()=>{ if(!window.matchMedia) return; const mq=window.matchMedia(`(max-width: ${max}px)`), f=e=>setM(e.matches);
    mq.addEventListener?mq.addEventListener('change',f):mq.addListener(f); return ()=>{ mq.removeEventListener?mq.removeEventListener('change',f):mq.removeListener(f); }; },[max]);
  return m;
}
// unidades na ordem da árvore: mãe antes das filhas; irmãs pela ordem e depois pelo rótulo/nome com número natural
// ("Reta 2" antes de "Reta 10"). O caminho é feito de ids, então ordenar por ele embaralhava as retas (A-025)
function ordenarUnidades(us){
  const filhos={}; (us||[]).forEach(u=>{ const k=u.mae_id||''; (filhos[k]||(filhos[k]=[])).push(u); });
  const cmp=(a,b)=>(num(a.ordem)-num(b.ordem))||String(a.rotulo||a.nome).localeCompare(String(b.rotulo||b.nome),'pt-BR',{numeric:true})||String(a.nome).localeCompare(String(b.nome),'pt-BR',{numeric:true});
  const out=[], vistos=new Set(); const vai=k=>{ (filhos[k]||[]).sort(cmp).forEach(u=>{ if(vistos.has(u.id)) return; vistos.add(u.id); out.push(u); vai(u.id); }); };
  vai(''); (us||[]).forEach(u=>{ if(!vistos.has(u.id)){ vistos.add(u.id); out.push(u); vai(u.id); } });
  return out;
}
// Esc fecha a janela aberta (a de cima: cada uma registra o seu e só a última responde)
const pilhaEsc=[];
function useEsc(onClose,ativo=true){
  const ref=React.useRef(onClose); ref.current=onClose;
  useEffect(()=>{ if(!ativo) return; const f=()=>ref.current&&ref.current(); pilhaEsc.push(f);
    const k=e=>{ if(e.key==='Escape'&&pilhaEsc[pilhaEsc.length-1]===f){ e.stopPropagation(); f(); } };
    window.addEventListener('keydown',k); return ()=>{ window.removeEventListener('keydown',k); const i=pilhaEsc.lastIndexOf(f); if(i>=0) pilhaEsc.splice(i,1); }; },[ativo]);
}
const fundoModal={position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50};
const caixaModal={background:C.surface,width:'100%',maxWidth:500,maxHeight:'92vh',overflowY:'auto',borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:12};
// janela de baixo (o padrão do app): fundo escuro, Esc fecha e vai pro body
function Janela({onClose,children,rotulo,attrs,largura}){
  useEsc(onClose);
  return <Portal><div onClick={onClose} style={fundoModal}><div onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={rotulo} className="ftfade"
    style={{...caixaModal,...(largura?{maxWidth:largura}:{})}} {...(attrs||{})}>{children}</div></div></Portal>;
}
const topoModal=(titulo,onClose)=><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
  <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>{titulo}</h3>
  <button onClick={onClose} aria-label="Fechar" style={{width:40,height:40,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button></div>;
// capital mandado pelo time: valor e sala (cada sala tem o seu jeito de depósito)
function CapitalModal({nome,salas,onSalvar,onClose}){
  useEsc(onClose);
  const [valor,setValor]=useState(''); const [sala,setSala]=useState(''); const [indo,setIndo]=useState(false);
  const v=parseValor(valor), ok=v!==0&&String(sala).trim().length>0&&!indo;
  return <div onClick={onClose} style={fundoModal}><div onClick={e=>e.stopPropagation()} data-capital-modal className="ftfade" style={caixaModal}>
    {topoModal(`Capital mandado pra ${nome}`,onClose)}
    <div><label style={labelStyle} htmlFor="cap-v">Quanto (US$)</label><input id="cap-v" data-capital-valor style={inputStyle} inputMode="decimal" value={valor} placeholder="ex.: 200" onChange={e=>setValor(e.target.value)}/></div>
    <SalaCampo salas={salas} valor={sala} onChange={setSala} rotulo="Em qual sala"/>
    <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.5}}>Entra no MU e na banca dessa sala. Negativo corrige um lançamento.</div>
    <button disabled={!ok} onClick={async()=>{ setIndo(true); await onSalvar({valor:v,sala:String(sala).trim()}); setIndo(false); }} style={{padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer',opacity:ok?1:.5}}>Registrar capital</button>
  </div></div>;
}
// as salas de um jogador pelo sistema, a soma (= banca) e a última conferência dele
function SalasModal({nome,dados,onClose}){
  useEsc(onClose);
  const salas=(dados&&dados.salas)||[], conf=dados&&dados.ultima_conferencia;
  const difDe=ch=>{ const l=conf&&(conf.salas||[]).find(x=>x.chave===ch); return l&&l.diferenca!=null?Number(l.diferenca):null; };
  return <div onClick={onClose} style={fundoModal}><div onClick={e=>e.stopPropagation()} data-salas-modal className="ftfade" style={caixaModal}>
    {topoModal(`Salas de ${nome}`,onClose)}
    {salas.length===0?<div style={{fontSize:14,color:C.inkSoft}}>Nenhuma sala ainda.</div>:salas.map(s=>{ const dif=s.chave?difDe(s.chave):null;
      return <div key={s.chave||'sem'} data-sala-linha={s.sala} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'6px 0',borderBottom:`1px solid ${C.border}`,fontSize:13.5}}>
        <span style={{color:s.chave?C.ink:C.inkSoft}}>{s.chave?s.sala:'Sem sala (capital ou saque antigo sem a sala)'}</span>
        <span><b>{fmt(s.saldo)}</b>{dif!=null&&Math.abs(dif)>1?<span style={{color:C.red,fontWeight:700}}> · lançado {fmtSinal(dif)}</span>:null}</span></div>; })}
    <div style={{display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:800,paddingTop:4}}><span>Total (banca)</span><span>{fmt(dados?.total)}</span></div>
    <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.5}}>{conf?`Última conferência do jogador: ${dataBR(conf.criado_em)} · ${conf.diverge?`diverge ${fmtSinal(Number(conf.diferenca))} no total`:'bateu'}.`:'O jogador ainda não conferiu os saldos das salas.'}</div>
  </div></div>;
}
// abertura sem planilha: o jogador preenche o que a planilha do time diria (serve pra qualquer time)
function PlanilhaManualModal({nome,salas,onPronto,onClose}){
  useEsc(onClose);
  const base=(salas||[]).filter(s=>s.chave).map(s=>s.sala);
  const [mk,setMk]=useState(''); const [co,setCo]=useState(''); const [data,setData]=useState(todayISO());
  const [ls,setLs]=useState(()=>(base.length?base:['GG Poker','PokerStars']).map(sala=>({sala,saldo:''})));
  const saldos=ls.filter(l=>String(l.sala).trim()).map(l=>({sala:String(l.sala).trim(),saldo:cent(parseValor(l.saldo))}));
  const banca=cent(saldos.reduce((a,s)=>a+s.saldo,0)), makeup=cent(parseValor(mk)), cashout=cent(parseValor(co));
  const ok=makeup>=0&&cashout>=0&&saldos.length>0&&!!data;
  return <div onClick={onClose} style={fundoModal}><div onClick={e=>e.stopPropagation()} data-planilha-manual className="ftfade" style={caixaModal}>
    {topoModal('Abertura sem planilha',onClose)}
    <div style={{fontSize:13,color:C.inkSoft,lineHeight:1.5}}>Os números de hoje com o time (os mesmos da planilha). O time confere antes de valer.</div>
    {ls.map((l,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'1fr 120px',gap:8}}>
      <input data-manual-sala={i} style={inputStyle} value={l.sala} placeholder="Sala" onChange={e=>setLs(x=>x.map((y,j)=>j===i?{...y,sala:e.target.value}:y))}/>
      <input data-manual-saldo={i} style={inputStyle} inputMode="decimal" value={l.saldo} placeholder="Saldo" onChange={e=>setLs(x=>x.map((y,j)=>j===i?{...y,saldo:e.target.value}:y))}/></div>)}
    <button style={{...btnS,alignSelf:'flex-start'}} onClick={()=>setLs(x=>[...x,{sala:'',saldo:''}])}>+ sala</button>
    <div><label style={labelStyle} htmlFor="pm-mk">MakeUp (capital do time com você)</label><input id="pm-mk" data-manual-makeup style={inputStyle} inputMode="decimal" value={mk} onChange={e=>setMk(e.target.value)}/></div>
    <div><label style={labelStyle} htmlFor="pm-co">Cashout (lucro que você já sacou no time)</label><input id="pm-co" data-manual-cashout style={inputStyle} inputMode="decimal" value={co} onChange={e=>setCo(e.target.value)}/></div>
    <div><label style={labelStyle} htmlFor="pm-dt">Saldos de que dia</label><input id="pm-dt" type="date" style={inputStyle} value={data} max={todayISO()} onChange={e=>setData(e.target.value)}/></div>
    <div style={{fontSize:13.5}}>Banca (soma das salas): <b>{fmt(banca)}</b> · profit {fmtSinal(cent(banca-makeup))}</div>
    <button disabled={!ok} onClick={()=>onPronto({nome,atualizado_em:data,saldos,banca,makeup,cashout,lucro:cent(banca-makeup),lifetime:cent(cashout+banca-makeup),grade:[],avisos:[]})}
      style={{padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer',opacity:ok?1:.5}}>Conferir e enviar</button>
  </div></div>;
}

// regras por reta (fase 1): o que cada unidade pode mudar; sem regra em nenhuma unidade vale o padrão do time
const REGRAS_RETA=[
  {k:'abi_max',rot:'ABI máximo (reta sem grade)',kind:'money',padrao:c=>num(c.abi_max_player1)||num(c.abi_max)||2,txt:v=>fmt(v)},
  {k:'stop_dia_buyins',rot:'Stop loss diário',kind:'money',padrao:c=>num(c.stoploss_daily_buyins),txt:v=>`${num(v)} buy-ins`},
  {k:'stop_semana_pct',rot:'Stop loss semanal',kind:'percent',padrao:c=>num(c.stoploss_weekly_pct),txt:v=>`${pctFmt(num(v)*100)} da banca`},
  {k:'sites',rot:'Sites permitidos',kind:'list',padrao:c=>c.sites_permitidos||[],txt:v=>(Array.isArray(v)?v:[]).join(', ')||'—'},
  {k:'modalidades',rot:'Modalidades',kind:'list',padrao:c=>c.modalidades_permitidas||[],txt:v=>(Array.isArray(v)?v:[]).join(', ')||'—'},
  {k:'reserva_por_sala',rot:'Reserva por sala no saque',kind:'money',padrao:()=>0,txt:v=>num(v)>0?`${fmt(v)} por sala`:'nenhuma'},
  {k:'bloquear_promocao_com_mk',rot:'Não promover com MK',kind:'bool',padrao:()=>false,txt:v=>v===true?'ligado':'desligado'},
];

// saída do jogador (opção B do plano): a prévia do acerto vem do servidor (refeita com a banca que quem confere digita),
// o que vai pra conta individual nova dele e o que fica com o time. Confirma digitando SAIU.
function SaidaModal({nome,previa,onBanca,onConfirmar,onClose}){
  useEsc(onClose);
  const a=previa.acerto||{}, r=previa.resultado||{}, lv=previa.leva||{}, pend=previa.pendencias||[];
  const [banca,setBanca]=useState(String(a.banca_sistema??0)); const [recebido,setRecebido]=useState(''); const [conf,setConf]=useState(''); const [indo,setIndo]=useState(false);
  const B=parseValor(banca), R=String(recebido).trim()===''?null:parseValor(recebido);
  const temDinheiro=Number(a.banca)!==0||Number(a.mu)!==0||Number(a.lifetime)!==0;
  const travado=previa.dono||previa.eu||pend.length>0||(temDinheiro&&previa.precisa_aprovar_saques);
  const ok=!travado&&B>=0&&(R==null||R>=0)&&conf.trim().toUpperCase()==='SAIU'&&!indo;
  const linha=(rot,val,extra={})=><div style={{display:'flex',justifyContent:'space-between',gap:10,padding:'4px 0',fontSize:13.5,...extra}}><span style={{color:C.inkSoft}}>{rot}</span><b style={{color:C.ink}}>{val}</b></div>;
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50}}>
    <div onClick={e=>e.stopPropagation()} data-saida-modal className="ftfade" style={{background:C.surface,width:'100%',maxWidth:500,maxHeight:'92vh',overflowY:'auto',borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>Saída de {nome}</h3>
        <button onClick={onClose} aria-label="Fechar" style={{width:40,height:40,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
      </div>
      <div style={{fontSize:13,color:C.inkSoft}}>No time desde {previa.entrada?dataBR(previa.entrada):'—'} · {r.torneios||0} torneio{Number(r.torneios)!==1?'s':''} · resultado {fmtSinal(Number(r.lucro)||0)}</div>
      {(previa.dono||previa.eu)&&<div data-saida-travada style={{color:C.red,fontWeight:700,fontSize:13.5}}>{previa.dono?'O dono do time não sai por aqui: fale com o suporte.':'Ninguém registra a própria saída.'}</div>}
      {pend.length>0&&<div data-saida-pendencias style={{background:C.redSoft,borderRadius:12,padding:'10px 12px',fontSize:13.5,color:C.ink}}>Resolva antes da saída: <b>{pend.join(', ')}</b>. O acerto sairia errado.</div>}
      {temDinheiro&&previa.precisa_aprovar_saques&&<div style={{color:C.red,fontWeight:700,fontSize:13.5}}>Tem dinheiro do time com {nome}: o acerto precisa de quem aprova saques nesta reta.</div>}
      {temDinheiro&&<>
        <div><label style={labelStyle} htmlFor="sd-banca">Banca final (somando as salas)</label>
          <input id="sd-banca" data-saida-banca style={inputStyle} inputMode="decimal" value={banca} onChange={e=>setBanca(e.target.value)} onBlur={()=>{ if(B>=0) onBanca(B); }}/>
          <div style={{fontSize:12,color:C.inkSoft,marginTop:4}}>No sistema: {fmt(a.banca_sistema)}. Confira com ele e corrija se precisar.</div></div>
        <div data-saida-acerto style={{background:C.bg,borderRadius:12,padding:'8px 12px'}}>
          {linha('Banca final',fmt(a.banca))}{linha('MU (capital do time)',fmt(a.mu))}
          {Number(a.mk_congelado)>0
            ?linha('Em MK: fica congelado no acerto',fmt(a.mk_congelado),{color:C.red})
            :linha('Profit (banca − MU)',fmtSinal(Number(a.profit)||0))}
          {linha('Time recolhe o capital',fmt(a.devolucao))}
          {Number(a.cashout)>0&&(a.parte_time!=null
            ?<>{linha(`Lucro dividido pelo contrato (${fmt(a.cashout)})`,`${nome} fica com ${fmt(a.parte_jogador)}`)}{linha('Parte do time no lucro',fmt(a.parte_time))}</>
            :<div style={{fontSize:13,color:C.red,fontWeight:600,padding:'4px 0'}}>Sem contrato: combine a divisão dos {fmt(a.cashout)} de lucro e registre o recebido.</div>)}
          {a.total_time!=null&&linha('Total pro time',fmt(a.total_time),{borderTop:`1px solid ${C.border}`,marginTop:4,paddingTop:8})}
        </div>
        <div><label style={labelStyle} htmlFor="sd-rec">Recebido pelo time (se já recebeu)</label>
          <input id="sd-rec" data-saida-recebido style={inputStyle} inputMode="decimal" placeholder="em branco: fica a receber no Financeiro" value={recebido} onChange={e=>setRecebido(e.target.value)}/></div>
      </>}
      <div data-saida-leva style={{fontSize:13,color:C.ink,lineHeight:1.5}}>
        {previa.tem_conta
          ?<>Vai pra uma conta individual nova de {nome} (15 dias de teste): {lv.torneios||0} torneio{Number(lv.torneios)!==1?'s':''}, {lv.maos||0} registro{Number(lv.maos)!==1?'s':''} de mãos, {lv.salas||0} sala{Number(lv.salas)!==1?'s':''} e os movimentos. </>
          :<>{nome} não tem conta no app: só fecha o vínculo. </>}
        O time fica com o acerto, os saques, o MU, os reloads e a planilha.</div>
      <div><label style={labelStyle} htmlFor="sd-conf">Digite SAIU pra confirmar</label>
        <input id="sd-conf" data-saida-confirma style={inputStyle} value={conf} onChange={e=>setConf(e.target.value)} disabled={travado}/></div>
      <button disabled={!ok} onClick={async()=>{ setIndo(true); await onConfirmar({banca:temDinheiro?B:null,recebido:temDinheiro?R:null}); setIndo(false); }}
        style={{padding:'14px 0',borderRadius:14,border:'none',background:C.red,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer',opacity:ok?1:.5}}>Registrar saída</button>
    </div>
  </div>;
}

/* o time: telas de gestão (visão, jogadores, grades, financeiro, equipe, regras) e o "Meu time" do jogador.
   Os dados vêm do banco já filtrados pelo que cada um pode ver (RLS); a tela só escolhe o que mostrar. */
function TimeApp({session,secao,tours,config,banca,onVerJogador,onIr,marca,nomeTime,onMarca,onPadrao}){
  const uid=session.user.id;
  const celular=useCelular();
  const [d,setD]=useState(null);
  const [cortes,setCortes]=useState({});       // conferência da planilha: até que dia os saldos dela valem (por planilha)
  const [pedEsc,setPedEsc]=useState({});       // pedido de entrada: reta e nome escolhidos antes de aprovar
  const corteDe=a=>{ const pl=a.planilha||{}; return cortes[a.id]||(/^\d{4}-\d{2}-\d{2}$/.test(String(pl.atualizado_em||''))?pl.atualizado_em:String(a.enviado_em||'').slice(0,10))||null; };
  const [aviso,setAviso]=useState(null);       // {erro, texto}
  const [perg,setPerg]=useState(null);         // QuickEditModal: {label,hint,kind,opts,valor,onSave}
  const [link,setLink]=useState(null);         // link pessoal gerado fora do convite: {titulo,url,texto}
  const [saqueAberto,setSaqueAberto]=useState(false);
  const [saidaDe,setSaidaDe]=useState(null);   // saída: {p, previa} (a prévia do acerto vem do servidor)
  const [regraSel,setRegraSel]=useState(null); // regras por reta: a unidade aberta no cartão
  const [planilha,setPlanilha]=useState(null);
  const [reloadAberto,setReloadAberto]=useState(false);
  const [capitalDe,setCapitalDe]=useState(null);   // capital com a sala: {p, salas}
  const [salasDe,setSalasDe]=useState(null);       // gestor olhando as salas de um jogador: {p, dados}
  const [conf,setConf]=useState(null);             // conferência de saldos do jogador: {valores, resultado}
  const [manualAberta,setManualAberta]=useState(false);   // abertura sem planilha
  const [periodo,setPeriodo]=useState('mes');
  const [resumo,setResumo]=useState(null);
  const [gradeAberta,setGradeAberta]=useState(null);
  const [gradeSel,setGradeSel]=useState(null);
  const [versoes,setVersoes]=useState(false);
  const [convite,setConvite]=useState(null);
  const [pessoaEd,setPessoaEd]=useState(null);
  const [estrutura,setEstrutura]=useState(false);
  const [contratoAberto,setContratoAberto]=useState(false);
  const [filtro,setFiltro]=useState({reta:null,sit:null,busca:''});
  const [menuDe,setMenuDe]=useState(null);
  const [ord,setOrd]=useState({k:'nome',dir:1});
  const desdePeriodo=()=>{ const hoje=todayISO(); return periodo==='mes'?hoje.slice(0,8)+'01':periodo==='30'?addDaysISO(hoje,-29):null; };
  const carregarResumo=async()=>{ const {data,error}=await sb.rpc('resumo_time',{p_desde:desdePeriodo()}); setResumo(error?[]:(data||[])); };
  useEffect(()=>{ carregarResumo(); },[periodo]);
  const lerPlanilha=async file=>{
    setAviso(null);
    if(!file) return;
    if(!/\.xlsx$/i.test(file.name)) return setAviso({erro:true,texto:'Mande o arquivo .xlsx (no Google Planilhas: Arquivo → Fazer download → Microsoft Excel).'});
    if(!window.fflate) return setAviso({erro:true,texto:'Leitor de planilha não carregou. Recarregue a página e tente de novo.'});
    try{
      const u=new Uint8Array(await file.arrayBuffer());
      const r=lerXlsxSamba(fflate.unzipSync(u),b=>fflate.strFromU8(b));
      if(r.erro) return setAviso({erro:true,texto:r.erro});
      setPlanilha(r);
    }catch(e){ setAviso({erro:true,texto:'Não consegui abrir essa planilha ('+(e.message||'arquivo inválido')+').'}); }
  };
  const carregar=async()=>{
    const q=(t,cols='*')=>lerTudo(()=>sb.from(t).select(cols).order('id'));   // paginado: o servidor corta em 1.000 linhas
    const [u,p,v,a,cv,sq,ct,ab,rl,gr,rg,tc,pd,acs,cfs]=await Promise.all([q('unidade'),q('pessoa'),q('vinculo'),q('acesso'),
      q('convite','id,unidade_id,pessoa_id,expira_em,usos_max,usos,revogado,criado_em'),q('saque'),q('contrato'),q('abertura'),q('reload'),q('grade'),q('regra_unidade'),
      sb.from('time_codigo').select('workspace_id,codigo,ativo'),q('pedido_entrada'),q('acerto_saida'),q('conferencia_saldo')]);
    const stp=await sb.rpc('stop_semana_do_time',{p_inicio:weekStart(weekEnding(todayISO()))});
    const pessoas=p.data||[], vinculos=v.data||[];
    const eu=pessoas.find(x=>x.user_id===uid&&x.status!=='saiu')||null;
    let sit=null;
    let salasEu=null;
    if(eu&&vinculos.some(x=>x.pessoa_id===eu.id&&!x.fim)){ const r=await sb.rpc('situacao_jogador',{p_pessoa:eu.id}); if(!r.error) sit=r.data;
      const r2=await sb.rpc('salas_jogador',{p_pessoa:eu.id}); if(!r2.error&&r2.data) salasEu=r2.data; }
    setD({unidades:ordenarUnidades((u.data||[]).filter(x=>!x.arquivada)),pessoas,vinculos,
      acessos:a.data||[],convites:cv.error?[]:(cv.data||[]),saques:(sq.data||[]).sort((x,y)=>String(y.solicitado_em).localeCompare(String(x.solicitado_em))),
      contratos:ct.data||[],aberturas:ab.data||[],reloads:(rl.data||[]).sort((x,y)=>String(y.solicitado_em).localeCompare(String(x.solicitado_em))),eu,sit,salasEu,
      conferencias:cfs.error?[]:(cfs.data||[]).sort((x,y)=>String(y.criado_em).localeCompare(String(x.criado_em))),
      grades:gr.error?[]:(gr.data||[]),regras:rg.error?[]:(rg.data||[]),
      codigo:tc.error?null:((tc.data||[])[0]||null),pedidos:pd.error?[]:(pd.data||[]).filter(x=>x.status==='pendente').sort((x,y)=>String(x.criado_em).localeCompare(String(y.criado_em))),
      acertos:acs.error?[]:(acs.data||[]).sort((x,y)=>String(y.registrado_em).localeCompare(String(x.registrado_em))),
      stopSemana:stp&&!stp.error&&Array.isArray(stp.data)?stp.data:[]});
  };
  useEffect(()=>{ carregar(); },[]);
  // trocou de tela: nenhuma janela da tela anterior fica aberta por cima da nova (A-036)
  useEffect(()=>{ setAviso(null); setMenuDe(null); setPerg(null); setCapitalDe(null); setSalasDe(null); setSaidaDe(null); setConvite(null); setGradeAberta(null);
    setPessoaEd(null); setEstrutura(false); setContratoAberto(false); setSaqueAberto(false); setReloadAberto(false); setManualAberta(false); setPlanilha(null); },[secao]);
  const rodar=async(nome,args,okTexto)=>{
    setAviso(null);
    const {data,error}=await sb.rpc(nome,args);
    if(error){ setAviso({erro:true,texto:error.message||'Não deu certo.'}); return null; }
    if(okTexto) setAviso({erro:false,texto:okTexto});
    await Promise.all([carregar(),carregarResumo()]); return data??true;
  };
  if(!d) return <div style={{display:'grid',placeItems:'center',padding:60}}><div className="spin"/></div>;

  /* ---------- quem pode o quê (o banco confere de novo em cada ação) ---------- */
  const U=Object.fromEntries(d.unidades.map(u=>[u.id,u]));
  const posU=Object.fromEntries(d.unidades.map((u,i)=>[u.id,i]));   // posição na árvore (ordem das retas)
  const raiz=d.unidades.find(u=>!u.mae_id);
  const meus=d.eu?d.acessos.filter(a=>a.pessoa_id===d.eu.id):[];
  const pode=(cap,uid_)=>{ const t=U[uid_]; if(!t) return false;
    return meus.some(a=>{ const u=U[a.unidade_id]; return u&&String(t.caminho).startsWith(u.caminho)&&(a.capacidades.includes(cap)||a.capacidades.includes('administrar')); }); };
  const podeAlgum=cap=>d.unidades.some(u=>pode(cap,u.id));
  // painel do aluno é tela de desempenho: só pra quem vê desempenho da reta dele (financeiro tem a banca na lista)
  const verPainel=l=>l.status==='ativo'&&!!onVerJogador&&pode('ver_desempenho',l.unidade_id);
  const nomeUnidade=u=>u?`${u.nome}${u.rotulo?` · ${u.rotulo}`:''}`:'—';
  const caminhoNome=u=>{ const ids=String(u.caminho).split('/').filter(Boolean); return ids.map(i=>U[i]?.nome).filter(Boolean).slice(1).join(' › ')||u.nome; };
  const ativo=pid=>d.vinculos.find(v=>v.pessoa_id===pid&&!v.fim);
  const nomeDe=pid=>d.pessoas.find(p=>p.id===pid)?.nome||'—';
  const pessoaPorNome=n=>d.pessoas.find(p=>p.status!=='saiu'&&nomeIgual(p.nome,n));
  const urlConvite=t=>`${window.location.origin}/?convite=${t}`;
  const hoje=todayISO(), semana=addDaysISO(hoje,-6);
  const gradeEf=uid_=>gradeDoTorneio({unidade_id:uid_,entry_date:hoje},d.unidades,d.grades);
  // a regra que vale numa unidade (ela ou a de cima mais perto), com a origem; null = vale o padrão do time
  const regraComOrigem=(uid_,chave)=>{ const t=U[uid_]; if(!t) return null;
    return d.regras.filter(x=>x.chave===chave&&String(x.vigente_desde)<=hoje&&U[x.unidade_id]&&String(t.caminho).startsWith(U[x.unidade_id].caminho))
      .sort((a,b)=>U[b.unidade_id].caminho.length-U[a.unidade_id].caminho.length||(a.vigente_desde<b.vigente_desde?1:-1))[0]||null; };
  const regraEf=(uid_,chave)=>{ const r=regraComOrigem(uid_,chave); return r?r.valor:null; };
  const contratoEf=uid_=>{ const t=U[uid_]; if(!t) return null;
    return d.contratos.filter(c=>!c.pessoa_id&&c.unidade_id&&U[c.unidade_id]&&String(c.inicio||'')<=hoje&&String(t.caminho).startsWith(U[c.unidade_id].caminho))
      .sort((a,b)=>U[b.unidade_id].caminho.length-U[a.unidade_id].caminho.length||String(b.inicio).localeCompare(String(a.inicio))||String(b.criado_em).localeCompare(String(a.criado_em)))[0]||null; };
  const linhas=resumo||[];
  const linhaDe=pid=>linhas.find(l=>l.pessoa_id===pid);
  const unidadeDoTorneio=t=>t.unidade_id||GRADE_CTX.unidadeDe[String(t.player||'').trim().toLowerCase()]||null;
  // grade dos últimos 7 dias, por jogador: quantos fora / atenção
  const toursSemana=(tours||[]).filter(t=>String(t.entry_date)>=semana&&String(t.entry_date)<=hoje);
  const gradePorPessoa={}; const conferidos=[];
  toursSemana.forEach(t=>{ const sg=statusGrade(t,config); const p=t.pessoa_id||pessoaPorNome(t.player)?.id; if(!p) return;
    const g=gradePorPessoa[p]||(gradePorPessoa[p]={fora:0,atencao:0,n:0}); g.n++; if(sg.status==='fora') g.fora++; if(sg.status==='atencao') g.atencao++;
    if(sg.status!=='dentro') conferidos.push({t,sg,pessoa:p}); });
  const header=(titulo,acoes)=><div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
    <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,margin:0,flex:1,minWidth:180}}>{titulo}</h2>{acoes}</div>;
  const periodoChips=<div role="group" aria-label="Período" style={{display:'flex',gap:6}}>{[['mes','Este mês'],['30','30 dias'],['tudo','Tudo']].map(([k,r])=><Chip key={k} on={periodo===k} onClick={()=>setPeriodo(k)}>{r}</Chip>)}</div>;
  const podeConvidar=podeAlgum('gerir_pessoas');
  const btnConvidar=(ctx)=>podeConvidar&&<button data-convidar style={btnP} onClick={()=>setConvite(ctx||{})}>+ Convidar</button>;
  const avisoBox=aviso&&<div data-time-aviso={aviso.erro?'erro':'ok'} role="status" style={{background:aviso.erro?C.redSoft:C.greenSoft,color:aviso.erro?C.red:C.greenMid,borderRadius:12,padding:'11px 14px',fontSize:13.5,fontWeight:600}}>{aviso.texto}</div>;

  /* ---------- listas usadas em mais de uma tela ---------- */
  const paraDecidir=d.saques.filter(s=>['solicitado','aprovado'].includes(s.status)&&(!d.eu||s.pessoa_id!==d.eu.id)&&pode('aprovar_saques',s.unidade_id));
  const reloadsParaDecidir=d.reloads.filter(r=>['solicitado','aprovado'].includes(r.status)&&(!d.eu||r.pessoa_id!==d.eu.id)&&pode('aprovar_saques',r.unidade_id));
  const paraConferir=d.aberturas.filter(a=>a.status==='enviada'&&(!d.eu||a.pessoa_id!==d.eu.id)&&pode('aprovar_saques',a.unidade_id));
  const parados=linhas.filter(l=>l.status==='ativo'&&l.torneios!=null&&(l.ultimo_lancamento==null||diasDesde(l.ultimo_lancamento)>7));
  // stop loss batido (A-060): o semanal vem do servidor (base = banca do começo da semana); o diário, dos torneios de hoje
  const stops=linhas.filter(l=>l.status==='ativo'&&(!d.eu||l.pessoa_id!==d.eu.id)&&pode('ver_desempenho',l.unidade_id)).map(l=>{
    const sem=(d.stopSemana||[]).find(x=>x.pessoa_id===l.pessoa_id);
    const hojeRes=(tours||[]).filter(t=>t.entry_date===hoje&&(t.pessoa_id===l.pessoa_id||(!t.pessoa_id&&nomeIgual(t.player,l.nome)))).reduce((a,t)=>a+lucroTorneio(t),0);
    const slDia=stopDe(config||{},l.nome).dia*abiDoStop(config||{},l.nome,tours,hoje).valor;
    return (sem&&sem.bateu)||(slDia>0&&hojeRes<=-slDia)?{pessoa_id:l.pessoa_id,nome:l.nome}:null; }).filter(Boolean);
  // conferência de saldos que não bateu (a última de cada um): pendência de quem vê o dinheiro (A-012)
  const ultimaConf={}; (d.conferencias||[]).forEach(c=>{ if(!ultimaConf[c.pessoa_id]) ultimaConf[c.pessoa_id]=c; });
  const divergentes=Object.values(ultimaConf).filter(c=>c.diverge&&(!d.eu||c.pessoa_id!==d.eu.id)&&pode('ver_financeiro',c.unidade_id)&&linhas.some(l=>l.pessoa_id===c.pessoa_id&&l.status==='ativo'));
  const convidados=linhas.filter(l=>l.status==='convidado');
  const RELOAD_ROTULO={solicitado:'aguardando aprovação',aprovado:'aprovado · falta mandar',recusado:'recusado',cancelado:'cancelado',enviado:'enviado'};
  const contratoRaiz=raiz?d.contratos.filter(c=>c.unidade_id===raiz.id&&!c.pessoa_id).sort((a,b)=>String(b.criado_em).localeCompare(String(a.criado_em)))[0]:null;

  /* ---------- ações reaproveitadas ---------- */
  const moverJogador=(p,uAtual)=>{ const destinos=d.unidades.filter(x=>x.id!==uAtual&&x.mae_id&&pode('promover',x.id));
    if(!destinos.length) return setAviso({erro:true,texto:'Você não tem outra reta pra onde mover.'});
    const l=linhaDe(p.id), mk=l?mkDe(l.banca,l.mu):null, bloqueia=regraEf(uAtual,'bloquear_promocao_com_mk')===true;
    setPerg({label:`Mover ${p.nome}`,hint:(mk!=null&&mk<0?`Atenção: ${p.nome} está em MK (${fmtSinal(mk)}).${bloqueia?' Este time não promove com MK: o servidor vai recusar.':''} `:'')+'O histórico até hoje fica na reta atual; daqui pra frente conta na nova.',
      // começa na reta atual (marcada) e o Salvar só liga quando escolher outra
      kind:'select',opts:d.unidades.filter(x=>x.id===uAtual||destinos.includes(x)).map(x=>x.id===uAtual?`${caminhoNome(x)} (atual)`:caminhoNome(x)),
      valor:U[uAtual]?`${caminhoNome(U[uAtual])} (atual)`:caminhoNome(destinos[0]),exigeMudar:!!U[uAtual],
      onSave:async nome=>{ setPerg(null); const alvo=destinos.find(x=>caminhoNome(x)===nome); if(alvo) await rodar('mover_jogador',{p_alvo:p.id,p_destino:alvo.id,p_motivo:'promocao'},`${p.nome} agora está em ${alvo.nome}.`); }}); };
  const salasDoJogador=async p=>{ const {data,error}=await sb.rpc('salas_jogador',{p_pessoa:p.id}); if(error){ setAviso({erro:true,texto:error.message||'Não deu certo.'}); return null; } return data; };
  const capital=async p=>{ setAviso(null); const dados=await salasDoJogador(p); setCapitalDe({p,salas:(dados&&dados.salas)||[]}); };
  const verSalas=async p=>{ setAviso(null); const dados=await salasDoJogador(p); if(dados) setSalasDe({p,dados}); };
  const linkPessoal=async(p,u)=>{ const t=await rodar('criar_convite',{p_unidade:u,p_pessoa:p.id,p_dias:7,p_usos:null}); if(t&&typeof t==='string') setLink({titulo:`Link pessoal de ${p.nome}`,url:urlConvite(t),texto:`${p.nome}, seu convite pro time no GrinderBank:`}); };
  const renomear=p=>setPerg({label:`Nome de ${p.nome}`,hint:'Como aparece no time e nos lançamentos (os torneios dele acompanham a troca). Depois que ele entrar com a conta dele, o nome passa a ser dele.',kind:'text',valor:p.nome,
    onSave:async n=>{ setPerg(null); const nn=String(n||'').trim(); if(nn&&nn!==p.nome) await rodar('renomear_pessoa',{p_alvo:p.id,p_nome:nn},`Agora é ${nn}.`); }});
  const previaSaida=async(p,banca)=>{ const {data,error}=await sb.rpc('previa_saida',{p_pessoa:p.id,p_banca:banca??null});
    if(error){ setAviso({erro:true,texto:error.message||'Não deu certo.'}); return null; } return data; };
  const saida=async p=>{ setAviso(null); const pv=await previaSaida(p,null); if(pv) setSaidaDe({p,previa:pv}); };
  const gerarConvite=async({quem,reta,onde,joga,jogaEm,tipo,nome})=>{
    const chama=async(fn,args)=>{ const {data,error}=await sb.rpc(fn,args); if(error) throw new Error(error.message||'Não deu certo.'); return data; };
    try{
      let tok, titulo, texto, pessoa=null;
      if(quem==='jogador'&&tipo==='aberto'){ tok=await chama('criar_convite',{p_unidade:reta,p_pessoa:null,p_dias:7,p_usos:null});
        titulo=`Link aberto da ${U[reta]?.nome}`; texto=`Convite pra jogar na ${U[reta]?.nome} pelo GrinderBank:`; }
      else if(quem==='jogador'){ pessoa=await chama('convidar_jogador',{p_unidade:reta,p_nome:nome,p_nick_ps:null,p_id_gg:null});
        tok=await chama('criar_convite',{p_unidade:reta,p_pessoa:pessoa,p_dias:7,p_usos:null}); titulo=`Link pessoal de ${nome}`; texto=`${nome}, seu convite pro time no GrinderBank:`; }
      else { pessoa=await chama('convidar_equipe',{p_nome:nome,p_unidades:onde,p_caps:PACOTES[quem],p_joga_em:joga?jogaEm:null});
        tok=await chama('criar_convite',{p_unidade:onde[0],p_pessoa:pessoa,p_dias:7,p_usos:null}); titulo=`Convite de ${PAPEL_ROT[quem].toLowerCase()} pra ${nome}`; texto=`${nome}, seu convite pra gestão do time no GrinderBank:`; }
      await Promise.all([carregar(),carregarResumo()]);
      return {titulo,url:urlConvite(tok),texto};
    }catch(e){ return {erro:e.message}; }
  };

  /* ================= MEU TIME (jogador) ================= */
  // jogador: "meu" é a reta (regras, grade, contrato); "dinheiro" (dentro da Banca) é MU, planilha, saque, reload e salas (A-058)
  if(secao==='meu'||secao==='dinheiro'){
    const soDinheiro=secao==='dinheiro';
    const meusSaques=d.eu?d.saques.filter(s=>s.pessoa_id===d.eu.id):[];
    const meusReloads=d.eu?d.reloads.filter(r=>r.pessoa_id===d.eu.id):[];
    const minhaAbertura=d.eu?d.aberturas.find(a=>a.pessoa_id===d.eu.id):null;
    const minhaGrade=(minhaAbertura?.planilha?.grade)||[];
    const minhaUnidade=d.eu?ativo(d.eu.id)?.unidade_id:null;
    const minhaGradeReta=minhaUnidade?gradeEf(minhaUnidade):null;
    const mk=d.sit?mkDe(banca,d.sit.mu):null;
    const saqueAberto_=meusSaques.some(s=>['solicitado','aprovado'].includes(s.status)), reloadAberto_=meusReloads.some(r=>['solicitado','aprovado'].includes(r.status));
    return <div className={soDinheiro?undefined:'ftfade'} data-secao-time={secao} style={{display:'flex',flexDirection:'column',gap:16}}>
      {!soDinheiro&&header('Meu time')}
      {avisoBox}
      {!soDinheiro&&!d.sit&&<Card style={{padding:20}}><div style={{fontWeight:700}}>Você ainda não está numa reta do time.</div><div style={{fontSize:13,color:C.inkSoft,marginTop:4}}>Peça o link de convite da sua reta pro professor.</div></Card>}
      {!soDinheiro&&d.sit&&<Card data-minha-reta style={{padding:20}}>
        <h3 style={tituloS}>Sua reta{minhaUnidade?<span style={{fontSize:14,color:C.inkSoft,fontWeight:500}}> · {nomeUnidade(U[minhaUnidade])}</span>:null}</h3>
        <div style={{fontSize:13.5,color:C.inkSoft,lineHeight:1.55}}>Contrato: {faixasTexto(d.sit.contrato)}</div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginTop:10}}><span style={{fontSize:13,color:C.inkSoft,flex:1,minWidth:200}}>MU, planilha de abertura, saque, reload e salas ficam na Banca.</span>
          {onIr&&<button style={btnS} onClick={()=>onIr('banca')}>Ir pra Banca</button>}</div>
      </Card>}
      {soDinheiro&&d.sit&&<Card data-meu-dinheiro style={{padding:20}}>
        <h3 style={tituloS}>Seu dinheiro no time{minhaUnidade?<span style={{fontSize:14,color:C.inkSoft,fontWeight:500}}> · {nomeUnidade(U[minhaUnidade])}</span>:null}</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>
          <div><div style={labelStyle}>MU (capital do time)</div><div data-mu style={{fontWeight:800,fontSize:20}}>{fmt(d.sit.mu)}</div></div>
          <div><div style={labelStyle}>{mk!=null&&mk<0?'Make-up':'Profit'}</div><div data-meu-mk style={{fontWeight:800,fontSize:20,color:mk==null?C.ink:mk<0?'#7a5a1f':C.greenMid}}>{mk==null?'—':(mk<0?`MK ${fmtSinal(mk)}`:fmtSinal(mk))}</div></div>
          {/* lifetime como na planilha do Samba: o que já sacou + o profit de agora (a relação total com o time) */}
          <div><div style={labelStyle}>Lifetime no time</div><div data-lifetime style={{fontWeight:800,fontSize:20}}>{mk==null?fmt(d.sit.lifetime):fmtSinal(cent(num(d.sit.lifetime)+mk))}</div>
            <div style={{fontSize:12,color:C.inkSoft}}>já sacado {fmt(d.sit.lifetime)}{mk!=null?` · profit agora ${fmtSinal(mk)}`:''}</div></div>
        </div>
        {mk!=null&&<div style={{fontSize:12.5,color:mk<0?'#7a5a1f':C.greenMid,fontWeight:600,marginTop:6}}>{mk<0?'Em MK: a banca está abaixo do capital do time. Saque de lucro só depois de sair do MK.':'Fora de MK: dá pra pedir saque.'}</div>}
        <div style={{fontSize:12.5,color:C.inkSoft,marginTop:8}}>Contrato: {faixasTexto(d.sit.contrato)}</div>
        {minhaAbertura?.status==='confirmada'
          ?<div data-abertura="confirmada" style={{fontSize:12.5,color:C.greenMid,fontWeight:600,marginTop:6}}>Planilha conferida pelo time em {dataBR(minhaAbertura.confirmado_em)}.</div>
          :<div style={{marginTop:10}}>
            {minhaAbertura&&<div data-abertura="enviada" style={{fontSize:12.5,color:C.gold,fontWeight:600,marginBottom:6}}>Planilha enviada em {dataBR(minhaAbertura.enviado_em)}: aguardando o time conferir. Até lá o MU e o lucro sacado dela não contam.</div>}
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <label style={{...btnS,display:'inline-block'}}>{minhaAbertura?'Enviar a planilha de novo':'Importar planilha (modelo do time)'}
                <input type="file" accept=".xlsx" data-importar-planilha style={{display:'none'}} onChange={e=>{ lerPlanilha(e.target.files&&e.target.files[0]); e.target.value=''; }}/></label>
              <button data-abertura-manual style={btnS} onClick={()=>setManualAberta(true)}>Preencher à mão</button></div>
          </div>}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}>
          <button disabled={saqueAberto_||!d.sit.contrato} onClick={()=>setSaqueAberto(true)} style={{...btnP,padding:'12px 18px',fontSize:14.5,opacity:saqueAberto_||!d.sit.contrato?.5:1}}>Pedir saque</button>
          <button data-pedir-reload disabled={reloadAberto_} onClick={()=>setReloadAberto(true)} style={{...btnS,padding:'12px 18px',fontSize:14.5,opacity:reloadAberto_?.5:1}}>Pedir reload</button>
        </div>
        {/* aqui só o que está em andamento ou foi recusado há pouco: o que já virou dinheiro está no histórico da Banca */}
        {meusReloads.filter(r=>['solicitado','aprovado'].includes(r.status)||(['recusado','cancelado'].includes(r.status)&&diasDesde(r.decidido_em||r.solicitado_em)<=30)).slice(0,3).map(r=><div key={r.id} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',padding:'8px 0',borderTop:`1px solid ${C.border}`,fontSize:13,marginTop:6}}>
          <div style={{flex:1,minWidth:160}}>{dataBR(r.solicitado_em)} · reload {fmt(r.status==='enviado'?r.enviado_valor:r.valor)}{r.sala?` · ${r.sala}`:''}</div>
          <span style={{fontWeight:700,color:r.status==='enviado'?C.greenMid:r.status==='recusado'?C.red:C.gold}}>{RELOAD_ROTULO[r.status]}{r.motivo_recusa?` · ${r.motivo_recusa}`:''}</span>
          {r.status==='solicitado'&&<button style={btnS} onClick={()=>rodar('cancelar_reload',{p_id:r.id},'Pedido de reload cancelado.')}>Cancelar</button>}
        </div>)}
        {meusSaques.length>0&&<div style={{marginTop:10}}>{meusSaques.filter(s=>['solicitado','aprovado'].includes(s.status)||(['recusado','cancelado'].includes(s.status)&&diasDesde(s.decidido_em||s.solicitado_em)<=30)).slice(0,6).map(s=><div key={s.id} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',padding:'8px 0',borderTop:`1px solid ${C.border}`,fontSize:13}}>
          <div style={{flex:1,minWidth:160}}>{dataBR(s.solicitado_em)} · MU {fmt(s.devolucao)} + cashout {fmt(s.cashout)} → time {fmt(s.total_time)}, você {fmt(s.parte_jogador)}</div>
          <span style={{fontWeight:700,color:s.status==='pago'?C.greenMid:s.status==='recusado'?C.red:C.gold}}>{SAQUE_ROTULO[s.status]}{s.status==='pago'&&Number(s.diferenca)?` · diferença ${fmt(s.diferenca)}`:''}{s.motivo?` · ${s.motivo}`:''}</span>
          {s.status==='solicitado'&&<button style={btnS} onClick={()=>rodar('cancelar_saque',{p_id:s.id},'Pedido cancelado.')}>Cancelar</button>}
        </div>)}</div>}
      </Card>}
      {soDinheiro&&d.salasEu&&<Card style={{padding:20}} data-minhas-salas>
        <h3 style={tituloS}>Saldo de cada sala agora</h3>
        <div style={{fontSize:12.5,color:C.inkSoft,marginTop:-4,marginBottom:6}}>O que o sistema calcula hoje: saldo de entrada + jogos + movimentos + capital e reload − saques.</div>
        {(d.salasEu.salas||[]).length===0&&<div style={{fontSize:13.5,color:C.inkSoft}}>Nenhuma sala ainda. Elas aparecem com a planilha conferida, com o capital do time ou com os torneios de cada site.</div>}
        {(d.salasEu.salas||[]).map(s=>{ const r=conf&&conf.resultado&&(conf.resultado.salas||[]).find(x=>x.chave===s.chave);
          return <div key={s.chave||'sem'} data-minha-sala={s.sala} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderTop:`1px solid ${C.border}`,fontSize:13.5}}>
            <span style={{flex:1,color:s.chave?C.ink:C.inkSoft}}>{s.chave?s.sala:'Sem sala (capital ou saque antigo)'}</span>
            <span style={{color:C.inkSoft,fontSize:12}}>sistema</span><b style={{minWidth:90,textAlign:'right'}}>{fmt(s.saldo)}</b>
            {conf&&!conf.resultado&&s.chave&&<input data-conferir-sala={s.sala} aria-label={`Saldo agora em ${s.sala}`} style={{...inputStyle,width:110,padding:'7px 10px'}} inputMode="decimal" placeholder="saldo agora"
              value={conf.valores[s.chave]??''} onChange={e=>{ const v=e.target.value; setConf(c=>({...c,valores:{...c.valores,[s.chave]:v}})); }}/>}
            {r&&r.diferenca!=null&&<span data-sala-diferenca={s.sala} style={{fontWeight:700,color:Math.abs(Number(r.diferenca))>1?C.red:C.greenMid,minWidth:80,textAlign:'right'}}>{Math.abs(Number(r.diferenca))>1?fmtSinal(Number(r.diferenca)):'bateu'}</span>}
          </div>; })}
        <div style={{display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:800,padding:'8px 0 0'}}><span>Total (banca)</span><span>{fmt(d.salasEu.total)}</span></div>
        {conf&&conf.resultado&&<div data-conferencia-resultado style={{marginTop:8,fontSize:13,fontWeight:600,color:conf.resultado.diverge?C.red:C.greenMid}}>
          {conf.resultado.diverge?`Lançado ${fmt(conf.resultado.total_informado)} · sistema ${fmt(conf.resultado.total_sistema)} (${fmtSinal(Number(conf.resultado.diferenca))}). O time foi avisado; confira torneios e movimentos das salas em vermelho.`:'Bateu com o sistema.'}</div>}
        {!conf&&d.salasEu.ultima_conferencia&&(()=>{ const uc=d.salasEu.ultima_conferencia, difs=(Array.isArray(uc.salas)?uc.salas:[]).filter(x=>Math.abs(Number(x.diferenca)||0)>=0.01);
          // diz quanto e onde (A-054): "GG Poker: US$ 15,00 a mais"
          return <div data-ultima-conferencia style={{fontSize:12.5,color:uc.diverge?C.red:C.inkSoft,fontWeight:uc.diverge?600:400,marginTop:6,lineHeight:1.5}}>Última conferência: {dataBR(uc.criado_em)} · {uc.diverge
            ?<>não bateu. {difs.map(x=>`${x.sala}: ${fmt(Math.abs(Number(x.diferenca)))} a ${Number(x.diferenca)>0?'mais':'menos'} que o sistema`).join(' · ')}. O time foi avisado: confira os torneios e movimentos dessas salas.</>:'bateu.'}</div>; })()}
        <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
          {!conf&&(d.salasEu.salas||[]).some(s=>s.chave)&&<button data-conferir-saldos style={btnS} onClick={()=>setConf({valores:{},resultado:null})}>Conferir saldos</button>}
          {conf&&!conf.resultado&&<button data-enviar-conferencia style={btnP} onClick={async()=>{
            const saldos=(d.salasEu.salas||[]).filter(s=>s.chave&&String(conf.valores[s.chave]??'').trim()!=='').map(s=>({sala:s.sala,saldo:cent(parseValor(conf.valores[s.chave]))}));
            if(!saldos.length) return setAviso({erro:true,texto:'Lance o saldo de pelo menos uma sala.'});
            setAviso(null); const {data,error}=await sb.rpc('conferir_saldos',{p_saldos:saldos});
            if(error) return setAviso({erro:true,texto:error.message||'Não deu certo.'}); setConf(c=>({...c,resultado:data})); }}>Comparar com o sistema</button>}
          {conf&&<button style={btnS} onClick={()=>{ setConf(null); carregar(); }}>{conf.resultado?'Fechar':'Cancelar'}</button>}
        </div>
      </Card>}
      {!soDinheiro&&minhaUnidade&&<Card style={{padding:20}} data-minhas-regras>
        <h3 style={tituloS}>Regras da sua reta</h3>
        {REGRAS_RETA.filter(rr=>rr.k!=='bloquear_promocao_com_mk').map(rr=>{ const r=regraComOrigem(minhaUnidade,rr.k), v=r?r.valor:rr.padrao(config||{});
          return <div key={rr.k} data-minha-regra={rr.k} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'5px 0',borderTop:`1px solid ${C.border}`,fontSize:13.5}}><span style={{color:C.inkSoft}}>{rr.rot}</span><b>{rr.txt(v)}</b></div>; })}
      </Card>}
      {!soDinheiro&&minhaGradeReta&&<Card style={{padding:20}}>
        <h3 style={tituloS}>Grade da {U[minhaGradeReta.unidade_id]?.nome||'reta'} {minhaGradeReta.simulada?<Tag tom="warn">simulada</Tag>:<Tag tom="ok">oficial</Tag>}</h3>
        {minhaGradeReta.simulada&&<div data-grade-simulada style={{background:C.goldSoft,color:'#6b4e1a',borderRadius:12,padding:'10px 12px',fontSize:13,fontWeight:700,marginBottom:10,lineHeight:1.5}}>Grade simulada: montada sem a planilha oficial desta reta. Confirme com o professor antes de seguir à risca.</div>}
        <GradeTabela celulas={minhaGradeReta.celulas||[]}/>
        <div style={{fontSize:11.5,color:C.inkSoft,marginTop:8}}>Vale desde {dataBR(minhaGradeReta.vigente_desde)}{minhaGradeReta.unidade_id!==minhaUnidade?` (da ${U[minhaGradeReta.unidade_id]?.nome}, vale pra ${U[minhaUnidade]?.nome})`:''}. Cada torneio lançado é conferido com ela.</div>
      </Card>}
      {!soDinheiro&&!minhaGradeReta&&minhaGrade.length>0&&<Card style={{padding:20}}>
        <h3 style={tituloS}>Minha grade</h3>
        <GradeTabela celulas={minhaGrade}/>
        <div style={{fontSize:11.5,color:C.inkSoft,marginTop:8}}>Da planilha enviada em {dataBR(minhaAbertura?.enviado_em)}. As regras valem como o time definiu na planilha.</div>
      </Card>}
      <Portal>
      {perg&&<QuickEditModal label={perg.label} hint={perg.hint} kind={perg.kind} opts={perg.opts} currentValue={perg.valor} exigeMudar={perg.exigeMudar} onClose={()=>setPerg(null)} onSave={perg.onSave}/>}
      {reloadAberto&&<ReloadModal salas={d.salasEu?.salas} onClose={()=>setReloadAberto(false)} onPedir={async a=>{ const r=await rodar('pedir_reload',a,'Pedido de reload enviado. O time foi avisado.'); if(r) setReloadAberto(false); }}/>}
      {planilha&&<PlanilhaModal p={planilha} onClose={()=>setPlanilha(null)} onEnviar={async()=>{ const r=await rodar('enviar_planilha',{p_planilha:planilha},'Planilha enviada. Agora o time confere os valores.'); if(r) setPlanilha(null); }}/>}
      {manualAberta&&d.eu&&<PlanilhaManualModal nome={d.eu.nome} salas={d.salasEu?.salas} onClose={()=>setManualAberta(false)} onPronto={p=>{ setManualAberta(false); setPlanilha(p); }}/>}
      {saqueAberto&&d.eu&&<SaqueModal pessoa={d.eu.id} salas={d.salasEu?.salas} onClose={()=>setSaqueAberto(false)} onPedir={async a=>{ const r=await rodar('solicitar_saque',a,'Pedido de saque enviado. Aguarde a aprovação do time.'); if(r) setSaqueAberto(false); }}/>}
      </Portal>
    </div>;
  }

  /* ================= GESTÃO ================= */
  const souAdmin=!!(raiz&&pode('administrar',raiz.id));
  const modais=<>
    {capitalDe&&<CapitalModal nome={capitalDe.p.nome} salas={capitalDe.salas} onClose={()=>setCapitalDe(null)}
      onSalvar={async({valor,sala})=>{ const p=capitalDe.p; const r=await rodar('registrar_aporte',{p_pessoa:p.id,p_valor:valor,p_data:todayISO(),p_obs:null,p_sala:sala},`Capital de ${fmt(valor)} registrado pra ${p.nome} (${sala}).`); if(r) setCapitalDe(null); }}/>}
    {salasDe&&<SalasModal nome={salasDe.p.nome} dados={salasDe.dados} onClose={()=>setSalasDe(null)}/>}
    {saidaDe&&<SaidaModal nome={saidaDe.p.nome} previa={saidaDe.previa} onClose={()=>setSaidaDe(null)}
      onBanca={async b=>{ const pv=await previaSaida(saidaDe.p,b); if(pv) setSaidaDe(x=>x&&{...x,previa:pv}); }}
      onConfirmar={async({banca,recebido})=>{ const p=saidaDe.p; const r=await rodar('registrar_saida',{p_alvo:p.id,p_banca:banca,p_recebido:recebido,p_obs:null},
        `Saída de ${p.nome} registrada. O histórico dele foi pra conta individual nova; o acerto está no Financeiro.`); if(r) setSaidaDe(null); }}/>}
    {perg&&<QuickEditModal label={perg.label} hint={perg.hint} kind={perg.kind} opts={perg.opts} currentValue={perg.valor} exigeMudar={perg.exigeMudar} onClose={()=>setPerg(null)} onSave={perg.onSave}/>}
    {convite&&<ConviteModal unidades={d.unidades} podeGerir={u=>pode('gerir_pessoas',u)} podeAdmin={u=>pode('administrar',u)} inicial={convite} nomeUnidade={nomeUnidade} onGerar={gerarConvite} onClose={()=>setConvite(null)}/>}
    {gradeAberta&&U[gradeAberta]&&(()=>{ const u=U[gradeAberta], g=gradeEf(u.id);
      const planilhas=d.aberturas.filter(a=>a.planilha&&Array.isArray(a.planilha.grade)&&a.planilha.grade.length&&U[a.unidade_id]&&String(U[a.unidade_id].caminho).startsWith(u.caminho))
        .map(a=>({nome:nomeDe(a.pessoa_id),grade:a.planilha.grade}));
      return <GradeModal u={u} efetiva={g} origem={g?U[g.unidade_id]:null} podeEditar={pode('configurar_regras',u.id)} planilhas={planilhas}
        historico={d.grades.filter(x=>x.unidade_id===u.id).sort((a,b)=>String(b.vigente_desde).localeCompare(String(a.vigente_desde)))} onClose={()=>setGradeAberta(null)}
        onSalvar={async({desde,simulada,celulas,obs})=>{ const r=await rodar('salvar_grade',{p_unidade:u.id,p_desde:desde,p_simulada:simulada,p_celulas:celulas,p_obs:obs||null},`Grade de ${u.nome} salva. Os jogadores dela foram avisados.`); if(r) setGradeAberta(null); }}
        onApagar={async h=>{ await rodar('apagar_grade',{p_id:h.id},'Versão da grade apagada.'); }}/>; })()}
    {pessoaEd&&<PessoaModal p={pessoaEd} unidades={d.unidades} podeAdmin={u=>pode('administrar',u)} nomeUnidade={nomeUnidade} onClose={()=>setPessoaEd(null)}
      souEu={pessoaEd.user_id===uid} ultimoAdmin={pessoaEd.papel==='admin'&&!!raiz&&new Set(d.acessos.filter(a=>a.unidade_id===raiz.id&&(a.capacidades||[]).includes('administrar')
        &&d.pessoas.some(x=>x.id===a.pessoa_id&&x.status!=='saiu')).map(a=>a.pessoa_id)).size<=1}
      onLink={pessoaEd.status==='convidado'?()=>{ const p=pessoaEd; setPessoaEd(null); linkPessoal(p,p.unidades[0]); }:null}
      onSalvar={async({nome,caps,unidades})=>{ const p=pessoaEd; setPessoaEd(null);
        if(nome!==p.nome){ const r=await rodar('renomear_pessoa',{p_alvo:p.id,p_nome:nome}); if(!r) return; }
        await rodar('definir_papel',{p_alvo:p.id,p_unidades:unidades,p_caps:caps},`${nome}: ${PAPEL_ROT[papelDe(caps)]||'papel'} salvo.`); }}
      onRemover={()=>{ const p=pessoaEd; setPessoaEd(null); setPerg({label:p.joga?`Tirar ${p.nome} da gestão`:`Tirar ${p.nome} do time`,hint:p.joga?'Ele continua jogando na reta dele, só perde o papel na gestão. Digite TIRAR pra confirmar.':'Ele perde o acesso ao time. Digite TIRAR pra confirmar.',kind:'text',valor:'',
        onSave:async t=>{ setPerg(null); if(String(t).trim().toUpperCase()==='TIRAR') await rodar('definir_papel',{p_alvo:p.id,p_unidades:null,p_caps:null},`${p.nome} saiu da gestão.`); }}); }}/>}
    {estrutura&&<EstruturaModal unidades={d.unidades} podeAdmin={u=>pode('administrar',u)} onClose={()=>setEstrutura(false)}
      ocupada={u=>new Set([...d.vinculos.filter(v=>!v.fim&&v.unidade_id===u.id).map(v=>v.pessoa_id),...d.acessos.filter(a=>a.unidade_id===u.id).map(a=>a.pessoa_id)]
        .filter(pid=>d.pessoas.some(x=>x.id===pid&&x.status!=='saiu'))).size}
      onCriar={u=>setPerg({label:`Nova unidade dentro de ${u.nome}`,hint:'Ex.: Pandeiro, Reco-reco, Turma A.',kind:'text',valor:'',
        onSave:async nome=>{ setPerg(null); if(nome) await rodar('criar_unidade',{p_mae:u.id,p_nome:nome,p_rotulo:null,p_ordem:0},`${nome} criada.`); }})}
      onRenomear={u=>setPerg({label:`Renomear ${u.nome}`,hint:'Nome e, se quiser, o rótulo depois de ";" (ex.: Banjo;Reta 3).',kind:'text',valor:u.rotulo?`${u.nome};${u.rotulo}`:u.nome,
        onSave:async t=>{ setPerg(null); const [n,r]=String(t||'').split(';'); if(n&&n.trim()) await rodar('renomear_unidade',{p_alvo:u.id,p_nome:n.trim(),p_rotulo:(r||'').trim()||null},'Unidade renomeada.'); }})}
      onArquivar={u=>setPerg({label:`Arquivar ${u.nome}`,hint:'Só funciona com a unidade vazia. Digite ARQUIVAR pra confirmar.',kind:'text',valor:'',
        onSave:async t=>{ setPerg(null); if(String(t).trim().toUpperCase()==='ARQUIVAR') await rodar('arquivar_unidade',{p_alvo:u.id},`${u.nome} arquivada.`); }})}/>}
    {contratoAberto&&raiz&&(()=>{ const alvo=contratoAberto===true?raiz:U[contratoAberto]; if(!alvo) return null;
      return <ContratoModal atual={(alvo.id===raiz.id?contratoRaiz:contratoEf(alvo.id))?.faixas} titulo={alvo.id===raiz.id?'Contrato do time':`Contrato da ${alvo.nome}`} onClose={()=>setContratoAberto(false)}
        onSalvar={async(faixas,ini)=>{ const r=await rodar('definir_contrato',{p_unidade:alvo.id,p_pessoa:null,p_faixas:faixas,p_inicio:ini||todayISO()},'Contrato salvo.'); if(r) setContratoAberto(false); }}/>; })()}
  </>;
  const linkBox=link&&<LinkPronto titulo={link.titulo} url={link.url} texto={link.texto} onFechar={()=>setLink(null)}/>;

  /* ---------- VISÃO GERAL ---------- */
  if(secao==='g_visao'){
    const vis=linhas.filter(l=>l.status!=='convidado');
    const soma=(ls,k)=>{ const v=ls.map(l=>l[k]).filter(x=>x!=null); return v.length?v.reduce((a,b)=>a+Number(b),0):null; };
    const temPerf=vis.some(l=>l.torneios!=null), temDin=vis.some(l=>l.banca!=null);
    const torn=soma(vis,'torneios'), inv=soma(vis,'investido'), luc=soma(vis,'lucro');
    const emMk=vis.filter(l=>mkDe(l.banca,l.mu)!=null&&mkDe(l.banca,l.mu)<0).length;
    // ABI por entrada (reentry conta), igual ao do aluno: a média do grupo pesa pelas entradas de cada um
    const pesoAbi=l=>Number(l.entradas??l.torneios)||0;
    const abiPond=(()=>{ const ls=vis.filter(l=>l.abi!=null&&pesoAbi(l)); const n=ls.reduce((a,l)=>a+pesoAbi(l),0); return n?ls.reduce((a,l)=>a+Number(l.abi)*pesoAbi(l),0)/n:null; })();
    const foraTot=Object.values(gradePorPessoa).reduce((a,g)=>a+g.fora,0), foraAlunos=Object.values(gradePorPessoa).filter(g=>g.fora>0).length;
    const porReta=Object.values(vis.reduce((m,l)=>{ const k=l.unidade_id; (m[k]||(m[k]={u:U[k],ls:[]})).ls.push(l); return m; },{}))
      .filter(x=>x.u).sort((a,b)=>posU[a.u.id]-posU[b.u.id]);
    const pend=[
      ...(paraDecidir.filter(s=>s.status==='solicitado').length?[{n:paraDecidir.filter(s=>s.status==='solicitado').length,t:'Saques para aprovar',ir:'g_financeiro',tom:'warn'}]:[]),
      ...(paraDecidir.filter(s=>s.status==='aprovado').length?[{n:paraDecidir.filter(s=>s.status==='aprovado').length,t:'Saques aprovados esperando o dinheiro chegar',ir:'g_financeiro',tom:'warn'}]:[]),
      ...(reloadsParaDecidir.length?[{n:reloadsParaDecidir.length,t:'Reloads pedidos',ir:'g_financeiro',tom:'warn'}]:[]),
      ...(paraConferir.length?[{n:paraConferir.length,t:'Planilhas para conferir',ir:'g_financeiro',tom:'warn'}]:[]),
      ...(parados.length?[{n:parados.length,t:'Alunos sem lançar há mais de 7 dias',ir:'g_jogadores',sit:'parados',tom:'bad'}]:[]),
      ...(stops.length?[{n:stops.length,t:`Bateram o stop loss: ${stops.slice(0,3).map(x=>x.nome).join(', ')}${stops.length>3?'…':''}`,ir:'g_jogadores',sit:'stop',tom:'bad'}]:[]),
      ...(divergentes.length?[{n:divergentes.length,t:`Conferência de saldos com diferença: ${divergentes.slice(0,3).map(c=>nomeDe(c.pessoa_id)).join(', ')}${divergentes.length>3?'…':''}`,ir:'g_financeiro',tom:'bad'}]:[]),
      ...(convidados.length&&podeConvidar?[{n:convidados.length,t:'Convites ainda não aceitos',ir:'g_jogadores',sit:'convidados',tom:'plum'}]:[]),
      ...((d.pedidos||[]).length&&podeAlgum('gerir_pessoas')?[{n:d.pedidos.length,t:'Pedidos pra entrar no time',ir:'g_equipe',tom:'plum'}]:[]),
    ];
    return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
      {header(raiz&&meus.some(a=>a.unidade_id===raiz.id)?'Visão geral':'Minhas retas',<>{periodoChips}{btnConvidar()}</>)}
      {avisoBox}{linkBox}
      {resumo==null?<Card style={{padding:30,display:'grid',placeItems:'center'}}><div className="spin"/></Card>:<>
      <div data-kpis style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>
        <Kpi rot="Alunos ativos" val={vis.length} sub={temPerf?(parados.length?`${parados.length} sem lançar há 7+ dias`:'todos lançando'):null}/>
        {temPerf&&<Kpi rot="Torneios" val={(torn||0).toLocaleString('pt-BR')} sub={abiPond!=null?`ABI médio ${fmt(abiPond)}`:null}/>}
        {temPerf&&<Kpi rot="Resultado" val={luc==null?'—':fmtSinal(luc)} tom={luc>0?'ok':luc<0?'bad':null} sub={inv>0?`ROI ${pctFmt(luc/inv*100)}`:null}/>}
        {temPerf&&<Kpi data-kpi-fora rot="Fora da grade · 7 dias" val={`${foraTot} torneio${foraTot!==1?'s':''}`} tom={foraTot?'bad':'ok'} sub={foraTot?`de ${foraAlunos} aluno${foraAlunos!==1?'s':''} · ver quais`:'tudo dentro'}
          onClick={foraTot?()=>{ setFiltro({reta:null,sit:'fora',busca:''}); onIr('g_jogadores'); }:null}/>}
        {!temPerf&&temDin&&<Kpi rot="Banca dos alunos" val={fmt(soma(vis,'banca')||0)} sub="todas as salas"/>}
        {!temPerf&&temDin&&<Kpi rot="Em MK" val={`${emMk} aluno${emMk!==1?'s':''}`} tom={emMk?'warn':'ok'} sub={emMk?'banca abaixo do MU':'ninguém em MK'}/>}
      </div>
      <Card style={{padding:20}}>
        <h3 style={tituloS}>Pendências</h3>
        {pend.length===0&&<div style={{fontSize:14,color:C.inkSoft}}>Nada pendente agora.</div>}
        {pend.length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:10}}>
          {pend.map((p,i)=><button key={i} data-pendencia={p.t} aria-label={`${p.n}: ${p.t}`} onClick={()=>{ if(p.sit) setFiltro(f=>({...f,sit:p.sit,reta:null})); onIr(p.ir); }} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:14,border:`1px solid ${C.border}`,background:C.warm,cursor:'pointer',textAlign:'left',font:'inherit',color:C.ink}}>
            <Tag tom={p.tom}>{p.n}</Tag><span style={{flex:1,fontSize:14,lineHeight:1.35}}>{p.t}</span><span aria-hidden="true" style={{color:P,fontWeight:800}}>›</span></button>)}
        </div>}
      </Card>
      <div>
        <Card style={{padding:20,minWidth:0}}>
          <h3 style={tituloS}>Por reta</h3>
          {!porReta.length&&<div style={{fontSize:14,color:C.inkSoft}}>Nenhum aluno com vínculo ainda. Use <b>+ Convidar</b> pra chamar os jogadores.</div>}
          {porReta.length>0&&celular&&<div data-por-reta-cartoes style={{display:'flex',flexDirection:'column',gap:8}}>
            {porReta.map(({u,ls})=>{ const i_=soma(ls,'investido'), l_=soma(ls,'lucro'), n_=soma(ls,'torneios'), fora=ls.reduce((a,l)=>a+(gradePorPessoa[l.pessoa_id]?.fora||0),0), g=gradeEf(u.id);
              return <button key={u.id} data-reta={u.nome} onClick={()=>{ setFiltro({reta:u.id,sit:null,busca:''}); onIr('g_jogadores'); }} style={{textAlign:'left',font:'inherit',color:C.ink,background:C.warm,border:`1px solid ${C.border}`,borderRadius:14,padding:'11px 13px',cursor:'pointer'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}><b>{u.nome}</b>{u.rotulo&&<span style={{color:C.inkSoft,fontSize:12.5}}>· {u.rotulo}</span>}{g&&g.simulada&&<Tag tom="warn">grade simulada</Tag>}<span style={{marginLeft:'auto',color:P,fontWeight:800}} aria-hidden="true">›</span></div>
                <div style={{fontSize:12.5,color:C.inkSoft,marginTop:4,lineHeight:1.5}}>{ls.length} aluno{ls.length!==1?'s':''}{temPerf?<> · {n_??0} torneios · <span style={{color:l_>0?C.greenMid:l_<0?C.red:C.inkSoft,fontWeight:700}}>{l_==null?'—':fmtSinal(l_)}</span>{i_>0?` · ROI ${pctFmt(l_/i_*100)}`:''} · <span style={{color:fora?C.red:C.inkSoft,fontWeight:fora?700:400}}>{fora} fora da grade</span></>:null}</div></button>; })}
          </div>}
          {porReta.length>0&&!celular&&<div style={{overflowX:'auto'}}><table data-por-reta style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>{['Reta','Alunos',...(temPerf?['Torneios','ABI','ROI','Resultado','Fora da grade']:[])].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{porReta.map(({u,ls})=>{ const i_=soma(ls,'investido'), l_=soma(ls,'lucro'), n_=soma(ls,'torneios');
              const ab=(()=>{ const x=ls.filter(l=>l.abi!=null&&pesoAbi(l)); const n=x.reduce((a,l)=>a+pesoAbi(l),0); return n?x.reduce((a,l)=>a+Number(l.abi)*pesoAbi(l),0)/n:null; })();
              const fora=ls.reduce((a,l)=>a+(gradePorPessoa[l.pessoa_id]?.fora||0),0); const g=gradeEf(u.id);
              return <tr key={u.id} data-reta={u.nome} onClick={()=>{ setFiltro({reta:u.id,sit:null,busca:''}); onIr('g_jogadores'); }} style={{cursor:'pointer'}}>
                <td style={tdS}><b>{u.nome}</b>{u.rotulo&&<span style={{color:C.inkSoft}}> · {u.rotulo}</span>} {g&&g.simulada&&<Tag tom="warn">grade simulada</Tag>}</td>
                <td style={tdS}>{ls.length}</td>
                {temPerf&&<><td style={tdS}>{n_??'—'}</td><td style={tdS}>{ab!=null?fmt(ab):'—'}</td>
                  <td style={{...tdS,color:l_>0?C.greenMid:l_<0?C.red:C.ink}}>{i_>0?pctFmt(l_/i_*100):'—'}</td><td style={{...tdS,color:l_>0?C.greenMid:l_<0?C.red:C.ink}}>{l_==null?'—':fmtSinal(l_)}</td>
                  <td style={{...tdS,color:fora?C.red:C.ink,fontWeight:fora?700:400}}>{fora}</td></>}</tr>; })}
              {porReta.length>1&&<tr><td style={{...tdS,fontWeight:800}}>Total</td><td style={{...tdS,fontWeight:800}}>{vis.length}</td>
                {temPerf&&<><td style={{...tdS,fontWeight:800}}>{torn==null?'—':Number(torn).toLocaleString('pt-BR')}</td><td style={{...tdS,fontWeight:800}}>{abiPond!=null?fmt(abiPond):'—'}</td>
                  <td style={{...tdS,fontWeight:800}}>{inv>0?pctFmt(luc/inv*100):'—'}</td><td style={{...tdS,fontWeight:800}}>{luc==null?'—':fmtSinal(luc)}</td>
                  <td style={{...tdS,fontWeight:800}}>{foraTot}</td></>}</tr>}
            </tbody></table></div>}
          <div style={{fontSize:12,color:C.inkSoft,marginTop:8}}>{celular?'Toque':'Clique'} na reta pra ver os jogadores dela.{temPerf?' ROI do bloco é pelo total investido. Fora da grade: últimos 7 dias.':''}</div>
        </Card>
      </div></>}
      <Portal>{modais}</Portal>
    </div>;
  }

  /* ---------- JOGADORES ---------- */
  if(secao==='g_jogadores'){
    const retasComJogador=[...new Set(linhas.map(l=>l.unidade_id))].map(id=>U[id]).filter(Boolean).sort((a,b)=>posU[a.id]-posU[b.id]);
    const busca=filtro.busca.trim().toLowerCase();
    const lista=linhas.filter(l=>(!filtro.reta||String(l.caminho||U[l.unidade_id]?.caminho||'').startsWith(U[filtro.reta]?.caminho||'§'))
      &&(!busca||l.nome.toLowerCase().includes(busca))
      &&(!filtro.sit||(filtro.sit==='fora'&&gradePorPessoa[l.pessoa_id]?.fora>0)||(filtro.sit==='mk'&&mkDe(l.banca,l.mu)<0)
         ||(filtro.sit==='parados'&&parados.includes(l))||(filtro.sit==='stop'&&stops.some(x=>x.pessoa_id===l.pessoa_id))||(filtro.sit==='convidados'&&l.status==='convidado')));
    const chave={nome:l=>l.nome.toLowerCase(),torneios:l=>l.torneios??-1,lucro:l=>l.lucro??-1e9,banca:l=>l.banca??-1e9,mk:l=>mkDe(l.banca,l.mu)??-1e9,
      grade:l=>gradePorPessoa[l.pessoa_id]?.fora||0,ultimo:l=>l.ultimo_lancamento||''}[ord.k]||(l=>l.nome);
    lista.sort((a,b)=>{ const x=chave(a), y=chave(b); return (x<y?-1:x>y?1:0)*ord.dir; });
    const temDin=linhas.some(l=>l.banca!=null), temPerf=linhas.some(l=>l.torneios!=null);
    // nome e ⋯ presos nas pontas: a tabela rola de lado sem esconder de quem é a linha (A-017)
    const fixaEsq={position:'sticky',left:0,background:C.surface,zIndex:1,boxShadow:`1px 0 0 ${C.border}`}, fixaDir={position:'sticky',right:0,background:C.surface,zIndex:1,boxShadow:`-1px 0 0 ${C.border}`};
    const acoesJog=l=>{ const p=d.pessoas.find(x=>x.id===l.pessoa_id)||{id:l.pessoa_id,nome:l.nome}; return [
      ...(verPainel(l)?[['Ver painel do aluno',()=>onVerJogador(l.nome,l)]]:[]),
      ...(pode('promover',l.unidade_id)&&l.status==='ativo'?[['Mover de reta (promover)',()=>moverJogador(p,l.unidade_id)]]:[]),
      ...(pode('aprovar_saques',l.unidade_id)&&l.status==='ativo'?[['Capital mandado (MU)',()=>capital(p)]]:[]),
      ...(l.status==='convidado'&&pode('gerir_pessoas',l.unidade_id)?[['Link pessoal',()=>linkPessoal(p,l.unidade_id)]]:[]),
      // o nome de quem já tem conta é dele (só o aluno mexe na conta dele): o time renomeia só convidado
      ...((pode('gerir_pessoas',l.unidade_id)||souAdmin)&&!p.user_id?[['Renomear',()=>renomear(p)]]:[]),
      ...(pode('gerir_pessoas',l.unidade_id)&&p.user_id!==uid?[['Registrar saída',()=>saida(p),true]]:[]),
    ]; };
    const col=(k,r,extra)=><th key={k} style={{...thS,...(extra||{})}}><button onClick={()=>setOrd(o=>({k,dir:o.k===k?-o.dir:(k==='nome'?1:-1)}))} style={{border:'none',background:'transparent',padding:0,font:'inherit',color:ord.k===k?P:C.inkSoft,cursor:'pointer',fontWeight:700,textTransform:'uppercase',fontSize:11,letterSpacing:'.04em'}}>{r}{ord.k===k?(ord.dir>0?' ↑':' ↓'):''}</button></th>;
    return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:14}}>
      {header(<>Jogadores <span style={{fontSize:15,color:C.inkSoft,fontWeight:500}}>{linhas.filter(l=>l.status==='ativo').length} ativos</span></>,<>
        <input aria-label="Buscar jogador" data-busca value={filtro.busca} placeholder="Buscar jogador" onChange={e=>setFiltro(f=>({...f,busca:e.target.value}))} style={{...inputStyle,width:220,padding:'10px 12px',fontSize:14}}/>
        {btnConvidar({quem:'jogador',unidade:filtro.reta&&U[filtro.reta]?.mae_id?filtro.reta:undefined})}</>)}
      {avisoBox}{linkBox}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <Chip on={!filtro.reta} onClick={()=>setFiltro(f=>({...f,reta:null}))}>Todas as retas</Chip>
        {retasComJogador.map(u=><Chip key={u.id} data-filtro-reta={u.nome} on={filtro.reta===u.id} onClick={()=>setFiltro(f=>({...f,reta:f.reta===u.id?null:u.id}))}>{u.nome}</Chip>)}
        <span style={{width:1,height:22,background:C.border,margin:'0 4px'}}/>
        {[...(temPerf?[['fora','Fora da grade']]:[]),...(temDin?[['mk','Em MK']]:[]),...(temPerf?[['parados','Sem lançar'],...(stops.length?[['stop','Stop loss']]:[])]:[]),['convidados','Convidados']].map(([k,r])=><Chip key={k} data-filtro-sit={k} on={filtro.sit===k} onClick={()=>setFiltro(f=>({...f,sit:f.sit===k?null:k}))}>{r}</Chip>)}
        {periodoChips}
      </div>
      <Card style={{padding:celular?'8px':'6px 10px'}}>
        {resumo==null&&<div style={{padding:30,display:'grid',placeItems:'center'}}><div className="spin"/></div>}
        {resumo!=null&&!lista.length&&<Empty>{linhas.length?'Ninguém com esse filtro.':'Nenhum jogador no time ainda. Use + Convidar.'}</Empty>}
        {lista.length>0&&celular&&<div data-jogadores-cartoes style={{display:'flex',flexDirection:'column',gap:8}}>
          {lista.map(l=>{ const g=gradePorPessoa[l.pessoa_id], dd=diasDesde(l.ultimo_lancamento), conv=l.status==='convidado', ac=acoesJog(l);
            return <div key={l.pessoa_id} data-jogador={l.nome} style={{background:C.warm,border:`1px solid ${C.border}`,borderRadius:14,padding:'11px 12px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                <div style={{flex:1,minWidth:0}}>{verPainel(l)?<button onClick={()=>onVerJogador(l.nome,l)} style={{border:'none',background:'transparent',padding:0,color:P,fontWeight:700,fontSize:15,cursor:'pointer',textAlign:'left'}}>{l.nome}</button>:<b style={{fontSize:15}}>{l.nome}</b>}
                  {conv&&<> <Tag tom="plum">convite enviado</Tag></>}<div style={{fontSize:12,color:C.inkSoft}}>{U[l.unidade_id]?.nome||l.unidade}</div></div>
                {ac.length>0&&<button aria-label={`Ações de ${l.nome}`} data-acoes={l.nome} onClick={()=>setMenuDe(l.pessoa_id)} style={{width:36,height:36,borderRadius:10,border:`1.5px solid ${C.border}`,background:C.surface,color:C.inkSoft,fontWeight:800,cursor:'pointer',flexShrink:0}}>⋯</button>}
              </div>
              {!conv&&<div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'6px 10px',marginTop:8,fontSize:12.5}}>
                {temPerf&&<div><span style={{color:C.inkSoft}}>Torneios </span><b>{l.torneios??'—'}</b>{l.abi!=null&&l.torneios?<span style={{color:C.inkSoft}}> · ABI {fmt(l.abi)}</span>:null}</div>}
                {temPerf&&<div><span style={{color:C.inkSoft}}>Resultado </span><b style={{color:l.lucro>0?C.greenMid:l.lucro<0?C.red:C.ink}}>{l.lucro==null||!l.torneios?'—':fmtSinal(l.lucro)}</b></div>}
                {temDin&&<div><span style={{color:C.inkSoft}}>Banca </span><b>{l.banca==null?'—':fmt(l.banca)}</b>{l.mu!=null&&<span style={{color:C.inkSoft}}> · MU {fmt(l.mu)}</span>}</div>}
                {temDin&&<div><span style={{color:C.inkSoft}}>MK / Profit </span><MkSelo v={mkDe(l.banca,l.mu)}/></div>}
                {temPerf&&<div><span style={{color:C.inkSoft}}>Grade 7 dias </span>{!g?'—':g.fora?<Tag tom="bad">{g.fora} fora</Tag>:g.atencao?<Tag tom="warn">{g.atencao} atenção</Tag>:<Tag tom="ok">dentro</Tag>}</div>}
                {temPerf&&<div><span style={{color:C.inkSoft}}>Último </span><b>{l.ultimo_lancamento?dataBR(l.ultimo_lancamento):'nunca lançou'}</b>{dd!=null&&dd>7&&<span data-parado style={{color:C.red,fontWeight:700}}> · parado há {dd} dias</span>}</div>}
              </div>}
            </div>; })}
        </div>}
        {lista.length>0&&!celular&&<div style={{overflowX:'auto'}}><table data-jogadores style={{width:'100%',borderCollapse:'separate',borderSpacing:0}}>
          <thead><tr>{col('nome','Jogador',fixaEsq)}{temPerf&&col('torneios','Torneios')}{temPerf&&col('lucro','Resultado')}
            {temDin&&col('banca','Banca')}{temDin&&col('mk','MK / Profit')}{temPerf&&col('grade','Grade 7 dias')}{temPerf&&col('ultimo','Último lançamento')}<th style={{...thS,...fixaDir}}><span style={{position:'absolute',left:-9999}}>Ações</span></th></tr></thead>
          <tbody>{lista.map(l=>{ const g=gradePorPessoa[l.pessoa_id]; const dd=diasDesde(l.ultimo_lancamento); const conv=l.status==='convidado'; const ac=acoesJog(l);
            return <tr key={l.pessoa_id} data-jogador={l.nome}>
              <td style={{...tdS,...fixaEsq}}>{verPainel(l)?<button onClick={()=>onVerJogador(l.nome,l)} style={{border:'none',background:'transparent',padding:0,color:P,fontWeight:700,fontSize:14,cursor:'pointer'}}>{l.nome}</button>:<b>{l.nome}</b>}
                {conv&&<> <Tag tom="plum">convite enviado</Tag></>}<div style={{fontSize:12,color:C.inkSoft}}>{U[l.unidade_id]?.nome||l.unidade}</div></td>
              {temPerf&&<td style={tdS}>{conv?'—':(l.torneios??'—')}{!conv&&l.abi!=null&&l.torneios?<div style={{fontSize:12,color:C.inkSoft}}>ABI {fmt(l.abi)}</div>:null}</td>}
              {temPerf&&<td style={{...tdS,color:l.lucro>0?C.greenMid:l.lucro<0?C.red:C.ink}}>{conv||l.lucro==null||!l.torneios?'—':fmtSinal(l.lucro)}
                {!conv&&l.roi!=null&&l.torneios?<div style={{fontSize:12,color:l.roi<0?C.red:C.inkSoft}}>ROI {pctFmt(l.roi)}</div>:null}</td>}
              {temDin&&<td style={tdS}>{conv||l.banca==null?'—':fmt(l.banca)}{!conv&&l.mu!=null&&<div style={{fontSize:12,color:C.inkSoft}}>MU {fmt(l.mu)}</div>}</td>}
              {temDin&&<td style={tdS}>{conv?<span style={{color:C.inkSoft}}>—</span>:<MkSelo v={mkDe(l.banca,l.mu)}/>}</td>}
              {temPerf&&<td style={tdS}>{!g?<span style={{color:C.inkSoft}}>—</span>:g.fora?<Tag tom="bad">{g.fora} fora</Tag>:g.atencao?<Tag tom="warn">{g.atencao} atenção</Tag>:<Tag tom="ok">dentro</Tag>}</td>}
              {temPerf&&<td style={tdS}>{l.ultimo_lancamento?dataBR(l.ultimo_lancamento):(conv?'—':'nunca lançou')}{dd!=null&&dd>7&&<div data-parado style={{fontSize:12,color:C.red,fontWeight:700}}>parado há {dd} dias</div>}</td>}
              <td style={{...tdS,...fixaDir}}>{ac.length>0&&<button aria-label={`Ações de ${l.nome}`} data-acoes={l.nome} onClick={()=>setMenuDe(l.pessoa_id)}
                  style={{width:36,height:36,borderRadius:10,border:`1.5px solid ${C.border}`,background:C.surface,color:C.inkSoft,fontWeight:800,cursor:'pointer'}}>⋯</button>}</td>
            </tr>; })}</tbody></table></div>}
      </Card>
      {(()=>{ const l=menuDe&&lista.find(x=>x.pessoa_id===menuDe); if(!l) return null; const ac=acoesJog(l);
        return <Janela onClose={()=>setMenuDe(null)} rotulo={`Ações de ${l.nome}`} attrs={{'data-acoes-modal':true,role:'menu'}}>
          {topoModal(l.nome,()=>setMenuDe(null))}
          {ac.map(([r,fn,perigo])=><button key={r} role="menuitem" onClick={()=>{ setMenuDe(null); fn(); }}
            style={{textAlign:'left',padding:'13px 14px',borderRadius:13,border:`1.5px solid ${perigo?C.redSoft:C.border}`,background:C.surface,color:perigo?C.red:C.ink,fontWeight:700,fontSize:14.5,cursor:'pointer'}}>{r}</button>)}
        </Janela>; })()}
      <Portal>{modais}</Portal>
    </div>;
  }

  /* ---------- GRADES ---------- */
  if(secao==='g_grades'){
    const nivel=u=>String(u.caminho).split('/').filter(Boolean).length-1;
    const lista=d.unidades.filter(u=>u.mae_id);
    const comGrade=lista.find(u=>d.grades.some(g=>g.unidade_id===u.id));
    const sel=U[gradeSel]||comGrade||lista.find(u=>!d.unidades.some(x=>x.mae_id===u.id))||lista[0];
    const g=sel?gradeEf(sel.id):null; const propria=g&&g.unidade_id===sel.id;
    const hist=sel?d.grades.filter(x=>x.unidade_id===sel.id).sort((a,b)=>String(b.vigente_desde).localeCompare(String(a.vigente_desde))):[];
    const conf=sel?conferidos.filter(c=>{ const uid_=unidadeDoTorneio(c.t); return uid_&&U[uid_]&&String(U[uid_].caminho).startsWith(sel.caminho); })
      .sort((a,b)=>(a.sg.status==='fora'?0:1)-(b.sg.status==='fora'?0:1)||String(b.t.entry_date).localeCompare(String(a.t.entry_date))):[];
    const podeVerDesempenho=podeAlgum('ver_desempenho');
    return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:14}}>
      {header('Grades')}
      {avisoBox}
      {!lista.length&&<Card style={{padding:20}}><Empty>Crie as retas em Equipe e convites → Editar estrutura.</Empty></Card>}
      {lista.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:16,alignItems:'flex-start'}}>
        <div role="list" aria-label="Retas" style={{flex:'0 1 250px',display:'flex',flexDirection:'column',gap:8,minWidth:200}}>
          {lista.map(u=>{ const gu=gradeEf(u.id), pr=gu&&gu.unidade_id===u.id, on=sel&&sel.id===u.id;
            return <button key={u.id} role="listitem" data-grade-reta={u.nome} onClick={()=>{ setGradeSel(u.id); setVersoes(false); }} style={{textAlign:'left',padding:'12px 14px',marginLeft:Math.max(0,nivel(u)-1)*12,borderRadius:14,border:`1.5px solid ${on?P:C.border}`,background:on?C.plumSoft:C.surface,cursor:'pointer',font:'inherit',color:C.ink}}>
              <div style={{fontWeight:800,fontSize:14.5}}>{u.nome}{u.rotulo&&<span style={{fontWeight:600,color:C.inkSoft,fontSize:12.5}}> · {u.rotulo}</span>}</div>
              <div style={{marginTop:5,display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                {pr?<><Tag tom={gu.simulada?'warn':'ok'}>{gu.simulada?'simulada':'oficial'}</Tag><span style={{fontSize:12,color:C.inkSoft}}>desde {dataBR(gu.vigente_desde)}</span></>
                  :gu?<span style={{fontSize:12,color:C.inkSoft}}>usa a da {U[gu.unidade_id]?.nome}</span>:<span style={{fontSize:12,color:C.inkSoft}}>sem grade</span>}
              </div></button>; })}
          <div style={{fontSize:12,color:C.inkSoft,lineHeight:1.5,padding:'2px 4px'}}>Reta sem grade própria usa a de cima. Sem nenhuma, vale o teto de ABI das Regras do time.</div>
        </div>
        {sel&&<div style={{flex:'1 1 540px',minWidth:0,display:'flex',flexDirection:'column',gap:14}}>
          <Card style={{padding:20}}>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <h3 style={{...tituloS,margin:0,flex:1}}>Grade da {sel.nome} {g&&(propria?<Tag tom={g.simulada?'warn':'ok'}>{g.simulada?'simulada':'oficial'}</Tag>:<Tag>da {U[g.unidade_id]?.nome}</Tag>)}</h3>
              {hist.length>0&&<button style={btnS} onClick={()=>setVersoes(v=>!v)}>Versões ({hist.length})</button>}
              {pode('configurar_regras',sel.id)&&<button data-editar-grade style={btnP} onClick={()=>setGradeAberta(sel.id)}>{propria?'Editar grade':'Criar grade'}</button>}
            </div>
            {g&&g.simulada&&<div data-grade-simulada style={{marginTop:12,background:C.goldSoft,color:'#6b4e1a',borderRadius:12,padding:'10px 12px',fontSize:13,fontWeight:600,lineHeight:1.5}}>Simulada: montada sem a planilha oficial. Os alunos desta reta veem este aviso até alguém salvar a grade real.</div>}
            {g&&g.observacao&&<div style={{fontSize:12.5,color:C.inkSoft,marginTop:8}}>{g.observacao}</div>}
            {versoes&&<div style={{marginTop:10,borderTop:`1px solid ${C.border}`}}>{hist.map(h=><div key={h.id} style={{display:'flex',gap:8,alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.border}`,fontSize:13}}>
              <span style={{flex:1}}>Desde {dataBR(h.vigente_desde)}{h.simulada?' · simulada':''}{h.observacao?` · ${h.observacao}`:''}</span>
              {pode('configurar_regras',sel.id)&&<button style={{...btnS,color:C.red}} onClick={()=>rodar('apagar_grade',{p_id:h.id},'Versão da grade apagada.')}>Apagar</button>}</div>)}</div>}
            <div style={{marginTop:12}}>{g?<GradeTabela celulas={g.celulas||[]}/>:<Empty>Sem grade. Os torneios desta reta são conferidos só pelo teto de ABI das Regras do time.</Empty>}</div>
            {g&&<div style={{fontSize:11.5,color:C.inkSoft,marginTop:8}}>Vale desde {dataBR(g.vigente_desde)}. Escrita como na planilha; o app lê cada célula e confere cada torneio.</div>}
          </Card>
          {podeVerDesempenho&&<Card style={{padding:20}}>
            <h3 style={tituloS}>Conferência dos últimos 7 dias · {sel.nome}</h3>
            {!conf.length?<div data-conferencia-vazia style={{fontSize:13.5,color:C.inkSoft}}>Nenhum torneio fora ou em atenção nos últimos 7 dias.</div>
              :celular?<div data-conferencia style={{display:'flex',flexDirection:'column',gap:8}}>{conf.slice(0,60).map(({t,sg,pessoa},i)=><div key={t.id||i} style={{background:C.warm,border:`1px solid ${C.border}`,borderRadius:12,padding:'9px 11px',fontSize:12.5,lineHeight:1.5}}>
                <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}><b>{nomeDe(pessoa)}</b><span style={{color:C.inkSoft}}>{dataBR(t.entry_date)}</span><Tag tom={sg.status==='fora'?'bad':'warn'}>{sg.status==='fora'?'fora':'atenção'}</Tag></div>
                <div>{t.tournament_name||'Torneio'} · {fmt(t.buyin)}{num(t.reentries)>0?` +${num(t.reentries)}re`:''}</div><div style={{color:C.inkSoft}}>{sg.motivo}{sg.simulada?' · grade simulada':''}</div></div>)}</div>
              :<div style={{overflowX:'auto'}}><table data-conferencia style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>{['Aluno','Dia','Torneio','Buy-in','Status','Motivo'].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>{conf.slice(0,60).map(({t,sg,pessoa},i)=><tr key={t.id||i}>
                  <td style={{...tdS,fontWeight:700}}>{nomeDe(pessoa)}</td><td style={tdS}>{dataBR(t.entry_date)}</td>
                  <td style={{...tdS,maxWidth:240,overflow:'hidden',textOverflow:'ellipsis'}}>{t.tournament_name||'Torneio'}</td><td style={tdS}>{fmt(t.buyin)}{num(t.reentries)>0?` +${num(t.reentries)}re`:''}</td>
                  <td style={tdS}><Tag tom={sg.status==='fora'?'bad':'warn'}>{sg.status==='fora'?'fora':'atenção'}</Tag></td>
                  <td style={{...tdS,whiteSpace:'normal',minWidth:220}}>{sg.motivo}{sg.simulada?' · grade simulada':''}</td></tr>)}</tbody></table></div>}
          </Card>}
        </div>}
      </div>}
      <Portal>{modais}</Portal>
    </div>;
  }

  /* ---------- FINANCEIRO ---------- */
  if(secao==='g_financeiro'){
    const din=linhas.filter(l=>l.banca!=null&&l.status!=='convidado');
    const soma=k=>din.reduce((a,l)=>a+Number(l[k]||0),0);
    const aReceber=paraDecidir.filter(s=>s.status==='aprovado').reduce((a,s)=>a+Number(s.total_time||0),0);
    const historico=d.saques.filter(s=>['pago','recusado'].includes(s.status)&&pode('ver_financeiro',s.unidade_id)).slice(0,10);
    const itens=paraDecidir.length+reloadsParaDecidir.length+paraConferir.length+divergentes.length;
    // o que está aberto mas não é deste papel decidir (ex.: professor vê os saques, quem aprova é o financeiro) (A-042)
    const deOutros=d.saques.filter(x=>['solicitado','aprovado'].includes(x.status)&&!paraDecidir.includes(x)).length
      +d.reloads.filter(x=>['solicitado','aprovado'].includes(x.status)&&!reloadsParaDecidir.includes(x)).length
      +d.aberturas.filter(x=>x.status==='enviada'&&!paraConferir.includes(x)).length;
    return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
      {header('Financeiro')}
      {avisoBox}
      {din.length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>
        <Kpi rot="Banca somada" val={fmt(soma('banca'))} sub={`${din.length} aluno${din.length!==1?'s':''}, todas as salas`}/>
        <Kpi rot="Capital do time (MU)" val={fmt(soma('mu'))}/>
        <Kpi rot="Profit (banca − MU)" val={fmtSinal(soma('banca')-soma('mu'))} tom={soma('banca')-soma('mu')>=0?'ok':'bad'}/>
        <Kpi rot="A receber" val={fmt(aReceber)} sub="saques aprovados, dinheiro ainda não chegou"/>
      </div>}
      <Card style={{padding:20}}>
        <h3 style={tituloS}>Para resolver {itens>0&&<span style={{fontSize:14,color:C.inkSoft,fontWeight:500}}>{itens}</span>}</h3>
        {itens===0&&<div data-nada-resolver style={{fontSize:14,color:C.inkSoft}}>{deOutros?`Nada para você resolver. ${deOutros} ${deOutros===1?'item aberto está':'itens abertos estão'} com quem aprova os saques.`:'Nada para resolver agora.'}</div>}
        {paraDecidir.map(s=><div key={s.id} data-saque={nomeDe(s.pessoa_id)} style={{padding:'12px 0',borderTop:`1px solid ${C.border}`,fontSize:13.5}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><Tag tom="plum">saque</Tag><b>{nomeDe(s.pessoa_id)}</b><span style={{color:C.inkSoft}}>· {dataBR(s.solicitado_em)} ·</span><span style={{color:C.gold,fontWeight:700}}>{SAQUE_ROTULO[s.status]}</span></div>
          <div data-saque-conta style={{color:C.inkSoft,marginTop:4,lineHeight:1.6}}>
            <div><b style={{color:C.ink}}>Banca:</b> informada {fmt(s.banca)}{s.banca_sistema!=null?<> · no sistema {fmt(s.banca_sistema)}</>:null} · MU antes {fmt(s.mu_antes)}</div>
            <div><b style={{color:C.ink}}>Saque:</b> {Number(s.devolucao)>0?<>devolve {fmt(s.devolucao)} de MU + </>:null}cashout {fmt(s.cashout)}</div>
            <div><b style={{color:C.ink}}>Divisão do cashout:</b> jogador {fmt(s.parte_jogador)}{Number(s.cashout)>0?` (${pctFmt(Number(s.parte_jogador)/Number(s.cashout)*100)})`:''} · time {fmt(s.parte_time)}{Number(s.cashout)>0?` (${pctFmt(Number(s.parte_time)/Number(s.cashout)*100)})`:''} · <b style={{color:C.ink}}>o time recebe {fmt(s.total_time)}</b></div>
            {s.observacao?<div>"{s.observacao}"</div>:null}</div>
          {s.banca_sistema!=null&&Math.abs(Number(s.banca)-Number(s.banca_sistema))>1&&<div data-banca-diferente style={{color:C.red,fontWeight:700,fontSize:13,marginTop:4}}>
            A banca informada está {fmt(Math.abs(Number(s.banca)-Number(s.banca_sistema)))} {Number(s.banca)>Number(s.banca_sistema)?'acima':'abaixo'} da do sistema: confira os lançamentos antes de aprovar.</div>}
          {Array.isArray(s.carteiras)&&s.carteiras.length>0&&<div data-saque-salas style={{marginTop:6,fontSize:12.5,lineHeight:1.6}}>
            {s.carteiras.map(c=>{ const dif=cent(num(c.saldo)-num(c.sistema)); return <div key={c.chave||c.sala} data-saque-sala-linha={c.sala}><b>{c.sala}</b>: informado {fmt(c.saldo)} · sistema {fmt(c.sistema)}{Math.abs(dif)>1?<span style={{color:C.red,fontWeight:700}}> ({fmtSinal(dif)})</span>:null} · <b>sai {fmt(c.valor)}</b></div>; })}</div>}
          <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
            {s.status==='solicitado'&&<button style={btnP} onClick={()=>rodar('decidir_saque',{p_id:s.id,p_aprovar:true,p_motivo:null},'Saque aprovado. Quando o dinheiro chegar, confirme o valor recebido.')}>Aprovar</button>}
            {s.status==='solicitado'&&<button style={{...btnS,color:C.red}} onClick={()=>setPerg({label:'Motivo da recusa',hint:'O jogador vê este motivo.',kind:'text',valor:'',onSave:async m=>{ setPerg(null); if(m) await rodar('decidir_saque',{p_id:s.id,p_aprovar:false,p_motivo:m},'Saque recusado.'); }})}>Recusar</button>}
            {s.status==='aprovado'&&<button style={btnS} onClick={()=>setPerg({label:'Quanto o time recebeu?',hint:`Esperado: ${fmt(s.total_time)}. Some tudo que chegou (todas as carteiras).`,kind:'money',valor:s.total_time,
              onSave:async v=>{ setPerg(null); const r=await rodar('confirmar_recebimento',{p_id:s.id,p_recebido:v}); if(r&&typeof r==='object') setAviso({erro:Number(r.diferenca)!==0,texto:Number(r.diferenca)===0?'Recebimento confirmado, sem diferença.':`Recebimento confirmado com diferença de ${fmt(r.diferenca)} (esperado ${fmt(r.total_time)}, recebido ${fmt(r.recebido)}).`}); }})}>Confirmar recebimento</button>}
          </div></div>)}
        {reloadsParaDecidir.map(r=><div key={r.id} data-reload={nomeDe(r.pessoa_id)} style={{padding:'12px 0',borderTop:`1px solid ${C.border}`,fontSize:13.5}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><Tag tom="warn">reload</Tag><b>{nomeDe(r.pessoa_id)}</b><span>{fmt(r.valor)}{r.sala?` · ${r.sala}`:''}</span><span style={{color:C.gold,fontWeight:700}}>· {RELOAD_ROTULO[r.status]}</span></div>
          <div style={{color:C.inkSoft,marginTop:4}}>{dataBR(r.solicitado_em)}{r.motivo?` · "${r.motivo}"`:''}</div>
          <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
            {r.status==='solicitado'&&<button style={btnP} onClick={()=>rodar('decidir_reload',{p_id:r.id,p_aprovar:true,p_motivo:null},'Reload aprovado. Quando mandar o dinheiro, confirme o envio.')}>Aprovar</button>}
            {r.status==='solicitado'&&<button style={{...btnS,color:C.red}} onClick={()=>setPerg({label:'Motivo da recusa',hint:'O jogador vê este motivo.',kind:'text',valor:'',onSave:async m=>{ setPerg(null); if(m) await rodar('decidir_reload',{p_id:r.id,p_aprovar:false,p_motivo:m},'Reload recusado.'); }})}>Recusar</button>}
            {r.status==='aprovado'&&<button style={btnS} onClick={()=>setPerg({label:'Quanto foi enviado?',hint:`Pedido: ${fmt(r.valor)}. O valor enviado entra no MU de ${nomeDe(r.pessoa_id)}.`,kind:'money',valor:r.valor,
              onSave:async v=>{ setPerg(null); if(v>0) await rodar('confirmar_envio_reload',{p_id:r.id,p_valor:v},`Reload de ${fmt(v)} registrado no MU de ${nomeDe(r.pessoa_id)}.`); }})}>Confirmar envio</button>}
          </div></div>)}
        {paraConferir.map(a=>{ const pl=a.planilha||{}; return <div key={a.id} data-conferir={nomeDe(a.pessoa_id)} style={{padding:'12px 0',borderTop:`1px solid ${C.border}`,fontSize:13.5}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><Tag tom="ok">planilha</Tag><b>{nomeDe(a.pessoa_id)}</b><span style={{color:C.inkSoft}}>· enviada {dataBR(a.enviado_em)}{pl.atualizado_em?` · planilha de ${dataBR(pl.atualizado_em)}`:''}</span></div>
          <div style={{color:C.inkSoft,marginTop:4,lineHeight:1.5}}>MU (capital do time; na planilha, "MakeUp") <b style={{color:C.ink}}>{fmt(a.mu)}</b> · Cashout (lucro já sacado) <b style={{color:C.ink}}>{fmt(a.cashout)}</b> · banca {fmt(pl.banca)} · lifetime {fmt(pl.lifetime)}{pl.contrato_texto?` · contrato "${pl.contrato_texto}"`:''}</div>
          {(pl.avisos||[]).map((t,i)=><div key={i} style={{color:C.red,fontSize:12.5,fontWeight:600}}>{t}</div>)}
          {(()=>{ const padrao=/^\d{4}-\d{2}-\d{2}$/.test(String(pl.atualizado_em||''))?pl.atualizado_em:String(a.enviado_em||'').slice(0,10); const v=cortes[a.id]||padrao;
            // entrada no time: o 1º vínculo. Saldos de antes dela antecipam a entrada, no máximo até a data da planilha (o servidor confere)
            const entrada=d.vinculos.filter(x=>x.pessoa_id===a.pessoa_id).map(x=>String(x.inicio||'').slice(0,10)).filter(Boolean).sort()[0]||null;
            const vespera=entrada?addDaysISO(entrada,-1):null, minimo=vespera?(padrao&&padrao<vespera?padrao:vespera):null;
            return <div style={{marginTop:8}}><div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <label style={{fontSize:13,color:C.ink,fontWeight:600}}>Saldos valem até</label>
              <input type="date" data-corte={nomeDe(a.pessoa_id)} value={v} min={minimo||undefined} max={todayISO()} onChange={e=>setCortes(c=>({...c,[a.id]:e.target.value}))} style={{...inputStyle,width:'auto',padding:'7px 10px'}}/>
              <span style={{fontSize:12,color:C.inkSoft}}>Só contam jogos e movimentos depois desta data.</span></div>
              {vespera&&v&&v<vespera&&<div data-antecipa={nomeDe(a.pessoa_id)} style={{fontSize:12.5,color:C.ink,marginTop:6,lineHeight:1.5}}>
                {nomeDe(a.pessoa_id)} entrou no time em {dataBR(entrada)}. Com essa data, o que ele jogou a partir de {dataBR(addDaysISO(v,1))} passa a ser do time (a gestão vê e conta na banca). O que é de antes continua só dele.</div>}
            </div>; })()}
          <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
            <button style={btnP} onClick={()=>rodar('conferir_abertura',{p_pessoa:a.pessoa_id,p_mu:a.mu,p_cashout:a.cashout,p_corte:corteDe(a)},`Planilha de ${nomeDe(a.pessoa_id)} conferida.`)}>Conferir como está</button>
            <button style={btnS} onClick={()=>setPerg({label:`MU de ${nomeDe(a.pessoa_id)}`,hint:'Valor certo do MU: o capital do time com o jogador (na planilha aparece como MakeUp).',kind:'money',valor:a.mu,
              onSave:mu=>setPerg({label:`Cashout de ${nomeDe(a.pessoa_id)}`,hint:'Lucro que ele já sacou no time (conta pra faixa do contrato).',kind:'money',valor:a.cashout,
                onSave:async co=>{ setPerg(null); await rodar('conferir_abertura',{p_pessoa:a.pessoa_id,p_mu:mu,p_cashout:co,p_corte:corteDe(a)},`Planilha de ${nomeDe(a.pessoa_id)} conferida com os valores corrigidos.`); }})})}>Corrigir MU e cashout</button>
          </div></div>; })}
        {divergentes.map(c=><div key={c.id} data-divergente={nomeDe(c.pessoa_id)} style={{padding:'12px 0',borderTop:`1px solid ${C.border}`,fontSize:13.5}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><Tag tom="bad">conferência</Tag><b>{nomeDe(c.pessoa_id)}</b><span style={{color:C.inkSoft}}>· {dataBR(c.criado_em)} · saldo diferente do sistema</span></div>
          <div style={{color:C.inkSoft,marginTop:4,lineHeight:1.6}}>{(Array.isArray(c.salas)?c.salas:[]).filter(x=>Math.abs(Number(x.diferenca)||0)>=0.01).map(x=><div key={x.chave||x.sala}><b style={{color:C.ink}}>{x.sala}</b>: informou {fmt(x.informado)} · sistema {fmt(x.sistema)} · <b style={{color:C.red}}>{fmt(Math.abs(Number(x.diferenca)))} {Number(x.diferenca)>0?'a mais':'a menos'}</b></div>)}
            <div>Total: {fmtSinal(Number(c.diferenca))}. Confira com o jogador os torneios e movimentos dessas salas.</div></div>
          <div style={{display:'flex',gap:8,marginTop:8}}><button style={btnS} onClick={()=>verSalas({id:c.pessoa_id,nome:nomeDe(c.pessoa_id)})}>Ver salas</button></div>
        </div>)}
      </Card>
      {din.length>0&&<Card style={{padding:20}}>
        <h3 style={tituloS}>Dinheiro por jogador</h3>
        {celular&&<div data-dinheiro-cartoes style={{display:'flex',flexDirection:'column',gap:8}}>
          {[...din].sort((a,b)=>(mkDe(a.banca,a.mu)??0)-(mkDe(b.banca,b.mu)??0)).map(l=>{ const c=d.conferencias.find(x=>x.pessoa_id===l.pessoa_id), mk=mkDe(l.banca,l.mu);
            return <div key={l.pessoa_id} data-dinheiro-de={l.nome} style={{background:C.warm,border:`1px solid ${C.border}`,borderRadius:14,padding:'11px 12px'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{flex:1,minWidth:0}}><b>{l.nome}</b><div style={{fontSize:12,color:C.inkSoft}}>{U[l.unidade_id]?.nome||l.unidade}</div></div>
                <button style={{...btnS,padding:'6px 10px',fontSize:12.5}} onClick={()=>verSalas({id:l.pessoa_id,nome:l.nome})}>Salas</button></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'6px 10px',marginTop:8,fontSize:12.5}}>
                <div><span style={{color:C.inkSoft}}>Banca </span><b>{fmt(l.banca)}</b></div><div><span style={{color:C.inkSoft}}>MU </span><b>{l.mu==null?'—':fmt(l.mu)}</b></div>
                <div><span style={{color:C.inkSoft}}>MK / Profit </span><MkSelo v={mk}/></div>
                <div data-lifetime-de={l.nome}><span style={{color:C.inkSoft}}>Lifetime </span><b>{l.lucro_sacado==null?'—':mk==null?fmt(l.lucro_sacado):fmtSinal(cent(num(l.lucro_sacado)+mk))}</b></div>
                <div style={{gridColumn:'1/-1',color:c?(c.diverge?C.red:C.greenMid):C.inkSoft,fontWeight:c?700:400}}>{c?`${c.diverge?`conferência diverge ${fmtSinal(Number(c.diferenca))}`:'conferência bateu'} · ${dataBR(c.criado_em)}`:'sem conferência de saldos'}</div>
              </div></div>; })}
        </div>}
        {!celular&&<div style={{overflowX:'auto'}}><table data-dinheiro style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{['Jogador','Reta','Banca','MU','MK / Profit','Lifetime','Salas'].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>{[...din].sort((a,b)=>(mkDe(a.banca,a.mu)??0)-(mkDe(b.banca,b.mu)??0)).map(l=><tr key={l.pessoa_id} data-dinheiro-de={l.nome}>
            <td style={{...tdS,fontWeight:700}}>{l.nome}</td><td style={tdS}>{U[l.unidade_id]?.nome||l.unidade}</td><td style={tdS}>{fmt(l.banca)}</td><td style={tdS}>{l.mu==null?'—':fmt(l.mu)}</td>
            <td style={tdS}><MkSelo v={mkDe(l.banca,l.mu)}/></td>
            <td style={tdS} data-lifetime-de={l.nome}>{l.lucro_sacado==null?'—':<>{mkDe(l.banca,l.mu)==null?fmt(l.lucro_sacado):fmtSinal(cent(num(l.lucro_sacado)+mkDe(l.banca,l.mu)))}
              <div style={{fontSize:12,color:C.inkSoft}}>sacado {fmt(l.lucro_sacado)}</div></>}</td>
            <td style={tdS} data-salas-de={l.nome}>{(()=>{ const c=d.conferencias.find(x=>x.pessoa_id===l.pessoa_id);
              return <div style={{display:'flex',alignItems:'center',gap:8}}>{c?<span style={{fontSize:12.5,fontWeight:700,color:c.diverge?C.red:C.greenMid}}>{c.diverge?`diverge ${fmtSinal(Number(c.diferenca))}`:'bateu'} · {dataBR(c.criado_em)}</span>:<span style={{fontSize:12.5,color:C.inkSoft}}>sem conferência</span>}
                <button style={{...btnS,padding:'5px 9px',fontSize:12}} onClick={()=>verSalas({id:l.pessoa_id,nome:l.nome})}>Ver</button></div>; })()}</td></tr>)}</tbody></table></div>}
        <div style={{fontSize:12,color:C.inkSoft,marginTop:4,lineHeight:1.5}}>MU = capital do time com o jogador. MK = quanto falta pra banca voltar ao MU; Profit = o que passou dele. Lifetime = o que já sacou + o profit de agora (como na planilha).</div>
        <div style={{fontSize:12,color:C.inkSoft,marginTop:8}}>Contrato do time: {faixasTexto(contratoRaiz?.faixas)}{souAdmin?' · muda em Regras do time':''}</div>
      </Card>}
      {historico.length>0&&<Card style={{padding:20}}>
        <h3 style={tituloS}>Últimos saques</h3>
        {historico.map(s=><div key={s.id} style={{display:'flex',gap:8,flexWrap:'wrap',padding:'8px 0',borderTop:`1px solid ${C.border}`,fontSize:13}}>
          <span style={{flex:1,minWidth:200}}><b>{nomeDe(s.pessoa_id)}</b> · {dataBR(s.pago_em||s.solicitado_em)} · time {fmt(s.recebido??s.total_time)} · jogador {fmt(s.parte_jogador)}</span>
          <span style={{fontWeight:700,color:s.status==='pago'?C.greenMid:C.red}}>{SAQUE_ROTULO[s.status]}{s.status==='pago'&&Number(s.diferenca)?` · diferença ${fmt(s.diferenca)}`:''}</span></div>)}
      </Card>}
      {d.acertos.length>0&&<Card style={{padding:20}}>
        <h3 style={tituloS}>Saídas do time</h3>
        {d.acertos.slice(0,20).map(x=><div key={x.id} data-acerto={nomeDe(x.pessoa_id)} style={{padding:'10px 0',borderTop:`1px solid ${C.border}`,fontSize:13.5}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><b>{nomeDe(x.pessoa_id)}</b><span style={{color:C.inkSoft}}>· saiu {dataBR(x.saida)}{x.entrada?` (no time desde ${dataBR(x.entrada)})`:''}</span>
            {Number(x.mk_congelado)>0&&<Tag tom="bad">MK congelado {fmt(x.mk_congelado)}</Tag>}
            <span style={{marginLeft:'auto',fontWeight:700,color:x.status==='recebido'?C.greenMid:C.gold}}>{x.status==='recebido'?`recebido ${fmt(x.recebido)}${Number(x.diferenca)?` · diferença ${fmt(x.diferenca)}`:''}`:'a receber'}</span></div>
          <div style={{color:C.inkSoft,marginTop:4,lineHeight:1.5}}>Banca {fmt(x.banca)} · MU {fmt(x.mu)} · capital de volta {fmt(x.devolucao)}{Number(x.cashout)>0?` · lucro ${fmt(x.cashout)} (${x.parte_jogador!=null?`jogador ${fmt(x.parte_jogador)}, time ${fmt(x.parte_time)}`:'sem contrato'})`:''}{x.total_time!=null?` · time recebe ${fmt(x.total_time)}`:''} · resultado no time {fmtSinal(Number(x.resultado?.lucro)||0)}</div>
          {x.status==='a_receber'&&pode('aprovar_saques',x.unidade_id)&&<div style={{marginTop:8}}><button style={btnS} onClick={()=>setPerg({label:`Quanto o time recebeu de ${nomeDe(x.pessoa_id)}?`,
            hint:x.total_time!=null?`Pelo acerto: ${fmt(x.total_time)}.`:'Sem contrato: o que foi combinado.',kind:'money',valor:x.total_time??0,
            onSave:async v=>{ setPerg(null); const r=await rodar('confirmar_acerto',{p_id:x.id,p_recebido:v}); if(r&&typeof r==='object') setAviso({erro:r.diferenca!=null&&Number(r.diferenca)!==0,
              texto:r.diferenca!=null&&Number(r.diferenca)!==0?`Recebimento confirmado com diferença de ${fmt(r.diferenca)}.`:'Recebimento do acerto confirmado.'}); }})}>Confirmar recebimento</button></div>}
        </div>)}
      </Card>}
      <Portal>{modais}</Portal>
    </div>;
  }

  /* ---------- EQUIPE E CONVITES ---------- */
  if(secao==='g_equipe'){
    const nivel=u=>String(u.caminho).split('/').filter(Boolean).length-1;
    const alunosEm=u=>linhas.filter(l=>l.status==='ativo'&&String(l.caminho||'').startsWith(u.caminho)).length;
    const porPessoa={}; d.acessos.forEach(a=>{ const x=porPessoa[a.pessoa_id]||(porPessoa[a.pessoa_id]={caps:new Set(),unidades:[]}); a.capacidades.forEach(c=>x.caps.add(c)); x.unidades.push(a.unidade_id); });
    const gestao=Object.entries(porPessoa).map(([pid,x])=>{ const p=d.pessoas.find(y=>y.id===pid); if(!p||p.status==='saiu') return null; const caps=[...x.caps];
      const v=ativo(pid); return {...p,caps,papel:papelDe(caps),unidades:x.unidades,joga:v?v.unidade_id:null}; }).filter(Boolean).sort((a,b)=>a.nome.localeCompare(b.nome));
    const agora=Date.now();
    const convAtivos=d.convites.filter(c=>!c.revogado&&Date.parse(c.expira_em)>agora&&(c.usos_max==null||c.usos<c.usos_max)).sort((a,b)=>String(b.criado_em).localeCompare(String(a.criado_em)));
    const tipoConvite=c=>{ if(!c.pessoa_id) return 'Link aberto · jogador'; const g=porPessoa[c.pessoa_id]; return `Link pessoal · ${g?PAPEL_ROT[papelDe([...g.caps])]?.toLowerCase()||'gestão':'jogador'}`; };
    return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
      {header('Equipe e convites',btnConvidar())}
      {avisoBox}{linkBox}
      <div style={{display:'flex',flexWrap:'wrap',gap:16,alignItems:'flex-start'}}>
        <Card style={{padding:20,flex:'1 1 280px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}><h3 style={{...tituloS,margin:0,flex:1}}>Estrutura</h3>
            {podeAlgum('administrar')&&<button data-editar-estrutura style={btnS} onClick={()=>setEstrutura(true)}>Editar</button>}</div>
          <div data-estrutura style={{marginTop:12,display:'flex',flexDirection:'column',gap:7}}>
            {d.unidades.map(u=><div key={u.id} style={{paddingLeft:nivel(u)*16,fontSize:14}}><span style={{fontWeight:nivel(u)<2?800:600}}>{u.nome}</span>
              {u.rotulo&&<span style={{color:C.inkSoft,fontSize:12.5}}> · {u.rotulo}</span>}<span style={{color:C.inkSoft,fontSize:12.5}}> · {alunosEm(u)} aluno{alunosEm(u)!==1?'s':''}</span></div>)}
          </div>
        </Card>
        {souAdmin&&<Card style={{padding:20,flex:'2 1 480px',minWidth:0}}>
          <h3 style={tituloS}>Pessoas da gestão</h3>
          {celular&&<div data-gestao style={{display:'flex',flexDirection:'column',gap:8}}>{gestao.map(p=><div key={p.id} data-gestor={p.nome} style={{background:C.warm,border:`1px solid ${C.border}`,borderRadius:14,padding:'11px 12px',display:'flex',alignItems:'flex-start',gap:8}}>
            <div style={{flex:1,minWidth:0,fontSize:13,lineHeight:1.5}}><div><b style={{fontSize:14.5}}>{p.nome}</b>{p.user_id===uid&&<span style={{color:C.inkSoft}}> (você)</span>}{p.status==='convidado'&&<> <Tag tom="plum">convite enviado</Tag></>}</div>
              <div><Tag tom={p.papel==='admin'?'plum':p.papel==='financeiro'?'warn':'ok'}>{PAPEL_ROT[p.papel]||'—'}</Tag> <span style={{color:C.inkSoft}}>cuida de {p.unidades.map(id=>U[id]?(U[id].mae_id?U[id].nome:'time inteiro'):null).filter(Boolean).join(', ')}</span></div>
              <div style={{color:C.inkSoft}}>{p.joga?`também joga na ${U[p.joga]?.nome}`:'não joga'}</div></div>
            <button data-editar-gestor={p.nome} style={btnS} onClick={()=>setPessoaEd(p)}>Editar</button></div>)}</div>}
          {!celular&&<div style={{overflowX:'auto'}}><table data-gestao style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>{['Nome','Papel','Cuida de','Também joga',''].map((h,i)=><th key={i} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{gestao.map(p=><tr key={p.id} data-gestor={p.nome}>
              <td style={{...tdS,fontWeight:700}}>{p.nome}{p.user_id===uid&&<span style={{color:C.inkSoft,fontWeight:500}}> (você)</span>}{p.status==='convidado'&&<> <Tag tom="plum">convite enviado</Tag></>}</td>
              <td style={tdS}><Tag tom={p.papel==='admin'?'plum':p.papel==='financeiro'?'warn':'ok'}>{PAPEL_ROT[p.papel]||'—'}</Tag></td>
              <td style={{...tdS,whiteSpace:'normal'}}>{p.unidades.map(id=>U[id]?(U[id].mae_id?U[id].nome:'time inteiro'):null).filter(Boolean).join(', ')}</td>
              <td style={tdS}>{p.joga?U[p.joga]?.nome:<span style={{color:C.inkSoft}}>não</span>}</td>
              <td style={{...tdS,display:'flex',gap:6}}>
                <button data-editar-gestor={p.nome} style={btnS} onClick={()=>setPessoaEd(p)}>Editar</button></td></tr>)}</tbody></table></div>}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10,marginTop:12}}>
            {['professor','financeiro','admin'].map(k=><div key={k} style={{background:C.warm,border:`1px solid ${C.border}`,borderRadius:12,padding:'10px 12px',fontSize:12.5,lineHeight:1.5}}><b>{PAPEL_ROT[k]}</b><br/>{PAPEL_DICA[k]}.</div>)}
          </div>
        </Card>}
      </div>
      {(d.pedidos||[]).length>0&&podeAlgum('gerir_pessoas')&&<Card data-pedidos style={{padding:20}}>
        <h3 style={tituloS}>Pedidos pra entrar <span style={{fontSize:14,color:C.inkSoft,fontWeight:500}}>{d.pedidos.length}</span></h3>
        {d.pedidos.map(pd=>{ const esc=pedEsc[pd.id]||{}; const raizU=d.unidades.find(u=>!u.mae_id);
          const retas=d.unidades.filter(u=>u.mae_id&&!d.unidades.some(f=>f.mae_id===u.id)&&pode('gerir_pessoas',u.id));
          const reta=esc.unidade??(retas[0]?retas[0].id:(raizU?raizU.id:''));
          return <div key={pd.id} data-pedido={pd.nome} style={{padding:'12px 0',borderTop:`1px solid ${C.border}`,display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
            <div style={{flex:'1 1 180px',minWidth:0}}><b>{pd.nome}</b><div style={{fontSize:12.5,color:C.inkSoft}}>pediu pelo código em {dataBR(pd.criado_em)}</div></div>
            <input data-pedido-nome aria-label={`Nome de ${pd.nome} no time`} style={{...inputStyle,width:160,padding:'8px 10px'}} value={esc.nome??pd.nome} onChange={e=>setPedEsc(x=>({...x,[pd.id]:{...esc,nome:e.target.value}}))}/>
            <select data-pedido-reta aria-label="Reta" style={{...inputStyle,width:'auto',padding:'8px 10px'}} value={reta} onChange={e=>setPedEsc(x=>({...x,[pd.id]:{...esc,unidade:e.target.value}}))}>
              {retas.map(u=><option key={u.id} value={u.id}>{nomeUnidade(u)}</option>)}
              {raizU&&pode('gerir_pessoas',raizU.id)&&<option value={raizU.id}>Escolher a reta depois</option>}
            </select>
            <button style={btnP} onClick={()=>rodar('decidir_entrada',{p_pedido:pd.id,p_aprovar:true,p_unidade:reta||null,p_nome:(esc.nome??pd.nome).trim()||null,p_motivo:null},`${(esc.nome??pd.nome).trim()} entrou no time.`)}>Aprovar</button>
            <button style={{...btnS,color:C.red}} onClick={()=>setPerg({label:`Recusar o pedido de ${pd.nome}`,hint:'Diga o motivo (a pessoa vê).',kind:'text',valor:'',onSave:async m=>{ setPerg(null); await rodar('decidir_entrada',{p_pedido:pd.id,p_aprovar:false,p_unidade:null,p_nome:null,p_motivo:m||null},'Pedido recusado.'); }})}>Recusar</button>
          </div>; })}
      </Card>}
      {(()=>{ const raizU=d.unidades.find(u=>!u.mae_id); if(!raizU||!pode('gerir_pessoas',raizU.id)) return null; const cod=d.codigo&&d.codigo.ativo?d.codigo.codigo:null;
        const msg=cod?`Entre no time ${raizU.nome} no GrinderBank: crie sua conta em https://grinderbank.com e use o código ${cod}.`:'';
        return <Card data-codigo-card style={{padding:20}}>
          <h3 style={tituloS}>Código do time</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:10,lineHeight:1.5}}>Quem tem o código pede pra entrar (no cadastro ou em Ajustes, se já tem conta). O pedido aparece aqui e só vale depois que alguém da gestão aprova e escolhe a reta.</div>
          {cod?<div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span data-codigo style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:22,letterSpacing:1,color:P}}>{cod}</span>
            <button style={btnS} onClick={()=>{ try{ navigator.clipboard.writeText(cod); setAviso({erro:false,texto:'Código copiado.'}); }catch(e){} }}>Copiar</button>
            <a style={{...btnS,textDecoration:'none'}} target="_blank" rel="noreferrer" href={'https://wa.me/?text='+encodeURIComponent(msg)}>Mandar no WhatsApp</a>
            <button style={btnS} onClick={()=>setPerg({label:'Trocar o código do time?',hint:'O código atual para de valer na hora. Digite TROCAR pra confirmar.',kind:'text',valor:'',onSave:async t=>{ setPerg(null); if(String(t).trim().toUpperCase()==='TROCAR') await rodar('gerar_codigo_time',{},'Código novo gerado. O anterior não vale mais.'); }})}>Trocar código</button>
          </div>:<button data-gerar-codigo style={btnP} onClick={()=>rodar('gerar_codigo_time',{},'Código do time gerado.')}>Gerar código do time</button>}
        </Card>; })()}
      {podeConvidar&&<Card style={{padding:20}}>
        <h3 style={tituloS}>Convites ativos</h3>
        {!convAtivos.length&&<div style={{fontSize:14,color:C.inkSoft}}>Nenhum convite aberto.</div>}
        {convAtivos.length>0&&<div style={{overflowX:'auto'}}><table data-convites style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{['Para','Tipo','Onde','Usos','Vence',''].map((h,i)=><th key={i} style={thS}>{h}</th>)}</tr></thead>
          <tbody>{convAtivos.map(c=><tr key={c.id}>
            <td style={{...tdS,fontWeight:700}}>{c.pessoa_id?nomeDe(c.pessoa_id):'Qualquer jogador'}</td><td style={tdS}>{tipoConvite(c)}</td>
            <td style={tdS}>{U[c.unidade_id]?.nome||'—'}</td><td style={tdS}>{c.usos}{c.usos_max?` de ${c.usos_max}`:''}</td><td style={tdS}>{dataBR(c.expira_em)}</td>
            <td style={tdS}>{pode('gerir_pessoas',c.unidade_id)&&<button style={{...btnS,color:C.red}} onClick={()=>rodar('revogar_convite',{p_id:c.id},'Convite cancelado.')}>Cancelar</button>}</td></tr>)}</tbody></table></div>}
        <div style={{fontSize:12,color:C.inkSoft,marginTop:8}}>O link só aparece na hora de gerar. Perdeu? Cancele e gere outro.</div>
      </Card>}
      <Portal>{modais}</Portal>
    </div>;
  }

  /* ---------- REGRAS DO TIME (contrato e promoção; as regras de jogo ficam logo abaixo, nos Ajustes do time) ---------- */
  if(secao==='g_regras'){
    const mkBloq=raiz?regraEf(raiz.id,'bloquear_promocao_com_mk')===true:false;
    const podeRegras=raiz&&pode('configurar_regras',raiz.id);
    return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
      {header('Regras do time')}
      {avisoBox}
      {raiz&&pode('administrar',raiz.id)&&<Card style={{padding:20}} data-marca-time>
        <h3 style={tituloS}>Marca do time</h3>
        <MarcaEditor nomeTime={nomeTime} atual={marca} onSalvar={async a=>{ const r=await rodar('definir_marca',{...a,p_ws:null},'Marca do time salva.'); if(r&&onMarca) onMarca(); }}/>
      </Card>}
      <Card style={{padding:20}}>
        <h3 style={tituloS}>Contrato</h3>
        <div data-contrato style={{fontSize:14,marginBottom:12,lineHeight:1.5}}>{faixasTexto(contratoRaiz?.faixas)}</div>
        {podeRegras&&<button data-editar-contrato style={btnS} onClick={()=>setContratoAberto(true)}>{contratoRaiz?'Mudar contrato':'Definir contrato'}</button>}
      </Card>
      <Card style={{padding:20}}>
        <h3 style={tituloS}>Promoção</h3>
        <label style={{display:'flex',gap:10,alignItems:'center',fontSize:14,fontWeight:600,cursor:podeRegras?'pointer':'default'}}>
          <input type="checkbox" data-regra-mk-time disabled={!podeRegras} checked={mkBloq} onChange={e=>rodar('definir_regra',{p_unidade:raiz.id,p_chave:'bloquear_promocao_com_mk',p_valor:e.target.checked,p_desde:null},e.target.checked?'Promoção com MK bloqueada no servidor.':'Promoção com MK liberada (a tela só avisa).')}/>
          Não promover quem está em MK</label>
        <div style={{fontSize:12.5,color:C.inkSoft,marginTop:6,lineHeight:1.5}}>{mkBloq?'Ligado: o servidor recusa promover jogador com make-up negativo.':'Desligado: dá pra promover, a tela só avisa que o jogador está em MK.'}</div>
      </Card>
      {(()=>{ const unis=d.unidades; if(!unis.length) return null;
        const selU=U[regraSel]||unis.find(u=>u.mae_id&&pode('configurar_regras',u.id))||unis.find(u=>u.mae_id)||raiz; if(!selU) return null;
        const podeSel=pode('configurar_regras',selU.id), ehRaiz=!selU.mae_id;
        const mudar=(rr,v)=>{ if(rr.kind==='bool') return rodar('definir_regra',{p_unidade:selU.id,p_chave:rr.k,p_valor:!(v===true),p_desde:null},`${rr.rot}: ${v===true?'desligado':'ligado'} na ${selU.nome}.`);
          setPerg({label:`${rr.rot} · ${ehRaiz?'time inteiro':selU.nome}`,hint:rr.kind==='list'?'Separe por vírgula.':'Vale daqui pra frente, pra quem joga nesta unidade e nas de baixo (que não tiverem a própria).',kind:rr.kind,valor:v,
            onSave:async x=>{ setPerg(null); if(rr.kind==='list'&&!(Array.isArray(x)&&x.length)) return; await rodar('definir_regra',{p_unidade:selU.id,p_chave:rr.k,p_valor:x,p_desde:null},`${rr.rot} da ${ehRaiz?'equipe':selU.nome} salvo.`); }}); };
        const c=contratoEf(selU.id), cProprio=c&&c.unidade_id===selU.id;
        return <Card style={{padding:20}} data-regras-reta>
          <h3 style={tituloS}>Regras por reta</h3>
          <div style={{fontSize:12.5,color:C.inkSoft,marginBottom:10,lineHeight:1.5}}>Escolha "Time inteiro" pro padrão do time. Cada reta herda da de cima; mude só onde a reta é diferente.</div>
          <div style={{position:'relative',display:'inline-block',marginBottom:6}}>
          <select data-regra-unidade value={selU.id} onChange={e=>setRegraSel(e.target.value)} style={{...inputStyle,width:'auto',paddingRight:36}}>
            {unis.map(u=><option key={u.id} value={u.id}>{u.mae_id?caminhoNome(u):'Time inteiro'}</option>)}</select>
          <span aria-hidden="true" style={{position:'absolute',right:13,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:C.inkSoft,fontSize:12}}>▼</span></div>
          {REGRAS_RETA.map(rr=>{ const r=regraComOrigem(selU.id,rr.k), proprio=!!(r&&r.unidade_id===selU.id), v=r?r.valor:rr.padrao(config||{});
            const origem=r?(proprio?(ehRaiz?'do time':'desta unidade'):`herdado de ${U[r.unidade_id]?.nome}`):'padrão do time';
            // no "Time inteiro", ABI, stop, sites e modalidades são o padrão do time (a configuração): editados aqui mesmo (A-029)
            const doPadrao=ehRaiz&&!['reserva_por_sala','bloquear_promocao_com_mk'].includes(rr.k)&&!proprio;
            const editavel=podeSel&&(!doPadrao||!!onPadrao);
            return <div key={rr.k} data-regra={rr.k} style={{display:'grid',gridTemplateColumns:celular?'1fr auto':'minmax(170px,1fr) auto auto',alignItems:'center',gap:'4px 10px',padding:'9px 0',borderTop:`1px solid ${C.border}`,fontSize:13.5}}>
              <span style={{color:C.inkSoft,gridColumn:celular?'1 / -1':undefined}}>{rr.rot}</span>
              <span style={{minWidth:0}}><b data-regra-valor>{rr.txt(v)}</b><span data-regra-origem style={{fontSize:12,color:C.inkSoft}}> · {origem}</span></span>
              <span style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
              {editavel&&<button style={btnS} onClick={()=>doPadrao?onPadrao(rr.k):mudar(rr,v)}>Mudar</button>}
              {editavel&&proprio&&<button style={btnS} onClick={()=>rodar('limpar_regra',{p_unidade:selU.id,p_chave:rr.k},`${rr.rot}: ${selU.nome} volta a herdar.`)}>Herdar</button>}
              </span>
            </div>; })}
          {!ehRaiz&&<div data-regra="contrato" style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'8px 0',borderTop:`1px solid ${C.border}`,fontSize:13.5}}>
            <span style={{flex:1,minWidth:170,color:C.inkSoft}}>Contrato</span><b data-regra-valor>{faixasTexto((c||contratoRaiz)?.faixas)}</b>
            <span data-regra-origem style={{fontSize:12,color:C.inkSoft}}>· {cProprio?'desta unidade':c&&c.unidade_id!==raiz?.id?`herdado de ${U[c.unidade_id]?.nome}`:'do time'}</span>
            {podeSel&&<button style={btnS} onClick={()=>setContratoAberto(selU.id)}>Mudar</button>}
            {podeSel&&cProprio&&<button style={btnS} onClick={()=>rodar('limpar_regra',{p_unidade:selU.id,p_chave:'contrato'},`Contrato: ${selU.nome} volta a herdar.`)}>Herdar</button>}
          </div>}
        </Card>; })()}
      <div style={{fontSize:12.5,color:C.inkSoft}}>A grade de cada reta fica na aba <button onClick={()=>onIr('g_grades')} style={{border:'none',background:'transparent',color:P,fontWeight:700,padding:0,cursor:'pointer',font:'inherit'}}>Grades</button>.</div>
      <Portal>{modais}</Portal>
    </div>;
  }
  return null;
}
function ReloadModal({salas,onClose,onPedir}){
  useEsc(onClose);
  const [f,setF]=useState({valor:'',sala:'',motivo:''});
  const ok=parseValor(f.valor)>0&&String(f.sala).trim().length>0;
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50}}>
    <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:460,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>Pedir reload</h3>
        <button onClick={onClose} style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
      </div>
      <div><label style={labelStyle}>Quanto (US$)</label><input style={inputStyle} inputMode="decimal" value={f.valor} placeholder="ex.: 100" onChange={e=>setF(x=>({...x,valor:e.target.value}))}/></div>
      <SalaCampo salas={salas} valor={f.sala} onChange={v=>setF(x=>({...x,sala:v}))} rotulo="Em qual sala"/>
      <div><label style={labelStyle}>Motivo (opcional)</label><input style={inputStyle} value={f.motivo} placeholder="ex.: banca abaixo do mínimo da grade" onChange={e=>setF(x=>({...x,motivo:e.target.value}))}/></div>
      <div style={{fontSize:12,color:C.inkSoft,lineHeight:1.5}}>Quem aprova os saques do time é avisado. Quando o time mandar, o valor entra no seu MU.</div>
      <button disabled={!ok} onClick={()=>onPedir({p_valor:parseValor(f.valor),p_sala:f.sala.trim()||null,p_motivo:f.motivo.trim()||null})}
        style={{padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:ok?'pointer':'default',opacity:ok?1:.5}}>Pedir reload</button>
    </div>
  </div>;
}
function PlanilhaModal({p,onClose,onEnviar}){
  useEsc(onClose);
  const [busy,setBusy]=useState(false);
  const linha=(rot,val,forte)=><div style={{display:'flex',justifyContent:'space-between',gap:10,padding:'5px 0',borderBottom:`1px solid ${C.border}`,fontSize:13.5}}><span style={{color:C.inkSoft}}>{rot}</span><b style={{color:forte?C.ink:C.inkSoft}}>{val}</b></div>;
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50}}>
    <div onClick={e=>e.stopPropagation()} data-planilha-previa className="ftfade" style={{background:C.surface,width:'100%',maxWidth:460,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:10,maxHeight:'92vh',overflowY:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>Conferir antes de enviar</h3>
        <button onClick={onClose} style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
      </div>
      <div style={{fontSize:13,color:C.inkSoft}}>{p.nome}{p.atualizado_em?` · planilha de ${dataBR(p.atualizado_em)}`:''}</div>
      <div>
        {(p.saldos||[]).filter(s=>s.saldo).map(s=><React.Fragment key={s.sala}>{linha(s.sala,fmt(s.saldo))}</React.Fragment>)}
        {linha('Banca (soma das salas)',fmt(p.banca),true)}
        {linha('MakeUp (capital do time)',fmt(p.makeup),true)}
        {linha('Lucro na banca',fmt(p.lucro))}
        {linha('Cashout (lucro já sacado)',fmt(p.cashout),true)}
        {linha('Lifetime',fmt(p.lifetime))}
        {linha('Contrato',`${p.contrato_texto||'—'}${p.contrato_fim?` · até ${dataBR(p.contrato_fim)}`:''}`)}
        {linha('Grade',`${(p.grade||[]).length} linhas`)}
      </div>
      {(p.avisos||[]).map((t,i)=><div key={i} style={{color:C.red,fontSize:13,fontWeight:600}}>{t}</div>)}
      <div style={{fontSize:12,color:C.inkSoft,lineHeight:1.5}}>O time confere esses valores antes de valer. Depois de conferida, a planilha vira o ponto de partida: os saques e o capital entram por aqui.</div>
      <button disabled={busy} onClick={async()=>{ setBusy(true); await onEnviar(); setBusy(false); }}
        style={{padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',opacity:busy?.6:1}}>Enviar pro time conferir</button>
    </div>
  </div>;
}
/* grade da reta: quadro só de leitura (aluno) e editor (quem configura regras), no formato da planilha do time */
const GRADE_MODELO_LINHAS=['Semanal','Reentry semanal','Turbo/Fast','Reentry turbo','Sunday','Reentry sunday','Extra','Reentry extras'];
const gradeModelo=()=>[...['GGpoker','PokerStars','ACR'].flatMap(site=>GRADE_MODELO_LINHAS.map(tipo=>({site,tipo,regular:'',prog_ko:'',hyper:''}))),
  {site:'PokerStars',tipo:'SNG',regular:'',prog_ko:'',hyper:''}];
function GradeTabela({celulas}){
  const celular=useCelular();
  const th={textAlign:'left',padding:'6px 6px',color:C.inkSoft,fontSize:11,textTransform:'uppercase',borderBottom:`1px solid ${C.border}`};
  const cols=[['regular','Regular'],['prog_ko','Prog KO'],['hyper','Hyper']];
  // no celular, uma linha da grade vira um cartão (as 5 colunas não cabem: o Hyper ficava cortado)
  if(celular) return <div data-grade style={{display:'flex',flexDirection:'column',gap:8}}>
    {celulas.map((g,i)=><div key={i} data-grade-cartao style={{background:C.warm,border:`1px solid ${C.border}`,borderRadius:12,padding:'9px 11px',fontSize:12.5,lineHeight:1.5}}>
      <div><b>{nomeSala(g.site)}</b> · {g.tipo}</div>
      {cols.map(([k,r])=><div key={k}><span style={{color:C.inkSoft}}>{r}: </span>{g[k]?fmtGradeTexto(g[k]):'—'}</div>)}</div>)}
  </div>;
  return <div style={{overflowX:'auto'}}><table data-grade style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
    <thead><tr>{['Sala','Tipo',...cols.map(c=>c[1])].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
    <tbody>{celulas.map((g,i)=><tr key={i} style={{borderBottom:`1px solid ${C.border}`,verticalAlign:'top'}}>
      <td style={{padding:'6px',fontWeight:700,whiteSpace:'nowrap'}}>{i===0||salaChave(celulas[i-1].site)!==salaChave(g.site)?nomeSala(g.site):''}</td><td style={{padding:'6px'}}>{g.tipo}</td>
      {cols.map(([k])=><td key={k} style={{padding:'6px',whiteSpace:'pre-line',minWidth:120}}>{g[k]?fmtGradeTexto(g[k]):'—'}</td>)}</tr>)}</tbody>
  </table></div>;
}
function GradeModal({u,efetiva,origem,historico,planilhas,regraMk,podeEditar,onSalvar,onApagar,onRegra,onClose}){
  useEsc(onClose);
  const [linhas,setLinhas]=useState(()=>((efetiva&&efetiva.celulas)||[]).map(x=>({...x})));
  const [desde,setDesde]=useState(todayISO());
  const [simulada,setSimulada]=useState(efetiva?!!efetiva.simulada:false);
  const [obs,setObs]=useState('');
  const [busy,setBusy]=useState(false);
  const muda=(i,k,v)=>setLinhas(l=>l.map((x,j)=>j===i?{...x,[k]:v}:x));
  const inp={width:'100%',minWidth:70,padding:'7px 8px',borderRadius:9,border:`1.5px solid ${C.border}`,background:C.warm,color:C.ink,fontSize:13,outline:'none'};
  const btn={padding:'7px 11px',borderRadius:10,border:`1.5px solid ${C.border}`,background:C.surface,color:P,fontWeight:700,fontSize:12.5,cursor:'pointer'};
  const prontas=linhas.filter(x=>String(x.site||'').trim()&&String(x.tipo||'').trim());
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:50}}>
    <div onClick={e=>e.stopPropagation()} data-grade-editor className="ftfade" style={{background:C.surface,width:'100%',maxWidth:1100,height:'96vh',maxHeight:'96vh',overflowY:'auto',borderRadius:'24px 24px 0 0',padding:'22px 18px calc(22px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>Grade · {u.nome}</h3>
        <button onClick={onClose} aria-label="Fechar" style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
      </div>
      <div style={{fontSize:13,color:C.inkSoft,lineHeight:1.5}}>
        {efetiva?(origem&&origem.id!==u.id?<>Hoje {u.nome} usa a grade de <b>{origem.nome}</b> (vale desde {dataBR(efetiva.vigente_desde)}).{podeEditar?' Salvar aqui cria uma grade própria pra esta unidade.':''}</>
                 :<>Grade própria, vale desde {dataBR(efetiva.vigente_desde)}.</>)
                :<>{u.nome} ainda não tem grade. Sem grade, vale o teto de ABI dos Ajustes.</>}
        {' '}Escreva como na planilha: <i>até $2,50 + $3 2k+</i> · <i>$2,50 5k+</i> · <i>não</i> · <i>ok</i> · <i>$1.10 + Bounty Builder até $3.30</i>.
      </div>
      {efetiva&&efetiva.simulada&&<div data-grade-simulada style={{background:C.goldSoft,color:C.gold,borderRadius:12,padding:'10px 12px',fontSize:13,fontWeight:700}}>Grade simulada: montada sem a planilha oficial desta reta.</div>}
      {podeEditar&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {!linhas.length&&<button style={btn} onClick={()=>setLinhas(gradeModelo())}>Começar do modelo</button>}
        {planilhas.map(pl=><button key={pl.nome} style={btn} onClick={()=>setLinhas(pl.grade.map(x=>({...x})))}>Copiar da planilha de {pl.nome}</button>)}
      </div>}
      {linhas.length>0&&<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
        <thead><tr>{['Sala','Linha','Regular','Prog KO','Hyper',''].map((h,i)=><th key={i} style={{textAlign:'left',padding:'6px 4px',color:C.inkSoft,fontSize:11,textTransform:'uppercase',borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead>
        <tbody>{linhas.map((g,i)=><tr key={i} data-grade-linha={i} style={{borderBottom:`1px solid ${C.border}`,verticalAlign:'top'}}>
          {['site','tipo','regular','prog_ko','hyper'].map(k=><td key={k} style={{padding:'5px 4px',minWidth:k==='site'?90:k==='tipo'?110:150}}>
            {podeEditar?(['regular','prog_ko','hyper'].includes(k)
                ?<textarea data-celula={k} rows={Math.max(2,Math.ceil(String(g[k]||'').length/24))} value={g[k]||''} onChange={e=>muda(i,k,e.target.value)} style={{...inp,resize:'vertical',lineHeight:1.35,fontFamily:'inherit'}}/>
                :<input data-celula={k} value={g[k]||''} onChange={e=>muda(i,k,e.target.value)} style={inp}/>)
              :<div style={{padding:'7px 2px',whiteSpace:'pre-line'}}>{g[k]?(k==='site'?nomeSala(g[k]):fmtGradeTexto(g[k])):'—'}</div>}
            {['regular','prog_ko','hyper'].includes(k)&&String(g[k]||'').trim()&&<div data-entendi style={{fontSize:11,color:C.inkSoft,marginTop:3,lineHeight:1.35}}>{resumoCelulaGrade(g[k])}</div>}
          </td>)}
          <td style={{padding:'5px 4px'}}>{podeEditar&&<button aria-label="Tirar linha" onClick={()=>setLinhas(l=>l.filter((_,j)=>j!==i))} style={{border:'none',background:'transparent',color:C.inkSoft,cursor:'pointer',padding:6}}><IcoX s={15}/></button>}</td>
        </tr>)}</tbody>
      </table></div>}
      {podeEditar&&<>
        <div><button style={btn} onClick={()=>setLinhas(l=>[...l,{site:l.length?l[l.length-1].site:'',tipo:'',regular:'',prog_ko:'',hyper:''}])}>+ Linha</button></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:10,alignItems:'end'}}>
          <div><label style={labelStyle}>Vale desde</label><input type="date" data-grade-desde value={desde} onChange={e=>setDesde(e.target.value)} style={inputStyle}/></div>
          <div><label style={labelStyle}>Observação (opcional)</label><input value={obs} onChange={e=>setObs(e.target.value)} placeholder="ex.: liberado o Sunday Storm de $22" style={inputStyle}/></div>
        </div>
        <label style={{display:'flex',gap:8,alignItems:'center',fontSize:13.5,fontWeight:600,cursor:'pointer'}}>
          <input type="checkbox" data-grade-simulada-check checked={simulada} onChange={e=>setSimulada(e.target.checked)}/> Grade simulada (montada sem a planilha oficial; os jogadores veem o aviso)</label>
        <button disabled={busy||!prontas.length} onClick={async()=>{ setBusy(true); await onSalvar({desde,simulada,celulas:prontas,obs}); setBusy(false); }}
          style={{padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer',opacity:busy||!prontas.length?.5:1}}>Salvar grade de {u.nome}</button>
        {onRegra&&<div style={{borderTop:`1px solid ${C.border}`,paddingTop:12}}>
          <label style={{display:'flex',gap:8,alignItems:'center',fontSize:13.5,fontWeight:600,cursor:'pointer'}}>
            <input type="checkbox" data-regra-mk checked={!!regraMk} onChange={e=>onRegra(e.target.checked)}/> Não promover quem está em MK (vale pra {u.nome} e o que está abaixo)</label>
        </div>}
      </>}
      {historico.length>0&&<div style={{borderTop:`1px solid ${C.border}`,paddingTop:10}}>
        <div style={labelStyle}>Versões desta unidade</div>
        {historico.map(h=><div key={h.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',fontSize:13}}>
          <span style={{flex:1}}>Desde {dataBR(h.vigente_desde)}{h.simulada?' · simulada':''}{h.observacao?` · ${h.observacao}`:''}</span>
          {podeEditar&&<button style={{...btn,color:C.red}} onClick={()=>onApagar(h)}>Apagar</button>}
        </div>)}
      </div>}
    </div>
  </div>;
}
function SaqueModal({pessoa,salas,onClose,onPedir}){
  useEsc(onClose);
  // cada sala: o saldo de agora (o que o jogador vê no site) e quanto sai dela; o servidor confere tudo de novo
  const base=(salas||[]).filter(s=>s.chave);
  const [ls,setLs]=useState(()=>base.length?base.map(s=>({sala:s.sala,sistema:num(s.saldo),saldo:'',valor:''})):[{sala:'',sistema:null,saldo:'',valor:''}]);
  const [dev,setDev]=useState(''); const [obs,setObs]=useState('');
  const [prev,setPrev]=useState(null); const [err,setErr]=useState('');
  const [sug,setSug]=useState(null);   // sugestão do servidor: devolve o MU e saca deixando a reserva em cada sala
  useEffect(()=>{ let vivo=true; (async()=>{ try{ const {data,error}=await sb.rpc('sugerir_saque',{p_pessoa:pessoa}); if(vivo&&!error&&data) setSug(data); }catch(e){} })(); return ()=>{ vivo=false; }; },[pessoa]);
  const br=v=>String(Number(v)||0).replace('.',',');
  const nomeadas=ls.filter(l=>String(l.sala).trim());
  const banca=cent(nomeadas.reduce((a,l)=>a+parseValor(l.saldo),0)), total=cent(nomeadas.reduce((a,l)=>a+parseValor(l.valor),0));
  const devolucao=cent(parseValor(dev)), cashout=cent(total-devolucao);
  const problema=ls.some(l=>!String(l.sala).trim()&&(parseValor(l.saldo)||parseValor(l.valor)))?'Dê o nome da sala.'
    :nomeadas.some(l=>parseValor(l.valor)>parseValor(l.saldo)+0.001)?'Não dá pra sacar de uma sala mais do que ela tem.'
    :new Set(nomeadas.map(l=>salaChave(l.sala))).size<nomeadas.length?'Sala repetida.'
    :cashout<0?'A devolução é maior do que o que sai das salas.':'';
  useEffect(()=>{ if(problema||!(banca>0)||!(total>0)){ setPrev(null); setErr(problema); return; }
    const t=setTimeout(async()=>{ const {data,error}=await sb.rpc('simular_saque',{p_pessoa:pessoa,p_banca:banca,p_devolucao:devolucao,p_cashout:cashout});
      if(error){ setPrev(null); setErr(error.message||'Valores inválidos.'); } else { setPrev(data); setErr(''); } },350);
    return ()=>clearTimeout(t); },[banca,total,devolucao,cashout,problema]);
  const usarSugestao=()=>{ if(!sug) return; const de=Object.fromEntries((sug.de_onde||[]).map(x=>[salaChave(x.sala),x]));
    setLs(x=>x.map(l=>{ const y=de[salaChave(l.sala)]; return {...l,saldo:l.sistema!=null?br(l.sistema):l.saldo,valor:sug.por_sala&&y?br(y.sacar):l.valor}; }));
    setDev(br(sug.devolucao)); };
  const muda=(i,k,v)=>setLs(x=>x.map((l,j)=>j===i?{...l,[k]:v}:l));
  const ok=!!prev&&!problema;
  return <div onClick={onClose} style={fundoModal}>
    <div onClick={e=>e.stopPropagation()} data-saque-modal className="ftfade" style={caixaModal}>
      {topoModal('Pedir saque',onClose)}
      {sug&&sug.em_mk&&<div data-saque-sugestao="mk" style={{background:C.goldSoft,color:'#6b4e1a',borderRadius:12,padding:'10px 12px',fontSize:13,lineHeight:1.5}}>Em MK: a banca no sistema ({fmt(sug.banca)}) está abaixo do MU ({fmt(sug.mu)}). Saque de lucro só depois de sair do MK.</div>}
      {/* nada a sacar por causa da reserva: a janela diz por quê (A-056) */}
      {sug&&!sug.em_mk&&!(Number(sug.devolucao)>0||Number(sug.cashout)>0)&&<div data-saque-sugestao="nada" style={{background:C.goldSoft,color:'#6b4e1a',borderRadius:12,padding:'10px 12px',fontSize:13,lineHeight:1.5}}>
        Nada a sacar agora{Number(sug.reserva_por_sala)>0?`: cada sala precisa manter ${fmt(sug.reserva_por_sala)} e nenhuma tem mais que isso`:': a banca não passa do MU'}.
        {sug.por_sala&&(sug.de_onde||[]).length>0?<> Hoje: {(sug.de_onde||[]).map(x=>`${x.sala} ${fmt(x.saldo)}`).join(' · ')}.</>:null}</div>}
      {sug&&!sug.em_mk&&(Number(sug.devolucao)>0||Number(sug.cashout)>0)&&<div data-saque-sugestao style={{background:C.bg,borderRadius:12,padding:'10px 12px',fontSize:13,lineHeight:1.5}}>
        Sugestão: devolver <b>{fmt(sug.devolucao)}</b> de MU e sacar <b>{fmt(sug.cashout)}</b> (banca depois {fmt(sug.banca_depois)}).
        {/* o texto é montado por sala: quem já está abaixo da reserva não "fica com a reserva" (A-057) */}
        {sug.por_sala&&(sug.de_onde||[]).length>0?<div data-saque-por-sala style={{marginTop:4}}>{(sug.de_onde||[]).map(x=>{ const sai=Number(x.sacar)||0, fica=cent(num(x.saldo)-sai), r=Number(sug.reserva_por_sala)||0;
            return <div key={x.sala}><b>{x.sala}</b>: {sai>0?`sai ${fmt(sai)}, fica ${fmt(fica)}`:r>0&&num(x.saldo)<=r?`fica ${fmt(x.saldo)} (já está na reserva de ${fmt(r)}: não sai nada)`:`fica ${fmt(x.saldo)}`}</div>; })}</div>
          :Number(sug.reserva_total)>0?<> Deixa {fmt(sug.reserva_total)} de reserva nas salas.</>:null}
        <div style={{marginTop:6}}><button style={btnS} onClick={usarSugestao}>Usar sugestão</button></div></div>}
      <div style={{fontSize:12.5,color:C.inkSoft}}>Em cada sala: quanto tem agora (como aparece no site) e quanto sai dela.</div>
      {ls.map((l,i)=>{ const dif=l.sistema!=null&&String(l.saldo).trim()!==''?cent(parseValor(l.saldo)-l.sistema):null;
        return <div key={i} data-saque-sala={l.sala||i} style={{border:`1px solid ${C.border}`,borderRadius:12,padding:'10px 12px',display:'flex',flexDirection:'column',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {l.sistema!=null?<b style={{flex:1}}>{l.sala}</b>:<input data-saque-sala-nome style={{...inputStyle,flex:1}} value={l.sala} placeholder="Nome da sala" onChange={e=>muda(i,'sala',e.target.value)}/>}
            {l.sistema!=null&&<span style={{fontSize:12,color:C.inkSoft}}>no sistema {fmt(l.sistema)}</span>}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><div style={{fontSize:11,fontWeight:700,color:C.inkSoft,marginBottom:3}}>Saldo agora</div>
              <input data-saque-saldo aria-label={`Saldo agora em ${l.sala||'sala'}`} style={inputStyle} inputMode="decimal" value={l.saldo} placeholder="0" onChange={e=>muda(i,'saldo',e.target.value)}/></div>
            <div><div style={{fontSize:11,fontWeight:700,color:C.inkSoft,marginBottom:3}}>Sacar daqui</div>
              <input data-saque-valor aria-label={`Sacar de ${l.sala||'sala'}`} style={inputStyle} inputMode="decimal" value={l.valor} placeholder="0" onChange={e=>muda(i,'valor',e.target.value)}/></div></div>
          {dif!=null&&Math.abs(dif)>1&&<div data-saque-sala-diferente style={{fontSize:12,color:C.red,fontWeight:600}}>{fmtSinal(dif)} em relação ao sistema: o time vai ver a diferença.</div>}
        </div>; })}
      <button style={{...btnS,alignSelf:'flex-start'}} onClick={()=>setLs(x=>[...x,{sala:'',sistema:null,saldo:'',valor:''}])}>+ outra sala</button>
      <div data-saque-totais style={{fontSize:13.5,lineHeight:1.6}}>Banca (soma das salas): <b>{fmt(banca)}</b> · sai das salas: <b>{fmt(total)}</b></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,alignItems:'end'}}>
        <div><label style={labelStyle} htmlFor="sq-dev">Disso, devolver de MU</label><input id="sq-dev" data-saque-devolucao style={inputStyle} inputMode="decimal" value={dev} placeholder="0" onChange={e=>setDev(e.target.value)}/></div>
        <div style={{fontSize:13.5,paddingBottom:12}}>Cashout (lucro): <b data-saque-cashout>{fmt(Math.max(cashout,0))}</b></div></div>
      <div><label style={labelStyle}>Observação (opcional)</label><input style={inputStyle} value={obs} placeholder="ex.: GG pelo Skrill, PS pela conta do banco" onChange={e=>setObs(e.target.value)}/></div>
      {err&&<div data-saque-erro style={{color:C.red,fontSize:13,fontWeight:600}}>{err}</div>}
      {prev&&<div data-saque-previa style={{background:C.plumSoft,borderRadius:12,padding:'12px 14px',fontSize:13.5,lineHeight:1.6}}>
        Você fica com <b>{fmt(prev.parte_jogador)}</b> · time recebe <b>{fmt(prev.total_time)}</b> ({fmt(prev.devolucao)} de MU + {fmt(prev.parte_time)} do cashout)<br/>
        Banca depois: {fmt(prev.banca_depois)} · MU depois: {fmt(prev.mu_depois)}
        {prev.divisao&&prev.divisao.faixas&&prev.divisao.faixas[0]&&<><br/><span data-saque-faixa>Faixa de {Math.round(Number(prev.divisao.faixas[0].jogador_pct)*1000)/10}% pro saque inteiro (lifetime de {fmt(prev.divisao.faixas[0].lifetime)} hoje)</span></>}
      </div>}
      <button disabled={!ok} onClick={()=>onPedir({p_banca:banca,p_devolucao:devolucao,p_cashout:cashout,
          p_carteiras:nomeadas.map(l=>({sala:String(l.sala).trim(),saldo:cent(parseValor(l.saldo)),valor:cent(parseValor(l.valor))})),p_obs:obs.trim()||null})}
        style={{padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:ok?'pointer':'default',opacity:ok?1:.5}}>Pedir saque</button>
    </div>
  </div>;
}

// telas que têm endereço próprio (#tela). O resto do hash (ex.: o retorno do login por e-mail) não é tela.
const TELAS=new Set(['painel','torneios','diario','semanal','mensal','stats','saques','banca','config','time','g_visao','g_jogadores','g_grades','g_financeiro','g_equipe','g_regras']);
function Dashboard({session,profile}){
  /* convidado (role='guest'): sem acesso às áreas da pool — o RLS do banco também bloqueia;
     aqui só mostramos a telinha de acesso restrito e liberamos as Stats/relatório dele */
  const [ws,setWs]=useState(null);                 // workspace da conta (team = pool · solo = cliente)
  const [srvStatus,setSrvStatus]=useState(null);   // F0.6: status do contrato calculado no SERVIDOR (meu_status)
  const [needsSetup,setNeedsSetup]=useState(false);// solo sem config ainda -> onboarding de 3 passos
  const [conviteErro,setConviteErro]=useState(null);// convite de time recusado pelo servidor (vencido, conta em outro lugar…)
  const [temTime,setTemTime]=useState(false);       // workspace com estrutura de time (fase 1) -> aba Time
  const [avisos,setAvisos]=useState([]);             // sininho (fase 1)
  const [askTour,setAskTour]=useState(false);      // convite pro tour guiado (1º acesso)
  const [tour,setTour]=useState(0);                // 0 = desligado · n = passo atual do tour
  // solo = conta individual (GrinderBank). Fallback pro papel do perfil quando o workspace ainda não carregou.
  const soloConta = ws ? ws.kind==='solo' : !!(profile&&(profile.role==='guest'||profile.role==='solo'));
  // time de staking com N jogadores (fase 1): cada aluno vê só os próprios dados, com o layout de um jogador;
  // gestor escolhe o aluno. O pool de 2 (kind 'team') continua igual.
  const modoTime = !!ws&&ws.kind==='time';
  const marcaTime = ws?{nome:ws.marca_nome||ws.name,logo:ws.marca_logo||null}:null;   // logo e nome do time no topo
  const solo = soloConta||modoTime;                // layout de UM jogador (conta individual ou aluno do time)
  const [configRaw,setConfig]=useState(null);
  const [toursRaw,setTours]=useState([]);
  const [ledgerRaw,setLedger]=useState([]);
  const [walletsRaw,setWallets]=useState([]);      // saldo inicial por jogador+plataforma
  const [wdsRaw,setWds]=useState([]);
  const [loading,setLoading]=useState(true);
  const [erroCarga,setErroCarga]=useState(false);    // alguma tabela não veio: mantém o que já estava na tela e avisa
  const [meusPedidos,setMeusPedidos]=useState([]);    // conta individual: pedidos pra entrar num time pelo código
  const [minhasSaidas,setMinhasSaidas]=useState([]);  // conta individual de quem saiu de um time: o acerto (opção B)
  const [saidaVista,setSaidaVista]=useState(()=>{ try{ return localStorage.getItem('gb_saida_vista')||''; }catch(e){ return ''; } });
  const [avisoPedido,setAvisoPedido]=useState(null);  // {erro,texto} do último pedido pelo código
  const [codTime,setCodTime]=useState('');
  const [viewSel,setView]=useState(()=>{ try{ const v=decodeURIComponent(String(window.location.hash||'').slice(1)); if(TELAS.has(v)) return v; }catch(e){} return 'painel'; });
  const view=viewSel;
  const [modal,setModal]=useState(null);       // string type | {type, initial}
  const [menuOpen,setMenuOpen]=useState(false); // gaveta "Mais" do nav mobile
  const [changePass,setChangePass]=useState(false);
  const [delAcc,setDelAcc]=useState(false);       // modal de excluir conta (LGPD)
  const [installCard,setInstallCard]=useState(false); // convite "instalar na tela inicial"
  const [iosHelp,setIosHelp]=useState(false);     // modal com o passo a passo do iPhone
  const [alertDetail,setAlertDetail]=useState(null);
  const [editing,setEditing]=useState(null);    // {type, item}
  const [quickEdit,setQuickEdit]=useState(null);
  const [month,setMonth]=useState(todayISO().slice(0,7));
  const [diF,setDiF]=useState({player:'Todos',site:'Todos',mod:'Todos',from:'',to:'',days:''}); // filtros do Diário
  const [mensalWho,setMensalWho]=useState('Geral'); // filtro do "Onde vocês lucram"
  const [pastN,setPastN]=useState(10);            // Torneios: quantos dias antigos mostrar (dez em dez)
  const [diaryN,setDiaryN]=useState(12);          // Diário: quantos cards mostrar (doze em doze)
  const [hhRaw,setHh]=useState([]);               // agregados de hand history por torneio
  const [chgs,setChgs]=useState([]);              // histórico de alterações dos Ajustes
  // modo time: quem o usuário pode ver e de quem são os dados na tela
  const [timeGente,setTimeGente]=useState({jogadores:[],eu:null,podeConfigurar:false,saquesPagos:[]});
  const [jogadorSel,setJogadorSel]=useState(null);
  // gestão x jogo: quem tem papel na gestão E joga escolhe o modo (lembrado no aparelho)
  const [modoSel,setModoSel]=useState(()=>{ try{ return localStorage.getItem('gb_modo')||'gestao'; }catch(e){ return 'gestao'; } });
  const [alunoAberto,setAlunoAberto]=useState(null);   // gestor olhando o painel de um aluno (só leitura)
  const [sitSel,setSitSel]=useState(null);             // MU do jogador na tela (make-up no Início)
  const gestaoAtiva=modoTime&&!!timeGente.temGestao&&!alunoAberto&&(modoSel!=='jogo'||!timeGente.joga);
  const podeTrocarModo=modoTime&&!!timeGente.temGestao&&!!timeGente.joga&&!alunoAberto;
  const somenteLeitura=modoTime&&!!alunoAberto;
  const toque=typeof window!=='undefined'&&window.matchMedia?window.matchMedia('(pointer: coarse)').matches:false;   // celular: "toque"; computador: "clique"/"mouse"
  // trocou de tela (ou de aluno): nenhuma janela da tela anterior fica aberta por cima da nova (A-036)
  useEffect(()=>{ setAlertDetail(null); setModal(null); setEditing(null); setQuickEdit(null); setMenuOpen(false); setCfgConfirm(null); },[viewSel,alunoAberto]);
  const trocarModo=m=>{ setModoSel(m); try{ localStorage.setItem('gb_modo',m); }catch(e){} setView(m==='gestao'?'g_visao':'painel'); };
  const [alunoResumo,setAlunoResumo]=useState(null);   // linha do aluno na lista (banca e MU do servidor)
  const abrirAluno=(n,linha)=>{ setAlunoAberto(n); setAlunoResumo(linha||null); setView('painel'); };
  const fecharAluno=()=>{ setAlunoAberto(null); setAlunoResumo(null); setView('g_jogadores'); };
  // nome escrito com espaço ou maiúscula diferente ("hero " x "Hero") vira o nome do jogador antes de qualquer conta:
  // senão entra na banca e some da semana. No time, só ficam as linhas do jogador na tela.
  const nomesBase=modoTime?[jogadorSel]:(configRaw?[configRaw.player1_name,configRaw.player2_name]:[]);
  const canon=r=>{ const c=nomesBase.find(n=>n&&nomeIgual(n,r.player)); return c&&c!==r.player?{...r,player:c}:r; };
  const doJogador=arr=>modoTime?(arr||[]).filter(r=>nomeIgual(r.player,jogadorSel)).map(canon):(arr||[]).map(canon);
  const tours=useMemo(()=>doJogador(toursRaw),[toursRaw,modoTime,jogadorSel,configRaw]);
  const ledger=useMemo(()=>doJogador(ledgerRaw),[ledgerRaw,modoTime,jogadorSel,configRaw]);
  const wallets=useMemo(()=>doJogador(walletsRaw),[walletsRaw,modoTime,jogadorSel,configRaw]);
  // no time, os saques pagos (devolução + cashout saem das salas) entram como saque na banca do aluno
  const wds=useMemo(()=>doJogador(modoTime?timeGente.saquesPagos:wdsRaw),[wdsRaw,modoTime,jogadorSel,timeGente,configRaw]);
  const hh=useMemo(()=>doJogador(hhRaw),[hhRaw,modoTime,jogadorSel,configRaw]);
  // no time, a config é a do time e o "jogador 1" é o aluno na tela (nunca gravado: Ajustes não edita nome no time)
  // banca inicial e make-up inicial da config são coisa do pool de 2: no time a banca do aluno começa pelas salas dele
  const config=useMemo(()=>modoTime&&configRaw?{...configRaw,player1_name:jogadorSel||'',player2_name:'',
    banca_inicial:Math.round(wallets.reduce((a,w)=>a+num(w.saldo_inicial),0)*100)/100,makeup_inicial_player1:0,makeup_inicial_player2:0}:configRaw,[configRaw,modoTime,jogadorSel,wallets]);
  // no time, de quem são os dados na tela: o aluno aberto pelo gestor, ou o próprio jogador
  useEffect(()=>{ if(!modoTime) return; setJogadorSel(alunoAberto||(timeGente.joga&&timeGente.eu?timeGente.eu.nome:null)); },[modoTime,alunoAberto,timeGente]);
  // cada modo tem as suas abas: gestão só g_* (e Minha conta); jogo nenhuma g_*
  useEffect(()=>{ if(!modoTime||!timeGente.carregado) return;
    if(gestaoAtiva&&!String(viewSel).startsWith('g_')&&viewSel!=='config') setView('g_visao');
    if(!gestaoAtiva&&String(viewSel).startsWith('g_')) setView('painel'); },[gestaoAtiva,modoTime,timeGente.carregado]);
  // MU do jogador na tela: make-up = banca − MU
  // no time, banca e MU vêm do SERVIDOR (uma conta só, a partir da foto: planilha conferida ou entrada no time).
  // Recarrega quando os lançamentos mudam; troca de jogador limpa na hora (nunca mostra a situação do anterior).
  useEffect(()=>{ if(!modoTime||!jogadorSel){ setSitSel(null); return; }
    const pp=(timeGente.pessoas||[]).find(x=>nomeIgual(x.nome,jogadorSel)); if(!pp){ setSitSel(null); return; }
    setSitSel(s=>s&&s._pessoa===pp.id?s:null);
    let vivo=true; const t=setTimeout(()=>{ sb.rpc('situacao_jogador',{p_pessoa:pp.id,p_inicio_semana:weekStart(weekEnding(todayISO()))}).then(({data,error})=>{ if(!vivo) return;
      if(!error&&data) setSitSel({...data,_pessoa:pp.id}); else setSitSel(s=>s&&s._pessoa===pp.id?s:null); }).catch(()=>{}); },250);
    return ()=>{ vivo=false; clearTimeout(t); }; },[modoTime,jogadorSel,timeGente,toursRaw,ledgerRaw,walletsRaw]);
  const [cfgConfirm,setCfgConfirm]=useState(null);// confirmação pendente de mudança nos Ajustes
  // Esc fecha a janela de cima (confirmação, fora da grade, "Mais")
  useEsc(()=>{ if(cfgConfirm) return setCfgConfirm(null); if(alertDetail) return setAlertDetail(null); if(menuOpen) setMenuOpen(false); },!!(cfgConfirm||alertDetail||menuOpen));
  // cada tela tem endereço (#banca, #g_jogadores...): o voltar do navegador volta de tela, e a tela nova abre no topo (A-024)
  const viewRef=React.useRef(viewSel); viewRef.current=viewSel;
  const alunoRef=React.useRef(alunoAberto); alunoRef.current=alunoAberto;
  useEffect(()=>{ try{ const h='#'+viewSel; if(window.location.hash!==h) window.history.pushState(null,'',h); }catch(e){} try{ window.scrollTo(0,0); }catch(e){} },[viewSel]);
  useEffect(()=>{ const f=()=>{ const v=decodeURIComponent(String(window.location.hash||'').slice(1)); if(!TELAS.has(v)||v===viewRef.current) return;
      if(alunoRef.current&&v.startsWith('g_')){ setAlunoAberto(null); setAlunoResumo(null); }
      setView(v); };
    window.addEventListener('popstate',f); return ()=>window.removeEventListener('popstate',f); },[]);
  const [imp,setImp]=useState({busy:false,prog:'',res:null}); // estado do import de HH
  const [hhDono,setHhDono]=useState(null);   // import de mãos parado: os torneios já estão lançados no nome do outro jogador
  const [tsImp,setTsImp]=useState({busy:false,prog:'',preview:null,res:null}); // import de resumos de torneio
  const [tsSite,setTsSite]=useState('Detectar');  // site dos resumos (WPT usa o mesmo formato da GG)
  const [impPlayer,setImpPlayer]=useState('');    // de quem são os arquivos importados
  const [stF,setStF]=useState({player:'',days:'',from:'',to:''}); // filtros da tela Stats (preset ou intervalo de datas)
  const [audF,setAudF]=useState({player:'',days:30});             // filtros da aba Auditoria
  const [gloss,setGloss]=useState(false);         // glossário das siglas aberto?
  const [leitOpen,setLeitOpen]=useState(false);   // card "Leituras do jogo" expandido?
  const [leitX,setLeitX]=useState({});   // quais leituras estão com o texto aberto ("ver mais")
  const [statHint,setStatHint]=useState(null);    // stat tocada na tela Stats (abre a leitura dela)
  const [sorteOpen,setSorteOpen]=useState(false); // card "Sorte nos all-ins" expandido?
  const [copied,setCopied]=useState(false);       // feedback do "copiar pro Coach"
  const [report,setReport]=useState(null);        // relatório aberto: {type:'mensal'} | {type:'jogador',player,days}
  // sininho: avisos do aparelho (persistem até apagar) + quais alertas do painel já foram lidos/apagados
  const lerLS=(k,pad)=>{ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?pad:v; }catch(e){ return pad; } };
  const [avLocais,setAvLocais]=useState(()=>lerLS('gb_avisos_locais',[]));
  const [avApagados,setAvApagados]=useState(()=>lerLS('gb_avisos_apagados',[]));
  const [avLidos,setAvLidos]=useState(()=>lerLS('gb_avisos_lidos',[]));
  useEffect(()=>{ try{ localStorage.setItem('gb_avisos_locais',JSON.stringify(avLocais.map(({items,...x})=>x))); }catch(e){} },[avLocais]);
  useEffect(()=>{ try{ localStorage.setItem('gb_avisos_apagados',JSON.stringify(avApagados.slice(-200))); }catch(e){} },[avApagados]);
  useEffect(()=>{ try{ localStorage.setItem('gb_avisos_lidos',JSON.stringify(avLidos.slice(-200))); }catch(e){} },[avLidos]);
  const localIds=React.useRef(new Set());       // ids que EU acabei de criar (pra não me auto-avisar via realtime)
  const seq=React.useRef(0);
  // mesma chave = mesmo aviso: troca o que está na tela em vez de empilhar dois pop-ups iguais
  // mesma chave = mesmo aviso (troca em vez de empilhar) e no máximo 3 na tela: um lote de
  // lançamentos não pode cobrir o app de pop-up.
  // avisos do aparelho (tempo real: fora da grade do outro jogador, mudança nos Ajustes) vão pro SININHO, não pra tela
  const pushToast=(t)=>{ const k=t.key||((t.title||'')+'|'+(t.text||''));
    setAvLocais(l=>[{id:'l-'+(++seq.current)+'-'+Date.now(),key:k,local:true,tipo:'local',titulo:t.title,texto:t.text,tone:t.tone,items:t.items,criado_em:new Date().toISOString(),lido_em:null},
      ...l.filter(x=>x.key!==k)].slice(0,40)); };
  // sair: limpa o cadastro pendente do aparelho (device compartilhado não vaza contato)
  const sair=()=>{ try{ localStorage.removeItem('gb_signup'); }catch(e){} sb.auth.signOut(); };

  /* PWA "instalar na tela inicial": convite pra instalar (Android/desktop via beforeinstallprompt)
     ou instrução no iPhone. No iOS o site (Safari) NÃO tem como saber que já foi instalado, então
     em vez de insistir pra sempre, mostramos no MÁXIMO 2 vezes e paramos. Já instalado (standalone)
     ou dispensado no X = nunca mais. */
  useEffect(()=>{
    if(isStandalone()){ try{ localStorage.setItem('gb_install','1'); }catch(e){} return; }  // rodando como app: some de vez
    let v=''; try{ v=localStorage.getItem('gb_install')||''; }catch(e){}
    if(v==='1') return;                          // dispensado / já instalado
    const podeMostrar=()=>{ let x=''; try{ x=localStorage.getItem('gb_install')||''; }catch(e){} return x!=='1' && (parseInt(x,10)||0) < 2; };
    if((window.__deferredInstall || isIOS()) && podeMostrar()){
      setInstallCard(true);
      try{ localStorage.setItem('gb_install', String((parseInt(v,10)||0)+1)); }catch(e){}  // conta esta exibição (para de mostrar após 2)
    }
    const onBip=()=>{ if(!isStandalone() && podeMostrar()) setInstallCard(true); };
    const onInstalled=()=>{ setInstallCard(false); try{ localStorage.setItem('gb_install','1'); }catch(e){} };
    window.addEventListener('beforeinstallprompt',onBip);
    window.addEventListener('appinstalled',onInstalled);
    return ()=>{ window.removeEventListener('beforeinstallprompt',onBip); window.removeEventListener('appinstalled',onInstalled); };
  },[]);
  const marcarInstall=()=>{ try{ localStorage.setItem('gb_install','1'); }catch(e){} };
  const instalar=async()=>{
    const dp=window.__deferredInstall;
    if(dp){ // Android / Chrome / Edge / desktop: dispara o prompt nativo de instalar
      dp.prompt();
      try{ await dp.userChoice; }catch(e){}
      window.__deferredInstall=null; setInstallCard(false); marcarInstall();
    } else if(isIOS()){ // iPhone/iPad: não dá pra instalar por código — mostra o passo a passo
      setIosHelp(true);
    }
  };
  const dispensarInstall=()=>{ setInstallCard(false); marcarInstall(); };

  // modo time: jogadores visíveis (com vínculo ativo), a própria pessoa e se pode configurar o time
  const carregarGenteTime=async()=>{
    try{
      const [pe,vi,ac,un,sq,gr,rg,apo,rel]=await Promise.all([sb.from('pessoa').select('id,nome,user_id,status'),sb.from('vinculo').select('pessoa_id,unidade_id,fim'),
        sb.from('acesso').select('pessoa_id,unidade_id,capacidades'),sb.from('unidade').select('id,mae_id,caminho,nome,rotulo,ordem'),
        lerTudo(()=>sb.from('saque').select('id,pessoa_id,devolucao,cashout,parte_jogador,total_time,pago_em,status,solicitado_em').order('id')),
        sb.from('grade').select('id,unidade_id,vigente_desde,simulada,celulas'),sb.from('regra_unidade').select('unidade_id,chave,valor,vigente_desde'),
        lerTudo(()=>sb.from('aporte').select('id,pessoa_id,valor,data,sala,criado_em').order('id')),
        lerTudo(()=>sb.from('reload').select('id,pessoa_id,valor,sala,status,enviado_valor,enviado_em,aporte_id').order('id'))]);
      // grade da reta: torneio novo ainda não tem unidade gravada -> usa a reta atual do jogador
      const unidadeDe={}; (pe.data||[]).forEach(x=>{ const v=(vi.data||[]).find(v=>v.pessoa_id===x.id&&!v.fim); if(v) unidadeDe[String(x.nome).trim().toLowerCase()]=v.unidade_id; });
      GRADE_CTX={unidades:un.data||[],grades:gr.error?[]:(gr.data||[]),unidadeDe,regras:rg.error?[]:(rg.data||[])};
      const pessoas=(pe.data||[]).filter(x=>x.status!=='saiu'); const ativos=new Set((vi.data||[]).filter(v=>!v.fim).map(v=>v.pessoa_id));
      const eu=pessoas.find(x=>x.user_id===session.user.id)||null;
      const jogadores=pessoas.filter(x=>ativos.has(x.id)).map(x=>x.nome).sort((a,b)=>a.localeCompare(b));
      const raiz=(un.data||[]).find(u=>!u.mae_id);
      const podeConfigurar=!!(eu&&raiz&&(ac.data||[]).some(a=>a.pessoa_id===eu.id&&a.unidade_id===raiz.id&&(a.capacidades||[]).some(c=>c==='administrar'||c==='configurar_regras')));
      const nomePorId=Object.fromEntries((pe.data||[]).map(x=>[x.id,x.nome]));
      const saquesPagos=(sq.data||[]).filter(x=>x.status==='pago').map(x=>({id:'saque-'+x.id,player:nomePorId[x.pessoa_id]||'',valor_sacado:num(x.devolucao)+num(x.cashout),
        week_ending_date:weekEnding(String(x.pago_em||'').slice(0,10)),wallet:null,observacoes:'saque do time'}));
      const meusAc=eu?(ac.data||[]).filter(a=>a.pessoa_id===eu.id):[];
      const caps=[...new Set(meusAc.flatMap(a=>a.capacidades||[]))];
      const joga=!!(eu&&ativos.has(eu.id));
      const souAdmin=!!(raiz&&meusAc.some(a=>a.unidade_id===raiz.id&&(a.capacidades||[]).includes('administrar')));
      const naRaiz=!!(raiz&&meusAc.some(a=>a.unidade_id===raiz.id));
      setTimeGente({jogadores,eu,podeConfigurar,saquesPagos,caps,temGestao:meusAc.length>0,joga,souAdmin,naRaiz,carregado:true,
        pessoas:pessoas.map(x=>({id:x.id,nome:x.nome})),
        dinheiro:{saques:sq.error?[]:(sq.data||[]),aportes:apo.error?[]:(apo.data||[]),reloads:rel.error?[]:(rel.data||[])}});
    }catch(e){ console.error(e); }
  };
  const loadAll=async()=>{
    try{
      // convite de time pendente: aceita ANTES de carregar (a conta passa a ver o time)
      const tk=conviteGuardado();
      if(tk){
        const {error:ce}=await sb.rpc('aceitar_convite',{p_token:tk});
        if(ce){ registrarErro('app','convite não aceito: '+(ce.message||''),{codigo:ce.code||null}); setConviteErro(ce.message||'Não consegui aceitar o convite.'); return; }
        esquecerConvite();
      }
      // código do time digitado no cadastro: manda o pedido de entrada (a gestão aprova e escolhe a reta)
      const cod=codigoGuardado();
      if(cod){ const {error:pe}=await sb.rpc('pedir_entrada_time',{p_codigo:cod}); esquecerCodigo();
        if(pe){ registrarErro('app','pedido pelo código não foi: '+(pe.message||''),{}); setAvisoPedido({erro:true,texto:pe.message||'Não consegui mandar o pedido pro time.'}); } }
      // pagou na Kiwify (ou ganhou plano manual)? aplica a ativação pendente do e-mail antes de carregar
      try{ await sb.rpc('aplicar_ativacao'); }catch(e){}
      // status calculado com o relógio do servidor; sem a função (banco antigo) cai na conta local
      try{ const {data:st,error:se}=await sb.rpc('meu_status'); if(!se&&st&&typeof st==='object') setSrvStatus(st); }catch(e){}
      // carga UNIFORME: o RLS por workspace entrega a cada conta só o que é dela
      // listas que crescem: paginadas (o servidor corta em 1.000 linhas); o id no fim deixa a ordem estável entre páginas
      const todas=(tabela,cols,col,asc)=>lerTudo(()=>{ let q=sb.from(tabela).select(cols); if(col) q=q.order(col,{ascending:asc}); return q.order('id',{ascending:true}); });
      const [wsr,cfg,t,l,pw,w,hhr,cc]=await Promise.all([
        sb.from('workspaces').select('*'),
        sb.from('pool_config').select('*').order('created_at',{ascending:true}),
        todas('tournaments','*','entry_date',false),
        todas('bankroll_ledger','*','entry_date',true),
        todas('player_wallets','*'),
        todas('withdrawals','*','week_ending_date',false),
        todas('hh_tournament_stats',HH_COLS,'entry_date',false),
        todas('config_changes','*','created_at',false),
      ]);
      // tabela que não veio (rede, tempo esgotado): NÃO troca a lista da tela por vazia (a banca ficaria errada sem
      // aviso); mantém o que já estava e mostra a faixa "não consegui atualizar"
      const listas=[[t,setTours],[l,setLedger],[pw,setWallets],[w,setWds],[hhr,setHh],[cc,setChgs]];
      const falhas=listas.filter(([r])=>r.error);
      const aplicarListas=()=>{ for(const [r,set] of listas) if(!r.error) set(r.data); };
      setErroCarga(falhas.length>0);
      if(falhas.length) registrarErro('carga','lista não carregou: '+falhas.map(([r])=>r.error.message).join(' | '),{tabelas:falhas.length});
      const myWs=(wsr.data&&wsr.data[0])||null; setWs(myWs);
      // conta individual: pedidos pra entrar num time (o próprio pedido; a RLS só mostra os da pessoa)
      if(myWs&&myWs.kind==='solo'){ try{ const {data:mp}=await sb.from('pedido_entrada').select('id,status,criado_em,motivo,time_nome').order('criado_em',{ascending:false}).limit(5); setMeusPedidos(mp||[]); }catch(e){}
        try{ const {data:ms}=await sb.from('acerto_saida').select('id,time_nome,saida,banca,mu,mk_congelado,devolucao,parte_jogador,total_time').order('registrado_em',{ascending:false}).limit(1); setMinhasSaidas(ms||[]); }catch(e){} }
      // estrutura de time (fase 1): a aba Time só aparece onde o workspace tem unidades
      try{ const {data:un}=await sb.from('unidade').select('id').limit(1); const tem=!!(un&&un.length); setTemTime(tem);
        if(tem){ const {data:av}=await sb.from('aviso').select('*').order('criado_em',{ascending:false}).limit(50); setAvisos(av||[]); } }catch(e){}
      const ehSolo=myWs?myWs.kind==='solo':!!(profile&&(profile.role==='guest'||profile.role==='solo'));
      if(myWs&&myWs.kind==='time') await carregarGenteTime();
      // a config é SEMPRE a linha mais antiga. Só cria a padrão se o banco RESPONDEU e está
      // realmente vazio (primeiro uso) — falha transitória de leitura NUNCA pode virar
      // "cria outra config" (isso já duplicou a tabela e bagunçou a banca uma vez).
      let c=(cfg.data&&cfg.data[0])||null;
      if(!c&&!cfg.error&&ehSolo){
        // solo sem config = primeiro uso: onboarding de 3 passos cria a config com o nome da pessoa
        setNeedsSetup(true);
        aplicarListas();
        return;
      }
      // time sem config gravada: usa a padrão em memória (aluno não grava config; quem configura salva nos Ajustes)
      if(!c&&!cfg.error&&myWs&&myWs.kind==='time') c=configPadraoTime(myWs.id);
      if(!c&&!cfg.error){
        const r=await sb.from('pool_config').insert({}).select().single();
        c=r.data||null;
        if(!c){ const r2=await sb.from('pool_config').select('*').order('created_at',{ascending:true}); c=(r2.data&&r2.data[0])||null; }
      }
      if(!c){ console.error('pool_config indisponível, tentando de novo…',cfg.error); if(!configRef.current) setTimeout(loadAll,2500); return; }
      setNeedsSetup(false);
      setConfig(c); aplicarListas();
    }catch(e){ console.error(e); }
  };
  useEffect(()=>{(async()=>{ await loadAll(); setLoading(false); })();},[]);

  /* PWA em segundo plano congela e o realtime cai; ao voltar pro app, recarrega tudo em silêncio */
  useEffect(()=>{
    const onVis=()=>{ if(document.visibilityState==='visible') loadAll(); };
    document.addEventListener('visibilitychange',onVis);
    return ()=>document.removeEventListener('visibilitychange',onVis);
  },[]);

  /* tempo real: o lançamento de um jogador aparece na hora pro outro */
  useEffect(()=>{
    if(!sb.channel) return;
    const apply=setter=>p=>setter(list=>{
      const nv=semIds(p.new);   // o tempo real manda a linha inteira; hand_ids não fica na memória
      if(p.eventType==='INSERT') return list.some(x=>x.id===nv.id)?list:[nv,...list];
      if(p.eventType==='UPDATE') return list.map(x=>x.id===nv.id?nv:x);
      if(p.eventType==='DELETE') return list.filter(x=>x.id!==p.old.id);
      return list;
    });
    // avisa o OUTRO jogador quando um torneio fora da grade chega pelo tempo real (não avisa quem lançou)
    const onTour=p=>{
      apply(setTours)(p);
      // o aviso é pro OUTRO jogador da pool: em conta solo não existe "outro" — seria o app
      // avisando a pessoa sobre ela mesma, no meio do lançamento dela.
      if(p.eventType==='INSERT' && p.new && p.new.player && !localIds.current.has(p.new.id) && configRef.current && !soloRef.current){
        const c=configRef.current, sg=statusGrade(p.new,c);
        if(sg.status==='fora') pushToast({tone:C.red,title:`${p.new.player} jogou fora da grade`,text:`${p.new.tournament_name||'Torneio'} · ${sg.motivo}. Fique atento e verifique com ${p.new.player.split(' ')[0]}.`});
      }
    };
    const ch=sb.channel('pool-sync')
      .on('postgres_changes',{event:'*',schema:'public',table:'tournaments'},onTour)
      .on('postgres_changes',{event:'*',schema:'public',table:'bankroll_ledger'},apply(setLedger))
      .on('postgres_changes',{event:'*',schema:'public',table:'player_wallets'},apply(setWallets))
      .on('postgres_changes',{event:'*',schema:'public',table:'hh_tournament_stats'},apply(setHh))
      .on('postgres_changes',{event:'*',schema:'public',table:'withdrawals'},apply(setWds))
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'aviso'},p=>{ if(p.new&&p.new.id) setAvisos(a=>a.some(x=>x.id===p.new.id)?a:[p.new,...a]); })
      .on('postgres_changes',{event:'*',schema:'public',table:'pool_config'},p=>{ if(p.new&&p.new.id) setConfig(prev=>prev&&prev.id===p.new.id?p.new:prev); })
      // mudança nos Ajustes: registra no histórico local e AVISA quem não fez a mudança
      .on('postgres_changes',{event:'*',schema:'public',table:'config_changes'},p=>{
        apply(setChgs)(p);
        if(p.eventType==='INSERT' && p.new && !localIds.current.has(p.new.id))
          pushToast({tone:C.gold,title:`${p.new.changed_by_name||'Alguém'} alterou os Ajustes`,text:p.new.resumo});
      })
      .subscribe();
    return ()=>{ sb.removeChannel(ch); };
  },[]);
  // ref com o config atual pro handler de realtime (que roda fora do render)
  const configRef=React.useRef(null);
  useEffect(()=>{configRef.current=config;},[config]);

  // Aviso de fora-da-grade pro próprio jogador. Ele AGRUPA: lançar 10 torneios acima do teto
  // abre UM aviso com os 10, não dez modais em fila. E para de abrir depois de 2 vezes na
  // sessão — a faixa fixa do Painel e o selo na lista continuam mostrando, sem sequestrar a tela.
  const [gradeWarn,setGradeWarn]=useState(null);   // {items:[torneio,...]}
  const gradeAberturas=React.useRef(0);
  const soloRef=React.useRef(false);
  React.useEffect(()=>{ soloRef.current=solo; },[solo]);
  const avisarForaGrade=row=>setGradeWarn(g=>{
    if(g) return {items:[...g.items,row]};              // já está aberto: só acumula
    if(gradeAberturas.current>=2) return null;          // já avisou 2x nesta sessão: silêncio
    gradeAberturas.current++; return {items:[row]};
  });
  // conta de um aluno aberta pela gestão: só leitura (regra do dono, 21/11). O banco também recusa.
  const soDono=()=>{ if(!somenteLeitura) return true; alert(`Só ${alunoAberto} mexe na conta dele. Aqui você só vê.`); return false; };
  /* CRUD genérico (mesmo padrão do app original) */
  const add = async (table,data,setter,list)=>{
    if(!soDono()) return;
    const {data:row,error}=await sb.from(table).insert(data).select().single();
    if(error){alert('Não consegui salvar. Tente de novo.');console.error(error);return;}
    if(table==='tournaments' && row){
      localIds.current.add(row.id);
      if(config && statusGrade(row,config).status==='fora') avisarForaGrade(row); // avisa quem lançou
    }
    setter([row,...list]); setModal(null);
  };
  const del = async (table,id,setter,list)=>{
    if(!soDono()) return;
    const {error}=await sb.from(table).delete().eq('id',id);
    if(error){alert('Não consegui remover.');console.error(error);return;}
    setter(list.filter(x=>x.id!==id));
  };
  const update = async (table,newData,setter,list)=>{
    if(!soDono()) return;
    const {id,created_by,created_at,...payload}=newData;
    const {data:updated,error}=await sb.from(table).update(payload).eq('id',id).select().single();
    if(error){alert('Não consegui atualizar. Tente de novo.');console.error(error);return;}
    setter(list.map(x=>x.id===id?updated:x)); setEditing(null);
  };
  const saveConfig = async patch=>{
    if(!soDono()) return false;
    const prev=config, next={...config,...patch}; setConfig(next); setQuickEdit(null);
    const {error}=await sb.from('pool_config').update(patch).eq('id',config.id);
    if(error){alert('Não consegui salvar a configuração — nada foi alterado.');console.error(error);setConfig(prev);return false;}
    return true;
  };
  // mudança nos Ajustes: mostra "de X para Y", pede confirmação, registra no histórico e o
  // realtime avisa o outro jogador. Nada muda em silêncio.
  const showCfgVal=(row,v)=>{
    if(row.key==='stoploss_daily_buyins') return `${num(v)} buy-ins`;
    if(row.kind==='money') return fmt(v);
    if(row.kind==='percent') return pctFmt(num(v)*100);
    if(row.kind==='list') return (Array.isArray(v)?v:[]).join(', ');
    if(row.kind==='date') return dLabel(v);
    return String(v);
  };
  const askSaveConfig=(row,nv)=>{
    setQuickEdit(null);
    const old=config[row.key];
    if(JSON.stringify(old)===JSON.stringify(nv)) return;   // não mudou nada
    setCfgConfirm({row,nv,oldShow:showCfgVal(row,old),newShow:showCfgVal(row,nv)});
  };
  const confirmSaveConfig=async()=>{
    if(!soDono()) return;
    const {row,nv,oldShow,newShow}=cfgConfirm; setCfgConfirm(null);
    const oldRaw=config[row.key];
    const salvou=await saveConfig({[row.key]:nv});
    if(!salvou) return;   // não registra no histórico uma mudança que o banco não aceitou
    // renomear jogador: propaga o novo nome pro histórico (torneios, carteiras, saques, mãos),
    // senão os registros antigos ficam "órfãos" com o nome velho e somem das telas do jogador.
    if((row.key==='player1_name'||row.key==='player2_name') && oldRaw && nv && oldRaw!==nv){
      for(const tb of ['tournaments','daily_entries','player_wallets','withdrawals','hh_tournament_stats']){
        const {error}=await sb.from(tb).update({player:nv}).eq('player',oldRaw);
        if(error) console.error('rename cascade '+tb,error);
      }
      await loadAll();   // recarrega tudo já com o nome novo em todo lugar
    }
    const resumo=`${row.label}: ${oldShow} → ${newShow}`;
    const {data,error}=await sb.from('config_changes').insert({field:row.key,old_value:String(oldRaw),new_value:String(nv),resumo,changed_by_name:myName}).select();
    if(error){ console.error('config_changes',error); return; }
    if(data&&data[0]){ localIds.current.add(data[0].id); setChgs(l=>l.some(x=>x.id===data[0].id)?l:[data[0],...l]); }
  };
  // saldo inicial de um jogador numa plataforma (upsert por player+wallet)
  const saveWallet = async (player,wallet,saldo_inicial)=>{
    if(!soDono()) return;
    setQuickEdit(null);
    const {data,error}=await sb.from('player_wallets').upsert({player,wallet,saldo_inicial},{onConflict:'workspace_id,player,wallet'}).select().single();
    if(error){alert('Não consegui salvar o saldo.');console.error(error);return;}
    setWallets(w=>{ const rest=w.filter(x=>!(x.player===player&&x.wallet===wallet)); return [...rest,data]; });
  };
  /* transferência interna: move saldo de uma carteira pra outra (2 lançamentos casados,
     saída de um lado + entrada do outro). Não muda a banca central (é zero-a-zero);
     só rebalanceia o saldo por jogador/plataforma. "Pool / Reserva" = dinheiro sem dono (player null). */
  const addTransfer = async (out)=>{
    if(!soDono()) return;
    const val=num(out.valor);
    const deP=out.de_player==='Pool / Reserva'?null:out.de_player;
    const paraP=out.para_player==='Pool / Reserva'?null:out.para_player;
    if(val<=0){ alert('Informe um valor maior que zero.'); return; }
    if(deP===paraP && out.de_wallet===out.para_wallet){ alert('Origem e destino são a mesma carteira.'); return; }
    const obs=out.observacao?` · ${out.observacao}`:'';
    const nome=x=>x?x.split(' ')[0]:'pool';
    const rows=[
      {entry_date:out.entry_date, player:deP,   wallet:out.de_wallet,   entrada:0,   saida:val, observacao:`Transferência → ${out.para_wallet} (${nome(paraP)})${obs}`},
      {entry_date:out.entry_date, player:paraP, wallet:out.para_wallet, entrada:val, saida:0,   observacao:`Transferência ← ${out.de_wallet} (${nome(deP)})${obs}`},
    ];
    const {data,error}=await sb.from('bankroll_ledger').insert(rows).select();
    if(error){ alert('Não consegui registrar a transferência.'); console.error(error); return; }
    setLedger(l=>[...(data||rows),...l]); setModal(null);
  };
  /* ---------- importar RESUMOS de torneio (o fim do "lançar um por um") ----------
     Lê os arquivos de Tournament Summary (GG/PokerCraft, PokerStars ou WPT), monta a prévia e
     só grava depois que a pessoa confirma. Três destinos possíveis pra cada resumo:
       · já importado  → tem o mesmo id de torneio do site: não mexe
       · completa      → casa com um lançamento manual do mesmo dia/buy-in: preenche field,
                         posição, premiação e re-entries que faltavam (em vez de duplicar)
       · novo          → entra como torneio novo
     O id do site fica gravado, então reimportar a mesma pasta é seguro. */
  const lerResumos = async (files,player)=>{
    if(!files.length) return;
    setTsImp({busy:true,prog:'Lendo arquivos…',preview:null,res:null});
    const issues=[], textos=[];
    const addZip=(nome,u,depth)=>{
      if(!window.fflate){ issues.push(nome+': leitor de ZIP não carregou (recarregue a página).'); return; }
      let entries; try{ entries=fflate.unzipSync(u); }catch(e){ issues.push(nome+': zip inválido ('+e.message+')'); return; }
      for(const [n,b] of Object.entries(entries)){
        if(!b.length) continue;
        if(/\.zip$/i.test(n)||isZip(b)){ if(depth<3) addZip(nome+' → '+n,b,depth+1); continue; }
        if(/\.(csv|xlsx?|pdf)$/i.test(n)) continue;
        textos.push({name:n,text:decodeSmart(b)});
      }
    };
    for(const f of files){
      try{
        const u=new Uint8Array(await f.arrayBuffer());
        if(/\.zip$/i.test(f.name)||isZip(u)) addZip(f.name,u,0);
        else textos.push({name:f.name,text:decodeSmart(u)});
      }catch(e){ issues.push(f.name+': '+e.message); }
    }
    setTsImp(s=>({...s,prog:`Lendo ${textos.length} arquivo${textos.length!==1?'s':''}…`}));
    await new Promise(r=>setTimeout(r,0));
    let lidos=[], maos=0, psSemFim=0; const psTextos=[];
    for(const t of textos){
      // PokerStars: o próprio hand history traz colocação, prêmio, bounties e re-entries (F0.10).
      // Junta TODOS os arquivos do PS antes: as mãos de um torneio podem vir em arquivos diferentes.
      if(/^PokerStars (?:Hand|Game) #/m.test(t.text)){ psTextos.push(t.text); continue; }
      const rs=parseSummaries(t.text);
      if(rs.length){ rs.forEach(r=>lidos.push({...r,arquivo:t.name})); continue; }
      // erro clássico: mandar o HAND HISTORY da GG (as mãos) no lugar do resumo
      if(/^(?:Mão PokerStars|Poker Hand|GGPoker Hand) #/m.test(t.text)) maos++;
      else issues.push(t.name+': não parece um resumo de torneio (a 1ª linha tem que começar com "Tournament #").');
    }
    if(psTextos.length){
      // dedup de mão repetida (arquivos sobrepostos) antes de somar bounties
      const vistas=new Set(), maosPS=[];
      for(const tx of psTextos) for(const b of tx.replace(/\f/g,'\n').split(/(?=^PokerStars (?:Hand|Game) #)/m)){
        const id=(b.match(/^PokerStars (?:Hand|Game) #(\d+)/)||[])[1]; if(!id||vistas.has(id)) continue; vistas.add(id); maosPS.push(b); }
      psTorneiosDoHH(maosPS.join('\n')).rows.forEach(r=>{ if(r.fim) lidos.push({...r,arquivo:'hand history PokerStars'}); else psSemFim++; });
    }
    if(psSemFim) issues.push(`${psSemFim} torneio${psSemFim!==1?'s':''} do PokerStars ainda sem fim no arquivo (rodando?) — ficou de fora; reimporte quando acabar.`);
    if(maos) issues.unshift(`${maos} arquivo${maos!==1?'s':''} de MÃOS (hand history) — esse${maos!==1?'s':''} vai${maos!==1?'o':''} na aba Stats. Aqui entra o resumo do torneio (o resultado).`);
    // mesmo torneio em dois arquivos: fica um só
    const vistos=new Set(); lidos=lidos.filter(r=>{ const k=r.tid; if(vistos.has(k)) return false; vistos.add(k); return true; });
    const semData=lidos.filter(r=>!r.date);   // freeroll (buy-in 0) é torneio de verdade e entra
    lidos=lidos.filter(r=>r.date).sort((a,b)=>a.date===b.date?(a.tid<b.tid?-1:1):(a.date<b.date?-1:1));
    if(semData.length) issues.push(`${pl(semData.length,'resumo','resumos')} sem data legível: deixei de fora.`);

    // classifica cada resumo · "usados" impede que dois torneios iguais no mesmo dia
    // (dois "Daily Classic $3", por exemplo) casem com o mesmo lançamento manual
    const meus=tours.filter(t=>t.player===player);
    const usados=new Set();
    const novos=[], completa=[], repetidos=[];
    for(const r of lidos){
      const site=tsSite!=='Detectar'?tsSite:(r.psite||(sites.find(x=>/gg/i.test(x))||'GG Poker'));
      const linha={
        entry_date:r.date, player, site, site_tournament_id:r.tid,
        tournament_name:r.name||('Torneio #'+r.tid),
        modality:tsModalidade(modalidades,r.bounty),
        buyin:r.buyin, reentries:r.reentries, field_size:r.field,
        ...(r.bountyGanho!=null?{bounty:r.bountyGanho}:{}),   // PS: bounty lido do hand history; GG não informa
        final_position:r.position, prize:r.premioTicket?0:r.prize,
        ticket:false,   // o arquivo do site não diz — quem marca é o jogador, na prévia
        currency:r.moeda||'USD',   // F0.11: torneio em ¥/€ fica marcado; a banca é em US$ e NÃO convertemos
        observacoes:[r.premioTicket?'Premiação paga em bilhete (não entrou dinheiro).':null,
          r.moeda&&r.moeda!=='USD'?`Valores em ${r.moeda} no arquivo, sem conversão para US$.`:null].filter(Boolean).join(' ')||null,
      };
      const jaTid=meus.find(t=>String(t.site_tournament_id||'')===r.tid);
      if(jaTid){ repetidos.push({r,linha,atual:jaTid}); continue; }
      const manual=meus.find(t=>!t.site_tournament_id&&!usados.has(t.id)&&t.entry_date===r.date
        &&Math.abs(num(t.buyin)-r.buyin)<0.005
        &&(!r.name||!t.tournament_name||tsNorm(t.tournament_name)===tsNorm(r.name)));
      if(manual){ usados.add(manual.id); completa.push({r,linha:{...linha,ticket:!!manual.ticket},atual:manual,escolhas:{}}); continue; }
      novos.push({r,linha});
    }
    const outraMoeda=[...novos,...completa].filter(x=>x.linha.currency!=='USD');
    if(outraMoeda.length) issues.unshift(`${outraMoeda.length} torneio${outraMoeda.length!==1?'s':''} em ${[...new Set(outraMoeda.map(x=>x.linha.currency))].join('/')} (${outraMoeda.slice(0,3).map(x=>x.linha.tournament_name).join(', ')}${outraMoeda.length>3?'…':''}). Os valores entram como estão no arquivo, SEM converter pra US$ — confira ou exclua depois de salvar.`);
    const fora=[...novos,...completa].filter(x=>x.linha.currency==='USD'&&statusGrade({...x.linha,player},config).status==='fora');
    setTsImp({busy:false,prog:'',res:null,preview:{player,novos,completa,repetidos,issues,fora,arquivos:textos.length}});
  };
  // liga/desliga "entrei com bilhete" numa linha da prévia (o resumo do site não traz esse dado)
  const marcarBilhete = tid => setTsImp(s=>{
    if(!s.preview) return s;
    const vira=l=>l.map(x=>x.linha.site_tournament_id===tid?{...x,linha:{...x.linha,ticket:!x.linha.ticket}}:x);
    return {...s,preview:{...s.preview,novos:vira(s.preview.novos),completa:vira(s.preview.completa)}};
  });
  // conflito de dinheiro na prévia: "usar o do arquivo" / "manter o digitado" (campo, ou todos com k=null)
  const escolherResumo = (tid,k,valor) => setTsImp(s=>{
    if(!s.preview) return s;
    const muda=x=>{ if(!x.atual||(tid&&x.linha.site_tournament_id!==tid)) return x;
      const cs=tsMesclar(x.atual,x.linha).conflitos.map(c=>c.campo).filter(c=>!k||c===k);
      const e={...x.escolhas}; cs.forEach(c=>{ e[c]=valor; }); return {...x,escolhas:e}; };
    return {...s,preview:{...s.preview,completa:s.preview.completa.map(muda)}};
  });
  const salvarResumos = async ()=>{
    if(!soDono()) return;
    const pv=tsImp.preview; if(!pv) return;
    setTsImp(s=>({...s,busy:true,prog:'Salvando…'}));
    let inseridos=0, completados=0; const erros=[];
    if(pv.novos.length){
      // em blocos, pra não estourar o tamanho da requisição num import de vários dias
      for(let i=0;i<pv.novos.length;i+=100){
        const chunk=pv.novos.slice(i,i+100).map(x=>x.linha);
        const {data,error}=await sb.from('tournaments').insert(chunk).select();
        if(!error){ inseridos+=(data||[]).length; setTours(t=>[...(data||[]),...t]); continue; }
        // o bloco inteiro caiu por causa de UMA linha: repete um a um pra não perder o resto
        let barrados=0;
        for(const row of chunk){
          const r1=await sb.from('tournaments').insert(row).select();
          if(r1.error){ if(r1.error.code==='23505') barrados++; else if(erros.length<3) erros.push(r1.error.message); }
          else { inseridos+=(r1.data||[]).length; setTours(t=>[...(r1.data||[]),...t]); }
        }
        // 23505 = o índice único do id do torneio barrou: já tinha sido importado em outro lugar
        if(barrados) erros.push(`${pl(barrados,'torneio já tinha','torneios já tinham')} sido importado${barrados===1?'':'s'} em outro aparelho: saia e entre de novo pra ver a lista atualizada.`);
      }
    }
    for(const x of pv.completa){
      const {upd}=tsMesclar(x.atual,x.linha,x.escolhas);
      const {data,error}=await sb.from('tournaments').update(upd).eq('id',x.atual.id).select().single();
      if(error){ erros.push(error.message); } else { completados++; setTours(t=>t.map(y=>y.id===x.atual.id?data:y)); }
    }
    if(erros.length) registrarErro('import','resumos: '+erros.length+' erro(s) ao salvar — '+String(erros[0]).slice(0,200),{inseridos,completados});
    setTsImp({busy:false,prog:'',preview:null,res:{inseridos,completados,repetidos:pv.repetidos.length,erros}});
  };
  /* importa hand histories (.txt ou .zip): parseia no navegador, agrega por torneio e
     sobe SÓ os agregados (upsert por player+site+torneio — reimportar substitui, não duplica) */
  const importHH = async (files,player)=>{
    if(!soDono()) return;
    if(!files.length) return;
    setImp({busy:true,prog:'Lendo arquivos…',res:null});
    const issues=[]; const texts=[];
    // diagnóstico do import: SÓ metadados (nome/tamanho/cabeçalho) — nunca as mãos. Sobe pro
    // hh_import_log no fim, pra dar pra investigar um import que "não foi" sem pedir o arquivo.
    const diag={build:HH_BUILD,ua:String(navigator.userAgent||'').slice(0,140),files:[],zips:[],texts:[]};
    const HH_START=/^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #/m;
    // o export do PokerCraft (GG) às vezes vem com OUTROS zips dentro — abre tudo, até 3 níveis
    const addZip=(name,u,depth)=>{
      if(!window.fflate){ issues.push(name+': leitor de ZIP não carregou (recarregue a página e tente de novo)'); return; }
      let entries; try{ entries=fflate.unzipSync(u); }catch(e){ issues.push(name+': zip inválido ou protegido ('+e.message+')'); return; }
      let usou=false, planilhas=0;
      for(const [n,b] of Object.entries(entries)){
        if(diag.zips.length<60) diag.zips.push({zip:name,entry:n,kb:Math.round(b.length/1024)});
        if(!b.length) continue;
        if(/\.zip$/i.test(n)||isZip(b)){ if(depth<3){ addZip(name+' → '+n,b,depth+1); usou=true; } continue; }
        if(/\.(csv|xlsx?|pdf)$/i.test(n)){ planilhas++; continue; }
        const tx=decodeSmart(b);
        if(/\.txt$/i.test(n)||HH_START.test(tx)){ texts.push({name:n,text:tx}); usou=true; }
      }
      if(!usou) issues.push(name+(planilhas
        ? ': isso parece o export de RESULTADOS (planilha/PDF) do PokerCraft — baixe o HAND HISTORY (as mãos), não o resumo'
        : ': nenhum arquivo de mãos dentro do zip'));
    };
    for(const f of files){
      try{
        const u=new Uint8Array(await f.arrayBuffer());
        diag.files.push({name:f.name,kb:Math.round((f.size||u.length)/1024),magic:Array.from(u.slice(0,4)).map(x=>x.toString(16).padStart(2,'0')).join('')});
        if(/\.zip$/i.test(f.name)||isZip(u)) addZip(f.name,u,0);
        else texts.push({name:f.name,text:decodeSmart(u)});
      }catch(e){ issues.push(f.name+': '+e.message); }
    }
    let allHands=[], ignored=0, resumos=0; const reasons={};
    for(let i=0;i<texts.length;i++){
      setImp(s=>({...s,prog:`Analisando ${i+1}/${texts.length}: ${texts[i].name}`}));
      await new Promise(r=>setTimeout(r,0));   // deixa a UI respirar entre arquivos
      // arquivos grandes (milhares de mãos) são parseados em fatias pra não travar a tela
      const parts=String(texts[i].text||'').replace(/\f/g,'\n').split(/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m);
      let achou=0, maosArq=0;
      for(let j=0;j<parts.length;j+=400){
        const r=parseHH(parts.slice(j,j+400).join(''));
        allHands=allHands.concat(r.hands); ignored+=r.ignored; achou+=r.hands.length+r.ignored; maosArq+=r.hands.length;
        Object.keys(r.reasons||{}).forEach(k=>{ reasons[k]=(reasons[k]||0)+r.reasons[k]; });
        r.issues.forEach(x=>issues.push(texts[i].name+': '+x));
        if(parts.length>400){ setImp(s=>({...s,prog:`Analisando ${i+1}/${texts.length}: ${texts[i].name} (${Math.min(j+400,parts.length)} de ${parts.length} mãos)`})); await new Promise(rs=>setTimeout(rs,0)); }
      }
      // arquivo que não rendeu NENHUMA mão: avisa em vez de terminar em silêncio com "0 mãos".
      // Caso clássico: o "Tournament Summary" do PokerCraft (resultado do torneio, SEM as mãos)
      if(!achou){
        if(/^\s*Tournament #\S+,/.test(String(texts[i].text||''))) resumos++;
        else issues.push(texts[i].name+': nenhuma mão reconhecida — é um hand history do PokerStars (.txt) ou do PokerCraft (GG)?');
      }
      if(diag.texts.length<60) diag.texts.push({name:texts[i].name,head:String(texts[i].text||'').slice(0,200).split(/\r?\n/)[0].slice(0,120),maos:maosArq,ign:achou-maosArq});
    }
    if(resumos) issues.unshift(`${resumos} arquivo${resumos!==1?'s':''} ${resumos!==1?'são':'é'} o RESUMO do torneio (resultado, sem as mãos) — esse${resumos!==1?'s':''} serve${resumos!==1?'m':''} na aba TORNEIOS, em "Importar do site", que lança os torneios pra você. Aqui na Stats entra o HAND HISTORY (as mãos jogadas).`);
    /* dedup: cada torneio guarda o nº das mãos já importadas (hand_ids). Aqui separamos
       mão NOVA de mão REPETIDA — arquivos sobrepostos (transcript geral + avulsos) podem
       ser importados em qualquer ordem sem contar nada 2x nem perder o que já existia. */
    const grupos={};
    for(const h of allHands){ const k=h.site+'|'+h.tid; (grupos[k]=grupos[k]||[]).push(h); }
    // as mãos são de torneios que já estão lançados no nome do OUTRO jogador? Quase sempre o "de quem" ficou errado
    // (achado em produção: mãos de um jogador gravadas no outro, com as stats dos dois trocadas). Pergunta antes de gravar.
    if(!modoTime&&players.filter(Boolean).length>1){
      const tids=new Set(Object.values(grupos).map(g=>String(g[0].tid)));
      const dono={}; for(const t of toursRaw){ if(t.site_tournament_id&&tids.has(String(t.site_tournament_id))) dono[String(t.site_tournament_id)]=t.player; }
      const outro=players.find(p=>p&&!nomeIgual(p,player));
      const doOutro=Object.values(dono).filter(p=>nomeIgual(p,outro)).length, deste=Object.values(dono).filter(p=>nomeIgual(p,player)).length;
      if(outro&&doOutro>deste){
        const escolha=await new Promise(res=>setHhDono({player,outro,n:doOutro,total:tids.size,res}));
        setHhDono(null);
        if(escolha==='cancelar'){ setImp({busy:false,prog:'',res:null}); return; }
        player=escolha;
      }
    }
    let saved=0, novas=0, repetidas=0, reproc=0; const paraSalvar=[];
    // hand_ids não vem na carga inicial (F0.18): busca SÓ os dos torneios deste lote, em fatias
    const idsDe={};
    const tidsLote=[...new Set(Object.values(grupos).map(g=>g[0].tid))].filter(t=>hh.some(x=>x.player===player&&x.site_tournament_id===t));
    for(let i=0;i<tidsLote.length;i+=100){
      const {data:idr,error:ide}=await sb.from('hh_tournament_stats').select('site,site_tournament_id,hand_ids').eq('player',player).in('site_tournament_id',tidsLote.slice(i,i+100));
      if(ide){ issues.push('não consegui conferir as mãos já importadas ('+ide.message+'); import parado pra não duplicar'); setImp({busy:false,prog:'',res:{files:texts.length,novas:0,repetidas:0,reproc:0,tours:0,saved:0,ignored,reasons,issues,issuesTotal:issues.length}}); return; }
      (idr||[]).forEach(r=>{ idsDe[r.site+'|'+r.site_tournament_id]=r.hand_ids||[]; });
    }
    for(const k of Object.keys(grupos)){
      const g=grupos[k], site=g[0].site, tid=g[0].tid;
      const ex0=hh.find(x=>x.player===player&&x.site===site&&x.site_tournament_id===tid);
      const existente=ex0?{...ex0,hand_ids:idsDe[site+'|'+tid]||[]}:null;
      // linha calculada por uma versão ANTIGA do motor (ou sem os campos por posição): se o arquivo
      // cobre TODAS as mãos já importadas, recalcula o torneio inteiro com as definições atuais —
      // reimportar corrige as stats retroativamente sem duplicar nada (F0.15)
      const batchIds=new Set(g.map(h=>h.hid).filter(Boolean));
      const antiga=existente&&((num(existente.engine_version)||1)<HH_ENGINE
        ||(existente.pos_json&&Object.values(existente.pos_json).some(x=>x&&x.hn==null)));
      const upgrade=antiga&&Array.isArray(existente.hand_ids)&&existente.hand_ids.length
        &&existente.hand_ids.every(id=>batchIds.has(id));
      const jaVistas=new Set(existente&&!upgrade&&Array.isArray(existente.hand_ids)?existente.hand_ids:[]);
      const noLote=new Set(); const frescas=[];
      for(const h of g){
        const id=h.hid||`s-n|${h.date||'?'}|${noLote.size}`;   // mão sem nº: não dá pra dedupar entre imports
        if(jaVistas.has(id)||noLote.has(id)){ repetidas++; continue; }
        noLote.add(id); frescas.push(h.hid?h:{...h,hid:id});
      }
      if(upgrade){ reproc+=frescas.length; } else { novas+=frescas.length; }
      if(!frescas.length) continue;
      let row=hhAggregate(frescas,player)[0];
      if(!upgrade&&existente&&Array.isArray(existente.hand_ids)&&existente.hand_ids.length) row=mergeHH(existente,row);
      // linha antiga sem hand_ids (importada antes do dedup): substitui em vez de somar, pra não contar 2x
      paraSalvar.push(row);
    }
    // grava em LOTES de 100 torneios (10 mil mãos ≈ centenas de torneios: poucas idas ao banco em vez de uma por torneio)
    const keyOf=x=>x.player+'|'+x.site+'|'+x.site_tournament_id;
    for(let i=0;i<paraSalvar.length;i+=100){
      const chunk=paraSalvar.slice(i,i+100);
      setImp(s=>({...s,prog:`Salvando torneios ${i+1}–${Math.min(i+100,paraSalvar.length)} de ${paraSalvar.length}…`}));
      const {data,error}=await sb.from('hh_tournament_stats').upsert(chunk,{onConflict:'workspace_id,player,site,site_tournament_id'}).select();
      if(error){ issues.push(`lote de torneios ${i+1}+: não salvou (${error.message})`); registrarErro('import','stats: lote não salvou — '+error.message,{lote:i,tamanho:chunk.length,codigo:error.code||null}); continue; }
      const recs=((data&&data.length===chunk.length)?data:chunk).map(semIds); saved+=chunk.length;
      setHh(list=>{ const novasKeys=new Set(recs.map(keyOf)); return [...recs,...list.filter(x=>!novasKeys.has(keyOf(x)))]; });
      await new Promise(r=>setTimeout(r,0));
    }
    setImp({busy:false,prog:'',res:{files:texts.length,novas,repetidas,reproc,tours:Object.keys(grupos).length,saved,ignored,reasons,issues:issues.slice(0,8),issuesTotal:issues.length}});
    // grava o diagnóstico (só metadados) — se um import "não for", dá pra ver o motivo sem pedir o arquivo
    try{ await sb.from('hh_import_log').insert({player,saved,novas,repetidas,ignored,reasons,issues:issues.slice(0,20),meta:diag}); }catch(e){ console.error('hh_import_log',e); }
  };

  // Diário derivado dos torneios (fonte da verdade = torneios)
  const daily = useMemo(()=>deriveDaily(tours),[tours]);
  const weeksByPlayer = useMemo(()=>config?computeWeeks(daily,config):{},[daily,config]);

  if(conviteErro) return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20}}>
    <Card style={{padding:30,width:'100%',maxWidth:400}} className="ftfade">
      <div style={{display:'flex',justifyContent:'center',marginBottom:14}}><Brand/></div>
      <div data-convite="erro" style={{fontWeight:800,fontSize:16,color:C.ink,marginBottom:6}}>Não deu pra entrar no time</div>
      <div style={{fontSize:13.5,color:C.inkSoft,lineHeight:1.55}}>{conviteErro}</div>
      <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:18}}>
        <button onClick={()=>{ sb.auth.signOut(); }} style={{padding:'13px 0',borderRadius:13,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:14.5,cursor:'pointer'}}>Sair e entrar com outra conta</button>
        <button onClick={()=>{ esquecerConvite(); setConviteErro(null); setLoading(true); loadAll().then(()=>setLoading(false)); }} style={{padding:'12px 0',borderRadius:13,border:`1.5px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:13.5,cursor:'pointer'}}>Seguir sem aceitar o convite</button>
      </div>
    </Card>
  </div>;
  if(needsSetup&&!config) return <SetupSolo profile={profile} ws={ws} onDone={()=>{setNeedsSetup(false); if(!localStorage.getItem('gb_tour')) setAskTour(true); loadAll();}}/>;
  if(loading||!config) return <div style={{minHeight:'100vh',display:'grid',placeItems:'center'}}><div className="spin"/></div>;

  /* ---- derivados ---- */
  CONFIG_CHANGES=chgs;   // deixa o histórico visível pro abiMaxFor (grade julgada pela época)
  const myName=(profile&&profile.nickname)||String(session.user.email||'').split('@')[0];
  const players=solo?[config.player1_name]:[config.player1_name, config.player2_name];
  // plano do workspace: quem pode usar as Stats (Pro/fundador/time). Gestão de banca é de todos.
  // Sem workspace carregado, conta solo assume 'free' — falha de leitura nunca destrava paywall.
  const plan=ws?ws.plan:(solo?'free':'team');
  const canStats=srvStatus&&srvStatus.pode_stats!=null?!!srvStatus.pode_stats:(!solo||['pro','founder','team'].includes(plan));
  // teste grátis de 15 dias: trial_ends_at no futuro = em teste; no passado = bloqueado.
  // null = pool/fundador/assinatura ativa (nunca bloqueia).
  const trialEnds=(ws&&ws.trial_ends_at)?Date.parse(ws.trial_ends_at):null;
  // "agora" é o do servidor quando disponível: mudar a data do aparelho não destrava nem bloqueia nada
  const agoraSrv=srvStatus&&srvStatus.agora?Date.parse(srvStatus.agora):Date.now();
  const trialDaysLeft=trialEnds!=null?Math.max(0,Math.ceil((trialEnds-agoraSrv)/86400000)):null;
  const trialExpired=srvStatus&&srvStatus.ativo!=null?!srvStatus.ativo:(trialEnds!=null&&agoraSrv>trialEnds);
  const makeInit={[players[0]]:num(config.makeup_inicial_player1),[players[1]]:num(config.makeup_inicial_player2)};
  const abiMax=num(config.abi_max), piso=num(config.piso_minimo);
  const sitesTime=(config.sites_permitidos&&config.sites_permitidos.length)?config.sites_permitidos:['PokerStars','GG Poker'];
  const modalidadesTime=(config.modalidades_permitidas&&config.modalidades_permitidas.length)?config.modalidades_permitidas:['MTT','Spin','Cash','Sit & Go'];
  // no time, quem joga usa os da reta dele (regra por reta); sem regra, os do time
  const meuNomeTime=modoTime&&timeGente.eu?timeGente.eu.nome:null;
  const sitesReta=meuNomeTime?regraDoJogador('sites',meuNomeTime):null, modsReta=meuNomeTime?regraDoJogador('modalidades',meuNomeTime):null;
  const sites=Array.isArray(sitesReta)&&sitesReta.length?sitesReta:sitesTime;
  const modalidades=Array.isArray(modsReta)&&modsReta.length?modsReta:modalidadesTime;
  const CURWK=weekEnding(todayISO());
  const temWpt=!modoTime||sites.some(x=>/wpt/i.test(String(x)));   // no time, WPT só aparece se for sala permitida

  /* banca central = inicial + resultados dos jogos + movimentos manuais − saques pagos
     (atualiza sozinha a cada torneio lançado; saque de jogador entra pela aba Saques) */
  const resultadosTotal = cent(daily.reduce((s,e)=>s+resultadoDia(e),0));
  const movimentosTotal = cent(ledger.reduce((s,l)=>s+num(l.entrada)-num(l.saida),0));
  const sacadoTotal = cent(wds.reduce((s,w)=>s+num(w.valor_sacado),0));
  const bancaFatos = cent(num(config.banca_inicial)+resultadosTotal+movimentosTotal-sacadoTotal);
  // painel de aluno aberto pela gestão: banca e MU do SERVIDOR, os mesmos da lista de jogadores. Quem olha pode não ler
  // todos os fatos do aluno (o de antes do time fica na raiz; professor só de desempenho não lê dinheiro), então a
  // soma do que chegou aqui não é a banca. Sem permissão de ver o dinheiro dele, o painel não mostra banca.
  const dinAluno = somenteLeitura && !!alunoResumo && alunoResumo.banca!=null;
  const semDinheiro = somenteLeitura && !dinAluno;
  // no time a banca é a do servidor (salas + o que veio depois da foto + capital do time − saques pagos): a mesma da
  // lista de jogadores, do Financeiro e do MK. A soma local só fica enquanto o servidor não respondeu.
  const partesBanca = modoTime && sitSel && sitSel.banca_partes ? sitSel.banca_partes : null;
  const bancaAtual = modoTime && sitSel && sitSel.banca!=null ? cent(sitSel.banca) : dinAluno ? cent(alunoResumo.banca) : bancaFatos;
  const muTela = sitSel && sitSel.mu!=null ? sitSel.mu : dinAluno ? alunoResumo.mu : null;
  // banca no começo da semana (base do stop semanal): no time vem do servidor; no pool e na conta individual, a soma
  // do que aconteceu antes da semana
  const iniSemana=weekStart(CURWK);
  const bancaSemana = modoTime ? (sitSel&&sitSel.banca_inicio_semana!=null ? cent(sitSel.banca_inicio_semana) : bancaAtual)
    : cent(num(config.banca_inicial)+daily.filter(e=>e.entry_date<iniSemana).reduce((s,e)=>s+resultadoDia(e),0)
      +ledger.filter(l=>l.entry_date<iniSemana).reduce((s,l)=>s+num(l.entrada)-num(l.saida),0)
      -wds.filter(w=>String(w.week_ending_date||'')<iniSemana).reduce((s,w)=>s+num(w.valor_sacado),0));
  // saldo inicial das salas trava depois do 1º dinheiro do time ou da planilha conferida (o servidor também recusa)
  const salasTravadas = modoTime && !!sitSel && (sitSel.abertura==='confirmada' || (partesBanca&&(Number(partesBanca.aportes)!==0||Number(partesBanca.saques)!==0)));
  // saldo por jogador e plataforma = inicial + resultado dos torneios naquele site + movimentos atribuídos − saques daquela carteira
  const walletInicial=(player,wallet)=>{ const w=wallets.find(x=>x.player===player&&x.wallet===wallet); return w?num(w.saldo_inicial):0; };
  // usa walletBucket pra que site/carteira fora da lista (ou saque "Não informar" = null) caiam em "Outros"
  // em vez de sumir — mantendo a soma dos saldos por carteira coerente com todo o dinheiro do jogador.
  const saldoWallet=(player,wallet)=>
    walletInicial(player,wallet)
    + tours.filter(t=>t.player===player&&walletBucket(t.site)===wallet).reduce((s,t)=>s+lucroTorneio(t),0)
    + ledger.filter(l=>l.player===player&&walletBucket(l.wallet)===wallet).reduce((s,l)=>s+num(l.entrada)-num(l.saida),0)
    - wds.filter(w=>w.player===player&&walletBucket(w.wallet)===wallet).reduce((s,w)=>s+num(w.valor_sacado),0);
  const saldoJogador=(player)=>WALLETS.reduce((s,wl)=>s+saldoWallet(player,wl),0);
  const walletsDoJogador=(player)=>WALLETS.map(wl=>({wallet:wl, saldo:saldoWallet(player,wl), inicial:walletInicial(player,wl),
    temMov: walletInicial(player,wl)!==0 || tours.some(t=>t.player===player&&walletBucket(t.site)===wl) || ledger.some(l=>l.player===player&&walletBucket(l.wallet)===wl) || wds.some(w=>w.player===player&&walletBucket(w.wallet)===wl)})).filter(x=>x.temMov);
  const curMakeUp={}, curWeek={};
  players.forEach(p=>{const arr=weeksByPlayer[p]||[]; curMakeUp[p]=arr.length?arr[arr.length-1].makeFinal:(makeInit[p]||0); curWeek[p]=arr.find(w=>w.week===CURWK)||null;});
  const valorSacadoFor=(week,player)=>wds.filter(w=>w.week_ending_date===week&&w.player===player).reduce((s,w)=>s+num(w.valor_sacado),0);
  const makeUpAt=(p,wk)=>{let mk=makeInit[p]||0; for(const w of (weeksByPlayer[p]||[])){ if(w.week<=wk) mk=w.makeFinal; else break;} return mk;};
  const allWeeks=[...new Set(players.flatMap(p=>(weeksByPlayer[p]||[]).map(w=>w.week)))].sort();
  const curMonthISO=todayISO().slice(0,7);
  // geral da pool por semana (os dois jogadores somados) — mais recente primeiro
  const geralSemana=allWeeks.map(wk=>{
    const perP=players.map(p=>(weeksByPlayer[p]||[]).find(w=>w.week===wk)).filter(Boolean);
    return {week:wk, mes:wk.slice(0,7),
      resultado:perP.reduce((s,w)=>s+w.resultado,0),
      parteJog:perP.reduce((s,w)=>s+w.parteJog,0),
      partePool:perP.reduce((s,w)=>s+w.partePool,0),
      saqueAut:perP.reduce((s,w)=>s+w.saqueAut,0)};
  }).reverse();

  const lucroPoolAcum = players.reduce((s,p)=>s+(weeksByPlayer[p]||[]).reduce((a,w)=>a+w.partePool,0),0);
  const resTotalGeral = players.reduce((s,p)=>s+(weeksByPlayer[p]||[]).reduce((a,w)=>a+w.resultado,0),0);  // lucro total (modo solo)
  const totalPago = sacadoTotal;
  /* a receber por jogador = tudo que já foi autorizado nas semanas − o que já foi pago */
  const aReceber={};
  players.forEach(p=>{
    const aut=(weeksByPlayer[p]||[]).reduce((s,w)=>s+w.saqueAut,0);
    const pago=wds.filter(w=>w.player===p).reduce((s,w)=>s+num(w.valor_sacado),0);
    aReceber[p]=Math.max(0,aut-pago);
  });
  const resSemanaAtual = players.reduce((s,p)=>s+(curWeek[p]?curWeek[p].resultado:0),0);
  const makeUpTotal = players.reduce((s,p)=>s+curMakeUp[p],0);
  // piso respeitado contra os saques SOMADOS (não por jogador isolado): desconta de uma banca que vai diminuindo
  let saqueAutTotal=0; { let bancaLivre=bancaAtual; players.forEach(p=>{ const w=curWeek[p]; if(!w||w.saqueAut===0||w.makeFinal>0) return; if(bancaLivre-w.saqueAut<piso) return; bancaLivre-=w.saqueAut; saqueAutTotal+=w.saqueAut; }); }

  /* alertas */
  const alerts=[];
  if(!solo) players.forEach(p=>{ if(curMakeUp[p]>num(config.makeup_max_recomendado)) alerts.push({key:'makeup:'+p,tone:C.red,text:`Make-up de ${p} em ${fmt(curMakeUp[p])} — acima do recomendado (${fmt(config.makeup_max_recomendado)}).`}); });
  // no time, piso só vale quando o time definiu um e a banca já tem os saldos de entrada (planilha conferida) (A-051)
  if(bancaAtual<piso&&!(modoTime&&(!(piso>0)||(sitSel&&sitSel.abertura!=='confirmada')))) alerts.push({key:'piso',tone:C.red,text:`Banca atual ${fmt(bancaAtual)} está abaixo do piso mínimo (${fmt(piso)}).`});
  // fora da grade: torneios da semana atual com buy-in acima do ABI máximo DAQUELE jogador (clicável mostra quais/de quem)
  const foraGradeTours=tours.filter(t=>weekEnding(t.entry_date)===CURWK && statusGrade(t,config).status==='fora');
  if(foraGradeTours.length) alerts.push({key:'grade:'+CURWK,tone:C.red,text:`${pl(foraGradeTours.length,'torneio','torneios')} fora da grade nesta semana. ${toque?'Toque':'Clique'} para ver ${foraGradeTours.length===1?'qual':'quais'}.`,items:foraGradeTours});
  // histórico do dinheiro do time na Banca (A-018, A-062, A-069): capital, reload enviado e saque pago, só leitura
  const historicoTime=(()=>{ if(!modoTime) return []; const pp=(timeGente.pessoas||[]).find(x=>nomeIgual(x.nome,jogadorSel)); const dt=timeGente.dinheiro; if(!pp||!dt) return [];
    const rlPorAporte=Object.fromEntries((dt.reloads||[]).filter(r=>r.aporte_id).map(r=>[r.aporte_id,r]));
    return [...(dt.aportes||[]).filter(a=>a.pessoa_id===pp.id).map(a=>({k:'a'+a.id,data:String(a.data||a.criado_em||'').slice(0,10),
        tipo:rlPorAporte[a.id]?'Reload':num(a.valor)>=0?'Capital do time':'Capital recolhido pelo time',sala:a.sala,valor:num(a.valor)})),
      ...(dt.saques||[]).filter(q=>q.pessoa_id===pp.id&&q.status==='pago').map(q=>({k:'s'+q.id,data:String(q.pago_em||q.solicitado_em||'').slice(0,10),tipo:'Saque',
        texto:`${num(q.devolucao)>0?`devolveu ${fmt(q.devolucao)} de MU + `:''}cashout ${fmt(q.cashout)} · ${somenteLeitura?'jogador':'você'} ficou com ${fmt(q.parte_jogador)}`,valor:-(num(q.devolucao)+num(q.cashout))}))]
      .sort((x,y)=>String(y.data).localeCompare(String(x.data))); })();
  // o que está em aberto, no Início (A-014, A-051, A-052, A-053, A-055): saque e reload pedidos, planilha, dias sem lançar
  const faixasInicio=(()=>{ if(!solo) return []; const f=[], quem=somenteLeitura?alunoAberto:null;
    const sq=modoTime&&sitSel?sitSel.saque_aberto:null, rl=modoTime&&sitSel?sitSel.reload_aberto:null, ab=modoTime&&sitSel?sitSel.abertura:null;
    if(sq) f.push(sq.status==='aprovado'
      ?{k:'saque',tom:'warn',titulo:'Saque aprovado',texto:quem?`o time espera ${fmt(sq.total_time)} de ${quem}`:`mande ${fmt(sq.total_time)} pro time; depois o time confirma que recebeu`}
      :{k:'saque',tom:'warn',titulo:'Saque aguardando aprovação',texto:`pedido em ${dataBR(sq.solicitado_em)} · o time recebe ${fmt(sq.total_time)}${Number(sq.parte_jogador)>0?` · ${quem?quem+' fica':'você fica'} com ${fmt(sq.parte_jogador)}`:''}`});
    if(rl) f.push({k:'reload',tom:'warn',titulo:rl.status==='aprovado'?'Reload aprovado':'Reload aguardando aprovação',
      texto:`${fmt(rl.valor)}${rl.sala?` na ${rl.sala}`:''} · ${rl.status==='aprovado'?'o time vai mandar o dinheiro':`pedido em ${dataBR(rl.solicitado_em)}`}`});
    if(ab==='sem') f.push({k:'planilha',tom:'bad',titulo:quem?'Sem planilha de abertura':'Mande a planilha de abertura',
      texto:quem?'a banca ainda não tem os saldos de entrada':'com ela o time registra seus saldos de entrada, o MU e o que você já sacou',acao:quem?null:['Mandar agora',()=>setView('banca')]});
    if(ab==='enviada') f.push({k:'planilha',tom:'warn',titulo:'Planilha aguardando o time conferir',
      texto:`enviada em ${dataBR(sitSel.abertura_enviada_em)}${sitSel.abertura_banca!=null?` · banca na planilha ${fmt(sitSel.abertura_banca)}`:''}`});
    const ultimo=tours.reduce((m,t)=>t.entry_date>m?t.entry_date:m,''), dd=ultimo?diasDesde(ultimo):null;
    if(dd!=null&&dd>=3) f.push({k:'parado',tom:dd>7?'bad':'warn',titulo:quem?`Último torneio lançado: ${dataBR(ultimo)}`:`Seu último torneio lançado é de ${dataBR(ultimo)}`,
      texto:`${dd} dias atrás${quem?'':'. Se jogou depois disso, lance os jogos'}`});
    return f; })();
  // stop já batido pelo jogador na tela (hoje ou na semana): o formulário de torneio avisa antes de lançar mais
  const stopBatido=(()=>{ if(!solo||somenteLeitura||!players[0]) return null; const p=players[0], st=stopDe(config,p), hoje=todayISO();
    const resHoje=daily.filter(e=>e.player===p&&e.entry_date===hoje).reduce((a,e)=>a+resultadoDia(e),0), slDia=st.dia*abiDoStop(config,p,tours,hoje).valor;
    if(slDia>0&&resHoje<=-slDia) return `Você já bateu o stop loss de hoje (${fmtSinal(resHoje)}, limite ${fmt(slDia)}). A regra é parar por hoje.`;
    const resSem=curWeek[p]?curWeek[p].resultado:0, slSem=st.semana*bancaSemana;
    if(slSem>0&&resSem<=-slSem) return `Você já bateu o stop loss da semana (${fmtSinal(resSem)}, limite ${fmt(slSem)}). A regra é parar até a semana que vem.`;
    return null; })();
  // quem bateu: "Você" na própria conta; o nome no pool e no painel aberto pela gestão
  const quemBateu=p=>solo&&!somenteLeitura?'Você':p;
  players.forEach(p=>{ const r=curWeek[p]?curWeek[p].resultado:0; const lim=stopDe(config,p).semana*bancaSemana; if(lim>0 && r<0 && r<=-lim) alerts.push({key:'slsem:'+p+':'+CURWK,tone:C.red,text:`${quemBateu(p)} atingiu o stop loss semanal (${fmtSinal(r)}, limite ${fmt(lim)}: ${pctFmt(stopDe(config,p).semana*100)} da banca do começo da semana).`}); });
  daily.filter(e=>weekEnding(e.entry_date)===CURWK).forEach(e=>{ const sl=stopDe(config,e.player).dia*abiDoStop(config,e.player,tours,e.entry_date).valor; if(sl>0 && resultadoDia(e)<=-sl) alerts.push({key:'sldia:'+e.player+':'+e.entry_date,tone:C.red,text:`${quemBateu(e.player)} bateu o stop loss diário em ${dLabel(e.entry_date)} (${fmtSinal(resultadoDia(e))}, limite ${fmt(sl)}).`}); });
  // nudge de inatividade: sem registrar torneio há alguns dias -> painel/banca desatualizados.
  // Usa a data do lançamento mais recente (created_at, quando existe; senão a data do torneio).
  // pela data do torneio (não a do cadastro): é o que a gestão vê como "último lançamento" (A-053)
  if(tours.length>0){
    const ultimo=tours.reduce((m,t)=>t.entry_date>m?t.entry_date:m,'');
    if(ultimo){ const dias=diasDesde(ultimo);
      if(dias>=3) alerts.push({key:'parado',tone:C.gold,text:somenteLeitura?`O último torneio lançado de ${alunoAberto} é de ${dataBR(ultimo)} (${dias} dias).`
        :`Seu último torneio lançado é de ${dataBR(ultimo)} (${dias} dias). Se jogou depois disso, lance os jogos pra manter a banca e as estatísticas em dia.`}); }
  }

  // resultado faltando: dia com mãos importadas e NENHUM torneio lançado pro jogador (depois do 1º torneio dele). Mão de
  // torneio que já está lançado (mesmo id, de qualquer jogador) não conta: é outro problema (mão no jogador errado).
  { const idsLancados=new Set(tours.map(t=>t.site_tournament_id).filter(Boolean).map(String));
    players.filter(Boolean).forEach(p=>{
      const dele=tours.filter(t=>nomeIgual(t.player,p)); if(!dele.length) return;
      const primeiro=dele.reduce((m,t)=>t.entry_date<m?t.entry_date:m,dele[0].entry_date), comTorneio=new Set(dele.map(t=>t.entry_date));
      const dias=[...new Set(hh.filter(h=>nomeIgual(h.player,p)&&h.entry_date&&h.entry_date>=primeiro&&!comTorneio.has(h.entry_date)&&!idsLancados.has(String(h.site_tournament_id))).map(h=>h.entry_date))].sort();
      if(dias.length) alerts.push({key:'semres:'+p+':'+dias[dias.length-1]+':'+dias.length,tone:C.gold,
        text:`${solo?'Você tem':p+' tem'} mãos importadas em ${dias.length} dia${dias.length!==1?'s':''} sem nenhum torneio lançado (${dias.slice(-3).map(dLabel).join(', ')}${dias.length>3?'…':''}). O resultado ${dias.length!==1?'desses dias':'desse dia'} não está na banca: importe os resumos ou lance os torneios.`}); }); }

  // sininho: alertas do painel (enquanto a situação durar e ninguém apagar) + avisos do aparelho + avisos do time
  const alertasPainel=alerts.map(a=>({key:a.key||a.text,painel:true,tipo:'painel',titulo:a.tone===C.red?'Atenção na banca':'Aviso',texto:a.text,tone:a.tone,items:a.items}))
    .filter(a=>!avApagados.includes(a.key)).map(a=>({...a,id:'p-'+a.key,lido_em:avLidos.includes(a.key)?'lido':null}));
  const todosAvisos=(()=>{ const l=[...alertasPainel,...avLocais,...avisos.map(x=>({...x,servidor:true}))]
      .sort((x,y)=>String(y.criado_em||'9').localeCompare(String(x.criado_em||'9')));
    const vistos={}, out=[];
    l.forEach(a=>{ const k=a.servidor?`${a.tipo}|${a.ref_id||''}|${a.titulo}|${a.texto||''}`:'id|'+a.id;
      if(vistos[k]){ vistos[k].vezes=(vistos[k].vezes||1)+1; if(!a.lido_em) vistos[k].lido_em=null; vistos[k].ids=[...(vistos[k].ids||[vistos[k].id]),a.id]; return; }
      vistos[k]={...a}; out.push(vistos[k]); });
    return out; })();

  /* dados dos gráficos */
  const chartWeeks=allWeeks.slice(-8);
  const resChart=chartWeeks.map(wk=>({label:dLabel(wk),vals:players.map(p=>{const w=(weeksByPlayer[p]||[]).find(x=>x.week===wk); return w?w.resultado:0;})}));
  const makeChart=chartWeeks.map(wk=>({label:dLabel(wk),vals:players.map(p=>makeUpAt(p,wk))}));
  const volWeeks=[...new Set(daily.map(e=>weekEnding(e.entry_date)))].sort().slice(-8);
  const volChart=volWeeks.map(wk=>({label:dLabel(wk),vals:[daily.filter(e=>weekEnding(e.entry_date)===wk).reduce((s,e)=>s+num(e.qtd_torneios),0)]}));
  const bankWeeks=[...new Set([
    ...daily.map(e=>weekEnding(e.entry_date)),
    ...ledger.map(l=>weekEnding(l.entry_date)),
    ...wds.map(w=>weekEnding(w.week_ending_date)),
  ])].sort();
  let runBanca=num(config.banca_inicial);
  const bancaChart=[{label:'Início',value:runBanca}].concat(bankWeeks.map(wk=>{
    runBanca+=daily.filter(e=>weekEnding(e.entry_date)===wk).reduce((s,e)=>s+resultadoDia(e),0);
    runBanca+=ledger.filter(l=>weekEnding(l.entry_date)===wk).reduce((s,l)=>s+num(l.entrada)-num(l.saida),0);
    runBanca-=wds.filter(w=>weekEnding(w.week_ending_date)===wk).reduce((s,w)=>s+num(w.valor_sacado),0);
    return {label:dLabel(wk),value:runBanca};
  })).slice(-9);
  // curva de lucro acumulado por jogador (o gráfico clássico de poker), por dia
  const lucroDias=[...new Set(daily.map(e=>e.entry_date))].sort();
  const lucroLabels=['Início',...lucroDias.map(dLabel)].slice(-13);
  const lucroSeries=players.map((p,i)=>{ let run=0; const vals=[0,...lucroDias.map(d=>{ run+=daily.filter(e=>e.player===p&&e.entry_date===d).reduce((s,e)=>s+resultadoDia(e),0); return run; })]; return {name:p, color:PLAYER_COLORS[i], values:vals.slice(-13)}; });

  /* atalhos de torneio (lançar/editar/excluir a partir do Diário ou dos cards de dia) */
  const addTourOn=(date,player)=>setModal({type:'tour',initial:{entry_date:date||todayISO(),...(player?{player}:{})}});
  const editTour=t=>setEditing({type:'tour',item:t});
  const delTour=t=>del('tournaments',t.id,setTours,tours);

  /* schemas de campos p/ AddModal */
  const FIELDS={
    tour:[
      {k:'entry_date',label:'Data',type:'date',def:todayISO()},
      {k:'player',label:'Jogador',type:'select',opts:players,def:players[0],oculto:players.length===1},
      {k:'tournament_name',label:'Torneio',type:'text',full:true},
      {k:'site',label:'Site',type:'select',opts:sites},
      {k:'modality',label:'Modalidade',type:'select',opts:modalidades},
      {k:'buyin',label:'Buy-in (US$)',type:'money',def:'0'},
      {k:'reentries',label:'Re-entries',type:'int',def:'0'},
      {k:'field_size',label:'Field (jogadores)',type:'int',def:'0'},
      {k:'final_position',label:'Posição final',type:'int'},
      {k:'prize',label:'Premiação (US$)',type:'money',def:'0'},
      {k:'bounty',label:'Bounties PKO (US$)',type:'money',def:'0',hint:'PKO: o que você ganhou eliminando jogadores. Fica separado do prêmio por colocação e entra no lucro.'},
      {k:'ticket',label:'Entrei com bilhete',type:'toggle',full:true,hint:'Ticket/T$ ganho antes. O buy-in conta como nível jogado, mas nenhum dinheiro sai da banca (já saiu no satélite).'},
      {k:'observacoes',label:'Observações',type:'textarea',full:true},
    ],
    bank:[
      {k:'entry_date',label:'Data',type:'date',def:todayISO()},
      {k:'player',label:'Jogador (ou pool)',type:'select',opts:['Pool / Reserva',...players]},
      {k:'wallet',label:'Carteira',type:'select',opts:WALLETS},
      {k:'entrada',label:'Entrada (US$)',type:'money',def:'0'},
      {k:'saida',label:'Saída (US$)',type:'money',def:'0'},
      {k:'observacao',label:'Observação',type:'text',full:true},
    ],
    wd:[
      {k:'week_ending_date',label:'Semana (domingo de fechamento)',type:'date',def:CURWK,full:true},
      {k:'player',label:'Jogador',type:'select',opts:players,def:players[0],oculto:players.length===1},
      {k:'wallet',label:'Saiu de qual carteira',type:'select',opts:['Não informar',...WALLETS]},
      {k:'valor_sacado',label:'Valor sacado (US$)',type:'money',def:'0'},
      {k:'observacoes',label:'Observações',type:'textarea',full:true},
    ],
    transfer:[
      {k:'entry_date',label:'Data',type:'date',def:todayISO()},
      {k:'de_player',label:'Sai de quem',type:'select',opts:['Pool / Reserva',...players]},
      {k:'de_wallet',label:'Sai de qual carteira',type:'select',opts:WALLETS,def:'Reserva'},
      {k:'para_player',label:'Vai pra quem',type:'select',opts:[...players,'Pool / Reserva']},
      {k:'para_wallet',label:'Vai pra qual carteira',type:'select',opts:WALLETS,def:'PokerStars'},
      {k:'valor',label:'Valor (US$)',type:'money',def:'0'},
      {k:'observacao',label:'Observação',type:'text',full:true},
    ],
  };
  const MODAL_TITLE={tour:'torneio',bank:'movimento na banca',wd:'saque pago'};
  const MODAL_TABLE={tour:'tournaments',bank:'bankroll_ledger',wd:'withdrawals'};
  const MODAL_STATE={tour:[tours,setTours],bank:[ledger,setLedger],wd:[wds,setWds]};

  // padrão do time editado no bloco de regras ("Time inteiro"): cada regra da reta aponta pra sua coluna da configuração
  const PADRAO_TIME={abi_max:{label:'ABI máximo (reta sem grade)',kind:'money',key:'abi_max_player1'},stop_dia_buyins:{label:'Stop loss diário (buy-ins)',kind:'money',key:'stoploss_daily_buyins'},
    stop_semana_pct:{label:'Stop loss semanal',kind:'percent',key:'stoploss_weekly_pct'},sites:{label:'Sites permitidos',kind:'list',key:'sites_permitidos'},modalidades:{label:'Modalidades permitidas',kind:'list',key:'modalidades_permitidas'}};
  /* nav: no celular só o essencial embaixo; o resto abre no "Mais" (menu hambúrguer) */
  let MAIN_TABS=['painel','torneios','diario','stats'];
  let nav=[
    {id:'painel',label:'Painel',Icon:IcoPanel},
    {id:'torneios',label:'Torneios',Icon:IcoTrophy},
    {id:'diario',label:'Diário',Icon:IcoDaily},
    {id:'semanal',label:'Semanal',Icon:IcoWeek},
    {id:'mensal',label:'Mensal',Icon:IcoMonth},
    {id:'stats',label:'Stats',Icon:IcoStats},
    // Auditoria: em stand-by (fora do menu). A versão certa cruza com o HISTÓRICO OFICIAL
    // de torneios do site + tempo ativo na pool — espera um documento de exemplo.
    {id:'saques',label:'Saques',Icon:IcoCashOut},
    {id:'banca',label:'Banca',Icon:IcoStack},
    {id:'config',label:'Ajustes',Icon:IcoGear},
  ].filter(n=>!solo||n.id!=='saques');
  // time de staking: o menu é o do papel. Gestão: telas do time. Jogo (ou gestor olhando um aluno): telas de um jogador.
  const GRUPO_TORNEIOS=['torneios','diario','semanal','mensal'];
  if(modoTime){
    const cs=new Set(timeGente.caps||[]), tem=c=>cs.has(c)||cs.has('administrar');
    if(gestaoAtiva){
      nav=[{id:'g_visao',label:timeGente.naRaiz?'Visão geral':'Minhas retas',Icon:IcoPanel},
        ...((tem('ver_desempenho')||tem('ver_financeiro')||tem('gerir_pessoas')||tem('promover')||tem('aprovar_saques'))?[{id:'g_jogadores',label:'Jogadores',Icon:IcoUsers}]:[]),
        {id:'g_grades',label:'Grades',Icon:IcoGrid},
        ...((tem('ver_financeiro')||tem('aprovar_saques'))?[{id:'g_financeiro',label:'Financeiro',Icon:IcoCashOut}]:[]),
        ...(tem('gerir_pessoas')?[{id:'g_equipe',label:'Equipe e convites',Icon:IcoShield}]:[]),
        ...(tem('configurar_regras')?[{id:'g_regras',label:'Regras do time',Icon:IcoGear}]:[]),
        {id:'config',label:'Minha conta',Icon:IcoUser}];
      MAIN_TABS=nav.slice(0,4).map(n=>n.id);
    } else {
      nav=[{id:'painel',label:'Início',Icon:IcoHome},{id:'torneios',label:'Torneios',Icon:IcoTrophy},{id:'stats',label:'Stats',Icon:IcoStats},
        ...(semDinheiro?[]:[{id:'banca',label:'Banca',Icon:IcoStack}]),
        ...(alunoAberto?[]:[{id:'time',label:'Meu time',Icon:IcoShield},{id:'config',label:'Ajustes',Icon:IcoGear}])];
      MAIN_TABS=alunoAberto?['painel','torneios','stats',...(semDinheiro?[]:['banca'])]:['painel','torneios','banca','time'];
    }
  }
  const navAtiva=id=>view===id||(modoTime&&!gestaoAtiva&&id==='torneios'&&GRUPO_TORNEIOS.includes(view));

  /* ---------- mensal ---------- */
  // O mês é o mês do CALENDÁRIO em que o dia foi jogado: lançou dia 28/07, conta em julho.
  // (o rateio semanal — make-up, split, saque — continua semanal e aparece na semana em que fecha)
  const monthList=[...new Set(daily.map(e=>mKey(e.entry_date)).concat(allWeeks.map(mKey)).concat([todayISO().slice(0,7)]))].sort();
  const monthIdx=monthList.indexOf(month);
  const goMonth=d=>{const i=monthIdx+d; if(i>=0&&i<monthList.length)setMonth(monthList[i]);};
  const monthWeeks=players.flatMap(p=>(weeksByPlayer[p]||[]).filter(w=>mKey(w.week)===month)); // semanas FECHADAS no mês (só pro rateio)
  const monthDaily=daily.filter(e=>mKey(e.entry_date)===month);
  const mRes=monthDaily.reduce((s,e)=>s+resultadoDia(e),0);
  const mLucroDiv=monthWeeks.reduce((s,w)=>s+w.lucroDiv,0);
  const mPool=monthWeeks.reduce((s,w)=>s+w.partePool,0);
  const mTorneios=monthDaily.reduce((s,e)=>s+num(e.qtd_torneios),0);
  const mEntradas=monthDaily.reduce((s,e)=>s+(num(e.qtd_entradas)||num(e.qtd_torneios)),0);
  const mBuyins=monthDaily.reduce((s,e)=>s+num(e.total_buyins),0);              // dinheiro investido
  const mNominal=monthDaily.reduce((s,e)=>s+(num(e.buyins_nominal)||num(e.total_buyins)),0); // nível jogado
  const mTickets=monthDaily.reduce((s,e)=>s+num(e.tickets),0);
  const mAbi=mEntradas>0?mNominal/mEntradas:0;
  const mRoi=mBuyins>0?(mRes/mBuyins)*100:0;
  const dayResults=monthDaily.map(e=>({d:e.entry_date,r:resultadoDia(e),p:e.player}));
  const melhorDia=dayResults.length?dayResults.reduce((a,b)=>b.r>a.r?b:a):null;
  const piorDia=dayResults.length?dayResults.reduce((a,b)=>b.r<a.r?b:a):null;
  const monthToursOf=p=>tours.filter(t=>t.player===p && mKey(t.entry_date)===month);
  const perPlayerMonth=players.map(p=>{
    const ed=monthDaily.filter(e=>e.player===p);
    const res=ed.reduce((s,e)=>s+resultadoDia(e),0);
    const vol=ed.reduce((s,e)=>s+num(e.total_buyins),0);                          // dinheiro
    const volNom=ed.reduce((s,e)=>s+(num(e.buyins_nominal)||num(e.total_buyins)),0); // nível
    const torneios=ed.reduce((s,e)=>s+num(e.qtd_torneios),0);
    const entradas=ed.reduce((s,e)=>s+(num(e.qtd_entradas)||num(e.qtd_torneios)),0);
    const premios=monthToursOf(p).reduce((s,t)=>s+num(t.prize),0);
    const bounties=monthToursOf(p).reduce((s,t)=>s+bountyTorneio(t),0);
    const cashes=monthToursOf(p).filter(t=>num(t.prize)>0).length;
    const abi=entradas>0?volNom/entradas:0;
    const roi=vol>0?(res/vol)*100:0;
    const itm=torneios>0?(cashes/torneios)*100:0;
    const makeAberto=makeUpAt(p,month+'-31');   // make-up depois da última semana fechada até o fim do mês
    return {p, res, vol, torneios, entradas, premios, bounties, cashes, abi, roi, itm, makeAberto};
  });
  const maisLucrativo=perPlayerMonth.length?perPlayerMonth.reduce((a,b)=>b.res>a.res?b:a):null;
  const maiorVolume=perPlayerMonth.length?perPlayerMonth.reduce((a,b)=>b.vol>a.vol?b:a):null;
  // desempenho por site e por modalidade (usa os campos que já são lançados em cada torneio)
  const monthTours=tours.filter(t=>mKey(t.entry_date)===month);
  // "Onde vocês lucram" com filtro Geral/jogador
  const monthToursWho=mensalWho==='Geral'?monthTours:monthTours.filter(t=>t.player===mensalWho);
  const breakdownBy=(key,list)=>{
    const m={};
    list.forEach(t=>{ const k=t[key]||'—'; if(!m[k]) m[k]={k,n:0,inv:0,res:0,premios:0,bounties:0}; const g=m[k]; g.n+=1; g.inv+=totalInvestido(t); g.res+=lucroTorneio(t); g.premios+=num(t.prize); g.bounties+=bountyTorneio(t); });
    return Object.values(m).map(g=>({...g,roi:g.inv>0?(g.res/g.inv)*100:0})).sort((a,b)=>b.res-a.res);
  };
  const bySite=breakdownBy('site',monthToursWho), byModality=breakdownBy('modality',monthToursWho);

  const pcolor=p=>PLAYER_COLORS[players.indexOf(p)]||C.inkSoft;

  /* ---------- Diário: filtros (jogador / site / modalidade) + período (intervalo ou últimos N dias) ---------- */
  const diarySites=['Todos',...[...new Set(tours.map(t=>t.site).filter(Boolean))]];
  const diaryMods=['Todos',...[...new Set(tours.map(t=>t.modality).filter(Boolean))]];
  const diPeriodo=(()=>{ // resolve o período ativo -> {from,to} (ou null)
    const n=parseInt(diF.days,10);
    if(n>0) return {from:addDaysISO(todayISO(),-(n-1)), to:todayISO(), label:`últimos ${n} dias`};
    if(diF.from||diF.to) return {from:diF.from||'0000-01-01', to:diF.to||'9999-12-31', label:`${diF.from?dLabel(diF.from):'início'} a ${diF.to?dLabel(diF.to):'hoje'}`};
    return null;
  })();
  const diaryTours=tours.filter(t=>
    (diF.player==='Todos'||t.player===diF.player) &&
    (diF.site==='Todos'||t.site===diF.site) &&
    (diF.mod==='Todos'||t.modality===diF.mod) &&
    (!diPeriodo || (t.entry_date>=diPeriodo.from && t.entry_date<=diPeriodo.to)));
  const diaryDaily=deriveDaily(diaryTours);
  const diFiltroAtivo=diF.player!=='Todos'||diF.site!=='Todos'||diF.mod!=='Todos'||!!diPeriodo;
  const diAgg=(()=>{
    const dd=diaryDaily;
    const res=dd.reduce((s,e)=>s+resultadoDia(e),0);
    const torneios=dd.reduce((s,e)=>s+num(e.qtd_torneios),0);
    const entradas=dd.reduce((s,e)=>s+(num(e.qtd_entradas)||num(e.qtd_torneios)),0);
    const buyins=dd.reduce((s,e)=>s+num(e.total_buyins),0);                          // dinheiro
    const nominal=dd.reduce((s,e)=>s+(num(e.buyins_nominal)||num(e.total_buyins)),0);  // nível
    const premios=diaryTours.reduce((s,t)=>s+num(t.prize),0);
    const bounties=diaryTours.reduce((s,t)=>s+bountyTorneio(t),0);
    const cashes=diaryTours.filter(t=>num(t.prize)>0).length;
    return {res,torneios,entradas,buyins,premios,bounties,tickets:dd.reduce((s,e)=>s+num(e.tickets),0),
      abi:entradas>0?nominal/entradas:0, roi:buyins>0?(res/buyins)*100:0, itm:torneios>0?(cashes/torneios)*100:0,
      dias:[...new Set(dd.map(e=>e.entry_date))].length};
  })();

  // teste grátis acabou: bloqueia o app inteiro até assinar (dados preservados no banco)
  if(srvStatus&&srvStatus.suspenso) return <TimeSuspenso nome={srvStatus.time} onLogout={sair}/>;
  if(trialExpired) return <>
    <TrialBlocked plan={plan} email={session.user.email} onLogout={sair} onDelete={()=>setDelAcc(true)}/>
    {delAcc&&<DeleteAccountModal nickname={myName} onClose={()=>setDelAcc(false)}/>}
  </>;

  return <div className="wrap">
    {/* sidebar desktop */}
    <aside className="side" style={{flexDirection:'column',width:238,padding:20,borderRight:`1px solid ${C.border}`,position:'sticky',top:0,height:'100vh',gap:6}}>
      <Brand team={!soloConta} marca={marcaTime}/><div style={{height:6}}/>
      {podeTrocarModo&&<ModoSwitch modo={gestaoAtiva?'gestao':'jogo'} onTrocar={trocarModo}/>}
      {nav.map(n=><NavBtn key={n.id} Icon={n.Icon} label={n.label} active={navAtiva(n.id)} onClick={()=>setView(n.id)}/>)}
      <div style={{marginTop:'auto',display:'flex',flexDirection:'column',gap:10}}>
        {gestaoAtiva?<div style={{padding:14,borderRadius:16,background:C.plumSoft,fontSize:12.5,color:P,lineHeight:1.45}}>
          <div style={{fontWeight:800}}>{marcaTime?.nome||'Time'} · {timeGente.souAdmin?'admin':PAPEL_ROT[papelDe(timeGente.caps)]?.toLowerCase()||'gestão'}</div>
          <div style={{color:C.inkSoft,marginTop:2}}>{timeGente.joga?'Também joga: troque em Meu jogo.':'Esta conta só gere o time.'}</div></div>
        :<div style={{padding:15,borderRadius:16,background:C.plumSoft}}>
          <div style={{fontSize:12.5,color:P,fontWeight:700}}>{somenteLeitura?`Banca de ${alunoAberto}`:'Banca atual'}</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,color:P,marginTop:2}}>{semDinheiro?'—':fmt(bancaAtual)}</div>
        </div>}
        <button onClick={sair} style={{padding:'10px',borderRadius:12,border:`1px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:600,cursor:'pointer',fontSize:13.5}}>Sair</button>
      </div>
    </aside>

    <main style={{flex:1,padding:'22px 16px calc(112px + env(safe-area-inset-bottom))',maxWidth:'100%',minWidth:0}}>
      {/* header mobile */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
        <div className="bottomnav"><Brand small team={!soloConta} marca={marcaTime}/></div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'}}>
          <Sininho avisos={todosAvisos}
            onAbrir={async()=>{ setAvLidos(l=>[...new Set([...l,...alertasPainel.map(x=>x.key)])]);
              setAvLocais(l=>l.map(x=>x.lido_em?x:{...x,lido_em:new Date().toISOString()}));
              if(avisos.some(x=>!x.lido_em)){ setAvisos(a=>a.map(x=>x.lido_em?x:{...x,lido_em:new Date().toISOString()})); try{ await sb.rpc('marcar_avisos_lidos'); }catch(e){} } }}
            onApagar={async av=>{ if(av.painel){ setAvApagados(l=>[...l,av.key]); return; }
              if(av.local){ setAvLocais(l=>l.filter(x=>x.id!==av.id)); return; }
              const ids=av.ids||[av.id]; setAvisos(a=>a.filter(x=>!ids.includes(x.id))); try{ for(const id of ids) await sb.rpc('apagar_aviso',{p_id:id}); }catch(e){} }}
            onLimpar={async()=>{ setAvApagados(l=>[...l,...alertasPainel.map(x=>x.key)]); setAvLocais([]);
              if(avisos.length){ setAvisos([]); try{ await sb.rpc('apagar_avisos'); }catch(e){} } }}
            onIr={av=>{ if(av.items&&av.items.length) return setAlertDetail({items:av.items});
              if(av.painel){ const k=String(av.key||''); return setView(k.startsWith('parado')||k.startsWith('semres')?'torneios':k.startsWith('piso')?'banca':'painel'); }
              if(av.local) return;
              if(gestaoAtiva) return setView({saque:'g_financeiro',reload:'g_financeiro',planilha:'g_financeiro',abertura:'g_financeiro',saida:'g_financeiro',saldo:'g_financeiro',capital:'g_financeiro',entrada:'g_jogadores',grade:'g_grades'}[av.tipo]||'g_visao');
              setView({grade:'time',planilha:'time',entrada:'time'}[av.tipo]||(modoTime?'banca':'painel')); }}/>
        </div>
      </div>
      {podeTrocarModo&&<div className="mobile-only" style={{marginBottom:14}}><ModoSwitch modo={gestaoAtiva?'gestao':'jogo'} onTrocar={trocarModo} compacto/></div>}
      {/* time: carregando quem é quem (evita piscar a tela de jogador pra quem só gere) */}
      {soloConta&&minhasSaidas.filter(x=>x.id!==saidaVista).slice(0,1).map(x=><div key={x.id} data-saida-time style={{display:'flex',gap:10,alignItems:'flex-start',padding:'11px 14px',marginBottom:14,borderRadius:13,background:C.plumSoft,border:`1.5px solid ${P}`,fontSize:13.5,color:C.ink,lineHeight:1.5}}>
        <div style={{flex:1}}>Você saiu do time <b>{x.time_nome||''}</b> em {dataBR(x.saida)}. O seu histórico (torneios, mãos, salas e movimentos) veio com você pra esta conta, com 15 dias de teste.
          {' '}Acerto: banca {fmt(x.banca)}, capital do time {fmt(x.mu)}{Number(x.mk_congelado)>0?`, MK de ${fmt(x.mk_congelado)} congelado`:''}{x.parte_jogador!=null&&Number(x.parte_jogador)>0?`, você ficou com ${fmt(x.parte_jogador)} do lucro`:''}.</div>
        <button aria-label="Fechar" onClick={()=>{ setSaidaVista(x.id); try{ localStorage.setItem('gb_saida_vista',x.id); }catch(e){} }} style={{border:'none',background:'transparent',cursor:'pointer',color:C.inkSoft,padding:2}}><IcoX s={16}/></button></div>)}
      {soloConta&&meusPedidos.filter(x=>x.status==='pendente').slice(0,1).map(x=><div key={x.id} data-pedido-pendente style={{padding:'11px 14px',marginBottom:14,borderRadius:13,background:C.plumSoft,border:`1.5px solid ${P}`,fontSize:13.5,color:C.ink,lineHeight:1.5}}>
        Pedido pra entrar no time <b>{x.time_nome||''}</b> enviado em {dataBR(x.criado_em)}. Quando a gestão aprovar, esta conta entra no time. O seu histórico vai junto e o de antes da entrada fica só com você.</div>)}
      {avisoPedido&&avisoPedido.erro&&<div data-pedido-erro role="alert" style={{padding:'11px 14px',marginBottom:14,borderRadius:13,background:C.redSoft,border:`1.5px solid ${C.red}`,fontSize:13.5,color:C.ink}}>
        <b>O pedido pro time não foi:</b> {avisoPedido.texto}</div>}
      {erroCarga&&<div data-erro-carga role="alert" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'11px 14px',marginBottom:14,borderRadius:13,background:C.goldSoft,border:`1.5px solid ${C.gold}`,fontSize:13.5,color:C.ink}}>
        <span style={{flex:1,minWidth:200}}><b>Não consegui atualizar tudo do servidor.</b> Os números abaixo podem estar desatualizados.</span>
        <button onClick={()=>loadAll()} style={{padding:'7px 13px',borderRadius:10,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>Tentar de novo</button>
      </div>}
      {modoTime&&!timeGente.carregado&&<div style={{display:'grid',placeItems:'center',padding:60}}><div className="spin"/></div>}
      {/* gestor olhando o painel de um aluno: faixa fixa com o nome e o caminho de volta */}
      {somenteLeitura&&<div data-aluno-aberto style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',background:C.plumSoft,borderRadius:14,padding:'10px 14px',marginBottom:16,
        position:'sticky',top:8,zIndex:20,boxShadow:'0 10px 24px -18px rgba(25,35,29,.5)',border:`1px solid ${C.border}`}}>
        <span style={{fontSize:14,color:P,flex:1,minWidth:180}}>Painel de <b>{alunoAberto}</b> · só leitura: você vê tudo, só {alunoAberto} lança e muda</span>
        <button onClick={fecharAluno} style={{padding:'8px 14px',borderRadius:11,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>Voltar para a gestão</button>
      </div>}
      {modoTime&&timeGente.carregado&&!gestaoAtiva&&!jogadorSel&&view!=='config'&&<Card style={{padding:20,marginBottom:16}}><div style={{fontWeight:700}}>Você ainda não está numa reta do time.</div>
        <div style={{fontSize:13,color:C.inkSoft,marginTop:4}}>Peça o link de convite da sua reta pro professor.</div></Card>}
      {/* jogador do time: Diário, Semana e Mês ficam dentro de Torneios */}
      {modoTime&&!gestaoAtiva&&GRUPO_TORNEIOS.includes(view)&&<div role="tablist" aria-label="Torneios" data-sub-torneios style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
        {[['torneios','Lista'],['diario','Diário'],['semanal','Semana'],['mensal','Mês']].map(([k,r])=><button key={k} role="tab" aria-selected={view===k} onClick={()=>setView(k)}
          style={{padding:'8px 14px',borderRadius:99,border:`1.5px solid ${view===k?P:C.border}`,background:view===k?C.plumSoft:C.surface,color:view===k?P:C.inkSoft,fontWeight:700,fontSize:13,cursor:'pointer'}}>{r}</button>)}
      </div>}

      {/* ---------------- PAINEL ---------------- */}
      {/* ---------------- CONVIDADO: tela de acesso restrito ---------------- */}
      {view==='painel'&&<div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
        {/* teste grátis: contagem regressiva + convite pra assinar (só conta em teste) */}
        {trialDaysLeft!=null&&<Card style={{padding:'13px 16px',display:'flex',alignItems:'center',gap:12,border:`1.5px solid ${trialDaysLeft<=3?C.gold:P}`,background:trialDaysLeft<=3?C.goldSoft:C.plumSoft}}>
          <span style={{fontSize:22,flexShrink:0}}>⏳</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:14,color:C.ink}}>Teste grátis · {trialDaysLeft===0?'último dia':`faltam ${trialDaysLeft} dia${trialDaysLeft!==1?'s':''}`}</div>
            <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.4}}>Assine o plano <b>{PLAN_LABEL[plan]?PLAN_LABEL[plan].split(' (')[0]:plan}</b> pra não perder o acesso quando o teste acabar.</div>
          </div>
          <button onClick={()=>abrirCheckout(plan==='pro'?'pro':'gestao','mensal',session.user.email)} style={{padding:'9px 14px',borderRadius:11,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',flexShrink:0}}>Assinar</button>
        </Card>}
        {/* convite pra instalar na tela inicial (some quando já instalado ou dispensado) */}
        {installCard&&trialDaysLeft==null&&<Card style={{padding:'14px 16px',display:'flex',alignItems:'center',gap:12,border:`1.5px solid ${P}`,background:C.plumSoft}}>
          <span style={{width:40,height:40,borderRadius:12,background:'#fff',display:'grid',placeItems:'center',color:P,flexShrink:0}}><IcoChip s={22}/></span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:14,color:C.ink}}>Deixe o GrinderBank na tela inicial</div>
            <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.4}}>Abre em tela cheia, como um app de celular — {isIOS()?'toque pra ver como':'um toque e pronto'}.</div>
          </div>
          <button onClick={instalar} style={{padding:'9px 14px',borderRadius:11,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',flexShrink:0}}>{isIOS()?'Como instalar':'Adicionar'}</button>
          <button onClick={dispensarInstall} aria-label="Dispensar" style={{width:30,height:30,borderRadius:9,border:'none',background:'transparent',color:C.inkSoft,cursor:'pointer',display:'grid',placeItems:'center',flexShrink:0}}><IcoX s={16}/></button>
        </Card>}
        <Card style={{padding:22,background:`linear-gradient(135deg,${P},#3B305E)`,border:'none',color:'#fff'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,opacity:.85,fontWeight:600,fontSize:14}}><IcoStack s={17}/>{somenteLeitura?`Banca de ${alunoAberto}`:solo?'Minha banca':'Banca central da pool'}</div>
          {semDinheiro?<div data-sem-dinheiro style={{fontSize:14.5,fontWeight:600,marginTop:8,opacity:.92}}>Você não vê o financeiro deste aluno.</div>:<>
          <div data-banca-hero style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:42,fontWeight:600,marginTop:6}}>{fmt(bancaAtual)}</div>
          {partesBanca?<div data-partes-banca style={{display:'flex',gap:'6px 16px',flexWrap:'wrap',marginTop:8,fontSize:12.5,opacity:.88,fontWeight:600}}>
            <span>Salas {fmt(partesBanca.salas)}</span><span>Jogos {fmtSinal(partesBanca.resultados)}</span>
            {Number(partesBanca.movimentos)!==0&&<span>Movimentos {fmtSinal(partesBanca.movimentos)}</span>}
            {Number(partesBanca.aportes)!==0&&<span>Reload e capital do time {fmtSinal(partesBanca.aportes)}</span>}
            {Number(partesBanca.saques)>0&&<span>Saques −{fmt(partesBanca.saques)}</span>}
            {partesBanca.corte&&<span style={{opacity:.85}}>conta o que veio depois de {dataBR(partesBanca.corte)}</span>}
          </div>:!somenteLeitura&&<div style={{display:'flex',gap:'6px 16px',flexWrap:'wrap',marginTop:8,fontSize:12.5,opacity:.88,fontWeight:600}}>
            <span>Inicial {fmt(config.banca_inicial)}</span>
            <span>Jogos {resultadosTotal>=0?'+':'−'}{fmt(Math.abs(resultadosTotal))}</span>
            {movimentosTotal!==0&&<span>Aportes {movimentosTotal>=0?'+':'−'}{fmt(Math.abs(movimentosTotal))}</span>}
            {sacadoTotal>0&&<span>Saques −{fmt(sacadoTotal)}</span>}
          </div>}
          {!(modoTime&&!(piso>0))&&<><div style={{marginTop:12}}><Bar2 pct={piso>0?(bancaAtual/piso)*100:100} color="#fff" track="rgba(255,255,255,.22)"/></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:13.5,opacity:.92}}>
            <span>Piso mínimo {fmt(piso)}</span>
            <span>{bancaAtual>=piso?`${fmt(bancaAtual-piso)} acima do piso`:'abaixo do piso!'}</span>
          </div></>}
          {modoTime&&muTela!=null&&(()=>{ const mk=mkDe(bancaAtual,muTela), ab=sitSel?sitSel.abertura:null;
            // sem a planilha conferida, a banca ainda não tem os saldos de entrada: MK aqui seria um número falso
            if(ab==='sem'||ab==='enviada') return <div data-painel-mk="sem-foto" style={{marginTop:12,background:'rgba(255,255,255,.14)',borderRadius:12,padding:'9px 12px',fontSize:13.5,fontWeight:600}}>
              {ab==='sem'?'Sem planilha de abertura: a banca ainda não tem os saldos de entrada, então MU e MK ainda não valem.':'Planilha aguardando o time conferir: MU e MK passam a valer depois da conferência.'}</div>;
            const pedido=sitSel&&sitSel.saque_aberto;
            return <div data-painel-mk style={{marginTop:12,background:'rgba(255,255,255,.14)',borderRadius:12,padding:'9px 12px',fontSize:13.5,fontWeight:600,display:'flex',gap:'4px 14px',flexWrap:'wrap'}}>
            <span>MU {fmt(muTela)}</span><span>{mk<0?`MK ${fmtSinal(mk)}`:`Profit ${fmtSinal(mk)}`}</span>
            <span style={{opacity:.85}}>{pedido?'saque em andamento':mk<0?'saque só depois de sair do MK':'fora de MK: pode pedir saque'}</span></div>; })()}
          </>}
        </Card>

        {faixasInicio.length>0&&<div data-faixas-inicio style={{display:'flex',flexDirection:'column',gap:8}}>
          {faixasInicio.map(f=><div key={f.k} data-faixa={f.k} style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'11px 14px',borderRadius:14,
            border:`1.5px solid ${f.tom==='bad'?C.red+'55':f.tom==='warn'?C.gold+'66':C.border}`,background:f.tom==='bad'?C.redSoft:f.tom==='warn'?C.goldSoft:C.plumSoft,color:C.ink,fontSize:13.5,lineHeight:1.45}}>
            <span style={{flex:1,minWidth:200}}><b>{f.titulo}</b>{f.texto?<> · {f.texto}</>:null}</span>
            {f.acao&&<button onClick={f.acao[1]} style={{...btnS,padding:'7px 12px'}}>{f.acao[0]}</button>}</div>)}
        </div>}


        <ResumoTorneios tours={tours} players={players} solo={solo}
          abi={tours.length?tours.reduce((s,t)=>s+nominalTorneio(t),0)/tours.reduce((s,t)=>s+1+num(t.reentries),0):0}/>

        <StopLossCard players={players} config={config} daily={daily} curWeek={curWeek} bancaSemana={bancaSemana} tours={tours} leitura={somenteLeitura?alunoAberto:null}/>

        {/* fora da grade fica FIXO: o pop-up passa em 8s e some pra sempre, e essa é a
            informação que o produto existe pra mostrar. Uma linha, sem parágrafo. */}
        {foraGradeTours.length>0&&<button onClick={()=>setAlertDetail({items:foraGradeTours})}
          style={{display:'flex',alignItems:'center',gap:9,width:'100%',textAlign:'left',cursor:'pointer',
            padding:'12px 15px',borderRadius:14,border:`1.5px solid ${C.red}55`,background:C.redSoft,color:C.red,fontWeight:700,fontSize:13.5}}>
          <IcoAlert s={17}/><span style={{flex:1,minWidth:0}}>{foraGradeTours.length} torneio{foraGradeTours.length!==1?'s':''} fora da grade nesta semana (desde {dataBR(iniSemana)})</span>
          <span style={{fontSize:18,flexShrink:0}}>›</span>
        </button>}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <Stat Icon={resSemanaAtual>=0?IcoUp:IcoDown} tone={resSemanaAtual>=0?C.greenMid:C.red} bg={resSemanaAtual>=0?C.greenSoft:C.redSoft} label="Resultado da semana" value={resSemanaAtual===0?fmt(0):fmtSinal(resSemanaAtual)}
            sub={!daily.some(e=>weekEnding(e.entry_date)===CURWK)?(todayISO()===iniSemana?`semana começando · ${weekLabel(CURWK)}`:`nada lançado nesta semana · ${weekLabel(CURWK)}`):weekLabel(CURWK)}/>
          {!solo&&<Stat Icon={IcoAlert} tone={makeUpTotal>0?C.gold:C.greenMid} bg={makeUpTotal>0?C.goldSoft:C.greenSoft} label="Make-up em aberto" value={fmt(makeUpTotal)} sub={players.map(p=>`${p.split(' ')[0]}: ${fmt(curMakeUp[p])}`).join(' · ')}/>}
          {!solo&&<Stat Icon={IcoCashOut} tone={P} bg={C.plumSoft} label="Saque autorizado" value={fmt(saqueAutTotal)} sub="semana atual, respeitando o piso"/>}
          <Stat Icon={IcoChip} tone={C.green} bg={C.greenSoft} label={solo?'Resultado dos jogos':'Lucro da pool (acum.)'} value={solo?(resTotalGeral===0?fmt(0):fmtSinal(resTotalGeral)):fmt(lucroPoolAcum)}
            sub={solo?(modoTime?'soma dos torneios lançados (não é o lifetime do contrato)':'soma dos torneios desde o começo'):`pago em saques: ${fmt(totalPago)}`}/>
        </div>

        {!solo&&<Recolhivel titulo="Divisão do dinheiro" sub='Acumulado autorizado e ainda não sacado' chip={fmt(players.reduce((s,p)=>s+aReceber[p],0))}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>
            {players.map((p,i)=><div key={p} style={{padding:14,borderRadius:14,background:C.plumSoft}}>
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12.5,color:P,fontWeight:700}}><span style={{width:8,height:8,borderRadius:99,background:PLAYER_COLORS[i]}}/>A receber · {p}</div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:P,marginTop:4}}>{fmt(aReceber[p])}</div>
            </div>)}
            <div style={{padding:14,borderRadius:14,background:C.greenSoft}}>
              <div style={{fontSize:12.5,color:C.green,fontWeight:700}}>Fica na banca (pool)</div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.green,marginTop:4}}>{fmt(lucroPoolAcum)}</div>
            </div>
          </div>
        </Recolhivel>}

        {/* os gráficos ficam recolhidos: o Painel abre com o que exige decisão (banca, semana,
            stop loss, torneios) e a curva fica a um toque, em vez de cinco telas de rolagem */}
        <Recolhivel titulo="Gráficos" sub="curva de lucro, banca, semana a semana e volume" chip={`${solo?3:5} gráficos`}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 4px'}}>Lucro acumulado por jogador</h3>
          <div style={{fontSize:12.5,color:C.inkSoft,marginBottom:12}}>{toque?'Passe o dedo':'Passe o mouse'} pra ver os valores.</div>
          <MultiLineChart labels={lucroLabels} series={lucroSeries}/>
        </Card>

        <div className="grid2">
          <Card style={{padding:20}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 14px'}}>Evolução da banca</h3>
            <LineChart data={bancaChart} ref_={piso}/>
          </Card>
          <Card style={{padding:20}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 14px'}}>Resultado semanal por jogador</h3>
            <MultiBars data={resChart} series={players.map((p,i)=>({name:p,color:PLAYER_COLORS[i]}))}/>
          </Card>
          {!solo&&<Card style={{padding:20}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 14px'}}>Make-up por jogador</h3>
            <MultiBars data={makeChart} series={players.map((p,i)=>({name:p,color:PLAYER_COLORS[i]}))}/>
          </Card>}
          <Card style={{padding:20}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 14px'}}>Volume de torneios por semana</h3>
            <MultiBars data={volChart} series={[{name:'Torneios',color:C.greenMid}]}/>
          </Card>
        </div>
        </div>
        </Recolhivel>
      </div>}

      {/* ---------------- TORNEIOS (lançamento: hoje + relatórios dos dias anteriores) ---------------- */}
      {view==='torneios'&&(()=>{
        const today=todayISO();
        const dates=[...new Set(tours.map(t=>t.entry_date))].sort((a,b)=>a<b?1:-1);
        const past=dates.filter(d=>d!==today);
        return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
            <div><div style={{fontSize:13,color:C.inkSoft,fontWeight:600}}>O Diário e a banca se ajustam sozinhos</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,lineHeight:1.1}}>Torneios</div></div>
            {!somenteLeitura&&<button onClick={()=>addTourOn(today)} style={{display:'flex',alignItems:'center',gap:6,background:P,color:'#fff',border:'none',padding:'11px 16px',borderRadius:13,fontWeight:700,fontSize:14.5,cursor:'pointer',flexShrink:0,boxShadow:'0 6px 16px -8px rgba(91,75,138,.7)'}}><IcoPlus s={18}/>Adicionar</button>}
          </div>
          <ResumoTorneios tours={tours} players={players} solo={solo}/>
          {/* import de resumos: o jeito preguiçoso (e mais fiel) de lançar o dia inteiro.
              O passo a passo fica recolhido — quem já sabe só toca no botão. */}
          {!somenteLeitura&&<><Card style={{padding:18}}>
            <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600}}>Importar do site</div>
                <div style={{fontSize:12.5,color:C.inkSoft,marginTop:1}}>Solte os resumos do dia — sem digitar nada.</div>
              </div>
              <input id="tsfile" type="file" multiple accept=".txt,.zip" style={{display:'none'}} onChange={e=>{const fs=[...e.target.files]; e.target.value=''; lerResumos(fs,impPlayer||players[0]);}}/>
              <label htmlFor="tsfile" style={{display:'inline-flex',alignItems:'center',gap:6,background:tsImp.busy?C.bg:P,color:tsImp.busy?C.inkSoft:'#fff',padding:'11px 16px',borderRadius:13,fontWeight:700,fontSize:14,cursor:tsImp.busy?'default':'pointer',pointerEvents:tsImp.busy?'none':'auto',flexShrink:0}}><IcoPlus s={16}/>{tsImp.busy?'Lendo…':'Escolher arquivos'}</label>
            </div>
            {(!solo||sites.length>1)&&<div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end',marginTop:12}}>
              {!solo&&<Seg label="De quem" value={impPlayer||players[0]} options={players} onChange={setImpPlayer}/>}
              {sites.length>1&&<Seg label="Site" value={tsSite} options={['Detectar',...sites]} onChange={setTsSite}/>}
            </div>}
            {tsImp.busy&&<div style={{marginTop:10,fontSize:12.5,color:P,fontWeight:600}}>{tsImp.prog}</div>}
            {tsImp.res&&<div style={{marginTop:10,padding:'10px 12px',borderRadius:12,background:tsImp.res.erros.length?C.redSoft:C.greenSoft,fontSize:12.5,color:C.ink,lineHeight:1.5}}>
              <b>{tsImp.res.inseridos} torneio{tsImp.res.inseridos!==1?'s':''} lançado{tsImp.res.inseridos!==1?'s':''}</b>
              {tsImp.res.completados>0&&<> · {tsImp.res.completados} lançamento{tsImp.res.completados!==1?'s':''} seu{tsImp.res.completados!==1?'s':''} completado{tsImp.res.completados!==1?'s':''} com os dados do site</>}
              {tsImp.res.repetidos>0&&<> · {tsImp.res.repetidos} já {tsImp.res.repetidos!==1?'estavam':'estava'} no sistema</>}
              {tsImp.res.erros.length>0&&<div style={{marginTop:6,color:C.red}}>{tsImp.res.erros.map((x,i)=><div key={i}>• {x}</div>)}</div>}
            </div>}
          </Card>
          <Recolhivel titulo="Onde pego esse arquivo?" sub={['GG',...(temWpt?['WPT']:[]),'PokerStars'].join(' · ')}>
            <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.6}}>
              <b style={{color:C.ink}}>{temWpt?'GG e WPT:':'GG:'}</b> PokerCraft → o <b>Tournament Summary</b> do torneio (o resultado, não as mãos). Pode mandar a pasta toda ou o .zip.<br/>
              <b style={{color:C.ink}}>PokerStars:</b> o resumo que chega por e-mail, ou o do histórico local.<br/>
              O sistema lê nome, buy-in, re-entries, field, colocação e premiação — você <b>confere antes de salvar</b> e reimportar a mesma pasta não duplica nada.<br/>
              Os arquivos de <b>mãos</b> (hand history) vão na aba <b>Stats</b>, não aqui.
            </div>
          </Recolhivel></>}
          <DayCard today date={today} dayTours={tours.filter(t=>t.entry_date===today)} players={players} config={config} onAdd={somenteLeitura?null:addTourOn} onEdit={somenteLeitura?null:editTour} onDelete={somenteLeitura?null:delTour}/>
          {past.length>0&&<div style={{fontSize:13,fontWeight:700,color:C.inkSoft,margin:'4px 2px 0'}}>Dias anteriores</div>}
          {past.slice(0,pastN).map(d=><DayCard key={d} date={d} dayTours={tours.filter(t=>t.entry_date===d)} players={players} config={config} onAdd={somenteLeitura?null:addTourOn} onEdit={somenteLeitura?null:editTour} onDelete={somenteLeitura?null:delTour}/>)}
          <VerMais resta={past.length-pastN} bloco={10} rotulo="dias" onClick={()=>setPastN(n=>n+10)}/>
        </div>;
      })()}

      {/* ---------------- DIÁRIO (resumo por jogador/dia, editável pelos torneios) ---------------- */}
      {view==='diario'&&<div className="ftfade" style={{display:'flex',flexDirection:'column',gap:12}}>
        <div><div style={{fontSize:13,color:C.inkSoft,fontWeight:600}}>Resumo por jogador e dia — monta sozinho dos torneios. {somenteLeitura?(toque?'Toque num dia para ver os torneios.':'Clique num dia para ver os torneios.'):(toque?'Toque num dia pra conferir ou corrigir.':'Clique num dia pra conferir ou corrigir.')}</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,lineHeight:1.1}}>Diário</div></div>

        {/* filtros */}
        <Card style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12}}>
            {!solo&&<Seg label="Jogador" value={diF.player} options={['Todos',...players]} onChange={v=>setDiF(f=>({...f,player:v}))}/>}
            {diarySites.length>1&&<Seg label="Plataforma" value={diF.site} options={diarySites} onChange={v=>setDiF(f=>({...f,site:v}))}/>}
            {diaryMods.length>1&&<Seg label="Modalidade" value={diF.mod} options={diaryMods} onChange={v=>setDiF(f=>({...f,mod:v}))}/>}
          </div>
          <div>
            <div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em',marginBottom:4}}>Período</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              {[7,15,30].map(n=><button key={n} onClick={()=>setDiF(f=>({...f,days:String(f.days)===String(n)?'':String(n),from:'',to:''}))} style={{padding:'6px 11px',borderRadius:99,border:`1.5px solid ${String(diF.days)===String(n)?P:C.border}`,background:String(diF.days)===String(n)?C.plumSoft:C.surface,color:String(diF.days)===String(n)?P:C.inkSoft,fontWeight:700,fontSize:12.5,cursor:'pointer'}}>{n} dias</button>)}
              <span style={{fontSize:12,color:C.inkSoft}}>ou</span>
              <input type="date" value={diF.from} onChange={e=>setDiF(f=>({...f,from:e.target.value,days:''}))} style={{padding:'6px 9px',borderRadius:10,border:`1.5px solid ${C.border}`,fontSize:12.5,color:C.ink,background:C.surface}}/>
              <span style={{fontSize:12,color:C.inkSoft}}>até</span>
              <input type="date" value={diF.to} onChange={e=>setDiF(f=>({...f,to:e.target.value,days:''}))} style={{padding:'6px 9px',borderRadius:10,border:`1.5px solid ${C.border}`,fontSize:12.5,color:C.ink,background:C.surface}}/>
              {diFiltroAtivo&&<button onClick={()=>setDiF({player:'Todos',site:'Todos',mod:'Todos',from:'',to:'',days:''})} style={{marginLeft:'auto',padding:'6px 11px',borderRadius:99,border:`1.5px solid ${C.border}`,background:C.surface,color:C.red,fontWeight:700,fontSize:12.5,cursor:'pointer'}}>Limpar</button>}
            </div>
          </div>
        </Card>

        {/* cálculo do período/filtro */}
        {diFiltroAtivo&&<Card style={{padding:18}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,margin:0}}>Cálculo do período</h3>
            <span style={{fontSize:12,color:C.inkSoft}}>{diPeriodo?diPeriodo.label:'todo o histórico'}{diF.player!=='Todos'?` · ${diF.player}`:''}{diF.site!=='Todos'?` · ${diF.site}`:''}{diF.mod!=='Todos'?` · ${diF.mod}`:''}</span>
            <span style={{marginLeft:'auto',fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:19,color:diAgg.res>=0?C.greenMid:C.red}}>{diAgg.res>=0?'+':'−'}{fmt(Math.abs(diAgg.res))}</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(88px,1fr))',gap:8}}>
            <MiniStat label="Dias" value={String(diAgg.dias)}/>
            <MiniStat label="Torneios" value={String(diAgg.torneios)}/>
            <MiniStat label="ABI médio" value={fmt(diAgg.abi)}/>
            <MiniStat label="Investido" value={fmt(diAgg.buyins)}/>
            <MiniStat label="Premiação" value={fmt(diAgg.premios)} tone={C.greenMid}/>
            {diAgg.bounties>0&&<MiniStat label="Bounties" value={fmt(diAgg.bounties)} tone={C.greenMid}/>}
            <MiniStat label="ROI" value={pctFmt(diAgg.roi)} tone={diAgg.res>=0?C.greenMid:C.red}/>
            <MiniStat label="ITM" value={pctFmt(diAgg.itm)}/>
          </div>
        </Card>}

        {diaryDaily.length?<>
          {diaryDaily.slice(0,diaryN).map(e=><DiaryCard key={e.id} entry={e} dayTours={diaryTours.filter(t=>t.player===e.player&&t.entry_date===e.entry_date)} players={players} config={config} onAdd={somenteLeitura?null:addTourOn} onEdit={somenteLeitura?null:editTour} onDelete={somenteLeitura?null:delTour}/>)}
          <VerMais resta={diaryDaily.length-diaryN} bloco={12} rotulo="dias" onClick={()=>setDiaryN(n=>n+12)}/>
        </>:<Empty>{diFiltroAtivo?'Nenhum torneio nesse filtro/período.':'Sem torneios lançados ainda. Vá em Torneios e lance o primeiro.'}</Empty>}
      </div>}

      {/* ---------------- SEMANAL ---------------- */}
      {view==='semanal'&&<div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
        {modoTime&&<Card data-contrato-semana style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:'0 0 4px'}}>Contrato do time</h3>
          <div style={{fontSize:13.5,color:C.inkSoft,lineHeight:1.55}}>{sitSel&&sitSel.contrato?faixasTexto(sitSel.contrato):'Sem contrato definido pelo time ainda.'}</div>
          <div style={{fontSize:12.5,color:C.inkSoft,marginTop:6,lineHeight:1.5}}>A divisão vale no saque: o cashout é dividido pela faixa do lifetime (o que já foi sacado + o profit). As semanas abaixo mostram só o resultado dos jogos.</div>
        </Card>}
        {!solo&&<Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:'0 0 4px'}}>Geral da pool</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:12}}>Split {pctFmt(num(config.player_pct)*100)} pro jogador · {pctFmt((1-num(config.player_pct))*100)} pra pool</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{padding:14,borderRadius:14,background:C.bg}}><div style={{fontSize:12.5,color:C.inkSoft,fontWeight:700}}>Lucro acumulado da pool</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.green}}>{fmt(lucroPoolAcum)}</div></div>
            <div style={{padding:14,borderRadius:14,background:C.bg}}><div style={{fontSize:12.5,color:C.inkSoft,fontWeight:700}}>Total pago em saques</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:P}}>{fmt(totalPago)}</div></div>
          </div>
        </Card>}
        {!solo&&<SemanalGeral geral={geralSemana} curMonth={curMonthISO}/>}
        {players.map(p=><SemanalPlayer key={p} player={p} weeks={weeksByPlayer[p]||[]} config={config} curMonth={curMonthISO} makeUpAtual={curMakeUp[p]} solo={solo}/>)}
      </div>}

      {/* ---------------- MENSAL ---------------- */}
      {view==='mensal'&&<div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <div><div style={{fontSize:13,color:C.inkSoft,fontWeight:600}}>Consolidado de</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:600,lineHeight:1.1}}>{mLabel(month)}</div></div>
          <div style={{display:'flex',gap:8}}><RoundBtn disabled={monthIdx<=0} onClick={()=>goMonth(-1)}>‹</RoundBtn><RoundBtn disabled={monthIdx>=monthList.length-1} onClick={()=>goMonth(1)}>›</RoundBtn></div>
        </div>
        {!solo&&<div style={{fontSize:12,color:C.inkSoft,marginTop:-8,display:'flex',alignItems:'flex-start',gap:6}}><span style={{flexShrink:0,lineHeight:1.4}}><IcoAlert s={14}/></span><span style={{lineHeight:1.4}}>Resultado, torneios e ROI contam pelo <b>dia jogado</b>. Só a <b>divisão de lucro</b> segue as semanas que <b>fecharam</b> neste mês — o rateio da pool é semanal.</span></div>}
        <button onClick={()=>setReport({type:'mensal'})} style={{alignSelf:'flex-start',display:'inline-flex',alignItems:'center',gap:6,padding:'9px 14px',borderRadius:12,border:`1.5px solid ${P}`,background:C.plumSoft,color:P,fontWeight:700,fontSize:13,cursor:'pointer'}}>📄 Gerar relatório do mês (PDF)</button>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <Stat Icon={mRes>=0?IcoUp:IcoDown} tone={mRes>=0?C.greenMid:C.red} bg={mRes>=0?C.greenSoft:C.redSoft} label="Resultado do mês" value={fmt(mRes)}/>
          {!solo&&<Stat Icon={IcoChip} tone={C.green} bg={C.greenSoft} label="Dividido nas semanas" value={fmt(mLucroDiv)} sub={`pool ficou com ${fmt(mPool)} · ${monthWeeks.length} semana${monthWeeks.length!==1?'s':''} fechada${monthWeeks.length!==1?'s':''}`}/>}
          <Stat Icon={IcoTrophy} tone={C.gold} bg={C.goldSoft} label="Torneios no mês" value={String(mTorneios)} sub={`ABI médio ${fmt(mAbi)}`}/>
          <Stat Icon={IcoPanel} tone={mRoi>=0?C.greenMid:C.red} bg={mRoi>=0?C.greenSoft:C.redSoft} label="ROI do mês" value={pctFmt(mRoi)} sub={`sobre ${fmt(mBuyins)} em buy-ins`}/>
        </div>
        <Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 12px'}}>{solo?'Resumo do mês':'Por jogador'}</h3>
          {perPlayerMonth.map(pm=><div key={pm.p} style={{padding:'12px 0',borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{width:10,height:10,borderRadius:99,background:pcolor(pm.p)}}/>
              <span style={{fontWeight:700,flex:1}}>{pm.p}</span>
              {!solo&&<span style={{fontSize:12.5,color:C.inkSoft}}>make-up <b style={{color:C.ink}}>{fmt(pm.makeAberto)}</b></span>}
              <span style={{fontWeight:800,color:pm.res>=0?C.greenMid:C.red,minWidth:88,textAlign:'right'}}>{pm.res>=0?'+':'−'}{fmt(Math.abs(pm.res))}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(76px,1fr))',gap:6,marginTop:8}}>
              <MiniStat label="Torneios" value={String(pm.torneios)}/>
              <MiniStat label="ABI médio" value={fmt(pm.abi)}/>
              <MiniStat label="ROI" value={pctFmt(pm.roi)} tone={pm.res>=0?C.greenMid:C.red}/>
              <MiniStat label="Investido" value={fmt(pm.vol)}/>
              <MiniStat label="Premiação" value={fmt(pm.premios)} tone={C.greenMid}/>
              {pm.bounties>0&&<MiniStat label="Bounties" value={fmt(pm.bounties)} tone={C.greenMid}/>}
              <MiniStat label="ITM" value={pctFmt(pm.itm)}/>
            </div>
          </div>)}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:14}}>
            {!solo&&<div style={{padding:12,borderRadius:12,background:C.bg}}><div style={{fontSize:12,color:C.inkSoft,fontWeight:700}}>Mais lucrativo</div><div style={{fontWeight:700,marginTop:2}}>{maisLucrativo?`${maisLucrativo.p} (${fmt(maisLucrativo.res)})`:'—'}</div></div>}
            {!solo&&<div style={{padding:12,borderRadius:12,background:C.bg}}><div style={{fontSize:12,color:C.inkSoft,fontWeight:700}}>Maior volume</div><div style={{fontWeight:700,marginTop:2}}>{maiorVolume?`${maiorVolume.p} (${fmt(maiorVolume.vol)})`:'—'}</div></div>}
            <div style={{padding:12,borderRadius:12,background:C.greenSoft}}><div style={{fontSize:12,color:C.green,fontWeight:700}}>Melhor dia</div><div style={{fontWeight:700,marginTop:2}}>{melhorDia?<>{dLabel(melhorDia.d)} · <span style={{whiteSpace:'nowrap'}}>{fmt(melhorDia.r)}</span></>:'—'}</div></div>
            <div style={{padding:12,borderRadius:12,background:C.redSoft}}><div style={{fontSize:12,color:C.red,fontWeight:700}}>Pior dia</div><div style={{fontWeight:700,marginTop:2}}>{piorDia?<>{dLabel(piorDia.d)} · <span style={{whiteSpace:'nowrap'}}>{fmt(piorDia.r)}</span></>:'—'}</div></div>
          </div>
        </Card>
        {monthTours.length>0&&<Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 4px'}}>{somenteLeitura?`Onde ${alunoAberto} lucra`:solo?'Onde você lucra':'Onde vocês lucram'}</h3>
          <div style={{fontSize:12.5,color:C.inkSoft,marginBottom:10}}>Resultado e ROI por site e por modalidade neste mês.</div>
          {!solo&&<div style={{marginBottom:14}}><Seg value={mensalWho} options={['Geral',...players]} onChange={setMensalWho}/></div>}
          {monthToursWho.length===0?<Empty>Sem torneios de {mensalWho} neste mês.</Empty>:[['Por site',bySite],['Por modalidade',byModality]].map(([titulo,rows])=><div key={titulo} style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:800,color:C.gold,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>{titulo}</div>
            {rows.map(g=>{const mx=Math.max(1,...rows.map(x=>Math.abs(x.res))); return <div key={g.k} style={{padding:'8px 0',borderBottom:`1px solid ${C.border}`}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:14}}>{g.k}</div><div style={{fontSize:11.5,color:C.inkSoft}}>{g.n} torneio{g.n!==1?'s':''} · investido {fmt(g.inv)} · ROI <b style={{color:g.res>=0?C.greenMid:C.red}}>{pctFmt(g.roi)}</b></div></div>
                <span style={{fontWeight:800,fontSize:14.5,color:g.res>=0?C.greenMid:C.red,flexShrink:0}}>{g.res>=0?'+':'−'}{fmt(Math.abs(g.res))}</span>
              </div>
              <div style={{marginTop:6}}><Bar2 pct={(Math.abs(g.res)/mx)*100} color={g.res>=0?C.greenMid:C.red}/></div>
            </div>;})}
          </div>)}
        </Card>}
      </div>}

      {/* ---------------- STATS (motor de hand history) ---------------- */}
      {view==='stats'&&(()=>{
        // bloqueio por plano: Stats (import + leituras + relatório) é do plano PRO.
        // A aba fica visível com o convite de upgrade — paywall escondida não vende.
        if(!canStats) return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><div style={{fontSize:13,color:C.inkSoft,fontWeight:600}}>Estatísticas de jogo a partir dos hand histories.</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,lineHeight:1.1}}>Stats</div></div>
          <Card style={{padding:26,textAlign:'center',maxWidth:560,margin:'0 auto',width:'100%'}}>
            <div style={{fontSize:40,marginBottom:4}}>📈</div>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:700,margin:'0 0 8px'}}>Desbloqueie suas estatísticas com o plano Pro</h3>
            <div style={{fontSize:13.5,color:C.inkSoft,lineHeight:1.7,textAlign:'left',margin:'0 auto 14px',maxWidth:420}}>
              ✓ Importa suas mãos da <b>GG (PokerCraft)</b> e do <b>PokerStars</b> — pode mandar o zip<br/>
              ✓ VPIP, PFR, 3-bet, c-bet, WWSF, W$SD, AF e <b>bb/100 por posição</b><br/>
              ✓ <b>Sorte nos all-ins</b>: quanto do resultado é jogo e quanto é variância<br/>
              ✓ <b>Leituras automáticas</b> em português comparando com faixas de reg<br/>
              ✓ <b>Relatório completo em PDF</b> pra revisar ou mandar pro coach
            </div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:700,color:P}}>R$ 49,90<span style={{fontSize:14,color:C.inkSoft,fontWeight:600}}>/mês</span></div>
            <div style={{fontSize:12,color:C.inkSoft,marginBottom:14}}>ou <button onClick={()=>abrirCheckout('pro','anual',session.user.email)} style={{border:'none',background:'transparent',color:P,fontWeight:700,fontSize:12,cursor:'pointer',padding:0,textDecoration:'underline'}}>R$ 399/ano (2 meses grátis)</button></div>
            <button onClick={()=>abrirCheckout('pro','mensal',session.user.email)} style={{padding:'14px 28px',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer'}}>Assinar o Pro</button>
            <div style={{fontSize:11.5,color:C.inkSoft,marginTop:10}}>Seu plano atual: <b>{PLAN_LABEL[plan]||plan}</b> — a gestão de banca continua completa e ilimitada.</div>
          </Card>
        </div>;
        const sp=stF.player||players[0];
        // período: preset (últimos N dias) OU intervalo de datas (de/até) — recalcula a tela INTEIRA
        const n=parseInt(stF.days,10);
        const fFrom=n>0?addDaysISO(todayISO(),-(n-1)):(stF.from||null);
        const fTo=n>0?null:(stF.to||null);
        const rangeAtivo=!(n>0)&&!!(stF.from||stF.to);
        const periodoLabel=n>0?`últimos ${n} dias`:rangeAtivo?`${stF.from?dLabel(stF.from):'início'} a ${stF.to?dLabel(stF.to):'hoje'}`:'todo o histórico';
        const rows=hh.filter(r=>r.player===sp&&(!fFrom||(r.entry_date&&r.entry_date>=fFrom))&&(!fTo||(r.entry_date&&r.entry_date<=fTo)));
        const S=k=>rows.reduce((s,r)=>s+num(r[k]),0);
        const TT=hhTotals(rows);
        const hands=TT.hands, bb100=TT.bb100;
        const evbb=TT.allinEv, netbb=TT.allinNet, sorte=TT.sorte;
        const afc=TT.afC, afb=TT.afB;
        const pos=TT.pos;
        const POS_ORDER=['EP','MP','CO','BTN','SB','BB'];
        // leituras calculadas UMA vez: alimentam o card "Leituras do jogo" E os toques nas stats
        const insights=hhInsights(hhInsightInput(TT));
        const hintFor=k=>insights.find(i=>i.k===k)||null;
        const toggleHint=k=>setStatHint(s=>s===k?null:k);
        // tile com leitura acoplada (só marca ⚠ se existir leitura pra essa stat)
        const tile=(label,cnt,opp,bk,k)=>{ const kk=k||bk; return <StatTile label={label} cnt={cnt} opp={opp} band={HH_BANDS[bk]} hint={hintFor(kk)} open={statHint===kk} onToggle={()=>toggleHint(kk)}/>; };
        const hintBox=keys=>{ const i=keys.includes(statHint)?hintFor(statHint):null; return i?<StatHintBox i={i} onClose={()=>setStatHint(null)}/>:null; };
        const verd=hands>=300?hintFor('bb100'):null;   // veredito bb/100 × sorte (ponto mais nobre da tela)
        const VERD_C={red:C.red,gold:C.gold,green:C.greenMid,info:P};
        return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><div style={{fontSize:13,color:C.inkSoft,fontWeight:600}}>Estatísticas de jogo a partir dos hand histories — só agregados sobem pro banco.</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,lineHeight:1.1}}>Stats</div></div>

          {/* importação: só o dono da conta (no painel do aluno a gestão só vê) */}
          {!somenteLeitura&&<Card style={{padding:18}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,margin:'0 0 4px'}}>Importar hand histories</h3>
            <div style={{fontSize:12.5,color:C.inkSoft,marginBottom:10}}>Arquivos .txt do PokerStars ou export do PokerCraft (GG) — pode mandar o .zip direto. Reimportar o mesmo torneio substitui, não duplica.</div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
              <Seg label="De quem são os arquivos" value={impPlayer||players[0]} options={players} onChange={setImpPlayer}/>
              <input id="hhfile" type="file" multiple accept=".txt,.zip" style={{display:'none'}} onChange={e=>{const fs=[...e.target.files]; e.target.value=''; importHH(fs,impPlayer||players[0]);}}/>
              <label htmlFor="hhfile" style={{display:'inline-flex',alignItems:'center',gap:6,background:imp.busy?C.bg:P,color:imp.busy?C.inkSoft:'#fff',padding:'11px 16px',borderRadius:13,fontWeight:700,fontSize:14,cursor:imp.busy?'default':'pointer',pointerEvents:imp.busy?'none':'auto'}}><IcoPlus s={16}/>{imp.busy?'Importando…':'Escolher arquivos'}</label>
            </div>
            {imp.busy&&<div style={{marginTop:10,fontSize:12.5,color:P,fontWeight:600}}>{imp.prog}</div>}
            {imp.res&&<div style={{marginTop:10,padding:'10px 12px',borderRadius:12,background:imp.res.saved||imp.res.repetidas?C.greenSoft:C.redSoft,fontSize:12.5,color:C.ink}}>
              <b>{imp.res.saved} torneio{imp.res.saved!==1?'s':''} salvo{imp.res.saved!==1?'s':''}</b> · {imp.res.novas} mão{imp.res.novas!==1?'s':''} nova{imp.res.novas!==1?'s':''} de {imp.res.files} arquivo{imp.res.files!==1?'s':''}{imp.res.repetidas?` · ${imp.res.repetidas} já importada${imp.res.repetidas!==1?'s':''} (pulada${imp.res.repetidas!==1?'s':''})`:''}{imp.res.reproc?` · ${imp.res.reproc} reprocessada${imp.res.reproc!==1?'s':''} (bb/100 por posição preenchido)`:''}{imp.res.ignored?` · ${imp.res.ignored} mão(s) ignorada(s)${(r=>{const M={cash:'cash game — só torneios entram',modalidade:"outra modalidade — só Hold'em",incompleta:'incompletas',formato:'formato não reconhecido'};const ps=Object.keys(M).filter(k=>r[k]).map(k=>`${r[k]} ${M[k]}`);return ps.length?` — ${ps.join(' · ')}`:'';})(imp.res.reasons||{})}`:''}
              {imp.res.issues.length>0&&<div style={{marginTop:6,color:C.red}}>{imp.res.issues.map((x,i)=><div key={i}>• {x}</div>)}{imp.res.issuesTotal>imp.res.issues.length&&<div>… e mais {imp.res.issuesTotal-imp.res.issues.length}</div>}</div>}
            </div>}
            <div style={{fontSize:11.5,color:C.inkSoft,marginTop:10,lineHeight:1.5}}>ℹ️ <b>PokerStars</b>: funciona tanto o histórico local (Configurações → Histórico de Mãos) quanto o <b>transcript pedido por e-mail</b>, em português ou inglês. <b>GG</b>: exporte o <b>hand history</b> pelo PokerCraft (pode mandar o .zip direto). Import grande é melhor no computador. <span style={{opacity:.6}}>build {HH_BUILD}</span></div>
          </Card>}

          {/* filtros */}
          <Card style={{padding:16,display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end'}}>
            <Seg label="Jogador" value={sp} options={players} onChange={v=>setStF(f=>({...f,player:v}))}/>
            <div><div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em',marginBottom:4}}>Período</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                {[['','Tudo'],['30','30 dias'],['90','90 dias'],['365','1 ano']].map(([v,l])=>{const ativo=stF.days===v&&!rangeAtivo; return <button key={l} onClick={()=>setStF(f=>({...f,days:v,from:'',to:''}))} style={{padding:'6px 11px',borderRadius:99,border:`1.5px solid ${ativo?P:C.border}`,background:ativo?C.plumSoft:C.surface,color:ativo?P:C.inkSoft,fontWeight:700,fontSize:12.5,cursor:'pointer'}}>{l}</button>;})}
                <span style={{fontSize:12,color:C.inkSoft}}>ou</span>
                <input type="date" value={stF.from} onChange={e=>setStF(f=>({...f,from:e.target.value,days:''}))} style={{padding:'6px 9px',borderRadius:10,border:`1.5px solid ${stF.from?P:C.border}`,fontSize:12.5,color:C.ink,background:C.surface}}/>
                <span style={{fontSize:12,color:C.inkSoft}}>até</span>
                <input type="date" value={stF.to} onChange={e=>setStF(f=>({...f,to:e.target.value,days:''}))} style={{padding:'6px 9px',borderRadius:10,border:`1.5px solid ${stF.to?P:C.border}`,fontSize:12.5,color:C.ink,background:C.surface}}/>
                {rangeAtivo&&<button onClick={()=>setStF(f=>({...f,days:'',from:'',to:''}))} style={{padding:'6px 11px',borderRadius:99,border:`1.5px solid ${C.border}`,background:C.surface,color:C.red,fontWeight:700,fontSize:12.5,cursor:'pointer'}}>Limpar</button>}
              </div></div>
            <button onClick={()=>setReport({type:'jogador',player:sp,days:stF.days,from:stF.from,to:stF.to})} style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:6,padding:'9px 14px',borderRadius:12,border:`1.5px solid ${P}`,background:C.plumSoft,color:P,fontWeight:700,fontSize:13,cursor:'pointer'}}>📄 Relatório do jogador (PDF)</button>
          </Card>

          {rows.length===0?<Empty>Sem dados de {sp} nesse período. Importe os hand histories acima.</Empty>:<>
          {/* resumo */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10}}>
            <Card style={{padding:14}}><div style={{fontSize:11,color:C.inkSoft,fontWeight:700}}>MÃOS</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600}}>{hands}</div><div style={{fontSize:11,color:C.inkSoft}}>{rows.length} torneio{rows.length!==1?'s':''}</div></Card>
            <Card onClick={verd?()=>toggleHint('bb100'):undefined} style={{padding:14,cursor:verd?'pointer':'default',position:'relative',outline:statHint==='bb100'?`2px solid ${verd?VERD_C[verd.tone]:P}`:'none'}}>
              {verd&&<span style={{position:'absolute',top:10,right:11,color:VERD_C[verd.tone],opacity:.85}}><IcoAlert s={13}/></span>}
              <div style={{fontSize:11,color:C.inkSoft,fontWeight:700}}>BB/100</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:bb100>=0?C.greenMid:C.red}}>{fmtBB(bb100)}</div>
              <div style={{fontSize:11,color:verd?VERD_C[verd.tone]:C.inkSoft,fontWeight:verd?700:400}}>{verd?verd.t.toLowerCase():'em fichas'}</div>
            </Card>
            <Card style={{padding:14}}><div style={{fontSize:11,color:C.inkSoft,fontWeight:700}}>SORTE (ALL-IN)</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:sorte>=0?C.greenMid:C.red}}>{fmtBB(sorte)}</div><div style={{fontSize:11,color:C.inkSoft}}>real {fmtBB(netbb)} vs EV {fmtBB(evbb)} · {S('allin_cnt')} all-in{S('allin_cnt')!==1?'s':''}</div></Card>
            <Card style={{padding:14}}><div style={{fontSize:11,color:C.inkSoft,fontWeight:700}}>AGRESSÃO (AF)</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600}}>{afc>0?(afb/afc).toFixed(1).replace('.',','):'—'}</div><div style={{fontSize:11,color:C.inkSoft}}>{afb} bets+raises / {afc} calls</div></Card>
          </div>
          {hintBox(['bb100'])}

          {/* Leituras automáticas (insights vs faixas de reg) */}
          {(()=>{ const TONE={red:{c:C.red,bg:C.redSoft},gold:{c:C.gold,bg:C.goldSoft},green:{c:C.greenMid,bg:C.greenSoft},info:{c:P,bg:C.plumSoft}};
            const pctS=(c,o)=>o>0?(c/o*100).toFixed(1).replace('.',',')+'% ('+c+'/'+o+')':'sem amostra';
            const coachTxt=()=>[
              `Análise de poker — ${sp} (${solo?'GrinderBank':'PoolGG'})`,
              `Período: ${periodoLabel} · ${hands} mãos · ${rows.length} torneios`,
              `bb/100 (fichas): ${fmtBB(bb100)}`,
              `Sorte all-in: ${fmtBB(sorte)} (real ${fmtBB(netbb)} vs EV ${fmtBB(evbb)}) em ${S('allin_cnt')} all-ins`,
              `VPIP ${pctS(TT.vpip,TT.vpipDen)} · PFR ${pctS(TT.pfr,TT.pfrOpp)}`,
              `3-bet ${pctS(TT.tb,TT.tbOpp)} · Squeeze ${pctS(TT.sq,TT.sqOpp)} · Fold pra 3-bet ${pctS(TT.f3b,TT.f3bOpp)}`,
              `Roubo de blinds ${pctS(S('steal_cnt'),S('steal_opp'))} · BB defende ${pctS(S('bbdef_cnt'),S('bbdef_opp'))}`,
              `C-bet flop ${pctS(S('cbet_cnt'),S('cbet_opp'))} · Fold pra c-bet ${pctS(S('fcbet_cnt'),S('fcbet_opp'))}`,
              `WWSF ${pctS(TT.wwsf,TT.sawflop)} · WTSD ${pctS(TT.wtsdNp,TT.wtsdDen)} · W$SD ${pctS(TT.wsd,TT.wtsd)}`,
              'Definições (padrão PT4): VPIP sem walks; PFR sobre as mãos em que dava pra aumentar; 3-bet inclui os spots de squeeze (squeeze à parte); WWSF = % dos flops vistos; WTSD = % dos flops vistos sem all-in pré-flop; W$SD = % dos showdowns; bb/100 em fichas; sorte = all-in EV (só cartas viradas, PKO/ICM fora).',
              `AF: ${afc>0?(afb/afc).toFixed(2).replace('.',','):'—'}`,
              'Por posição (mãos · VPIP · PFR · bb/100): '+POS_ORDER.filter(k=>pos[k]&&pos[k].h).map(k=>`${k} ${pos[k].h}·${(pos[k].v/pos[k].h*100).toFixed(0)}%·${(pos[k].p/pos[k].h*100).toFixed(0)}%·${pos[k].hn>0?(pos[k].net/pos[k].hn*100).toFixed(1):'—'}`).join(' | '),
              'Leituras automáticas: '+(insights.map(i=>i.t).join('; ')||'—'),
              '',
              `Contexto: jogador de MTT micro/low ${solo?'com banca própria':'numa pool 50/50 com make-up'}. Analise como coach: os 3 maiores vazamentos, o que treinar primeiro e o impacto esperado no winrate.`,
            ].join('\n');
            const copiar=async()=>{ const tx=coachTxt(); try{ await navigator.clipboard.writeText(tx); }catch(e){ const ta=document.createElement('textarea'); ta.value=tx; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } setCopied(true); setTimeout(()=>setCopied(false),2500); };
            const worst=insights[0]?TONE[insights[0].tone]:{c:C.inkSoft,bg:C.bg};
            return <Card style={{padding:0,overflow:'hidden'}}>
              <button onClick={()=>setLeitOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'15px 18px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
                <div style={{flex:1,minWidth:0}}>
                  <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:600}}>Leituras do jogo</span>
                  {!leitOpen&&insights[0]&&<div style={{fontSize:12,color:worst.c,fontWeight:700,marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{insights[0].t}{insights.length>1?` · +${insights.length-1}`:''}</div>}
                </div>
                <span style={{padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:800,color:worst.c,background:worst.bg,whiteSpace:'nowrap'}}>{insights.length} leitura{insights.length!==1?'s':''}</span>
                <span style={{color:C.inkSoft,fontSize:20,transform:leitOpen?'rotate(90deg)':'none',transition:'transform .2s'}}>›</span>
              </button>
              {leitOpen&&<div style={{padding:'0 18px 16px'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:10,flexWrap:'wrap'}}>
                  <div style={{fontSize:12,color:C.inkSoft,flex:1,minWidth:180}}>Comparação automática com as faixas de um reg de MTT micro/low. Pra análise profunda, copie o resumo e cole no seu projeto <b>Coach de Poker</b> no Claude.</div>
                  <button onClick={copiar} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 13px',borderRadius:11,border:`1.5px solid ${copied?C.greenMid:P}`,background:copied?C.greenSoft:C.plumSoft,color:copied?C.greenMid:P,fontWeight:700,fontSize:12.5,cursor:'pointer'}}>{copied?'✓ Copiado!':'Copiar resumo pro Coach'}</button>
                </div>
                {insights.map((i,ix)=><div key={ix} style={{display:'flex',gap:10,padding:'10px 12px',borderRadius:12,background:TONE[i.tone].bg,marginBottom:6,alignItems:'flex-start'}}>
                  <span style={{flexShrink:0,marginTop:1,color:TONE[i.tone].c}}><IcoAlert s={15}/></span>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                      <div style={{fontWeight:800,fontSize:13,color:TONE[i.tone].c,flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{i.t}</div>
                      {i.x&&<button onClick={()=>setLeitX(s=>({...s,[i.t]:!s[i.t]}))} style={{flexShrink:0,border:'none',background:'transparent',color:TONE[i.tone].c,fontWeight:700,fontSize:12,cursor:'pointer',padding:0,textDecoration:'underline'}}>{leitX[i.t]?'ver menos':'ver mais'}</button>}
                    </div>
                    {leitX[i.t]&&<div style={{fontSize:12.5,color:C.ink,lineHeight:1.5,marginTop:4}}>{i.x}</div>}
                  </div>
                </div>)}
              </div>}
            </Card>;
          })()}


          <Card style={{padding:18}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,margin:'0 0 10px'}}>Pré-flop</h3>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8}}>
              {tile('VPIP',TT.vpip,TT.vpipDen,'vpip')}
              {tile('PFR',TT.pfr,TT.pfrOpp,'pfr')}
              {tile('3-bet',TT.tb,TT.tbOpp,'tb')}
              {tile('Squeeze',TT.sq,TT.sqOpp,'sq')}
              {tile('Fold pra 3-bet',S('f3b_cnt'),S('f3b_opp'),'f3b')}
              {tile('Roubo de blinds',S('steal_cnt'),S('steal_opp'),'steal')}
              {tile('BB defende',S('bbdef_cnt'),S('bbdef_opp'),'bbdef')}
            </div>
            {hintBox(['vpip','pfr','tb','f3b','steal','bbdef'])}
          </Card>
          <Card style={{padding:18}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,margin:'0 0 10px'}}>Pós-flop</h3>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8}}>
              {tile('C-bet flop',S('cbet_cnt'),S('cbet_opp'),'cbet')}
              {tile('Fold pra c-bet',S('fcbet_cnt'),S('fcbet_opp'),'fcbet','fcb')}
              {tile('WWSF',S('wwsf_cnt'),S('sawflop_cnt'),'wwsf')}
              {tile('WTSD',TT.wtsdNp,TT.wtsdDen,'wtsd')}
              {tile('W$SD',TT.wsd,TT.wtsd,'wsd')}
            </div>
            {hintBox(['cbet','fcb','wwsf','wtsd','wsd'])}
            <div style={{fontSize:11.5,color:C.inkSoft,marginTop:10,lineHeight:1.5}}>WWSF = % dos <b>flops vistos</b> · WTSD = % dos flops vistos <b>sem all-in pré-flop</b> · W$SD = % dos <b>showdowns</b> (o HUD da GG usa outra base — detalhe no glossário). Stat com <b>⚠</b> tem uma leitura — toque no número pra ver.</div>
          </Card>
          <Card style={{padding:18}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,margin:'0 0 10px'}}>Por posição</h3>
            {POS_ORDER.filter(k=>pos[k]&&pos[k].h>0).map(k=>{const b100=pos[k].hn>0?pos[k].net/pos[k].hn*100:null; const ph=hintFor('pos:'+k); return <div key={k} onClick={ph?()=>toggleHint('pos:'+k):undefined} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${C.border}`,fontSize:13,flexWrap:'wrap',cursor:ph?'pointer':'default',background:statHint==='pos:'+k?C.bg:'transparent',borderRadius:statHint==='pos:'+k?8:0}}>
              <b style={{width:42}}>{k}</b>
              <span style={{color:C.inkSoft,flex:1}}>{pos[k].h} mão{pos[k].h!==1?'s':''}</span>
              <span>VPIP <b>{pos[k].h-pos[k].w>0?pctFmt(pos[k].v/(pos[k].h-pos[k].w)*100):'—'}</b></span>
              <span>PFR <b>{pos[k].po>0?pctFmt(pos[k].p/pos[k].po*100):'—'}</b></span>
              {pos[k].ro>0&&<span>RFI <b>{pctFmt(pos[k].r/pos[k].ro*100)}</b></span>}
              <span>BB/100 <b style={{color:b100==null?C.inkSoft:b100>=0?C.greenMid:C.red}}>{b100==null?'—':fmtBB(b100).replace(' bb','')}</b></span>
              {pos[k].an>0&&<span title="bb/100 com os all-ins trocados pelo valor esperado (sem a sorte)">Ajust. <b>{fmtBB(pos[k].adj/pos[k].an*100).replace(' bb','')}</b></span>}
              {k==='BB'&&['BTN','CO','SB'].filter(o=>pos.BB['v'+o+'_o']>0).length>0&&<span style={{width:'100%',fontSize:12,color:C.inkSoft}}>Fold contra roubo: {['BTN','CO','SB'].filter(o=>pos.BB['v'+o+'_o']>0).map(o=>`vs ${o} ${pctFmt((pos.BB['v'+o+'_f']||0)/pos.BB['v'+o+'_o']*100)} (${pos.BB['v'+o+'_o']})`).join(' · ')}</span>}
              {ph&&<span style={{color:{red:C.red,gold:C.gold,green:C.greenMid,info:P}[ph.tone],display:'flex',alignItems:'center'}}><IcoAlert s={14}/></span>}
            </div>;})}
            {hintBox(POS_ORDER.map(k=>'pos:'+k))}
            {TT.antigas>0&&<div style={{fontSize:11.5,color:C.gold,marginTop:8,fontWeight:700}}>⚠ {TT.antigas} torneio{TT.antigas!==1?'s':''} calculado{TT.antigas!==1?'s':''} pela versão antiga das stats. Reimporte os mesmos arquivos (não duplica) pra recalcular com as definições novas.</div>}
            {POS_ORDER.some(k=>pos[k]&&pos[k].h>0&&!(pos[k].hn>0))&&<div style={{fontSize:11.5,color:C.inkSoft,marginTop:8}}>ℹ️ BB/100 com "—": mãos importadas antes desse recurso. Reimporte os mesmos arquivos (não duplica nada) que o sistema reprocessa e preenche.</div>}
          </Card>

          {/* Sorte explicada em detalhe (recolhido por padrão; o chip do cabeçalho já mostra o número) */}
          <Card style={{padding:0,overflow:'hidden'}}>
            <button onClick={()=>setSorteOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'15px 18px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
              <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:600,flex:1}}>Sorte nos all-ins — como ler esse número</span>
              <span style={{padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:800,color:sorte>=0?C.greenMid:C.red,background:sorte>=0?C.greenSoft:C.redSoft,whiteSpace:'nowrap'}}>{fmtBB(sorte)}</span>
              <span style={{color:C.inkSoft,fontSize:20,transform:sorteOpen?'rotate(90deg)':'none',transition:'transform .2s'}}>›</span>
            </button>
            {sorteOpen&&<div style={{padding:'0 18px 16px'}}>
            {/* veredito do período: com sorte ou com azar, quanto acima/abaixo do justo, e o bb/100 sem o fator sorte */}
            {(()=>{
              const allins=S('allin_cnt');
              const luck100=hands>0?sorte/hands*100:0;              // sorte diluída por 100 mãos (comparável entre períodos)
              const adj=bb100-luck100;                              // bb/100 "sem sorte" = o termômetro honesto do jogo
              const mag=Math.abs(luck100), neutro=mag<1;
              const grau=neutro?null:mag<5?'levemente':mag<15?'moderadamente':'MUITO';
              const tone=neutro?C.inkSoft:sorte>=0?C.greenMid:C.red;
              const pctEV=evbb>0?(netbb-evbb)/evbb*100:null;        // % acima/abaixo do EV (só quando o EV é positivo, senão a % engana)
              const curta=allins<10||hands<300;
              return <div style={{padding:'12px 14px',borderRadius:12,background:neutro?C.bg:(sorte>=0?C.greenSoft:C.redSoft),marginBottom:12}}>
                <div style={{fontSize:10.5,fontWeight:700,color:C.inkSoft,textTransform:'uppercase',letterSpacing:'.03em'}}>Veredito do período · {periodoLabel} · {hands} mão{hands!==1?'s':''} · {allins} all-in{allins!==1?'s':''}</div>
                {allins===0
                  ? <div style={{fontSize:13.5,color:C.inkSoft,marginTop:4}}>Nenhum all-in de cartas viradas no período — não há sorte pra medir ainda. Ela aparece assim que você importar mãos que foram all-in e chegaram ao showdown.</div>
                  : <>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17.5,fontWeight:600,color:tone,marginTop:4,lineHeight:1.25}}>
                      {neutro?'Você correu dentro do normal':`Você correu ${grau} ${sorte>=0?'BEM':'MAL'}`}
                    </div>
                    <div style={{fontSize:12.5,fontWeight:700,color:tone,marginTop:2}}>
                      {neutro?'a sorte quase não mexeu no seu resultado':<>{Math.abs(luck100).toFixed(1).replace('.',',')} bb/100 {sorte>=0?'acima':'abaixo'} do que era justo</>}
                    </div>
                    <div style={{fontSize:12.5,color:C.ink,lineHeight:1.6,marginTop:8}}>
                      No período você fez <b style={{color:bb100>=0?C.greenMid:C.red}}>{fmtBB(bb100)}</b>/100 mãos. Tirando a sorte dos all-ins, seriam <b style={{color:adj>=0?C.greenMid:C.red}}>{fmtBB(adj)}</b>/100 — <b>é esse o número mais perto do seu jogo de verdade</b>.
                      {pctEV!=null&&<> Nos all-ins, caiu <b>{Math.abs(pctEV).toFixed(0)}% {pctEV>=0?'a mais':'a menos'}</b> do que a equity mandava.</>}
                    </div>
                    {curta&&<div style={{fontSize:11.5,color:C.inkSoft,marginTop:8,lineHeight:1.5}}>⚠️ Amostra curta ({allins} all-in{allins!==1?'s':''} em {hands} mão{hands!==1?'s':''}). Com pouca mão esse número pula muito de um dia pro outro — leia como tendência, não como veredito.</div>}
                  </>}
              </div>;
            })()}
            {/* leitura em equação: o que caiu · o que era justo · a diferença (a sorte, em destaque) */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
              <div style={{padding:'10px 12px',borderRadius:12,background:C.bg,minWidth:0}}><div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700}}>CAIU DE VERDADE</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:netbb>=0?C.greenMid:C.red,whiteSpace:'nowrap'}}>{fmtBB(netbb)}</div></div>
              <div style={{padding:'10px 12px',borderRadius:12,background:C.bg,minWidth:0}}><div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700}}>ERA JUSTO (EV)</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:evbb>=0?C.greenMid:C.red,whiteSpace:'nowrap'}}>{fmtBB(evbb)}</div></div>
              <div style={{gridColumn:'1 / -1',padding:'10px 12px',borderRadius:12,background:sorte>=0?C.greenSoft:C.redSoft,minWidth:0}}><div style={{fontSize:10.5,color:sorte>=0?C.green:C.red,fontWeight:700}}>SORTE — A DIFERENÇA ENTRE OS DOIS</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:sorte>=0?C.greenMid:C.red,whiteSpace:'nowrap'}}>{fmtBB(sorte)}</div></div>
            </div>
            {/* explicação em passos curtos — a versão antiga era um parágrafo só e ninguém lia até o fim */}
            <div style={{fontSize:12,fontWeight:800,color:C.gold,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>De onde sai esse número</div>
            <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.6,marginBottom:10}}>
              <div style={{marginBottom:5}}><b style={{color:C.ink}}>1.</b> Quando o dinheiro entra all-in e <b>as cartas viram</b>, dá pra saber a chance real de cada mão — a <b>equity</b>. AA contra KK ganha ~82% das vezes.</div>
              <div style={{marginBottom:5}}><b style={{color:C.ink}}>2.</b> Se o pote fosse repartido por essa chance, sem correr as cartas, você levaria a sua fatia. Somando todos os all-ins do período, isso é o <b>"era justo (EV)"</b>.</div>
              <div><b style={{color:C.ink}}>3.</b> O que <b>caiu de verdade</b> quase nunca é igual. Essa diferença é a <b>sorte</b>: <span style={{color:C.greenMid,fontWeight:700}}>positiva você correu bem</span>, <span style={{color:C.red,fontWeight:700}}>negativa você correu mal</span>.</div>
            </div>
            <div style={{fontSize:12.5,color:C.ink,lineHeight:1.6,padding:'9px 11px',borderRadius:10,background:C.plumSoft,marginBottom:10}}>
              Repare: a sorte <b>não julga a sua decisão</b>. Um all-in ruim pode ganhar e um all-in perfeito pode perder. Ela só separa o que foi <b>escolha sua</b> do que foi <b>a carta que veio</b>.
            </div>
            <div style={{fontSize:12,color:C.inkSoft,lineHeight:1.55,marginBottom:10}}>
              <b style={{color:C.ink}}>⚠️ O que ela não enxerga.</b> Só entram all-ins de cartas viradas ({S('allin_cnt')} no período). Ficam de fora: o <b>cooler antes do all-in</b> (AA contra KK é azar, mas a conta começa depois de virar), as <b>cartas que você simplesmente não recebeu</b>, o <b>prêmio de bounty do PKO</b> (um call ruim em fichas pode ser ótimo em dinheiro) e o <b>ICM</b> de bolha e mesa final. Ou seja: é a melhor pista que você tem sobre a variância — <b>não é uma nota do seu jogo</b>.
            </div>
            {(()=>{ // o "e daí?" — uma frase só, escolhida pelo cenário do jogador
              const luck100=hands>0?sorte/hands*100:0, mag=Math.abs(luck100);
              if(S('allin_cnt')===0) return null;
              let txt;
              if(mag<1) txt=<>a sorte está <b>neutra</b> — esse resultado é o seu jogo mesmo, pra melhor ou pra pior. É a hora mais confiável pra olhar as outras stats e decidir o que ajustar.</>;
              else if(luck100<0&&bb100<0) txt=<>você está <b>perdendo e correndo mal ao mesmo tempo</b>. Boa parte do prejuízo é variância cobrando — o certo aqui é <b>manter a grade e o plano</b>, não aumentar buy-in pra recuperar.</>;
              else if(luck100<0&&bb100>=0) txt=<>você está <b>no azul mesmo correndo mal</b>. É o cenário mais saudável que existe: o resultado veio do jogo, não da carta.</>;
              else if(luck100>0&&bb100>=0) txt=<>parte do seu lucro <b>veio da sorte</b>. O winrate real é menor do que a tela mostra — não use este período como prova pra subir de limite.</>;
              else txt=<>você está <b>no vermelho apesar de correr bem</b>. Aí não dá pra culpar a variância: o ajuste é no jogo. Vale revisar as leituras acima antes de aumentar volume.</>;
              return <div style={{fontSize:12.5,color:C.ink,marginTop:2,padding:'9px 11px',borderRadius:10,background:C.bg,lineHeight:1.55}}>💡 <b>E daí?</b> No período de <b>{periodoLabel}</b>, {txt}</div>;
            })()}
            </div>}
          </Card>

          </>}

          {/* glossário das siglas */}
          <Card style={{padding:0,overflow:'hidden'}}>
            <button onClick={()=>setGloss(g=>!g)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'15px 18px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
              <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:600,flex:1}}>O que significa cada estatística?</span>
              <span style={{color:C.inkSoft,fontSize:20,transform:gloss?'rotate(90deg)':'none',transition:'transform .2s'}}>›</span>
            </button>
            {gloss&&<div style={{padding:'0 18px 16px'}}>
              {HH_GLOSS.map(([k,v])=><div key={k} style={{padding:'9px 0',borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontWeight:800,fontSize:12.5,color:P}}>{k}</div>
                <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.5,marginTop:2}}>{v}</div>
              </div>)}
            </div>}
          </Card>
        </div>;
      })()}

      {/* ---------------- AUDITORIA ----------------
          Cruza o que foi DECLARADO (aba Torneios) com o que as mãos PROVAM (hand history
          importado da GG/PS) e dá o veredito: bate ou não bate. É a camada de confiança
          da pool — jogou sem lançar, lançou com buy-in errado e falta de comprovação. */}
      {view==='auditoria'&&(()=>{
        const sp=audF.player||players[0];
        const from=audF.days>0?addDaysISO(todayISO(),-audF.days+1):null;
        const decl=tours.filter(t=>t.player===sp&&(!from||t.entry_date>=from));
        const hhr=hh.filter(r=>r.player===sp&&(!from||(r.entry_date&&r.entry_date>=from)));
        const near2=(a,b)=>Math.abs(a-b)<=0.011;
        const close2=(a,b)=>Math.max(a,b)>0&&Math.abs(a-b)/Math.max(a,b)<=0.15;
        const dayDiff=(a,b)=>Math.abs(new Date(a+'T12:00:00Z')-new Date(b+'T12:00:00Z'))/86400000;
        const usados=new Set(); const linhas=[];
        for(const r of hhr){
          const b=num(r.buyin);
          // 1º: mesmo id de torneio do site (resumo importado). Na GG o HH não traz buy-in: o id é a prova.
          const porId=decl.find(t=>!usados.has(t.id)&&t.site_tournament_id&&String(t.site_tournament_id)===String(r.site_tournament_id));
          if(porId){ usados.add(porId.id); linhas.push({tipo:(!b||near2(num(porId.buyin),b))?'ok':'buyin',hh:r,t:porId,date:r.entry_date}); continue; }
          if(!b){ linhas.push({tipo:'semlanc',hh:r,date:r.entry_date}); continue; }
          const cand=decl.filter(t=>!usados.has(t.id)&&walletBucket(t.site)===walletBucket(r.site));
          const pick=list=>{ let best=null,bd=1e9; for(const t of list){ const df=Math.abs(num(t.buyin)-b); if(df<bd){bd=df;best=t;} } return best; };
          // 1º tenta o mesmo dia; se não, dia vizinho (sessão virando a madrugada)
          const m=pick(cand.filter(t=>t.entry_date===r.entry_date))||pick(cand.filter(t=>dayDiff(t.entry_date,r.entry_date)<=1));
          if(m&&(near2(num(m.buyin),b)||close2(num(m.buyin),b))){ usados.add(m.id); linhas.push({tipo:near2(num(m.buyin),b)?'ok':'buyin',hh:r,t:m,date:r.entry_date}); }
          else linhas.push({tipo:'semlanc',hh:r,date:r.entry_date});
        }
        decl.filter(t=>!usados.has(t.id)).forEach(t=>linhas.push({tipo:'semhh',t,date:t.entry_date}));
        linhas.sort((a,b)=>a.date<b.date?1:-1);
        const n=k=>linhas.filter(x=>x.tipo===k).length;
        const buyinHH=r=>{ const l=linhas.find(x=>x.hh===r&&x.t); return num(r.buyin)||(l?num(l.t.buyin):0); };
        const foraHH=hhr.filter(r=>buyinHH(r)>abiMaxFor(config,sp,r.entry_date)+0.011);
        const temDado=linhas.length>0;
        const veredito=!temDado?{tone:C.inkSoft,bg:C.bg,t:'Sem dados no período',x:'Lance torneios e importe hand histories pra auditoria comparar os dois.'}
          :(n('semlanc')||n('buyin'))?{tone:C.red,bg:C.redSoft,t:'Divergências encontradas',x:'Tem diferença entre o que as mãos provam e o que foi lançado — confira as linhas em vermelho/dourado abaixo.'}
          :n('semhh')?{tone:C.gold,bg:C.goldSoft,t:'Batendo, mas falta comprovação',x:'Nenhuma divergência, porém há torneios lançados sem hand history importado — importe as mãos pra fechar a prova.'}
          :{tone:C.greenMid,bg:C.greenSoft,t:'Tudo batendo',x:'Cada torneio lançado tem hand history correspondente com o mesmo buy-in. Prova fechada.'};
        const TIPO={
          ok:{c:C.greenMid,bg:C.greenSoft,l:'✓ Bate'},
          buyin:{c:C.gold,bg:C.goldSoft,l:'Buy-in difere'},
          semlanc:{c:C.red,bg:C.redSoft,l:'Jogado e NÃO lançado'},
          semhh:{c:C.inkSoft,bg:C.bg,l:'Sem hand history'},
        };
        return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><div style={{fontSize:13,color:C.inkSoft,fontWeight:600}}>O que as mãos provam vs. o que foi lançado — a prova de que o controle da pool está honesto.</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,lineHeight:1.1}}>Auditoria</div></div>

          <Card style={{padding:16,display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end'}}>
            <Seg label="Jogador" value={sp} options={players} onChange={v=>setAudF(f=>({...f,player:v}))}/>
            <Seg label="Período" value={audF.days===7?'7 dias':audF.days===30?'30 dias':audF.days===90?'90 dias':'Tudo'} options={['7 dias','30 dias','90 dias','Tudo']} onChange={v=>setAudF(f=>({...f,days:v==='7 dias'?7:v==='30 dias'?30:v==='90 dias'?90:0}))}/>
          </Card>

          <Card style={{padding:18,background:veredito.bg,border:`1.5px solid ${veredito.tone}22`}}>
            <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <span style={{color:veredito.tone,flexShrink:0,marginTop:2}}><IcoShield s={22}/></span>
              <div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:700,color:veredito.tone}}>{veredito.t}</div>
              <div style={{fontSize:12.5,color:C.ink,lineHeight:1.55,marginTop:3}}>{veredito.x}</div></div>
            </div>
          </Card>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>
            {[['Torneios lançados',decl.length,C.ink],['Com prova (mãos)',n('ok')+n('buyin'),C.greenMid],['Jogados sem lançar',n('semlanc'),n('semlanc')?C.red:C.inkSoft],['Lançados sem mãos',n('semhh'),n('semhh')?C.gold:C.inkSoft]].map(([l,v,c])=>
              <Card key={l} style={{padding:'14px 16px'}}><div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em'}}>{l}</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:700,color:c,marginTop:2}}>{v}</div></Card>)}
          </div>

          {foraHH.length>0&&<Card style={{padding:16,background:C.redSoft}}>
            <div style={{fontWeight:800,fontSize:13.5,color:C.red,marginBottom:6}}>⚠️ Fora da grade COMPROVADO pelas mãos ({foraHH.length})</div>
            <div style={{fontSize:12.5,color:C.ink,lineHeight:1.5}}>{foraHH.map(r=>`${r.tournament_name||('#'+r.site_tournament_id)} · ${dLabel(r.entry_date)} · buy-in ${fmt(buyinHH(r))} (máx da época ${fmt(abiMaxFor(config,sp,r.entry_date))})`).join(' — ')}</div>
          </Card>}

          <Card style={{padding:18}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,margin:'0 0 4px'}}>Reconciliação torneio a torneio</h3>
            <div style={{fontSize:12,color:C.inkSoft,marginBottom:10}}>Cada linha casa um torneio do hand history com um lançamento (mesmo site, mesmo dia — ou vizinho — e buy-in igual; até 15% de diferença conta como "quase", acima disso não casa).</div>
            {!linhas.length&&<Empty>Nada pra reconciliar no período.</Empty>}
            {linhas.map((x,i)=><div key={i} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'11px 0',borderBottom:`1px solid ${C.border}`}}>
              <span style={{padding:'3px 10px',borderRadius:99,fontSize:10.5,fontWeight:800,color:TIPO[x.tipo].c,background:TIPO[x.tipo].bg,whiteSpace:'nowrap',flexShrink:0,marginTop:1}}>{TIPO[x.tipo].l}</span>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontWeight:700,fontSize:13.5}}>{dLabel(x.date)} · {(x.hh&&(x.hh.tournament_name||('#'+x.hh.site_tournament_id)))||(x.t&&(x.t.tournament_name||'Torneio'))} <span style={{color:C.inkSoft,fontWeight:600}}>· {(x.hh&&x.hh.site)||(x.t&&x.t.site)||''}</span></div>
                <div style={{fontSize:12,color:C.inkSoft,marginTop:1}}>
                  {x.tipo==='ok'&&`Lançado ${fmt(x.t.buyin)} · mãos comprovam ${fmt(x.hh.buyin)} · ${pl(x.hh.hands,'mão','mãos')} no arquivo`}
                  {x.tipo==='buyin'&&`Lançado ${fmt(x.t.buyin)} mas as mãos mostram ${fmt(x.hh.buyin)} — confere qual está certo e corrige o lançamento`}
                  {x.tipo==='semlanc'&&`As mãos provam que esse torneio foi jogado (${pl(x.hh.hands,'mão','mãos')}, buy-in ${fmt(x.hh.buyin)}) mas não há lançamento correspondente na aba Torneios`}
                  {x.tipo==='semhh'&&`Lançado ${fmt(x.t.buyin)}${num(x.t.prize)>0?` · prêmio ${fmt(x.t.prize)}`:''} — sem hand history importado pra comprovar (importe as mãos na aba Stats)`}
                </div>
              </div>
            </div>)}
          </Card>
        </div>;
      })()}

      {/* ---------------- SAQUES ---------------- */}
      {view==='saques'&&<div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
        <Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:'0 0 4px'}}>Saques por semana</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:10}}>O valor autorizado vem do cálculo semanal. Registre aqui só o que foi <b>realmente pago</b> — o valor sai da banca sozinho.</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
            {players.map((p,i)=><span key={p} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:99,background:C.plumSoft,color:P,fontWeight:700,fontSize:12.5}}><span style={{width:8,height:8,borderRadius:99,background:PLAYER_COLORS[i]}}/>{p} tem {fmt(aReceber[p])} a receber</span>)}
          </div>
          {(()=>{ const rows=players.flatMap(p=>(weeksByPlayer[p]||[]).map(w=>({w,p,vs:valorSacadoFor(w.week,p)}))).filter(x=>x.w.saqueAut>0||x.vs>0).sort((a,b)=>a.w.week<b.w.week?1:-1);
            return rows.length?rows.map(({w,p,vs})=>{const st=saqueStatus(w,bancaAtual,piso,vs); const podePagar=st==='Autorizado'||st==='Parcialmente autorizado'; return <div key={w.week+p} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 0',borderBottom:`1px solid ${C.border}`}}>
              <span style={{width:10,height:10,borderRadius:99,background:pcolor(p),flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:14.5}}>{p} · semana até {dLabel(w.week)}</div>
                <div style={{fontSize:12.5,color:C.inkSoft,marginTop:2}}>autorizado {fmt(w.saqueAut)} · pago {fmt(vs)} <Badge text={st}/></div></div>
              {podePagar&&!somenteLeitura&&<button onClick={()=>setModal({type:'wd',initial:{week_ending_date:w.week,player:p,valor_sacado:String(Math.max(0,w.saqueAut-vs)).replace('.',',')}})} style={{padding:'8px 14px',borderRadius:11,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',flexShrink:0}}>Registrar</button>}
            </div>;}):<Empty>Nenhuma semana com saque autorizado ainda.</Empty>;
          })()}
        </Card>
        <ListView title="Pagamentos registrados" onAdd={somenteLeitura?null:()=>setModal('wd')} rows={[...wds].sort((a,b)=>a.week_ending_date<b.week_ending_date?1:-1)} empty="Nenhum pagamento registrado."
          renderRow={w=><Row key={w.id}
            onDelete={somenteLeitura?null:()=>del('withdrawals',w.id,setWds,wds)}
            onEdit={somenteLeitura?null:()=>setEditing({type:'wd',item:w})}
            left={<><span style={{width:40,height:40,borderRadius:12,background:C.plumSoft,display:'grid',placeItems:'center',flexShrink:0,color:pcolor(w.player)}}><IcoCashOut s={19}/></span>
              <div><div style={{fontWeight:700,fontSize:15}}>{w.player}</div><div style={{fontSize:12.5,color:C.inkSoft}}>semana até {dLabel(w.week_ending_date)}{w.observacoes?` · ${w.observacoes}`:''}</div></div></>}
            right={<span style={{fontWeight:800,fontSize:16,color:P,flexShrink:0}}>{fmt(w.valor_sacado)}</span>}/>}/>
      </div>}

      {/* ---------------- BANCA ---------------- */}
      {view==='banca'&&<div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
        <Card style={{padding:22,background:`linear-gradient(135deg,${P},#3B305E)`,border:'none',color:'#fff'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,opacity:.85,fontWeight:600,fontSize:14}}><IcoStack s={17}/>Banca atual</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:40,fontWeight:600,marginTop:6}}>{fmt(bancaAtual)}</div>
          {partesBanca?<><div data-partes-banca style={{display:'flex',gap:18,marginTop:14,flexWrap:'wrap'}}>
            <div><div style={{fontSize:12.5,opacity:.85}}>Salas</div><div style={{fontWeight:700,fontSize:15}}>{fmt(partesBanca.salas)}</div></div>
            <div><div style={{fontSize:12.5,opacity:.85}}>Resultado dos jogos</div><div style={{fontWeight:700,fontSize:15}}>{fmtSinal(partesBanca.resultados)}</div></div>
            <div><div style={{fontSize:12.5,opacity:.85}}>Movimentos</div><div style={{fontWeight:700,fontSize:15}}>{fmtSinal(partesBanca.movimentos)}</div></div>
            <div><div style={{fontSize:12.5,opacity:.85}}>Reload e capital do time</div><div style={{fontWeight:700,fontSize:15}}>{fmtSinal(partesBanca.aportes)}</div></div>
            <div><div style={{fontSize:12.5,opacity:.85}}>Saques pagos</div><div style={{fontWeight:700,fontSize:15}}>−{fmt(partesBanca.saques)}</div></div>
          </div>
          {partesBanca.corte&&<div style={{fontSize:12.5,opacity:.85,marginTop:10}}>Jogos e movimentos até {dataBR(partesBanca.corte)} já estão no saldo das salas (planilha ou entrada no time): contam só os de depois.</div>}</>
          :<div style={{display:'flex',gap:18,marginTop:14,flexWrap:'wrap'}}>
            <div><div style={{fontSize:12.5,opacity:.85}}>Banca inicial</div><div style={{fontWeight:700,fontSize:15}}>{fmt(config.banca_inicial)}</div></div>
            <div><div style={{fontSize:12.5,opacity:.85}}>Resultado dos jogos</div><div style={{fontWeight:700,fontSize:15}}>{resultadosTotal>=0?'+':'−'}{fmt(Math.abs(resultadosTotal))}</div></div>
            <div><div style={{fontSize:12.5,opacity:.85}}>Aportes/movimentos</div><div style={{fontWeight:700,fontSize:15}}>{movimentosTotal>=0?'+':'−'}{fmt(Math.abs(movimentosTotal))}</div></div>
            <div><div style={{fontSize:12.5,opacity:.85}}>Saques pagos</div><div style={{fontWeight:700,fontSize:15}}>−{fmt(sacadoTotal)}</div></div>
          </div>}
        </Card>

        {modoTime&&!somenteLeitura&&!gestaoAtiva&&timeGente.joga&&<TimeApp secao="dinheiro" session={session} tours={toursRaw} config={config} banca={bancaAtual} onIr={setView}/>}
        {modoTime&&!semDinheiro&&historicoTime.length>0&&<Card data-historico-time style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:0}}>Reload, capital e saques</h3>
          <div style={{fontSize:12.5,color:C.inkSoft,marginTop:2,marginBottom:6,lineHeight:1.5}}>O time lança quando manda ou recebe dinheiro. Só leitura: já está na banca, não lance de novo em Movimentos.</div>
          {historicoTime.map(e=><div key={e.k} data-historico={e.tipo} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderTop:`1px solid ${C.border}`}}>
            <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:14}}>{e.tipo}{e.sala?` · ${e.sala}`:''}</div><div style={{fontSize:12.5,color:C.inkSoft}}>{dataBR(e.data)}{e.texto?` · ${e.texto}`:''}</div></div>
            <span style={{fontWeight:800,fontSize:15,color:e.valor>=0?C.greenMid:C.red,flexShrink:0}}>{fmtSinal(e.valor)}</span></div>)}
        </Card>}
        {modoTime?<Card data-salas-time style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:0}}>Saldo de entrada (por sala)</h3>
          <div style={{fontSize:12.5,color:C.inkSoft,marginTop:2,lineHeight:1.5}}>O que {somenteLeitura?`${alunoAberto} tinha`:'você tinha'} em cada sala na entrada: {sitSel&&sitSel.abertura==='confirmada'?'o da planilha conferida':'quando entrou no time'}. Jogos, movimentos, reload e saques entram sozinhos na banca lá em cima.{somenteLeitura?` Só leitura: só ${alunoAberto} muda.`:''}</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
            {(salasTravadas||somenteLeitura?wallets.map(w=>w.wallet):[...new Set([...wallets.map(w=>w.wallet),...WALLETS.filter(x=>x!=='Reserva')])]).map(w=>{ const wr=wallets.find(x=>x.wallet===w); const editar=!salasTravadas&&!somenteLeitura;
              return <button key={w} data-sala={w} disabled={!editar} onClick={()=>editar&&setQuickEdit({label:`Saldo inicial · ${w}`,hint:'O que você tinha nessa sala quando entrou no time, antes de qualquer reload. Depois do primeiro reload ou saque, esse saldo trava (o reload já entra sozinho).',kind:'money',current:wr?num(wr.saldo_inicial):0,onSave:nv=>saveWallet(jogadorSel,w,nv)})}
                style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:2,padding:'8px 12px',borderRadius:11,border:`1px solid ${C.border}`,background:wr?C.warm:'transparent',cursor:editar?'pointer':'default',minWidth:96}}>
                <span style={{fontSize:11,color:C.inkSoft,fontWeight:700}}>{w}</span>
                <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:15,fontWeight:600,color:wr?C.ink:'#C3BBA9'}}>{wr?fmt(wr.saldo_inicial):'definir'}</span>
              </button>; })}
            {!wallets.length&&(salasTravadas||somenteLeitura)&&<span style={{fontSize:13,color:C.inkSoft}}>Nenhuma sala com saldo inicial.</span>}
          </div>
          {salasTravadas&&<div data-salas-travadas style={{fontSize:12.5,color:C.inkSoft,marginTop:10,lineHeight:1.5,padding:'10px 12px',borderRadius:12,background:C.bg}}>
            🔒 Travado: depois que o time mandou ou recebeu dinheiro (ou conferiu a planilha), o saldo inicial não muda. O reload já entra sozinho na banca: digitar de novo contaria duas vezes. Pra corrigir, fale com quem aprova os saques.</div>}
        </Card>:<Card style={{padding:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginBottom:6}}>
            <div><h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:0}}>Por jogador e plataforma</h3>
            <div style={{fontSize:12.5,color:C.inkSoft,marginTop:2}}>Onde o dinheiro está. Atualiza sozinho com torneios, saques e movimentos.</div></div>
            <button onClick={()=>setModal('transfer')} style={{display:'flex',alignItems:'center',gap:6,background:C.plumSoft,color:P,border:`1.5px solid ${P}`,padding:'9px 13px',borderRadius:12,fontWeight:700,fontSize:13.5,cursor:'pointer',flexShrink:0}}><IcoCashOut s={16}/>Transferir</button>
          </div>
          {players.map((p,i)=>{const wl=walletsDoJogador(p); const tot=saldoJogador(p); return <div key={p} style={{padding:'12px 0',borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:10,height:10,borderRadius:99,background:PLAYER_COLORS[i]}}/>
              <span style={{fontWeight:700,flex:1}}>{p}</span>
              <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:18,color:P}}>{fmt(tot)}</span>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
              {WALLETS.map(w=>{const wr=wl.find(x=>x.wallet===w); return <button key={w} onClick={()=>setQuickEdit({label:`Saldo inicial · ${p} · ${w}`,hint:'O que o jogador tinha nessa plataforma no começo. O app soma torneios, movimentos e saques em cima disso.',kind:'money',current:walletInicial(p,w),onSave:nv=>saveWallet(p,w,nv)})}
                style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:2,padding:'8px 12px',borderRadius:11,border:`1px solid ${C.border}`,background:wr?C.warm:'transparent',cursor:'pointer',minWidth:96}}>
                <span style={{fontSize:11,color:C.inkSoft,fontWeight:700}}>{w}</span>
                <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:15,fontWeight:600,color:wr?(wr.saldo>=0?C.ink:C.red):'#C3BBA9'}}>{wr?fmt(wr.saldo):'definir'}</span>
              </button>;})}
            </div>
          </div>;})}
          <div style={{fontSize:12,color:C.inkSoft,marginTop:10,lineHeight:1.5}}>Toque numa plataforma pra ajustar o <b>saldo inicial</b> daquele jogador. Depósitos/transferências entram como <b>movimento</b> abaixo (escolhendo o jogador); saque pago sai da carteira escolhida na aba Saques.</div>
          <div style={{fontSize:11.5,color:C.inkSoft,marginTop:8,lineHeight:1.5,padding:'10px 12px',borderRadius:12,background:C.bg}}>ℹ️ Esta é a visão de <b>quem tem o quê</b>, montada a partir do saldo inicial que cada um declarou por plataforma. Ela <b>não precisa bater</b> com o total da <b>banca central</b> lá em cima — a banca central parte da banca inicial da pool, não desses saldos por jogador. Torneio/movimento/saque num site fora das plataformas listadas cai em <b>"Outros"</b>.</div>
        </Card>}

        <ListView title="Movimentos da banca" subtitle={modoTime?"Reload e capital do time entram sozinhos quando o time confirma o envio, e saque pelo pedido de saque: não lance de novo aqui. Use para transferência entre salas, taxa, rakeback ou bônus.":"Só aportes e retiradas externas (dinheiro entrando ou saindo da pool). Resultado de jogo entra sozinho pelo Diário, e saque de jogador pela aba Saques — não registre eles aqui de novo."} onAdd={somenteLeitura?null:()=>setModal('bank')} rows={[...ledger].sort((a,b)=>a.entry_date<b.entry_date?1:-1)} empty="Nenhum movimento na banca."
          renderRow={l=>{const net=num(l.entrada)-num(l.saida); return <Row key={l.id}
            onDelete={somenteLeitura?null:()=>del('bankroll_ledger',l.id,setLedger,ledger)}
            onEdit={somenteLeitura?null:()=>setEditing({type:'bank',item:l})}
            left={<><span style={{width:40,height:40,borderRadius:12,background:net>=0?C.greenSoft:C.redSoft,display:'grid',placeItems:'center',flexShrink:0,color:net>=0?C.greenMid:C.red}}>{net>=0?<IcoUp s={20}/>:<IcoDown s={20}/>}</span>
              <div><div style={{fontWeight:700,fontSize:15}}>{l.wallet}{l.player?` · ${l.player}`:''}</div><div style={{fontSize:12.5,color:C.inkSoft}}>{dLabel(l.entry_date)}{l.observacao?` · ${l.observacao}`:''}</div></div></>}
            right={<span style={{fontWeight:800,fontSize:16,color:net>=0?C.greenMid:C.red,flexShrink:0}}>{net>=0?'+':'−'}{fmt(Math.abs(net))}</span>}/>;}}/>
      </div>}

      {/* ---------------- CONFIG ---------------- */}
      {view==='time'&&modoTime&&!gestaoAtiva&&!somenteLeitura&&<TimeApp secao="meu" session={session} tours={toursRaw} config={config} banca={bancaAtual} onIr={setView}/>}
      {gestaoAtiva&&String(view).startsWith('g_')&&<TimeApp secao={view} session={session} tours={toursRaw} config={config} banca={bancaAtual} onVerJogador={abrirAluno} onIr={setView}
        onPadrao={timeGente.podeConfigurar?k=>{ const row=PADRAO_TIME[k]; if(row) setQuickEdit({label:`${row.label} · padrão do time`,kind:row.kind,current:config[row.key],onSave:nv=>askSaveConfig(row,nv)}); }:null}
        marca={ws?{nome:ws.marca_nome||'',logo:ws.marca_logo||null}:null} nomeTime={ws?.name} onMarca={loadAll}/>}
      {(view==='config'||view==='g_regras')&&<div className="ftfade" style={view==='g_regras'?{marginTop:16}:undefined}>
        {!modoTime&&<>
        <Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,margin:'0 0 4px'}}>{solo?'Configurações':'Configurações da pool'}</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:12}}>{toque?'Toque no lápis':'Clique no lápis'} pra ajustar.{solo?'':' Todos veem a mesma configuração.'}</div>
          {modoTime&&<div data-ajustes-time style={{fontSize:12.5,color:C.inkSoft,marginTop:-6,marginBottom:8}}>{timeGente.podeConfigurar?'Regras do time inteiro: valem pra todos os jogadores.':'Regras do time: só quem configura o time altera.'}</div>}
          {(solo?[
            ...(modoTime?[]:[{label:'Seu nome',val:config.player1_name,kind:'text',key:'player1_name'}]),
            {label:modoTime?'ABI máximo (reta sem grade)':'ABI máximo',val:config.abi_max_player1,kind:'money',key:'abi_max_player1',show:fmt(config.abi_max_player1)},
            {label:'Stop loss diário (buy-ins)',val:config.stoploss_daily_buyins,kind:'money',key:'stoploss_daily_buyins',show:String(num(config.stoploss_daily_buyins))},
            {label:'Stop loss semanal',val:config.stoploss_weekly_pct,kind:'percent',key:'stoploss_weekly_pct',show:pctFmt(num(config.stoploss_weekly_pct)*100)},
            ...(modoTime?[]:[{label:'Banca inicial',val:config.banca_inicial,kind:'money',key:'banca_inicial',show:fmt(config.banca_inicial)}]),
            {label:'Início da semana de referência',val:config.week_start_date,kind:'date',key:'week_start_date',show:config.week_start_date},
            {label:'Sites permitidos',val:config.sites_permitidos,kind:'list',key:'sites_permitidos',show:sitesTime.join(', ')},
            {label:'Modalidades permitidas',val:config.modalidades_permitidas,kind:'list',key:'modalidades_permitidas',show:modalidadesTime.join(', ')},
          ]:[
            {label:'Jogador 1',val:config.player1_name,kind:'text',key:'player1_name'},
            {label:'Jogador 2',val:config.player2_name,kind:'text',key:'player2_name'},
            {label:'Fatia do jogador no lucro',val:config.player_pct,kind:'percent',key:'player_pct',show:pctFmt(num(config.player_pct)*100)},
            {label:`ABI máximo · ${config.player1_name}`,val:config.abi_max_player1,kind:'money',key:'abi_max_player1',show:fmt(config.abi_max_player1)},
            {label:`ABI máximo · ${config.player2_name}`,val:config.abi_max_player2,kind:'money',key:'abi_max_player2',show:fmt(config.abi_max_player2)},
            {label:'Piso mínimo da banca',val:config.piso_minimo,kind:'money',key:'piso_minimo',show:fmt(config.piso_minimo)},
            {label:'Make-up máx. recomendado',val:config.makeup_max_recomendado,kind:'money',key:'makeup_max_recomendado',show:fmt(config.makeup_max_recomendado)},
            {label:`Make-up inicial · ${config.player1_name}`,val:config.makeup_inicial_player1,kind:'money',key:'makeup_inicial_player1',show:fmt(config.makeup_inicial_player1)},
            {label:`Make-up inicial · ${config.player2_name}`,val:config.makeup_inicial_player2,kind:'money',key:'makeup_inicial_player2',show:fmt(config.makeup_inicial_player2)},
            {label:'Stop loss diário (buy-ins)',val:config.stoploss_daily_buyins,kind:'money',key:'stoploss_daily_buyins',show:String(num(config.stoploss_daily_buyins))},
            {label:'Stop loss semanal',val:config.stoploss_weekly_pct,kind:'percent',key:'stoploss_weekly_pct',show:pctFmt(num(config.stoploss_weekly_pct)*100)},
            {label:'Banca inicial',val:config.banca_inicial,kind:'money',key:'banca_inicial',show:fmt(config.banca_inicial)},
            {label:'Início da semana de referência',val:config.week_start_date,kind:'date',key:'week_start_date',show:config.week_start_date},
            {label:'Sites permitidos',val:config.sites_permitidos,kind:'list',key:'sites_permitidos',show:sitesTime.join(', ')},
            {label:'Modalidades permitidas',val:config.modalidades_permitidas,kind:'list',key:'modalidades_permitidas',show:modalidadesTime.join(', ')},
          ]).map(row=><div key={row.key} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 0',borderBottom:`1px solid ${C.border}`}}>
            <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:14.5}}>{row.label}</div><div style={{fontSize:13,color:C.inkSoft,marginTop:1,overflow:'hidden',textOverflow:'ellipsis'}}>{row.show!=null?row.show:String(row.val)}</div></div>
            {(!modoTime||timeGente.podeConfigurar)&&<button aria-label={`Mudar ${row.label}`} onClick={()=>setQuickEdit({label:row.label,kind:row.kind,current:row.val,onSave:nv=>askSaveConfig(row,nv)})} style={{width:38,height:38,borderRadius:11,border:'none',background:C.plumSoft,color:P,cursor:'pointer',display:'grid',placeItems:'center',flexShrink:0}}><IcoPencil s={17}/></button>}
          </div>)}
        </Card>
        <Card style={{padding:20,marginTop:16}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:'0 0 4px'}}>Histórico de alterações</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:10}}>{modoTime?<>Toda mudança nas regras fica registrada aqui. Reta sem grade é julgada pelo ABI máximo que valia <b>na data</b> de cada torneio.</>:<>Toda mudança nos Ajustes fica registrada aqui e o outro jogador é avisado na hora. A grade ("fora da grade") julga cada torneio pelo ABI que valia <b>na data dele</b>.</>}</div>
          {chgs.length===0&&<Empty>Nenhuma alteração registrada ainda.</Empty>}
          {chgs.slice(0,12).map(c=><div key={c.id} style={{padding:'10px 0',borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontWeight:700,fontSize:13.5}}>{c.resumo}</div>
            <div style={{fontSize:12,color:C.inkSoft,marginTop:1}}>{c.changed_by_name||'—'} · {dLabel(String(c.created_at).slice(0,10))}</div>
          </div>)}
        </Card>
        </>}
        {view!=='g_regras'&&<>
        {soloConta&&<Card data-entrar-time style={{padding:20,marginTop:16}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:'0 0 4px'}}>Entrar num time</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:12,lineHeight:1.5}}>Seu time te passou um código (ex.: TIME-12345)? Peça pra entrar. Quando a gestão aprovar, esta conta vira do time. O seu histórico vai junto, e o que é de antes da entrada só você vê.</div>
          {(()=>{ const pend=meusPedidos.find(x=>x.status==='pendente'); const rec=!pend&&meusPedidos[0]&&meusPedidos[0].status==='recusado'?meusPedidos[0]:null;
            const recarregar=async()=>{ const {data:mp}=await sb.from('pedido_entrada').select('id,status,criado_em,motivo,time_nome').order('criado_em',{ascending:false}).limit(5); setMeusPedidos(mp||[]); };
            if(pend) return <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <span style={{fontSize:14}}>Pedido pro time <b>{pend.time_nome}</b> enviado em {dataBR(pend.criado_em)}: aguardando a gestão.</span>
              <button onClick={async()=>{ const {error}=await sb.rpc('cancelar_pedido_entrada',{p_pedido:pend.id}); if(error) setAvisoPedido({erro:true,texto:error.message}); await recarregar(); }}
                style={{padding:'8px 13px',borderRadius:11,border:`1.5px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:13,cursor:'pointer'}}>Cancelar pedido</button></div>;
            return <>{rec&&<div style={{fontSize:13,color:C.red,fontWeight:600,marginBottom:8}}>O time {rec.time_nome} recusou o pedido{rec.motivo?`: ${rec.motivo}`:'.'}</div>}
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <input data-codigo-time aria-label="Código do time" style={{...inputStyle,flex:'1 1 180px',width:'auto'}} autoCapitalize="characters" placeholder="TIME-12345" value={codTime} onChange={e=>setCodTime(e.target.value)}/>
                <button data-pedir-entrada onClick={async()=>{ const c=normCodigo(codTime); if(!codigoValido(c)){ setAvisoPedido({erro:true,texto:'Código inválido: é tipo TIME-12345 (confira com o time).'}); return; }
                  const {error}=await sb.rpc('pedir_entrada_time',{p_codigo:c}); if(error){ setAvisoPedido({erro:true,texto:error.message}); return; } setAvisoPedido(null); setCodTime(''); await recarregar(); }}
                  style={{padding:'11px 16px',borderRadius:12,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer'}}>Pedir pra entrar</button>
              </div></>; })()}
        </Card>}
        {soloConta&&<Card style={{padding:20,marginTop:16}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:'0 0 4px'}}>Seu plano</h3>
          <div style={{fontSize:13.5,marginBottom:8}}>Plano atual: <b style={{color:P}}>{PLAN_LABEL[plan]||plan}</b>{trialDaysLeft!=null&&<span style={{marginLeft:8,padding:'3px 9px',borderRadius:99,fontSize:11.5,fontWeight:800,color:trialDaysLeft<=3?C.gold:P,background:trialDaysLeft<=3?C.goldSoft:C.plumSoft}}>teste grátis · {trialDaysLeft===0?'último dia':`${trialDaysLeft} dia${trialDaysLeft!==1?'s':''}`}</span>}</div>
          {trialDaysLeft!=null&&<div style={{fontSize:12.5,color:C.inkSoft,marginBottom:8,lineHeight:1.5}}>Seu teste grátis dura <b>15 dias</b>. Quando acabar, o acesso é bloqueado até você assinar — seus dados ficam guardados.</div>}
          <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.6}}>
            <b>Gestão</b> (R$ 19,90/mês): banca, torneios, diário, semanal e relatórios de banca — ilimitado.<br/>
            <b>Pro</b> (R$ 49,90/mês): tudo da Gestão + import de mãos GG/PS, estatísticas completas, leituras automáticas e relatório em PDF.
          </div>
          {trialDaysLeft!=null&&<button onClick={()=>abrirCheckout(plan==='pro'?'pro':'gestao','mensal',session.user.email)} style={{marginTop:4,marginRight:10,padding:'12px 20px',borderRadius:13,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer'}}>Assinar agora</button>}
          {!canStats&&<button onClick={()=>abrirCheckout('pro','mensal',session.user.email)} style={{marginTop:12,padding:'12px 20px',borderRadius:13,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer'}}>Fazer upgrade pro Pro</button>}
          <button onClick={()=>{setTour(1); setView(TOUR_STEPS[0].v);}} style={{marginTop:12,marginLeft:8,padding:'12px 20px',borderRadius:13,border:`1.5px solid ${C.border}`,background:'transparent',color:P,fontWeight:700,fontSize:14,cursor:'pointer'}}>Rever o tour do sistema</button>
        </Card>}
        <Card style={{padding:20,marginTop:16}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:'0 0 4px'}}>Minha conta</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:14}}>Troque sua senha quando quiser.</div>
          <button className="mobile-only" data-sair-conta onClick={sair} style={{display:'flex',alignItems:'center',gap:8,padding:'11px 16px',borderRadius:12,border:`1px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:14,cursor:'pointer',marginBottom:12}}><IcoLogout s={16}/>Sair da conta</button>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={()=>setChangePass(true)} style={{display:'flex',alignItems:'center',gap:8,padding:'12px 18px',borderRadius:12,border:`1px solid ${C.border}`,background:C.surface,color:P,fontWeight:700,fontSize:14.5,cursor:'pointer'}}><IcoLogout s={18}/>Trocar minha senha</button>
            {!isStandalone()&&<button onClick={instalar} style={{display:'flex',alignItems:'center',gap:8,padding:'12px 18px',borderRadius:12,border:`1px solid ${C.border}`,background:C.surface,color:P,fontWeight:700,fontSize:14.5,cursor:'pointer'}}><IcoChip s={18}/>Instalar na tela inicial</button>}
          </div>
          {soloConta&&<div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
            <div style={{fontSize:13,color:C.inkSoft,marginBottom:10,lineHeight:1.5}}>Quer sair de vez? Você pode <b>excluir sua conta</b> e apagar todos os seus dados definitivamente (direito garantido pela LGPD).</div>
            <button onClick={()=>setDelAcc(true)} style={{display:'flex',alignItems:'center',gap:8,padding:'11px 16px',borderRadius:12,border:`1px solid ${C.redSoft}`,background:C.redSoft,color:C.red,fontWeight:700,fontSize:13.5,cursor:'pointer'}}><IcoTrash s={17}/>Excluir minha conta</button>
          </div>}
        </Card>
        <Card style={{padding:20,marginTop:16}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:'0 0 4px'}}>Backup (CSV)</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:14}}>Baixa os dados brutos pra guardar. Abre direto no Excel/Planilhas.</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {[['Diário',daily,'diario'],['Torneios',tours,'torneios'],['Banca',ledger,'banca'],['Saques',wds,'saques'],['Configurações',config?[config]:[],'config']].map(([label,rows,file])=>
              <button key={file} disabled={!rows.length} onClick={()=>downloadCSV(`pool-${file}`,rows)} style={{padding:'10px 16px',borderRadius:12,border:`1px solid ${C.border}`,background:rows.length?C.surface:C.bg,color:rows.length?P:'#C3BBA9',fontWeight:700,fontSize:13.5,cursor:rows.length?'pointer':'default'}}>{label} ({rows.length})</button>)}
          </div>
        </Card>
        </>}
      </div>}
    </main>

    {/* nav mobile: só o essencial + "Mais" */}
    <nav className="bottomnav" style={{position:'fixed',bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,padding:'6px 8px calc(6px + env(safe-area-inset-bottom))',gap:2,boxShadow:'0 -8px 24px -16px rgba(0,0,0,.25)',zIndex:20}}>
      {(()=>{ const fora=nav.filter(n=>!MAIN_TABS.includes(n.id)), barra=fora.length===1?[...nav.filter(n=>MAIN_TABS.includes(n.id)),fora[0]]:nav.filter(n=>MAIN_TABS.includes(n.id));
        return <>{barra.map(n=><NavBtn key={n.id} Icon={n.Icon} label={n.label} active={navAtiva(n.id)} onClick={()=>{setView(n.id);setMenuOpen(false);}} mobile/>)}
          {fora.length>1&&<NavBtn Icon={IcoMenu} label="Mais" active={menuOpen||!barra.some(n=>navAtiva(n.id))} onClick={()=>setMenuOpen(true)} mobile/>}</>; })()}
    </nav>

    {/* gaveta "Mais" (demais telas) */}
    {menuOpen&&<div onClick={()=>setMenuOpen(false)} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:55}}>
      <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:460,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(26px + env(safe-area-inset-bottom))'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>Todas as telas</h3>
          <button onClick={()=>setMenuOpen(false)} style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {nav.filter(n=>!MAIN_TABS.includes(n.id)).map(n=><button key={n.id} onClick={()=>{setView(n.id);setMenuOpen(false);}} style={{display:'flex',alignItems:'center',justifyContent:'flex-start',textAlign:'left',gap:10,padding:'16px 14px',borderRadius:14,border:`1.5px solid ${view===n.id?P:C.border}`,background:view===n.id?C.plumSoft:C.warm,color:view===n.id?P:C.ink,fontWeight:700,fontSize:15,cursor:'pointer',lineHeight:1.25}}><span style={{flexShrink:0,display:'grid'}}><n.Icon s={20}/></span><span style={{minWidth:0}}>{n.label}</span></button>)}
        </div>
        <button data-sair-mais onClick={sair} style={{marginTop:14,width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'12px',borderRadius:12,border:`1px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:14,cursor:'pointer'}}><IcoLogout s={16}/>Sair da conta</button>
      </div>
    </div>}

    {/* relatório imprimível: Imprimir -> "Salvar como PDF" (funciona no celular e no desktop) */}
    {report&&(()=>{
      const hoje=todayISO();
      const Hdr=({title,sub})=><div style={{borderBottom:`3px solid ${P}`,paddingBottom:14,marginBottom:18}}>
        <div style={{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:700,color:P}}>{solo?'GrinderBank':'PoolGG'}</span>
          <span style={{fontSize:12,color:'#6B6455'}}>{solo?`banca de ${config.player1_name}`:`pool de poker · ${config.player1_name} & ${config.player2_name}`}</span>
        </div>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,marginTop:8}}>{title}</div>
        <div style={{fontSize:11.5,color:'#6B6455',marginTop:2}}>{sub} · gerado em {dLabel(hoje)}/{hoje.slice(0,4)}</div>
      </div>;
      const Big=({label,value,tone})=><div className="repcard" style={{padding:'10px 12px',borderRadius:10,background:'#F7F4EA',minWidth:0}}>
        <div style={{fontSize:10,color:'#6B6455',fontWeight:700,textTransform:'uppercase'}}>{label}</div>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,color:tone||'#1E2A24'}}>{value}</div></div>;
      const Sec=({t,children})=><div className="repcard" style={{marginBottom:18}}><div style={{fontSize:13,fontWeight:800,color:P,margin:'0 0 8px',textTransform:'uppercase',letterSpacing:'.04em'}}>{t}</div>{children}</div>;
      let corpo=null, titulo='', sub='';
      if(report.type==='mensal'){
        titulo=`Relatório mensal — ${mLabel(month)}`; sub=solo?'fechamento do mês':'fechamento da pool';
        const wkRows=players.flatMap(pl=>(weeksByPlayer[pl]||[]).filter(w=>w.week.slice(0,7)===month).map(w=>({...w,pl,vs:valorSacadoFor(w.week,pl)})));
        const mSaques=wds.filter(w=>String(w.week_ending_date||'').slice(0,7)===month);
        const bs=breakdownBy('site',monthTours), bm=breakdownBy('modality',monthTours);
        corpo=<>
          <Sec t="Resumo do mês">
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              <Big label="Resultado" value={fmt(mRes)} tone={mRes>=0?C.greenMid:C.red}/>
              {!solo&&<Big label="Lucro dividido" value={fmt(mLucroDiv)}/>}
              {!solo&&<Big label="Ficou na pool" value={fmt(mPool)}/>}
              <Big label="Torneios" value={String(mTorneios)}/>
              <Big label="ABI médio" value={fmt(mAbi)}/>
              <Big label="ROI" value={pctFmt(mRoi)} tone={mRoi>=0?C.greenMid:C.red}/>
            </div>
          </Sec>
          <Sec t="Por jogador">
            <table className="reptable"><thead><tr><th>Jogador</th><th>Torneios</th><th>Investido</th><th>Premiação</th><th>Resultado</th><th>ROI</th><th>ITM</th>{!solo&&<th>Make-up final</th>}</tr></thead>
            <tbody>{perPlayerMonth.map(pm=><tr key={pm.p}><td><b>{pm.p}</b></td><td>{pm.torneios}</td><td>{fmt(pm.vol)}</td><td>{fmt(pm.premios)}</td><td style={{color:pm.res>=0?C.greenMid:C.red,fontWeight:700}}>{fmt(pm.res)}</td><td>{pctFmt(pm.roi)}</td><td>{pctFmt(pm.itm)}</td>{!solo&&<td>{fmt(pm.makeAberto)}</td>}</tr>)}</tbody></table>
          </Sec>
          <Sec t="Semana a semana (fechadas no mês)">
            {wkRows.length?<table className="reptable"><thead><tr><th>Semana</th>{!solo&&<th>Jogador</th>}<th>Resultado</th>{!solo&&<><th>Make-up</th><th>Parte do jogador</th><th>Saque autorizado</th><th>Sacado</th></>}</tr></thead>
            <tbody>{wkRows.map((w,i)=><tr key={i}><td>{weekLabel(w.week)}</td>{!solo&&<td>{w.pl}</td>}<td style={{color:w.resultado>=0?C.greenMid:C.red,fontWeight:700}}>{fmt(w.resultado)}</td>{!solo&&<><td>{fmt(w.makeAnterior)} → {fmt(w.makeFinal)}</td><td>{fmt(w.parteJog)}</td><td>{fmt(w.saqueAut)}</td><td>{fmt(w.vs)}</td></>}</tr>)}</tbody></table>:<div style={{fontSize:12,color:'#6B6455'}}>Sem semanas fechadas neste mês.</div>}
          </Sec>
          {mSaques.length>0&&<Sec t="Saques pagos no mês">
            <table className="reptable"><thead><tr><th>Semana</th><th>Jogador</th><th>Carteira</th><th>Valor</th></tr></thead>
            <tbody>{mSaques.map(w=><tr key={w.id}><td>{dLabel(w.week_ending_date)}</td><td>{w.player}</td><td>{w.wallet||'—'}</td><td style={{fontWeight:700}}>{fmt(w.valor_sacado)}</td></tr>)}</tbody></table>
          </Sec>}
          {monthTours.length>0&&<Sec t={solo?'Onde você lucra (mês)':'Onde a pool lucra (mês)'}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              {[['Por site',bs],['Por modalidade',bm]].map(([tt,rws])=><div key={tt}>
                <div style={{fontSize:11,fontWeight:700,color:'#6B6455',marginBottom:4}}>{tt}</div>
                <table className="reptable"><tbody>{rws.map(g=><tr key={g.k}><td>{g.k}</td><td>{g.n} tor.</td><td>{pctFmt(g.roi)}</td><td style={{color:g.res>=0?C.greenMid:C.red,fontWeight:700}}>{fmt(g.res)}</td></tr>)}</tbody></table>
              </div>)}
            </div>
          </Sec>}
          <div style={{fontSize:11,color:'#6B6455'}}>{solo?<>Banca no momento do relatório: <b>{fmt(bancaAtual)}</b>.</>:<>Banca central da pool no momento do relatório: <b>{fmt(bancaAtual)}</b> · make-up em aberto: {players.map(pl=>`${pl.split(' ')[0]} ${fmt(curMakeUp[pl])}`).join(' · ')}.</>}</div>
        </>;
      } else {
        const sp2=report.player||players[0]; const nn=parseInt(report.days,10);
        // história COMPLETA do jogador na pool (financeiro — não depende do período das stats)
        const pT=tours.filter(t=>t.player===sp2);
        const pDias=[...new Set(pT.map(t=>t.entry_date))].sort();
        const pWeeks=weeksByPlayer[sp2]||[];
        const pInv=pT.reduce((s,t)=>s+totalInvestido(t),0);        // dinheiro
        const pNom=pT.reduce((s,t)=>s+nominalTorneio(t),0);         // nível (ABI)
        const pPrem=pT.reduce((s,t)=>s+num(t.prize),0);
        const pBounty=pT.reduce((s,t)=>s+bountyTorneio(t),0);
        const pRes=pT.reduce((s,t)=>s+lucroTorneio(t),0);
        const pEntr=pT.reduce((s,t)=>s+1+num(t.reentries),0);
        const pCash=pT.filter(t=>num(t.prize)>0).length;
        const pParteJog=pWeeks.reduce((s,w)=>s+w.parteJog,0);
        const pSaqueAut=pWeeks.reduce((s,w)=>s+w.saqueAut,0);
        const pPago=wds.filter(w=>w.player===sp2).reduce((s,w)=>s+num(w.valor_sacado),0);
        const pDayRes={}; pT.forEach(t=>{ pDayRes[t.entry_date]=(pDayRes[t.entry_date]||0)+lucroTorneio(t); });
        const pDR=Object.entries(pDayRes);
        const pBest=pDR.length?pDR.reduce((a,b)=>b[1]>a[1]?b:a):null;
        const pWorst=pDR.length?pDR.reduce((a,b)=>b[1]<a[1]?b:a):null;
        const pMaior=pT.length?pT.reduce((a,b)=>num(b.prize)>num(a.prize)?b:a):null;
        const pWk8=pWeeks.slice(-8).reverse();
        const from=nn>0?addDaysISO(todayISO(),-(nn-1)):(report.from||null);
        const to=nn>0?null:(report.to||null);
        const repPeriodo=nn>0?`últimos ${nn} dias`:(report.from||report.to)?`${report.from?dLabel(report.from):'início'} a ${report.to?dLabel(report.to):'hoje'}`:'todo o histórico';
        const rws=hh.filter(r=>r.player===sp2&&(!from||(r.entry_date&&r.entry_date>=from))&&(!to||(r.entry_date&&r.entry_date<=to)));
        const S2=k=>rws.reduce((s,r)=>s+num(r[k]),0);
        const T2=hhTotals(rws);
        const hands2=T2.hands, bb100v=T2.bb100;
        const evbb=T2.allinEv, netbb=T2.allinNet, sorte=T2.sorte;
        const afb=T2.afB, afc=T2.afC;
        const pos2=T2.pos;
        const insights=hhInsights(hhInsightInput(T2));
        titulo=`Relatório do jogador — ${sp2}`;
        sub=solo?`banca + estatísticas de jogo (${repPeriodo})`:`história completa na pool + estatísticas de jogo (${repPeriodo})`;
        const MET=[
          ['VPIP',T2.vpip,T2.vpipDen,HH_BANDS.vpip],['PFR',T2.pfr,T2.pfrOpp,HH_BANDS.pfr],
          ['3-bet',T2.tb,T2.tbOpp,HH_BANDS.tb],['Squeeze',T2.sq,T2.sqOpp,HH_BANDS.sq],['Fold pra 3-bet',S2('f3b_cnt'),S2('f3b_opp'),HH_BANDS.f3b],
          ['Roubo de blinds',S2('steal_cnt'),S2('steal_opp'),HH_BANDS.steal],['BB defende',S2('bbdef_cnt'),S2('bbdef_opp'),HH_BANDS.bbdef],
          ['C-bet flop',S2('cbet_cnt'),S2('cbet_opp'),HH_BANDS.cbet],['Fold pra c-bet',S2('fcbet_cnt'),S2('fcbet_opp'),HH_BANDS.fcbet],
          ['WWSF',S2('wwsf_cnt'),S2('sawflop_cnt'),HH_BANDS.wwsf],['WTSD',T2.wtsdNp,T2.wtsdDen,HH_BANDS.wtsd],['W$SD',S2('wsd_cnt'),S2('wtsd_cnt'),HH_BANDS.wsd],
        ];
        const stOf=(c,o,b)=>{ if(!o) return ['sem amostra','#6B6455']; if(!b) return ['—','#6B6455']; const pv=c/o*100; if(pv>=b[0]&&pv<=b[1]) return ['dentro',C.greenMid]; if(pv>=b[0]-5&&pv<=b[1]+5) return ['atenção',C.gold]; return ['fora',C.red]; };
        const TONE2={red:C.red,gold:C.gold,green:C.greenMid,info:P};
        corpo=<>
          {!solo&&<Sec t="Na pool — história completa">
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              <Big label="Na pool desde" value={pDias[0]?`${dLabel(pDias[0])}/${pDias[0].slice(0,4)}`:'—'}/>
              <Big label="Dias jogados" value={String(pDias.length)}/>
              <Big label="Semanas" value={String(pWeeks.length)}/>
              <Big label="Torneios (entradas)" value={`${pT.length} (${pEntr})`}/>
              <Big label="Investido" value={fmt(pInv)}/>
              <Big label="Premiação" value={fmt(pPrem)}/>
              {pBounty>0&&<Big label="Bounties" value={fmt(pBounty)}/>}
              <Big label="Resultado na pool" value={fmt(pRes)} tone={pRes>=0?C.greenMid:C.red}/>
              <Big label="ROI" value={pInv>0?pctFmt(pRes/pInv*100):'—'} tone={pRes>=0?C.greenMid:C.red}/>
              <Big label="ABI médio" value={pEntr>0?fmt(pNom/pEntr):'—'}/>
              <Big label="ITM" value={pT.length?pctFmt(pCash/pT.length*100):'—'}/>
              <Big label="Make-up atual" value={fmt(curMakeUp[sp2])} tone={num(curMakeUp[sp2])>0?C.red:C.greenMid}/>
              <Big label="Lucro dividido (dele)" value={fmt(pParteJog)}/>
              <Big label="Saque autorizado (acum.)" value={fmt(pSaqueAut)}/>
              <Big label="Sacado" value={fmt(pPago)}/>
              <Big label="A receber" value={fmt(aReceber[sp2]||0)} tone={P}/>
            </div>
            <div style={{fontSize:11,color:'#6B6455',marginTop:8,lineHeight:1.5}}>
              Melhor dia: <b>{pBest?`${dLabel(pBest[0])} (${fmt(pBest[1])})`:'—'}</b> · Pior dia: <b>{pWorst?`${dLabel(pWorst[0])} (${fmt(pWorst[1])})`:'—'}</b> · Maior premiação: <b>{pMaior&&num(pMaior.prize)>0?`${pMaior.tournament_name||'torneio'} (${fmt(pMaior.prize)})`:'—'}</b>
            </div>
          </Sec>}
          {!solo&&<Sec t="Últimas semanas na pool">
            {pWk8.length?<table className="reptable"><thead><tr><th>Semana</th><th>Resultado</th><th>Make-up</th><th>Parte do jogador</th><th>Saque autorizado</th><th>Sacado</th></tr></thead>
            <tbody>{pWk8.map(w=><tr key={w.week}><td>{weekLabel(w.week)}</td><td style={{color:w.resultado>=0?C.greenMid:C.red,fontWeight:700}}>{fmt(w.resultado)}</td><td>{fmt(w.makeAnterior)} → {fmt(w.makeFinal)}</td><td>{fmt(w.parteJog)}</td><td>{fmt(w.saqueAut)}</td><td>{fmt(valorSacadoFor(w.week,sp2))}</td></tr>)}</tbody></table>:<div style={{fontSize:12,color:'#6B6455'}}>Sem semanas fechadas ainda.</div>}
          </Sec>}
          <Sec t={`Estatísticas de jogo — hand histories (${repPeriodo})`}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              <Big label="Mãos" value={String(hands2)}/>
              <Big label="Torneios" value={String(rws.length)}/>
              <Big label="bb/100 (fichas)" value={fmtBB(bb100v)} tone={bb100v>=0?C.greenMid:C.red}/>
              <Big label="All-ins" value={String(S2('allin_cnt'))}/>
              <Big label="Sorte (real − EV)" value={fmtBB(sorte)} tone={sorte>=0?C.greenMid:C.red}/>
              <Big label="Agressão (AF)" value={afc>0?(afb/afc).toFixed(1).replace('.',','):'—'}/>
            </div>
            <div style={{fontSize:11,color:'#6B6455',marginTop:6}}>Sorte: real {fmtBB(netbb)} vs esperado pela equity {fmtBB(evbb)} nos all-ins — a diferença é variância, não mérito ou erro.</div>
          </Sec>
          <Sec t="Estatísticas vs faixa de reg (MTT micro/low)">
            <table className="reptable"><thead><tr><th>Estatística</th><th>Valor</th><th>Amostra</th><th>Faixa reg</th><th>Status</th></tr></thead>
            <tbody>{MET.map(([nm,c,o,b])=>{ const [lbl,cor]=stOf(c,o,b); return <tr key={nm}><td>{nm}</td><td style={{fontWeight:700}}>{o>0?pctFmt(c/o*100):'—'}</td><td>{c}/{o}</td><td>{b?`${b[0]}–${b[1]}%`:'—'}</td><td style={{color:cor,fontWeight:700}}>{lbl}</td></tr>; })}</tbody></table>
          </Sec>
          <Sec t="Por posição">
            {['EP','MP','CO','BTN','SB','BB'].some(k=>pos2[k]&&pos2[k].h>0)?<table className="reptable"><thead><tr><th>Posição</th><th>Mãos</th><th>VPIP</th><th>PFR</th><th>RFI</th><th>BB/100</th><th>Ajustado</th></tr></thead>
            <tbody>{['EP','MP','CO','BTN','SB','BB'].filter(k=>pos2[k]&&pos2[k].h>0).map(k=><tr key={k}><td><b>{k}</b></td><td>{pos2[k].h}</td><td>{pos2[k].h-pos2[k].w>0?pctFmt(pos2[k].v/(pos2[k].h-pos2[k].w)*100):'—'}</td><td>{pos2[k].po>0?pctFmt(pos2[k].p/pos2[k].po*100):'—'}</td><td>{pos2[k].ro>0?pctFmt(pos2[k].r/pos2[k].ro*100):'—'}</td><td>{pos2[k].hn>0?fmtBB(pos2[k].net/pos2[k].hn*100).replace(' bb',''):'—'}</td><td>{pos2[k].an>0?fmtBB(pos2[k].adj/pos2[k].an*100).replace(' bb',''):'—'}</td></tr>)}</tbody></table>:<div style={{fontSize:12,color:'#6B6455'}}>Sem dados de posição.</div>}
          </Sec>
          <Sec t="Leituras do jogo">
            {insights.length?insights.map((iz,ix)=><div key={ix} style={{marginBottom:8}}><div style={{fontWeight:800,fontSize:12.5,color:TONE2[iz.tone]}}>{iz.t}</div><div style={{fontSize:12,color:'#3d463f',lineHeight:1.5}}>{iz.x}</div></div>):<div style={{fontSize:12,color:'#6B6455'}}>Sem leituras — importe hand histories.</div>}
          </Sec>
        </>;
      }
      return <div className="printrep" style={{position:'fixed',inset:0,background:'#fff',zIndex:80,overflowY:'auto'}}>
        <div className="noprint" style={{position:'sticky',top:0,background:'#fff',borderBottom:`1px solid ${C.border}`,padding:'12px 16px',display:'flex',gap:10,zIndex:2}}>
          <button onClick={()=>setReport(null)} style={{padding:'10px 16px',borderRadius:12,border:`1.5px solid ${C.border}`,background:'#fff',color:C.ink,fontWeight:700,fontSize:13.5,cursor:'pointer'}}>← Voltar</button>
          <button onClick={()=>window.print()} style={{marginLeft:'auto',padding:'10px 18px',borderRadius:12,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:13.5,cursor:'pointer'}}>🖨 Imprimir / Salvar PDF</button>
        </div>
        <div style={{maxWidth:820,margin:'0 auto',padding:'22px 20px 60px',color:'#1E2A24'}}>
          <Hdr title={titulo} sub={sub}/>
          {corpo}
          <div style={{marginTop:22,paddingTop:10,borderTop:'1px solid #E7E1D2',fontSize:10.5,color:'#6B6455'}}>{solo?'GrinderBank':'PoolGG'} · gerado pelo app · valores financeiros vêm dos lançamentos; estatísticas de jogo vêm dos hand histories importados.</div>
        </div>
      </div>;
    })()}

    {/* modal adicionar */}
    {modal&&(()=>{const type=typeof modal==='string'?modal:modal.type; const initial=typeof modal==='object'?modal.initial:null;
      if(type==='transfer') return <AddModal title="Nova transferência" fields={FIELDS.transfer} initial={initial} onClose={()=>setModal(null)} onSave={addTransfer}/>;
      const [list,setter]=MODAL_STATE[type]; return (
      <AddModal title={`Novo ${MODAL_TITLE[type]}`} fields={FIELDS[type]} initial={initial} onClose={()=>setModal(null)} aviso={type==='tour'?stopBatido:null}
        onSave={d=>add(MODAL_TABLE[type],normalizeRow(type,d),setter,list)}/>);})()}

    {/* modal editar */}
    {editing&&(()=>{const [list,setter]=MODAL_STATE[editing.type]; return (
      <AddModal title={`Editar ${MODAL_TITLE[editing.type]}`} fields={FIELDS[editing.type]} editing={editing.item} onClose={()=>setEditing(null)}
        onEdit={d=>update(MODAL_TABLE[editing.type],normalizeRow(editing.type,d),setter,list)}/>);})()}

    {/* modal quick edit (config) */}
    {hhDono&&<div style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60,padding:16}}>
      <Card data-hh-dono role="dialog" aria-label="De quem são essas mãos?" style={{padding:22,width:'100%',maxWidth:430}}>
        <div style={{fontWeight:800,fontSize:16.5}}>De quem são essas mãos?</div>
        <div style={{fontSize:13.5,color:C.inkSoft,marginTop:6,lineHeight:1.55}}>{hhDono.n} dos {hhDono.total} torneios dessas mãos já estão lançados no nome de <b style={{color:C.ink}}>{hhDono.outro}</b>, mas o import está no nome de <b style={{color:C.ink}}>{hhDono.player}</b>. Mãos no jogador errado trocam as estatísticas dos dois.</div>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:16}}>
          <button onClick={()=>hhDono.res(hhDono.outro)} style={{padding:'13px 0',borderRadius:13,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:14.5,cursor:'pointer'}}>Importar no nome de {hhDono.outro}</button>
          <button onClick={()=>hhDono.res(hhDono.player)} style={{padding:'12px 0',borderRadius:13,border:`1.5px solid ${C.border}`,background:'transparent',color:C.ink,fontWeight:700,fontSize:14,cursor:'pointer'}}>São de {hhDono.player} mesmo</button>
          <button onClick={()=>hhDono.res('cancelar')} style={{padding:'10px 0',borderRadius:13,border:'none',background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:13.5,cursor:'pointer'}}>Cancelar o import</button>
        </div>
      </Card></div>}
    {quickEdit&&<QuickEditModal label={quickEdit.label} hint={quickEdit.hint} kind={quickEdit.kind} currentValue={quickEdit.current} onClose={()=>setQuickEdit(null)} onSave={quickEdit.onSave}/>}

    {/* modal trocar senha */}
    {changePass&&<ChangePassModal email={session.user.email} onClose={()=>setChangePass(false)}/>}

    {/* modal excluir conta (LGPD) */}
    {delAcc&&<DeleteAccountModal nickname={myName} onClose={()=>setDelAcc(false)}/>}

    {/* iPhone/iPad: passo a passo pra adicionar à tela inicial (não dá pra instalar por código) */}
    {iosHelp&&<div onClick={()=>setIosHelp(false)} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.55)',backdropFilter:'blur(3px)',display:'grid',placeItems:'center',zIndex:70,padding:18}}>
      <Card onClick={e=>e.stopPropagation()} className="ftfade" style={{padding:26,maxWidth:400,width:'100%'}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:6}}><span style={{width:52,height:52,borderRadius:16,background:C.plumSoft,display:'grid',placeItems:'center',color:P}}><IcoChip s={28}/></span></div>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:700,margin:'0 0 12px',textAlign:'center'}}>Instalar no iPhone</h3>
        <div style={{fontSize:13.5,color:C.ink,lineHeight:1.7}}>
          <div style={{display:'flex',gap:10,marginBottom:10}}><b style={{color:P}}>1.</b><span>No Safari, toque no botão <b>Compartilhar</b> (o quadrado com a seta pra cima ↑), na barra de baixo.</span></div>
          <div style={{display:'flex',gap:10,marginBottom:10}}><b style={{color:P}}>2.</b><span>Role e toque em <b>“Adicionar à Tela de Início”</b>.</span></div>
          <div style={{display:'flex',gap:10}}><b style={{color:P}}>3.</b><span>Confirme em <b>“Adicionar”</b>. Pronto — o GrinderBank vira um ícone e abre em tela cheia.</span></div>
        </div>
        <button onClick={()=>{setIosHelp(false); dispensarInstall();}} style={{marginTop:18,width:'100%',padding:'14px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:15.5,cursor:'pointer'}}>Entendi</button>
      </Card>
    </div>}

    {/* prévia do import de resumos: nada entra no banco antes de o jogador conferir aqui */}
    {tsImp.preview&&(()=>{
      const pv=tsImp.preview, entrando=[...pv.novos,...pv.completa];
      const inv=entrando.reduce((s,x)=>s+totalInvestido(tsEfetivo(x)),0);
      const nConf=pv.completa.filter(x=>tsMesclar(x.atual,x.linha).conflitos.length).length;
      const nBilhete=entrando.filter(x=>x.linha.ticket).length;
      const nSat=entrando.filter(x=>!x.linha.ticket&&x.r.satelite).length;
      const prem=entrando.reduce((s,x)=>s+num(tsEfetivo(x).prize)+bountyTorneio(tsEfetivo(x)),0);
      const dias=[...new Set(entrando.map(x=>x.linha.entry_date))].sort();
      const nada=entrando.length===0;
      return <div onClick={()=>setTsImp(s=>({...s,preview:null}))} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:60}}>
        <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:540,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',maxHeight:'86vh',overflowY:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>Confere antes de salvar</h3>
            <button onClick={()=>setTsImp(s=>({...s,preview:null}))} style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
          </div>
          <div style={{fontSize:12.5,color:C.inkSoft,marginBottom:14}}>{pv.arquivos} arquivo{pv.arquivos!==1?'s':''} lido{pv.arquivos!==1?'s':''}{!solo&&<> · lançando para <b style={{color:C.ink}}>{pv.player}</b></>}. Nada foi salvo ainda.</div>

          {nada
            ? <Empty>{pv.repetidos.length?`Esses ${pv.repetidos.length} torneios já estão no sistema — nada novo pra lançar.`:'Nenhum torneio pra lançar nesses arquivos.'}</Empty>
            : <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                <div style={{padding:'11px 13px',borderRadius:12,background:C.plumSoft}}><div style={{fontSize:10.5,color:P,fontWeight:800,textTransform:'uppercase'}}>Vão entrar</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,color:P}}>{entrando.length} torneio{entrando.length!==1?'s':''}</div><div style={{fontSize:11.5,color:C.inkSoft,marginTop:1}}>{dias.length} dia{dias.length!==1?'s':''} · {dLabel(dias[0])} a {dLabel(dias[dias.length-1])}</div></div>
                <div style={{padding:'11px 13px',borderRadius:12,background:prem-inv>=0?C.greenSoft:C.redSoft}}><div style={{fontSize:10.5,color:prem-inv>=0?C.green:C.red,fontWeight:800,textTransform:'uppercase'}}>Resultado</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,color:prem-inv>=0?C.greenMid:C.red,whiteSpace:'nowrap'}}>{prem-inv>=0?'+':'−'}{fmt(Math.abs(prem-inv))}</div><div style={{fontSize:11.5,color:C.inkSoft,marginTop:1}}>investido {fmt(inv)} · prêmios {fmt(prem)}</div></div>
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12,fontSize:11.5,fontWeight:700}}>
                {pv.novos.length>0&&<span style={{padding:'4px 10px',borderRadius:99,background:C.greenSoft,color:C.green}}>{pv.novos.length} novo{pv.novos.length!==1?'s':''}</span>}
                {pv.completa.length>0&&<span style={{padding:'4px 10px',borderRadius:99,background:C.goldSoft,color:C.gold}}>{pv.completa.length} completa{pv.completa.length!==1?'m':''} um lançamento seu</span>}
                {pv.repetidos.length>0&&<span style={{padding:'4px 10px',borderRadius:99,background:C.bg,color:C.inkSoft}}>{pv.repetidos.length} já no sistema</span>}
                {nBilhete>0&&<span style={{padding:'4px 10px',borderRadius:99,background:C.plumSoft,color:P}}>🎟 {nBilhete} com bilhete</span>}
              </div>
              {nConf>0&&<div style={{padding:'10px 12px',borderRadius:12,background:C.goldSoft,fontSize:12.5,color:C.ink,marginBottom:12,lineHeight:1.5}}>
                ✋ <b>{nConf} lançamento{nConf!==1?'s':''} seu{nConf!==1?'s':''} com valor diferente do arquivo.</b> Nada que você digitou muda sem você escolher. <button onClick={()=>escolherResumo(null,null,'arquivo')} style={{border:'none',background:'transparent',color:C.gold,fontWeight:800,cursor:'pointer',textDecoration:'underline',padding:0,fontSize:12.5}}>usar o do arquivo em todos</button> · <button onClick={()=>escolherResumo(null,null,'digitado')} style={{border:'none',background:'transparent',color:C.inkSoft,fontWeight:700,cursor:'pointer',textDecoration:'underline',padding:0,fontSize:12.5}}>manter os digitados</button></div>}
              {nSat>0&&<div style={{padding:'9px 11px',borderRadius:12,background:C.goldSoft,fontSize:12,color:C.ink,marginBottom:12,lineHeight:1.5}}>🎟 <b>{nSat} com cara de satélite.</b> O arquivo do site não diz se você entrou com bilhete — se entrou, toque no 🎟 da linha pra não contar o buy-in duas vezes.</div>}
              {pv.fora.length>0&&<div style={{padding:'10px 12px',borderRadius:12,background:C.redSoft,fontSize:12.5,color:C.ink,marginBottom:12,lineHeight:1.5}}>⚠️ <b>{pv.fora.length} torneio{pv.fora.length!==1?'s':''} fora da grade</b> ({(()=>{ const sg=statusGrade({...pv.fora[0].linha,player:pv.player},config); return sg.porGrade?sg.motivo+(pv.fora.length>1?' e outros':''):`${pv.fora.map(x=>fmt(x.linha.buyin)).filter((v,i,a)=>a.indexOf(v)===i).join(', ')} · teto ${fmt(sg.teto)}`; })()}). Vão entrar assim mesmo — o registro é do que aconteceu.</div>}
              {dias.map(d=>{
                const doDia=entrando.filter(x=>x.linha.entry_date===d);
                const rd=doDia.reduce((s,x)=>s+lucroTorneio(tsEfetivo(x)),0);
                return <div key={d} style={{marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:800,color:C.gold,textTransform:'uppercase',letterSpacing:'.05em'}}>{dLabel(d)}</span>
                    <span style={{fontSize:11.5,color:C.inkSoft}}>{doDia.length} torneio{doDia.length!==1?'s':''}</span>
                    <span style={{marginLeft:'auto',fontWeight:800,fontSize:13.5,color:rd>=0?C.greenMid:C.red}}>{rd>=0?'+':'−'}{fmt(Math.abs(rd))}</span>
                  </div>
                  {doDia.map(x=><div key={x.linha.site_tournament_id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:`1px solid ${C.border}`}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{x.linha.tournament_name}{x.atual&&<span style={{color:C.gold,fontWeight:700,fontSize:11}}> · completa o seu</span>}</div>
                      <div style={{fontSize:11.5,color:C.inkSoft}}>buy-in {fmt(x.linha.buyin)}{x.linha.reentries>0?` · ${x.linha.reentries} re-entry${x.linha.reentries!==1?'s':''}`:''} · {x.linha.modality} · {x.linha.final_position?`${x.linha.final_position}º de ${x.linha.field_size}`:`${x.linha.field_size} jogadores`}</div>
                      <button onClick={()=>marcarBilhete(x.linha.site_tournament_id)} style={{marginTop:4,padding:'3px 9px',borderRadius:99,cursor:'pointer',fontSize:10.5,fontWeight:800,
                        border:`1.5px solid ${x.linha.ticket?P:(x.r.satelite?C.gold:C.border)}`,background:x.linha.ticket?C.plumSoft:'transparent',color:x.linha.ticket?P:(x.r.satelite?C.gold:C.inkSoft)}}>
                        {x.linha.ticket?'🎟 BILHETE · não saiu dinheiro':(x.r.satelite?'🎟 parece satélite — entrou com bilhete?':'🎟 entrei com bilhete')}</button>
                      {x.atual&&tsMesclar(x.atual,x.linha).conflitos.map(c=>{ const usaArq=(x.escolhas||{})[c.campo]==='arquivo'; const nome={prize:'Prêmio',bounty:'Bounty',reentries:'Re-entries'}[c.campo]; const v=n=>c.campo==='reentries'?String(n):fmt(n);
                        return <div key={c.campo} style={{marginTop:4,fontSize:11.5,color:C.ink,display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                          <span>✋ {nome}: você digitou <b>{v(c.digitado)}</b> · arquivo <b>{v(c.arquivo)}</b></span>
                          <button onClick={()=>escolherResumo(x.linha.site_tournament_id,c.campo,usaArq?'digitado':'arquivo')} style={{padding:'2px 8px',borderRadius:99,cursor:'pointer',fontSize:10.5,fontWeight:800,border:`1.5px solid ${usaArq?C.gold:C.border}`,background:usaArq?C.goldSoft:'transparent',color:usaArq?C.gold:C.inkSoft}}>{usaArq?'vai usar o do arquivo':'mantém o digitado'}</button>
                        </div>; })}
                    </div>
                    {(()=>{ const ef=tsEfetivo(x), ganho=num(ef.prize)+bountyTorneio(ef); return <span style={{fontWeight:800,fontSize:13.5,flexShrink:0,color:ganho>0?C.greenMid:C.inkSoft}}>{ganho>0?fmt(ganho):'—'}</span>; })()}
                  </div>)}
                </div>;
              })}
            </>}
          {pv.issues.length>0&&<div style={{fontSize:12,color:C.red,lineHeight:1.5,marginTop:4}}>{pv.issues.map((x,i)=><div key={i}>• {x}</div>)}</div>}
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button onClick={()=>setTsImp(s=>({...s,preview:null}))} style={{flex:1,padding:'13px 16px',borderRadius:13,border:`1.5px solid ${C.border}`,background:C.surface,color:C.inkSoft,fontWeight:700,fontSize:14.5,cursor:'pointer'}}>Cancelar</button>
            {!nada&&<button onClick={salvarResumos} disabled={tsImp.busy} style={{flex:2,padding:'13px 16px',borderRadius:13,border:'none',background:tsImp.busy?C.bg:P,color:tsImp.busy?C.inkSoft:'#fff',fontWeight:700,fontSize:14.5,cursor:tsImp.busy?'default':'pointer'}}>{tsImp.busy?'Salvando…':`Salvar ${entrando.length} torneio${entrando.length!==1?'s':''}`}</button>}
          </div>
        </div>
      </div>;
    })()}

    {/* detalhe do alerta (fora da grade: quais torneios e de quem) */}
    {alertDetail&&<div onClick={()=>setAlertDetail(null)} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:55}}>
      <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:480,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',maxHeight:'80vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0,display:'flex',alignItems:'center',gap:8}}><span style={{color:C.red}}><IcoAlert s={20}/></span>Fora da grade</h3>
          <button onClick={()=>setAlertDetail(null)} aria-label="Fechar" style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
        </div>
        <div style={{fontSize:13,color:C.inkSoft,marginBottom:12,lineHeight:1.5}}>Torneios desta semana (desde {dataBR(iniSemana)}) fora da grade.{somenteLeitura?'':` ${toque?'Toque':'Clique'} no lápis pra corrigir.`}</div>
        {sortByCreated(alertDetail.items||[]).map(t=><Row key={t.id} onEdit={somenteLeitura?null:()=>{setAlertDetail(null);editTour(t);}} onDelete={somenteLeitura?null:()=>{delTour(t); setAlertDetail(d=>d&&{...d,items:d.items.filter(x=>x.id!==t.id)});}}
          left={<><span style={{width:38,height:38,borderRadius:11,background:C.redSoft,display:'grid',placeItems:'center',flexShrink:0,color:C.red}}><IcoTrophy s={18}/></span>
            <div style={{minWidth:0}}><div style={{fontWeight:700,fontSize:14.5}}>{t.tournament_name||'Torneio'} <span style={{color:PLAYER_COLORS[players.indexOf(t.player)]||C.inkSoft,fontWeight:700}}>· {t.player}</span></div>
            <div style={{fontSize:12,color:C.inkSoft,marginTop:2}}>{dLabel(t.entry_date)} · buy-in {fmt(t.buyin)} <span style={{color:C.red,fontWeight:700}}>({statusGrade(t,config).motivo})</span></div></div></>}
          right={<span style={{fontWeight:800,fontSize:15,color:lucroTorneio(t)>=0?C.greenMid:C.red,flexShrink:0}}>{lucroTorneio(t)>=0?'+':'−'}{fmt(Math.abs(lucroTorneio(t)))}</span>}/>)}
        {(!alertDetail.items||!alertDetail.items.length)&&<Empty>Tudo certo agora — nenhum torneio fora da grade.</Empty>}
      </div>
    </div>}

    {/* aviso pro próprio jogador que acabou de lançar fora da grade */}
    {gradeWarn&&<div onClick={()=>setGradeWarn(null)} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.5)',backdropFilter:'blur(3px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60,padding:20}}>
      <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:400,borderRadius:22,padding:24,textAlign:'center'}}>
        <div style={{width:56,height:56,borderRadius:18,background:C.redSoft,color:C.red,display:'grid',placeItems:'center',margin:'0 auto 14px'}}><IcoAlert s={30}/></div>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,margin:'0 0 8px'}}>{gradeWarn.items.length>1?`${gradeWarn.items.length} torneios fora da grade`:'Atenção — fora da grade!'}</h3>
        {(()=>{
          const it=gradeWarn.items, um=it[0], teto=abiMaxFor(config,um.player,um.entry_date), sg=statusGrade(um,config);
          if(sg.porGrade) return <>
            <p style={{fontSize:14,color:C.inkSoft,lineHeight:1.6,margin:'0 0 12px'}}>
              {it.length>1?<>Você lançou <b>{it.length} torneios</b> fora da grade da sua reta.</>:<>{um.tournament_name||'Esse torneio'} ({fmt(um.buyin)}): <b style={{color:C.red}}>{sg.motivo}</b>.</>}
            </p>
            {it.length>1&&<div style={{textAlign:'left',maxHeight:150,overflowY:'auto',marginBottom:12,fontSize:12.5,color:C.inkSoft,lineHeight:1.6}}>
              {it.slice(0,8).map((t,i)=><div key={i} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>· {t.tournament_name||'Torneio'} — <b style={{color:C.red}}>{statusGrade(t,config).motivo}</b></div>)}
              {it.length>8&&<div>… e mais {it.length-8}</div>}
            </div>}
            <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.55,padding:'10px 12px',borderRadius:12,background:C.bg,textAlign:'left',marginBottom:16}}>
              {sg.simulada?<>A grade da sua reta ainda é <b>simulada</b> (montada sem a planilha oficial): confirme com o professor.</>:<>A grade é a da sua reta, definida pelo time. Se o professor liberou esse torneio, ele atualiza a grade na aba Time.</>}
            </div>
          </>;
          return <>
            <p style={{fontSize:14,color:C.inkSoft,lineHeight:1.6,margin:'0 0 12px'}}>
              {it.length>1
                ? <>Você lançou <b>{it.length} torneios</b> com buy-in acima {solo?'do seu teto':`do teto de ${um.player.split(' ')[0]}`} de <b style={{color:C.red}}>{fmt(teto)}</b>.</>
                : <>Esse torneio ({um.tournament_name||'buy-in'} {fmt(um.buyin)}) está <b style={{color:C.red}}>acima {solo?'do seu teto':`do teto de ${um.player.split(' ')[0]}`}</b> ({fmt(teto)}).</>}
            </p>
            {it.length>1&&<div style={{textAlign:'left',maxHeight:150,overflowY:'auto',marginBottom:12,fontSize:12.5,color:C.inkSoft,lineHeight:1.6}}>
              {it.slice(0,8).map((t,i)=><div key={i} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>· {t.tournament_name||'Torneio'} — <b style={{color:C.red}}>{fmt(t.buyin)}</b></div>)}
              {it.length>8&&<div>… e mais {it.length-8}</div>}
            </div>}
            {/* o teto errado é a causa nº1 desse aviso em massa no primeiro uso */}
            <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.55,padding:'10px 12px',borderRadius:12,background:C.bg,textAlign:'left',marginBottom:16}}>
              {it.length>2
                ? <>Se <b>é assim que você joga mesmo</b>, o teto é que está desatualizado — ajuste em <b>Ajustes → ABI máximo</b> e o aviso para. Se não é, esse é o freio funcionando.</>
                : (solo?<>Manter a grade é o que segura a banca no longo prazo — evita subir de stake no impulso.</>
                       :<>Isso fura a gestão da pool. O outro jogador foi avisado.</>)}
            </div>
          </>;
        })()}
        <button onClick={()=>setGradeWarn(null)} style={{width:'100%',padding:'14px 0',borderRadius:14,border:'none',background:C.red,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer'}}>Entendi</button>
      </div>
    </div>}

    {/* confirmação de mudança nos Ajustes (fica registrada e o outro jogador é avisado) */}
    {cfgConfirm&&<div style={{position:'fixed',inset:0,background:'rgba(20,18,30,.55)',backdropFilter:'blur(4px)',display:'grid',placeItems:'center',zIndex:60,padding:18}}>
      <Card className="ftfade" style={{padding:26,maxWidth:420,width:'100%'}}>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:'0 0 10px'}}>Confirmar alteração</h3>
        <div style={{fontWeight:700,fontSize:14.5,marginBottom:6}}>{cfgConfirm.row.label}</div>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:12,background:C.bg,fontSize:15,marginBottom:12}}>
          <span style={{color:C.inkSoft,textDecoration:'line-through'}}>{cfgConfirm.oldShow}</span>
          <span style={{color:C.inkSoft}}>→</span>
          <span style={{fontWeight:800,color:P}}>{cfgConfirm.newShow}</span>
        </div>
        <p style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.5,margin:'0 0 16px'}}>A mudança fica registrada no <b>histórico de alterações</b> e o outro jogador recebe um aviso na hora. Torneios antigos continuam sendo julgados pela grade da época.</p>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>setCfgConfirm(null)} style={{flex:1,padding:'13px 0',borderRadius:13,border:`1.5px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:14.5,cursor:'pointer'}}>Cancelar</button>
          <button onClick={confirmSaveConfig} style={{flex:1,padding:'13px 0',borderRadius:13,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:14.5,cursor:'pointer'}}>Confirmar</button>
        </div>
      </Card>
    </div>}

    {/* convite pro tour guiado (1º acesso do solo) */}
    {askTour&&<div style={{position:'fixed',inset:0,background:'rgba(20,18,30,.55)',backdropFilter:'blur(4px)',display:'grid',placeItems:'center',zIndex:65,padding:18}}>
      <Card className="ftfade" style={{padding:26,maxWidth:400,width:'100%',textAlign:'center'}}>
        <div style={{fontSize:38,marginBottom:4}}>👋</div>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:700,margin:'0 0 8px'}}>Quer um tour rápido?</h3>
        <p style={{fontSize:13.5,color:C.inkSoft,lineHeight:1.6,margin:'0 0 16px'}}>Em 1 minuto eu te mostro cada tela e o que ela faz. Dá pra rever depois nos Ajustes.</p>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>{setAskTour(false); localStorage.setItem('gb_tour','1');}} style={{flex:1,padding:'13px 0',borderRadius:13,border:`1.5px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:14,cursor:'pointer'}}>Agora não</button>
          <button onClick={()=>{setAskTour(false); setTour(1); setView(TOUR_STEPS[0].v);}} style={{flex:1,padding:'13px 0',borderRadius:13,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer'}}>Sim, me guia!</button>
        </div>
      </Card>
    </div>}

    {/* tour guiado: cartão fixo que navega tela a tela */}
    {tour>0&&(()=>{ const i=tour-1, st=TOUR_STEPS[i], last=i===TOUR_STEPS.length-1;
      const fim=()=>{ setTour(0); localStorage.setItem('gb_tour','1'); };
      return <div style={{position:'fixed',left:0,right:0,bottom:'calc(84px + env(safe-area-inset-bottom))',display:'flex',justifyContent:'center',zIndex:66,padding:'0 14px',pointerEvents:'none'}}>
        <Card className="ftfade" style={{pointerEvents:'auto',padding:'16px 18px',maxWidth:440,width:'100%',border:`1.5px solid ${P}`,boxShadow:'0 14px 40px -14px rgba(76,62,146,.5)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
            <span style={{fontSize:10.5,fontWeight:800,color:P,background:C.plumSoft,padding:'2px 9px',borderRadius:99}}>TOUR · {tour} de {TOUR_STEPS.length}</span>
            <button onClick={fim} style={{marginLeft:'auto',border:'none',background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:12,cursor:'pointer'}}>Pular tour</button>
          </div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16.5,fontWeight:700}}>{st.t}</div>
          <div style={{fontSize:13,color:C.inkSoft,lineHeight:1.55,margin:'4px 0 12px'}}>{st.x}</div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <div style={{display:'flex',gap:4,flex:1}}>{TOUR_STEPS.map((_,d)=><span key={d} style={{width:7,height:7,borderRadius:99,background:d<=i?P:C.border}}/>)}</div>
            {i>0&&<button onClick={()=>{setTour(tour-1); setView(TOUR_STEPS[i-1].v);}} style={{padding:'10px 16px',borderRadius:11,border:`1.5px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:700,fontSize:13,cursor:'pointer'}}>Voltar</button>}
            <button onClick={()=>{ if(last){fim();} else {setTour(tour+1); setView(TOUR_STEPS[i+1].v);} }} style={{padding:'10px 20px',borderRadius:11,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>{last?'Concluir ✓':'Próximo'}</button>
          </div>
        </Card>
      </div>;
    })()}

  </div>;
}

/* ---------- raiz ---------- */
function App(){
  const [session,setSession]=useState(undefined);
  const [profile,setProfile]=useState(undefined);
  const [recovery,setRecovery]=useState(false);   // veio pelo link "esqueci minha senha"
  const [linkAviso,setLinkAviso]=useState('');     // link do e-mail vencido/usado
  const [gg,setGg]=useState(undefined);            // gestor geral da plataforma (o servidor diz): abre o console, sem nada de jogador
  useEffect(()=>{
    if(!sb) return;
    sb.auth.getSession().then(({data})=>setSession(data.session));
    const {data:sub}=sb.auth.onAuthStateChange((e,s)=>{ setSession(s); if(e==='PASSWORD_RECOVERY') setRecovery(true); });
    // veio do link do e-mail: confirma o código (cadastro entra logado; senha abre a troca)
    if(LINK_EMAIL){
      const aviso='Esse link do e-mail venceu ou já foi usado. Entre com seu e-mail e senha. Se era pra trocar a senha, peça outro em "Esqueci minha senha".';
      if(LINK_EMAIL.invalido) setLinkAviso(aviso);
      else sb.auth.verifyOtp(LINK_EMAIL).then(({error})=>{ if(error) setLinkAviso(aviso); }).catch(()=>setLinkAviso(aviso));
    }
    return ()=>sub.subscription.unsubscribe();
  },[]);
  // primeiro acesso: carrega o perfil do jogador; sem senha trocada, cai no cadastro
  useEffect(()=>{
    if(!session){ setProfile(undefined); return; }
    let on=true;
    (async()=>{
      const {data}=await sb.from('player_profiles').select('*').eq('user_id',session.user.id).maybeSingle();
      if(!on) return;
      // o espelho do e-mail no perfil é mantido pelo SERVIDOR (trigger a partir do auth) — o app não grava mais (F0.5)
      // cadastro pendente (conta confirmada por e-mail, ou passo do cadastro que falhou):
      // completa perfil + workspace sozinho com o apelido/WhatsApp guardados no aparelho
      if(!data){
        let pend=null; try{ pend=JSON.parse(localStorage.getItem('gb_signup')||'null'); }catch(e){}
        if(pend&&pend.nickname){
          const {data:novo,error:pe}=await sb.from('player_profiles').insert({user_id:session.user.id,email:session.user.email,nickname:pend.nickname,whatsapp:pend.whatsapp||null,password_changed:true,role:'solo'}).select().single();
          if(!pe&&novo){
            try{ localStorage.removeItem('gb_signup'); }catch(e){}
            if(!conviteGuardado()) try{ await sb.rpc('create_solo_workspace',{ws_name:pend.nickname,plan_escolhido:pend.plan||'gestao'}); }catch(e){ console.error(e); }
            if(on) setProfile(novo);
            return;
          }
          // apelido foi levado nesse meio-tempo: solta o pendente e deixa a pessoa escolher outro
          if(pe&&pe.code==='23505'){ try{ localStorage.removeItem('gb_signup'); }catch(e){} } else if(pe) console.error(pe);
        }
      }
      setProfile(data||null);
    })();
    return ()=>{on=false;};
  },[session]);
  // conta central: o servidor diz se é gestor geral (ninguém se promove pelo app)
  useEffect(()=>{
    if(!session){ setGg(undefined); return; }
    let on=true;
    (async()=>{ try{ const {data,error}=await sb.rpc('sou_gestor_geral'); if(on) setGg(!error&&data===true); }catch(e){ if(on) setGg(false); } })();
    return ()=>{on=false;};
  },[session]);
  if(!CONFIGURED) return <NotConfigured/>;
  // veio do link "esqueci minha senha": trava TUDO até criar a senha nova (sem fechar, sem pular)
  if(recovery) return <RecoveryReset/>;
  if(session===undefined) return <div style={{minHeight:'100vh',display:'grid',placeItems:'center'}}><div className="spin"/></div>;
  if(!session) return <Login aviso={linkAviso}/>;
  if(gg===undefined) return <div style={{minHeight:'100vh',display:'grid',placeItems:'center'}}><div className="spin"/></div>;
  if(gg) return <ConsolePlataforma session={session}/>;
  if(profile===undefined) return <div style={{minHeight:'100vh',display:'grid',placeItems:'center'}}><div className="spin"/></div>;
  if(!profile || !profile.password_changed) return <Onboarding session={session} profile={profile} onDone={setProfile}/>;
  return <Dashboard session={session} profile={profile}/>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
