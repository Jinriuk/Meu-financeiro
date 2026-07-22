const { useState, useMemo, useEffect } = React;

/* ---------- config / cliente ---------- */
const CONFIGURED = window.SUPABASE_URL && !window.SUPABASE_URL.startsWith("COLE_AQUI");
const sb = CONFIGURED ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;

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
const abrirCheckout=(plano,ciclo,email)=>{
  const c=CHECKOUT[plano==='gestao'?'gestao':'pro'];
  window.open((c[ciclo]||c.mensal)+(email?`&email=${encodeURIComponent(email)}`:''),'_blank');
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
const fmt = n => (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'USD'});
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
const abiMedioDia  = e => { const ent=num(e.qtd_entradas)||num(e.qtd_torneios); return ent>0 ? num(e.total_buyins)/ent : 0; };
function gradeStatus(e, abiMax){
  if(num(e.maior_buyin) > abiMax) return 'FORA DA GRADE';
  if((num(e.qtd_entradas)||num(e.qtd_torneios))>0 && abiMedioDia(e) >= abiMax*0.9) return 'ATENÇÃO';
  return 'OK';
}
const totalInvestido = t => num(t.buyin)*(1+num(t.reentries));
const lucroTorneio   = t => num(t.prize)-totalInvestido(t);
// ABI máximo por jogador (cada um tem seu limite de grade); cai no padrão se não definido.
// Com `date`, devolve o ABI vigente NAQUELE dia: desfaz as mudanças registradas depois dele —
// torneio antigo é julgado pela grade da época, não pela atual.
let CONFIG_CHANGES=[];   // histórico de alterações dos Ajustes (carregado do banco pelo Dashboard)
const abiMaxFor = (config, player, date) => {
  const key = player===config.player2_name ? 'abi_max_player2' : 'abi_max_player1';
  let v = num(config[key]);
  if(!(v>0)) v = num(config.abi_max)||2;
  if(date){
    const hist=CONFIG_CHANGES.filter(c=>c.field===key).sort((a,b)=>a.created_at<b.created_at?1:-1);
    for(const c of hist){ if(String(c.created_at).slice(0,10)>date && num(c.old_value)>0) v=num(c.old_value); }
  }
  return v;
};
// monta o "Diário" a partir dos torneios: 1 linha por jogador por dia (fonte da verdade = torneios)
function deriveDaily(tours){
  const map={};
  tours.forEach(t=>{
    const k=t.player+'|'+t.entry_date;
    if(!map[k]) map[k]={id:k, entry_date:t.entry_date, player:t.player, qtd_torneios:0, qtd_entradas:0, total_buyins:0, maior_buyin:0, maior_premiacao:0, resultado:0};
    const m=map[k], inv=totalInvestido(t);
    m.qtd_torneios+=1;
    m.qtd_entradas+=1+num(t.reentries);
    m.total_buyins+=inv;
    m.maior_buyin=Math.max(m.maior_buyin, num(t.buyin));
    m.maior_premiacao=Math.max(m.maior_premiacao, num(t.prize));
    m.resultado+=num(t.prize)-inv;
  });
  return Object.values(map).sort((a,b)=>a.entry_date<b.entry_date?1:-1);
}
function tourStatus(t, abiMax){
  if(num(t.buyin) > abiMax) return 'FORA DA GRADE';
  if(num(t.reentries)>0 || num(t.field_size)>200) return 'ATENÇÃO';
  return 'OK';
}
// Processa as semanas em ordem cronológica, carregando o make-up de uma pra outra.
function computeWeeks(daily, config){
  const players=[config.player1_name, config.player2_name];
  const makeInit={[config.player1_name]:num(config.makeup_inicial_player1),[config.player2_name]:num(config.makeup_inicial_player2)};
  const out={};
  players.forEach(p=>{
    const entries=daily.filter(e=>e.player===p);
    const weeks=[...new Set(entries.map(e=>weekEnding(e.entry_date)))].sort();
    let makeUp=makeInit[p]||0;
    out[p]=weeks.map(wk=>{
      const wkEntries=entries.filter(e=>weekEnding(e.entry_date)===wk);
      const resultado=wkEntries.reduce((s,e)=>s+resultadoDia(e),0);
      const makeAnterior=makeUp;
      const makeFinal=Math.max(0, makeAnterior-resultado);
      const lucroDiv=Math.max(0, resultado-makeAnterior);
      const parteJog=lucroDiv*num(config.player_pct);
      const partePool=lucroDiv*(1-num(config.player_pct));
      const saqueAut=makeFinal===0 ? parteJog : 0;
      makeUp=makeFinal;
      return {week:wk, player:p, resultado, makeAnterior, makeFinal, lucroDiv, parteJog, partePool, saqueAut, entries:wkEntries};
    });
  });
  return out;
}
function saqueStatus(w, bancaAtual, piso, valorSacado){
  if(w.makeFinal>0) return 'Bloqueado por make-up';
  if(w.saqueAut===0) return 'Sem valor a sacar';
  if(bancaAtual - w.saqueAut < piso) return 'Bloqueado por banca abaixo do piso';
  if(valorSacado===0) return 'Autorizado';
  if(valorSacado < w.saqueAut) return 'Parcialmente autorizado';
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
const HH_BUILD='2026-07-17.2';   // aparece no card de import e no diagnóstico (pra saber que versão a pessoa está rodando)
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
  let buyin=0; (seg.match(/\$\s?[\d.,]+/g)||[]).forEach(x=>buyin+=hhNum(x));
  const tname=((seg.split(/(?:Tournament|Torneio) #[^,]+,\s*/)[1]||'').replace(/\$\s?[\d.,]+/g,'').replace(/USD|EUR|CNY|\+/g,'').trim().replace(/[,\s]+$/,''))||null;

  let button=0; const seats=[]; let hero=null, heroCards=null;
  let street=0; const board=[]; const acts=[]; const invested={}, collected={}, shows={};
  let commit={}; let showdown=false, inSummary=false;
  const addInv=(n,x)=>{ invested[n]=(invested[n]||0)+x; };
  const ACT_PT={desiste:'folds',passa:'checks',iguala:'calls',aposta:'bets',aumenta:'raises'};
  for(let i=hi;i<lines.length;i++){
    const L=lines[i]; let m;
    if(/\*\*\* (SUMMARY|SUMÁRIO)/.test(L)){ inSummary=true; continue; }   // às vezes vem colado no fim de outra linha
    if(inSummary) continue;
    if(m=L.match(/(?:Seat|Lugar) #(\d+) (?:is the button|é o botão)/)){ button=+m[1]; continue; }
    if(m=L.match(/^(?:Seat|Lugar) (\d+): (.+?) \(\$?\s?([\d,.]+) (?:in chips|em fichas)/)){ seats.push({seat:+m[1],n:m[2],chips:hhNum(m[3])}); continue; }
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
    if(m=L.match(/^(.+?): (?:posts (?:the )?ante|coloca ante) \$?\s?([\d,.]+)/)){ addInv(m[1],hhNum(m[2])); continue; }
    if(m=L.match(/^(.+?): (?:posts|paga o) (?:small|big) blind \$?\s?([\d,.]+)/)){ addInv(m[1],hhNum(m[2])); commit[m[1]]=(commit[m[1]]||0)+hhNum(m[2]); continue; }
    if(m=L.match(/^(.+?): (?:posts|paga)\b.*?([\d,.]+)$/)){ addInv(m[1],hhNum(m[2])); continue; }   // straddle/dead blind
    if(m=L.match(/^(.+?): (folds|checks|calls|bets|raises|desiste|passa|iguala|aposta|aumenta)\b\s*\$?\s?([\d,.]*)(?:\s+(?:to|para)\s+\$?\s?([\d,.]+))?/)){
      const n=m[1],act=ACT_PT[m[2]]||m[2],allin=/and is all[- ]in|e está all-in/.test(L);
      if(act==='calls'||act==='bets'){ const x=hhNum(m[3]); addInv(n,x); commit[n]=(commit[n]||0)+x; }
      if(act==='raises'){ const to=hhNum(m[4]||m[3]); addInv(n,Math.max(0,to-(commit[n]||0))); commit[n]=to; }
      acts.push({n,act,street,allin});
      continue;
    }
  }
  if(!hero||!heroCards||heroCards.length!==2||heroCards.some(c=>c<0)) return skip('incompleta');
  if(!seats.some(s=>s.n===hero)) return skip('incompleta');

  const heroInv=invested[hero]||0, heroCol=collected[hero]||0, net=heroCol-heroInv;
  // posições (relativas ao botão)
  const order=seats.slice().sort((a,b)=>a.seat-b.seat);
  let bi=order.findIndex(s=>s.seat===button); if(bi<0) bi=0;
  const nP=order.length, after=i=>order[(bi+i)%nP].n;
  const posMap={};
  if(nP===2){ posMap[after(0)]='BTN'; posMap[after(1)]='BB'; }
  else { posMap[after(0)]='BTN'; posMap[after(1)]='SB'; posMap[after(2)]='BB';
    for(let i=3;i<nP;i++){ const d=nP-i; posMap[after(i)]=d===1?'CO':d===2?'MP':'EP'; } }
  const heroPos=posMap[hero]||'EP';
  // pré-flop: sequência
  const pre=acts.filter(a=>a.street===0);
  let raises=0, firstRaiser=null, lastRaiser=null, heroRaised=false, pendingF3b=false;
  let heroActedPre=false, foldedToHero=true, callersBefore=0, heroFoldedPre=false;
  let vpip=false,pfr=false,tbOpp=false,tb=false,f3bOpp=false,f3b=false,stealOpp=false,steal=false,bbdefOpp=false,bbdef=false;
  for(const a of pre){
    if(a.n===hero){
      if(pendingF3b&&!f3bOpp){ f3bOpp=true; f3b=(a.act==='folds'); pendingF3b=false; }
      if(!heroActedPre){
        heroActedPre=true;
        if(nP>=3&&raises===0&&callersBefore===0&&foldedToHero&&['CO','BTN','SB'].includes(heroPos)){ stealOpp=true; if(a.act==='raises') steal=true; }
        if(raises===1&&lastRaiser!==hero){ tbOpp=true; if(a.act==='raises') tb=true; }
        if(nP>=3&&heroPos==='BB'&&raises===1&&['CO','BTN','SB'].includes(posMap[firstRaiser])&&callersBefore===0){ bbdefOpp=true; if(a.act==='calls'||a.act==='raises') bbdef=true; }
      }
      if(a.act==='calls'||a.act==='raises') vpip=true;
      if(a.act==='raises') pfr=true;
      if(a.act==='folds') heroFoldedPre=true;
    } else {
      if(!heroActedPre&&a.act!=='folds') foldedToHero=false;
      if(!heroActedPre&&a.act==='calls') callersBefore++;
    }
    if(a.act==='raises'){ raises++; lastRaiser=a.n; if(!firstRaiser) firstRaiser=a.n; if(a.n===hero) heroRaised=true; else if(heroRaised) pendingF3b=true; }
  }
  // flop: c-bet / fold pra c-bet
  const sawflop=board.length>=3&&!heroFoldedPre;
  let cbetOpp=false,cbet=false,fcbOpp=false,fcb=false,betSeen=false,betBy=null;
  if(sawflop&&raises>0){
    for(const a of acts.filter(x=>x.street===1)){
      if(a.n===hero){
        if(lastRaiser===hero&&!betSeen&&!cbetOpp){ cbetOpp=true; cbet=(a.act==='bets'); }
        if(lastRaiser&&lastRaiser!==hero&&betSeen&&betBy===lastRaiser&&!fcbOpp){ fcbOpp=true; fcb=(a.act==='folds'); }
      }
      if(a.act==='bets'&&!betSeen){ betSeen=true; betBy=a.n; }
    }
  }
  const heroFolded=acts.some(a=>a.n===hero&&a.act==='folds');
  // showdown DE VERDADE exige cartas mostradas — a GG imprime o marcador SHOWDOWN em toda mão, até fold-win
  const wtsd=showdown&&!heroFolded&&Object.keys(shows).length>0, wsd=wtsd&&heroCol>0, wwsf=sawflop&&heroCol>0;
  let afB=0,afC=0; acts.forEach(a=>{ if(a.n===hero&&a.street>0){ if(a.act==='bets'||a.act==='raises') afB++; if(a.act==='calls') afC++; } });
  // all-in EV (sorte): só quando o herói foi ao showdown de all-in e os vilões mostraram as cartas
  let allin=null;
  const aiAct=acts.find(a=>a.allin);
  if(aiAct&&wtsd){
    const vils=Object.keys(shows).filter(n=>n!==hero).map(n=>shows[n]).filter(v=>v&&v.length===2);
    if(vils.length){
      const bAt=board.slice(0,[0,3,4,5][aiAct.street]).filter(c=>c!=null&&c>=0);
      const eq=hhEquity(heroCards,vils,bAt);
      // pote que o herói DISPUTA: de cada jogador, no máximo o que o próprio herói investiu (side pot fica de fora)
      const heroPot=Object.keys(invested).reduce((s,k)=>s+Math.max(0,Math.min(invested[k],heroInv)),0);
      allin={ev:(eq*heroPot-heroInv)/bb, net:net/bb};
    }
  }
  const heroChips=(seats.find(s=>s.n===hero)||{}).chips||0;
  const stackBB=heroChips/bb;
  const bucket=stackBB<10?'<10bb':stackBB<20?'10-20bb':stackBB<40?'20-40bb':'40bb+';
  return {site,tid,tname,buyin,date,bb,hid,net_bb:net/bb,pos:heroPos,bucket,
    vpip,pfr,tbOpp,tb,f3bOpp,f3b,stealOpp,steal,bbdefOpp,bbdef,cbetOpp,cbet,fcbOpp,fcb,
    sawflop,wwsf,wtsd,wsd,afB,afC,allin};
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
      af_bets:0,af_calls:0,allin_cnt:0,allin_ev_bb:0,allin_net_bb:0,pos_json:{},stack_json:{},hand_ids:[]};
    const a=agg[k];
    if(h.hid) a.hand_ids.push(h.hid);
    if(h.date&&(!a.entry_date||h.date<a.entry_date)) a.entry_date=h.date;
    if(h.buyin>a.buyin) a.buyin=h.buyin;
    a.hands++; a.net_bb+=h.net_bb;
    if(h.vpip)a.vpip_cnt++; if(h.pfr)a.pfr_cnt++;
    if(h.tbOpp)a.tb_opp++; if(h.tb)a.tb_cnt++;
    if(h.f3bOpp)a.f3b_opp++; if(h.f3b)a.f3b_cnt++;
    if(h.stealOpp)a.steal_opp++; if(h.steal)a.steal_cnt++;
    if(h.bbdefOpp)a.bbdef_opp++; if(h.bbdef)a.bbdef_cnt++;
    if(h.cbetOpp)a.cbet_opp++; if(h.cbet)a.cbet_cnt++;
    if(h.fcbOpp)a.fcbet_opp++; if(h.fcb)a.fcbet_cnt++;
    if(h.sawflop)a.sawflop_cnt++; if(h.wwsf)a.wwsf_cnt++; if(h.wtsd)a.wtsd_cnt++; if(h.wsd)a.wsd_cnt++;
    a.af_bets+=h.afB; a.af_calls+=h.afC;
    if(h.allin){ a.allin_cnt++; a.allin_ev_bb+=h.allin.ev; a.allin_net_bb+=h.allin.net; }
    // net/hn por posição: bb ganhos e nº de mãos COM net rastreado (linhas antigas não têm
    // esses campos — hn separa o denominador certo do bb/100 por posição)
    if(!a.pos_json[h.pos]) a.pos_json[h.pos]={h:0,v:0,p:0,net:0,hn:0};
    a.pos_json[h.pos].h++; if(h.vpip)a.pos_json[h.pos].v++; if(h.pfr)a.pos_json[h.pos].p++;
    a.pos_json[h.pos].net+=h.net_bb; a.pos_json[h.pos].hn++;
    if(!a.stack_json[h.bucket]) a.stack_json[h.bucket]={h:0,v:0,p:0,net:0};
    const sb2=a.stack_json[h.bucket]; sb2.h++; if(h.vpip)sb2.v++; if(h.pfr)sb2.p++; sb2.net+=h.net_bb;
  }
  // arredonda numéricos UMA vez no fim (arredondar a cada mão acumularia deriva)
  return Object.values(agg).map(a=>{
    const pj={}; Object.keys(a.pos_json).forEach(k=>{ pj[k]={...a.pos_json[k],net:Math.round(a.pos_json[k].net*100)/100}; });
    return {...a,pos_json:pj,net_bb:Math.round(a.net_bb*100)/100,allin_ev_bb:Math.round(a.allin_ev_bb*100)/100,allin_net_bb:Math.round(a.allin_net_bb*100)/100};
  });
}
// soma um agregado de mãos NOVAS numa linha já existente do banco (import incremental sem contar 2x)
const HH_SUM_KEYS=['hands','net_bb','vpip_cnt','pfr_cnt','tb_cnt','tb_opp','f3b_cnt','f3b_opp','steal_cnt','steal_opp',
  'bbdef_cnt','bbdef_opp','cbet_cnt','cbet_opp','fcbet_cnt','fcbet_opp','sawflop_cnt','wwsf_cnt','wtsd_cnt','wsd_cnt',
  'af_bets','af_calls','allin_cnt','allin_ev_bb','allin_net_bb'];
function mergeHH(a,b){
  const out={...a};
  HH_SUM_KEYS.forEach(k=>out[k]=Math.round((num(a[k])+num(b[k]))*100)/100);
  out.entry_date=[a.entry_date,b.entry_date].filter(Boolean).sort()[0]||null;
  out.buyin=Math.max(num(a.buyin),num(b.buyin));
  out.tournament_name=a.tournament_name||b.tournament_name;
  const mj=(x,y)=>{ const o=JSON.parse(JSON.stringify(x||{})); Object.keys(y||{}).forEach(k=>{ if(!o[k]) o[k]={...y[k]}; else Object.keys(y[k]).forEach(kk=>o[k][kk]=num(o[k][kk])+num(y[k][kk])); }); return o; };
  out.pos_json=mj(a.pos_json,b.pos_json); out.stack_json=mj(a.stack_json,b.stack_json);
  out.hand_ids=[...new Set([...(a.hand_ids||[]),...(b.hand_ids||[])])];
  return out;
}
// faixas saudáveis de referência (MTT micro/low) — verde dentro, amarelo perto, vermelho fora
const HH_BANDS={vpip:[18,27],pfr:[14,22],tb:[5,10],f3b:[45,65],steal:[30,50],bbdef:[35,55],cbet:[50,75],fcbet:[40,60],wtsd:[24,32],wsd:[48,58],wwsf:[42,52]};
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
/* Leituras automáticas: compara as suas stats com as faixas de um reg de MTT micro/low e
   escreve o que precisa de atenção. Cada regra só dispara com amostra mínima. */
function hhInsights(d){
  // k (opcional) liga a leitura à stat que a gerou — a tela usa pra abrir a frase ao tocar no número
  const out=[]; const add=(tone,t,x,k)=>out.push({tone,t,x,k});
  const pct=(c,o)=>o>0?c/o*100:null;
  const p={vpip:pct(d.vpip,d.hands),pfr:pct(d.pfr,d.hands),tb:pct(d.tb,d.tbOpp),f3b:pct(d.f3b,d.f3bOpp),steal:pct(d.steal,d.stealOpp),bbdef:pct(d.bbdef,d.bbdefOpp),cbet:pct(d.cbet,d.cbetOpp),fcb:pct(d.fcb,d.fcbOpp),wtsd:pct(d.wtsd,d.sawflop),wsd:pct(d.wsd,d.wtsd),wwsf:pct(d.wwsf,d.sawflop)};
  const f=n=>n==null?'—':n.toFixed(1).replace('.',',')+'%';
  const f1=n=>n.toFixed(1).replace('.',',');
  // VPIP/PFR/gap por posição — deixa as leituras cirúrgicas em vez de acusar a posição errada
  const pp=k=>{ const x=d.pos&&d.pos[k]; if(!x||!(num(x.h)>0)) return null; const h=num(x.h); return {h,v:num(x.v)/h*100,pr:num(x.p)/h*100,gap:(num(x.v)-num(x.p))/h*100}; };
  // gap VPIP−PFR SEM os blinds: defesa de BB é call por natureza (e completar SB pode ser plano),
  // então contar blinds no gap acusaria "passividade" injustamente
  const nb=['EP','MP','CO','BTN'].reduce((a,k)=>{const x=d.pos&&d.pos[k]; if(x){a.h+=num(x.h);a.v+=num(x.v);a.p+=num(x.p);} return a;},{h:0,v:0,p:0});
  const gapNB=nb.h>=200?(nb.v-nb.p)/nb.h*100:null;
  if(d.hands<300) add('info','Amostra pequena',`Com ${d.hands} mão(s), as leituras são preliminares — padrão de verdade aparece a partir de ~1.000 mãos (ideal 5.000+). Importe mais sessões antes de mudar o jogo por causa delas.`);
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
    if(p.wtsd>33&&p.wsd!=null&&p.wsd<47) add('red','Chegando ao showdown atrás',`WTSD ${f(p.wtsd)} com W$SD ${f(p.wsd)} (reg: 24–32% / 48–58%). Você paga até o fim e chega sem a melhor mão. A correção não é virar nit: é chegar ao river com range mais forte e escolher bluff catcher por blocker e sizing — não por "a linha do vilão não faz sentido".`,'wsd');
    else if(p.wtsd>34) add('gold','Showdown demais',`WTSD ${f(p.wtsd)} (reg: 24–32%). Confira se os calls de turn/river têm equity de verdade.`,'wtsd');
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
  if(d.f3bOpp>=15&&d.fcbOpp>=30&&d.sawflop>=100&&p.f3b<40&&p.fcb<35&&p.wtsd>34)
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
const IcoAlert  = p => <Svg {...p}><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4M12 17.5v.5"/></Svg>;
const IcoLogout = p => <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Svg>;
const IcoMenu   = p => <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16"/></Svg>;
const IcoStats  = p => <Svg {...p}><path d="M3 20h18"/><path d="M6 20v-6M11 20V5M16 20v-9M21 20v-4"/></Svg>;
const IcoEye    = p => <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></Svg>;
const IcoEyeOff = p => <Svg {...p}><path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.3 3.9M6.1 6.2A17 17 0 0 0 2 12s3.5 7 10 7a9.3 9.3 0 0 0 4.2-1"/><path d="M9.5 9.6a3 3 0 0 0 4.2 4.2"/></Svg>;

/* ---------- componentes base ---------- */
const Card = ({children,style,className,onClick}) => <div onClick={onClick} className={className} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:22,boxShadow:'0 1px 2px rgba(25,35,29,.05), 0 12px 32px -20px rgba(25,35,29,.28)',...style}}>{children}</div>;

function NavBtn({Icon,label,active,onClick,mobile}){
  return <button onClick={onClick} style={{display:'flex',flexDirection:mobile?'column':'row',alignItems:'center',gap:mobile?4:12,width:mobile?'auto':'100%',minWidth:0,flex:mobile?'1 1 0':'initial',justifyContent:mobile?'center':'flex-start',padding:mobile?'8px 4px':'12px 15px',borderRadius:14,border:'none',cursor:'pointer',background:active?P:'transparent',color:active?'#fff':C.inkSoft,fontWeight:active?700:600,fontSize:mobile?10.5:15,transition:'all .18s'}}>
    <Icon s={mobile?21:20} w={active?2.4:2}/>{label}
  </button>;
}
const RoundBtn = ({children,onClick,disabled}) => <button onClick={onClick} disabled={disabled} style={{width:44,height:44,borderRadius:14,border:`1px solid ${C.border}`,background:disabled?C.bg:C.surface,color:disabled?'#C3BBA9':P,fontSize:24,lineHeight:1,cursor:disabled?'default':'pointer',fontWeight:700}}>{children}</button>;
const Empty = ({children}) => <div style={{padding:'26px 0',textAlign:'center',color:C.inkSoft,fontSize:14}}>{children}</div>;
// marca: clientes (solo) veem a logo GrinderBank; a pool interna (team) mantém a ficha genérica
const Brand = ({small,team}) => <div style={{display:'flex',alignItems:'center',gap:10}}>
  {team
    ? <div style={{width:small?34:38,height:small?34:38,borderRadius:12,background:'linear-gradient(135deg,#5D4DAF 0%,#4C3E92 55%,#332A69 100%)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.25), 0 4px 12px -6px rgba(76,62,146,.5)',display:'grid',placeItems:'center',color:'#fff'}}><IcoChip s={small?19:21}/></div>
    : <img src="icon-192.png" alt="GrinderBank" width={small?34:38} height={small?34:38} style={{borderRadius:11,display:'block',boxShadow:'0 4px 12px -6px rgba(76,62,146,.5)'}}/>}
  <div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:small?17:19,lineHeight:1,letterSpacing:'-0.02em'}}>{team?'Pool de Poker':'GrinderBank'}</div><div style={{fontSize:11.5,color:C.inkSoft,fontWeight:600,letterSpacing:'.01em'}}>{team?'staking · make-up · saques':'seu grind sob controle'}</div></div>
</div>;
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
function StopLossCard({players,config,daily,curWeek,bancaAtual}){
  const today=todayISO();
  const dayBI=num(config.stoploss_daily_buyins), wkPct=num(config.stoploss_weekly_pct);
  if(!(dayBI>0)&&!(wkPct>0)) return null;
  return <Card style={{padding:20}}>
    <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 4px'}}>Stop loss — a hora de parar</h3>
    <div style={{fontSize:12.5,color:C.inkSoft,marginBottom:14}}>Quanto do seu limite já foi usado. Ver <b>antes</b> de estourar é o ponto — quando a barra fica vermelha, o dia (ou a semana) acabou.</div>
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {players.map((p,i)=>{
        const abiMax=abiMaxFor(config,p,today);
        const slDay=dayBI*abiMax;
        const dayLoss=Math.max(0,-daily.filter(e=>e.player===p&&e.entry_date===today).reduce((s,e)=>s+resultadoDia(e),0));
        const wkLim=wkPct*bancaAtual;
        const wkLoss=Math.max(0,-(curWeek[p]?curWeek[p].resultado:0));
        return <div key={p} style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}><span style={{width:9,height:9,borderRadius:99,background:PLAYER_COLORS[i]||C.inkSoft}}/><b style={{fontSize:13.5}}>{p.split(' ')[0]}</b></div>
          {slDay>0&&<SLMeter label={`Hoje · limite ${dayBI} buy-ins`} used={dayLoss} limit={slDay} detail={`${(dayLoss/(abiMax||1)).toFixed(1).replace('.',',')} de ${dayBI} bi`}/>}
          {wkLim>0&&<SLMeter label={`Semana · limite ${pctFmt(wkPct*100)} da banca`} used={wkLoss} limit={wkLim} detail={`${fmt(wkLoss)} de ${fmt(wkLim)}`}/>}
        </div>;
      })}
    </div>
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
          {act===i&&d.vals.map((v,j)=><span key={j} style={{fontSize:9.5,fontWeight:800,lineHeight:1,color:series[j].color,whiteSpace:'nowrap'}}>{num(v)>=0?'+':'−'}${Math.abs(num(v)).toFixed(2).replace('.',',')}</span>)}
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
  const compact=v=>'$'+Math.round(v).toLocaleString('pt-BR');
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
  const compact=v=>(v>=0?'+':'−')+'$'+Math.round(Math.abs(v)).toLocaleString('pt-BR');
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
function QuickEditModal({label,hint,currentValue,kind='money',opts,onClose,onSave}){
  const init = kind==='percent' ? String(((num(currentValue))*100)).replace('.',',')
    : kind==='list' ? (Array.isArray(currentValue)?currentValue.join(', '):String(currentValue||''))
    : kind==='text'||kind==='date' ? String(currentValue??'')
    : String(currentValue??0).replace('.',',');
  const [val,setVal]=useState(init);
  const save=()=>{
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
          <button onClick={onClose} style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
        </div>
        {hint&&<div style={{fontSize:13,color:C.inkSoft,marginBottom:14,lineHeight:1.6}}>{hint}</div>}
        {kind==='select'
          ? <div style={{marginBottom:16}}><Select value={val} onChange={e=>setVal(e.target.value)} opts={opts||[]}/></div>
          : kind==='date'
          ? <input type="date" style={{...inputStyle,marginBottom:16}} value={val} onChange={e=>setVal(e.target.value)}/>
          : kind==='text'||kind==='list'
          ? <input style={{...inputStyle,marginBottom:16}} value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()} autoFocus placeholder={kind==='list'?'Separe por vírgula':''}/>
          : <input style={{...inputStyle,fontSize:24,fontFamily:"'Space Grotesk',sans-serif",marginBottom:16}} inputMode="decimal" value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()} autoFocus/>}
        <button onClick={save} style={{width:'100%',padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer'}}>Salvar</button>
      </div>
    </div>
  );
}

/* ---------- modal adicionar / editar (genérico por schema de campos) ---------- */
function AddModal({title, fields, editing, initial, onClose, onSave, onEdit}){
  const [f,setF]=useState(()=>{
    const o={};
    fields.forEach(fd=>{
      let v = editing ? editing[fd.k] : (initial && initial[fd.k]!=null ? initial[fd.k] : fd.def);
      if(v==null) v = fd.type==='select' ? (fd.opts[0]||'') : '';
      if((fd.type==='money'||fd.type==='int') && typeof v==='number') v=String(v).replace('.',',');
      o[fd.k]=v;
    });
    return o;
  });
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=()=>{
    const out={};
    for(const fd of fields){
      let v=f[fd.k];
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
          <button onClick={onClose} style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
        </div>
        <div className="modalgrid">
          {fields.map(fd=><div key={fd.k} className={fd.full?'full':''}>
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
    if(p1.length<8) return setErr('A senha precisa de pelo menos 8 caracteres.');
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

function ChangePassModal({onClose}){
  const [p1,setP1]=useState(''); const [p2,setP2]=useState('');
  const [err,setErr]=useState(''); const [busy,setBusy]=useState(false); const [ok,setOk]=useState(false);
  const save=async()=>{
    setErr('');
    if(p1.length<8) return setErr('A senha precisa de pelo menos 8 caracteres.');
    if(p1!==p2) return setErr('As duas senhas não conferem.');
    setBusy(true);
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
              <div style={{fontSize:13,color:C.inkSoft,lineHeight:1.6}}>Escolhe uma senha só sua (mínimo 8 caracteres). Toque no 👁 pra conferir antes de salvar.</div>
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
function Login(){
  const [ident,setIdent]=useState(''); const [pass,setPass]=useState('');
  const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  // criar conta (self-service do GrinderBank): nome + e-mail + senha -> workspace solo
  const [mode,setMode]=useState('login'); const [ok,setOk]=useState('');
  const [nNome,setNNome]=useState(''); const [nMail,setNMail]=useState(''); const [nZap,setNZap]=useState(''); const [nP1,setNP1]=useState(''); const [nP2,setNP2]=useState('');
  const [nPlan,setNPlan]=useState('pro');   // plano escolhido pro teste grátis de 15 dias
  const criar=async()=>{
    setErr(''); setOk('');
    const nome=nNome.trim();
    const mail=nMail.trim().toLowerCase();
    const zap=nZap.replace(/\D/g,'');
    if(nome.length<2) return setErr('Diz teu nome ou apelido (pelo menos 2 letras).');
    if(nome.length>30) return setErr('Apelido muito longo — no máximo 30 caracteres.');
    // o apelido também é login: com @ confundiria com e-mail, e só números com CPF
    if(nome.includes('@')) return setErr('O apelido não pode ter @ (é ele que você usa pra entrar).');
    if(/^\d+$/.test(nome)) return setErr('O apelido não pode ser só números — mistura com letras.');
    if(!/^\S+@\S+\.\S+$/.test(mail)) return setErr('E-mail inválido.');
    if(zap&&(zap.length<10||zap.length>13)) return setErr('WhatsApp incompleto — usa DDD + número (ou deixa em branco).');
    if(nP1.length<8) return setErr('Senha com pelo menos 8 caracteres.');
    if(nP1!==nP2) return setErr('As duas senhas não conferem.');
    setBusy(true);
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
    if(!data||!data.session){ setBusy(false); setMode('login'); setOk('Conta criada! Confirma no teu e-mail e depois entra aqui — teu apelido fica guardado.'); return; }
    // sessão já veio: cria perfil + workspace solo e recarrega limpo
    const {error:pe}=await sb.from('player_profiles').insert({user_id:data.session.user.id,email:data.session.user.email,nickname:nome,whatsapp:zap||null,password_changed:true,role:'solo'});
    if(pe&&pe.code==='23505'){ setBusy(false); return setErr('Esse apelido acabou de ser registrado por outra pessoa — escolhe outro.'); }
    if(!pe){ try{ localStorage.removeItem('gb_signup'); }catch(e){} }
    try{ await sb.rpc('create_solo_workspace',{ws_name:nome,plan_escolhido:nPlan}); }catch(e){ console.error(e); }
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
    if(!id) return setErr('Digita teu e-mail, apelido ou CPF no campo acima que eu mando o link.');
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
      {mode==='login'?<div style={{display:'flex',flexDirection:'column',gap:14}}>
        {ok&&<div style={{color:C.greenMid,fontSize:13.5,fontWeight:600,background:C.greenSoft,padding:'10px 12px',borderRadius:11}}>{ok}</div>}
        <div><label style={labelStyle}>E-mail, apelido ou CPF</label><input style={inputStyle} type="text" autoCapitalize="none" autoComplete="username" value={ident} onChange={e=>setIdent(e.target.value)} onKeyDown={e=>e.key==='Enter'&&entrar()}/></div>
        <div><label style={labelStyle}>Senha</label><PassInput autoComplete="current-password" value={pass} onChange={e=>setPass(e.target.value)} onEnter={entrar}/></div>
        {err&&<div style={{color:C.red,fontSize:13.5,fontWeight:600}}>{err}</div>}
        {confirmMail&&<div style={{background:C.goldSoft,borderRadius:11,padding:'12px 14px'}}>
          <div style={{color:C.gold,fontSize:13.5,fontWeight:700}}>Falta confirmar teu e-mail 📬</div>
          <div style={{fontSize:12.5,color:C.ink,lineHeight:1.5,marginTop:3}}>Tua conta existe, mas antes de entrar você precisa clicar no link que mandamos pra <b>{confirmMail}</b>. Não achou? Olha o spam — ou reenvia:</div>
          <button onClick={reenviarConfirm} disabled={busy} style={{marginTop:8,padding:'9px 14px',borderRadius:10,border:'none',background:C.gold,color:'#fff',fontWeight:700,fontSize:12.5,cursor:'pointer'}}>Reenviar e-mail de confirmação</button>
        </div>}
        <button onClick={entrar} disabled={busy} style={{padding:'15px 0',borderRadius:14,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',opacity:busy?.7:1}}>{busy?'Entrando...':'Entrar'}</button>
        <button onClick={esqueci} disabled={busy} style={{border:'none',background:'transparent',color:C.inkSoft,fontWeight:600,fontSize:13,cursor:'pointer',padding:'2px 0',textDecoration:'underline'}}>Esqueci minha senha</button>
        <button onClick={()=>{setMode('signup');setErr('');setOk('');}} style={{padding:'12px 0',borderRadius:14,border:`1.5px solid ${C.border}`,background:'transparent',color:P,fontWeight:700,fontSize:14,cursor:'pointer'}}>Criar conta grátis</button>
      </div>
      :<div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{fontSize:13,color:C.inkSoft,lineHeight:1.5,textAlign:'center'}}>Sua conta individual: banca, torneios e estatísticas — só seus, ninguém mais vê.</div>
        <div><label style={labelStyle}>Nome ou apelido</label><input style={inputStyle} value={nNome} autoCapitalize="none" placeholder="Ex: rafa_grinder" onChange={e=>setNNome(e.target.value)}/></div>
        <div><label style={labelStyle}>E-mail</label><input style={inputStyle} type="email" autoCapitalize="none" autoComplete="email" value={nMail} onChange={e=>setNMail(e.target.value)}/></div>
        <div><label style={labelStyle}>WhatsApp (opcional)</label><input style={inputStyle} inputMode="tel" placeholder="DDD + número" value={nZap} onChange={e=>setNZap(e.target.value)}/></div>
        <div><label style={labelStyle}>Senha</label><PassInput autoComplete="new-password" value={nP1} onChange={e=>setNP1(e.target.value)}/></div>
        <div><label style={labelStyle}>Confirmar senha</label><PassInput autoComplete="new-password" value={nP2} onChange={e=>setNP2(e.target.value)} onEnter={criar}/></div>
        {/* escolha de plano: o teste grátis de 15 dias é do plano escolhido */}
        <div>
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
        </div>
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
        const {error}=await sb.from('pool_config').insert({player1_name:nome.trim(),player2_name:'',player_pct:1,
          banca_inicial:parseValor(banca)||0,piso_minimo:0,makeup_max_recomendado:0,abi_max:2,abi_max_player1:2,abi_max_player2:0,
          week_start_date:todayISO(),sites_permitidos:sites.length?sites:['GG Poker'],modalidades_permitidas:['MTT','Spin','Cash','Sit & Go']});
        if(error) throw error;
      }
      onDone();
    }catch(e){ console.error(e); setBusy(false); setErr('Não consegui salvar. Tenta de novo.'); }
  };
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:20}}>
    <Card style={{padding:30,width:'100%',maxWidth:420}} className="ftfade">
      <div style={{display:'flex',justifyContent:'center',marginBottom:12}}><Brand/></div>
      <div style={{fontSize:11,fontWeight:700,color:C.inkSoft,textTransform:'uppercase',letterSpacing:'.06em',textAlign:'center',marginBottom:6}}>Passo {step} de 3</div>
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
      {step===3&&<div style={{display:'flex',flexDirection:'column',gap:14}}>
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
    if(p1.length<8) return setErr('A senha nova precisa de pelo menos 8 caracteres.');
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
  const abiMax=abiMaxFor(config,t.player,t.entry_date);
  const st=tourStatus(t,abiMax), lp=lucroTorneio(t);
  const col=PLAYER_COLORS[players.indexOf(t.player)]||C.inkSoft;
  return <Row onEdit={onEdit} onDelete={onDelete}
    left={<><span style={{width:38,height:38,borderRadius:11,background:C.goldSoft,display:'grid',placeItems:'center',flexShrink:0,color:C.gold}}><IcoTrophy s={18}/></span>
      <div style={{minWidth:0}}><div style={{fontWeight:700,fontSize:14.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.tournament_name||'Torneio'} <span style={{color:col,fontWeight:700}}>· {t.player}</span></div>
      <div style={{fontSize:12,color:C.inkSoft,display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginTop:2}}>buy-in {fmt(t.buyin)}{num(t.reentries)>0?` +${num(t.reentries)}re`:''}{t.final_position?` · ${t.final_position}º`:''} {st==='FORA DA GRADE'&&<><Badge text={st}/><span style={{color:C.red,fontWeight:700}}>buy-in {fmt(t.buyin)} · teto {fmt(abiMax)}</span></>}</div></div></>}
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
// mini-stat usado no Diário/Mensal
const MiniStat = ({label,value,tone}) =><div style={{padding:'8px 10px',borderRadius:10,background:C.bg,minWidth:0}}><div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em'}}>{label}</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:15.5,fontWeight:600,color:tone||C.ink,marginTop:1}}>{value}</div></div>;

function DayCard({date,dayTours,players,config,onAdd,onEdit,onDelete,today}){
  const [open,setOpen]=useState(!!today);
  const per=players.map((p,i)=>{const ts=dayTours.filter(t=>t.player===p);return {p,i,n:ts.length,res:ts.reduce((s,t)=>s+lucroTorneio(t),0)};}).filter(x=>x.n>0);
  const res=per.reduce((s,x)=>s+x.res,0);
  return <Card style={{padding:0,overflow:'hidden',border:today?`1.5px solid ${P}`:`1px solid ${C.border}`}}>
    <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'15px 18px',background:today?C.plumSoft:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16.5,fontWeight:600,color:today?P:C.ink}}>{today?'Hoje · ':''}{dLabel(date)}</div>
        <div style={{fontSize:12.5,color:C.inkSoft,marginTop:2}}>{dayTours.length} torneio{dayTours.length!==1?'s':''}{per.length?' · '+per.map(x=>x.p.split(' ')[0]).join(' + '):''}</div>
      </div>
      <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:17,color:res>=0?C.greenMid:C.red}}>{res>=0?'+':'−'}{fmt(Math.abs(res))}</span>
      <span style={{color:C.inkSoft,fontSize:20,transform:open?'rotate(90deg)':'none',transition:'transform .2s'}}>›</span>
    </button>
    {open&&<div style={{padding:'0 18px 16px'}}>
      {per.length>0&&<div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'2px 0 6px'}}>
        {per.map(x=><span key={x.p} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:99,background:C.bg,fontSize:12,fontWeight:700,color:C.ink}}><span style={{width:8,height:8,borderRadius:99,background:PLAYER_COLORS[x.i]}}/>{x.p.split(' ')[0]}: {x.res>=0?'+':'−'}{fmt(Math.abs(x.res))} <span style={{color:C.inkSoft,fontWeight:600}}>({x.n})</span></span>)}
      </div>}
      {sortByCreated(dayTours).map(t=><TourRow key={t.id} t={t} config={config} players={players} onEdit={()=>onEdit(t)} onDelete={()=>onDelete(t)}/>)}
      <button onClick={()=>onAdd(date)} style={{marginTop:12,display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'transparent',color:P,border:`1.5px dashed ${C.border}`,padding:'11px 14px',borderRadius:12,fontWeight:700,fontSize:13.5,cursor:'pointer',width:'100%'}}><IcoPlus s={16}/>Adicionar torneio {today?'de hoje':`em ${dLabel(date)}`}</button>
    </div>}
  </Card>;
}

function DiaryCard({entry,dayTours,players,config,onAdd,onEdit,onDelete}){
  const [open,setOpen]=useState(false);
  const abiMax=abiMaxFor(config,entry.player,entry.entry_date);
  const st=gradeStatus(entry,abiMax), r=resultadoDia(entry), i=players.indexOf(entry.player);
  const ent=num(entry.qtd_entradas)||num(entry.qtd_torneios);
  const premios=dayTours.reduce((s,t)=>s+num(t.prize),0);
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
    {fora&&<div style={{display:'flex',alignItems:'center',gap:7,padding:'9px 18px',background:C.redSoft,color:C.red,fontSize:12.5,fontWeight:700,borderTop:`1px solid ${C.red}33`}}><IcoAlert s={15}/>Fora da grade — maior buy-in {fmt(entry.maior_buyin)} · teto {fmt(abiMax)} na data (passou {fmt(num(entry.maior_buyin)-abiMax)})</div>}
    {open&&<div style={{padding:'0 18px 16px'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(88px,1fr))',gap:8,marginBottom:12}}>
        <MiniStat label="ABI médio" value={fmt(abiMedioDia(entry))}/>
        <MiniStat label={`ABI máx (${entry.player.split(' ')[0]})`} value={fmt(abiMax)}/>
        <MiniStat label="Investido" value={fmt(entry.total_buyins)}/>
        <MiniStat label="Premiação" value={fmt(premios)} tone={C.greenMid}/>
        <MiniStat label="Cashes (ITM)" value={`${cashes}/${num(entry.qtd_torneios)}`}/>
        <MiniStat label="ROI do dia" value={pctFmt(roi)} tone={r>=0?C.greenMid:C.red}/>
      </div>
      <div style={{fontSize:12,color:C.inkSoft,marginBottom:4}}>Corrija editando os torneios abaixo:</div>
      {sortByCreated(dayTours).map(t=><TourRow key={t.id} t={t} config={config} players={players} onEdit={()=>onEdit(t)} onDelete={()=>onDelete(t)}/>)}
      <button onClick={()=>onAdd(entry.entry_date,entry.player)} style={{marginTop:12,display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'transparent',color:P,border:`1.5px dashed ${C.border}`,padding:'11px 14px',borderRadius:12,fontWeight:700,fontSize:13.5,cursor:'pointer',width:'100%'}}><IcoPlus s={16}/>Adicionar torneio de {entry.player.split(' ')[0]}</button>
    </div>}
  </Card>;
}

// linha de uma semana (por jogador) no Semanal — SEM status de saque (isso só aparece na aba Saques)
function WeekRow({w,player,config,solo}){
  const wkTorn=w.entries.reduce((s,e)=>s+num(e.qtd_torneios),0);
  const wkBuyins=w.entries.reduce((s,e)=>s+num(e.total_buyins),0);
  const wkEnt=w.entries.reduce((s,e)=>s+(num(e.qtd_entradas)||num(e.qtd_torneios)),0);
  const wkAbi=wkEnt>0?wkBuyins/wkEnt:0, pAbi=abiMaxFor(config,player,w.week);
  return <div style={{padding:'12px 0',borderBottom:`1px solid ${C.border}`}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
      <div style={{fontWeight:700,fontSize:14.5}}>Semana até {dLabel(w.week)}</div>
      <span style={{fontWeight:800,fontSize:15,color:w.resultado>=0?C.greenMid:C.red}}>{w.resultado>=0?'+':'−'}{fmt(Math.abs(w.resultado))}</span>
    </div>
    {!solo&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8,marginTop:8,fontSize:12.5}}>
      <div style={{color:C.inkSoft}}>Make-up: <b style={{color:C.ink}}>{fmt(w.makeAnterior)} → {fmt(w.makeFinal)}</b></div>
      <div style={{color:C.inkSoft}}>Lucro divisível: <b style={{color:C.ink}}>{fmt(w.lucroDiv)}</b></div>
      <div style={{color:C.inkSoft}}>Parte do jogador: <b style={{color:C.ink}}>{fmt(w.parteJog)}</b></div>
      <div style={{color:C.inkSoft}}>Saque autorizado: <b style={{color:P}}>{fmt(w.saqueAut)}</b></div>
    </div>}
    {wkTorn>0&&<div style={{marginTop:8}}><div style={{fontSize:11.5,color:C.inkSoft,marginBottom:4}}>ABI médio da semana {fmt(wkAbi)} / máx {fmt(pAbi)}</div><Bar2 pct={pAbi>0?(wkAbi/pAbi)*100:0} color={wkAbi>=pAbi*0.9?C.red:wkAbi>=pAbi*0.7?C.gold:C.greenMid}/></div>}
  </div>;
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
  const atuais=geral.filter(g=>g.mes===curMonth), antigas=geral.filter(g=>g.mes!==curMonth);
  const Row=g=><div key={g.week} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,padding:'11px 0',borderBottom:`1px solid ${C.border}`}}>
    <div style={{minWidth:0}}><div style={{fontWeight:700,fontSize:14}}>Semana até {dLabel(g.week)}</div><div style={{fontSize:11.5,color:C.inkSoft,marginTop:1}}>saque autorizado {fmt(g.saqueAut)} · pool ficou com {fmt(g.partePool)}</div></div>
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
  const atuais=arr.filter(w=>w.week.slice(0,7)===curMonth), antigas=arr.filter(w=>w.week.slice(0,7)!==curMonth);
  return <Card style={{padding:20}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><span style={{width:12,height:12,borderRadius:99,background:PLAYER_COLORS[[config.player1_name,config.player2_name].indexOf(player)]||C.inkSoft}}/><h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:0}}>{player}</h3>{!solo&&<span style={{marginLeft:'auto',fontSize:13,color:C.inkSoft,fontWeight:600}}>make-up atual {fmt(makeUpAtual)}</span>}</div>
    {atuais.length?atuais.map(w=><WeekRow key={w.week} w={w} player={player} config={config} solo={solo}/>):<Empty>Sem semanas neste mês ainda.</Empty>}
    {antigas.length>0&&<><HistToggle n={antigas.length} open={hist} onClick={()=>setHist(h=>!h)}/>{hist&&<div style={{marginTop:4}}>{antigas.map(w=><WeekRow key={w.week} w={w} player={player} config={config} solo={solo}/>)}</div>}</>}
  </Card>;
}

/* ---------- app ---------- */
function Dashboard({session,profile}){
  /* convidado (role='guest'): sem acesso às áreas da pool — o RLS do banco também bloqueia;
     aqui só mostramos a telinha de acesso restrito e liberamos as Stats/relatório dele */
  const [ws,setWs]=useState(null);                 // workspace da conta (team = pool · solo = cliente)
  const [needsSetup,setNeedsSetup]=useState(false);// solo sem config ainda -> onboarding de 3 passos
  const [askTour,setAskTour]=useState(false);      // convite pro tour guiado (1º acesso)
  const [tour,setTour]=useState(0);                // 0 = desligado · n = passo atual do tour
  // solo = conta individual (GrinderBank). Fallback pro papel do perfil quando o workspace ainda não carregou.
  const solo = ws ? ws.kind==='solo' : !!(profile&&(profile.role==='guest'||profile.role==='solo'));
  const [config,setConfig]=useState(null);
  const [tours,setTours]=useState([]);
  const [ledger,setLedger]=useState([]);
  const [wallets,setWallets]=useState([]);      // saldo inicial por jogador+plataforma
  const [wds,setWds]=useState([]);
  const [loading,setLoading]=useState(true);
  const [viewSel,setView]=useState('painel');
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
  const [hh,setHh]=useState([]);                  // agregados de hand history por torneio
  const [chgs,setChgs]=useState([]);              // histórico de alterações dos Ajustes
  const [cfgConfirm,setCfgConfirm]=useState(null);// confirmação pendente de mudança nos Ajustes
  const [imp,setImp]=useState({busy:false,prog:'',res:null}); // estado do import de HH
  const [impPlayer,setImpPlayer]=useState('');    // de quem são os arquivos importados
  const [stF,setStF]=useState({player:'',days:'',from:'',to:''}); // filtros da tela Stats (preset ou intervalo de datas)
  const [audF,setAudF]=useState({player:'',days:30});             // filtros da aba Auditoria
  const [gloss,setGloss]=useState(false);         // glossário das siglas aberto?
  const [leitOpen,setLeitOpen]=useState(false);   // card "Leituras do jogo" expandido?
  const [statHint,setStatHint]=useState(null);    // stat tocada na tela Stats (abre a leitura dela)
  const [sorteOpen,setSorteOpen]=useState(false); // card "Sorte nos all-ins" expandido?
  const [copied,setCopied]=useState(false);       // feedback do "copiar pro Coach"
  const [report,setReport]=useState(null);        // relatório aberto: {type:'mensal'} | {type:'jogador',player,days}
  const [toasts,setToasts]=useState([]);        // avisos flutuantes (ex: fora da grade do outro jogador)
  const localIds=React.useRef(new Set());       // ids que EU acabei de criar (pra não me auto-avisar via realtime)
  const seq=React.useRef(0);
  const pushToast=(t)=>{ const id=++seq.current; setToasts(l=>[...l,{...t,id}]); setTimeout(()=>setToasts(l=>l.filter(x=>x.id!==id)),8000); };
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

  const loadAll=async()=>{
    try{
      // pagou na Kiwify (ou ganhou plano manual)? aplica a ativação pendente do e-mail antes de carregar
      try{ await sb.rpc('aplicar_ativacao'); }catch(e){}
      // carga UNIFORME: o RLS por workspace entrega a cada conta só o que é dela
      const [wsr,cfg,t,l,pw,w,hhr,cc]=await Promise.all([
        sb.from('workspaces').select('*'),
        sb.from('pool_config').select('*').order('created_at',{ascending:true}),
        sb.from('tournaments').select('*').order('entry_date',{ascending:false}),
        sb.from('bankroll_ledger').select('*').order('entry_date'),
        sb.from('player_wallets').select('*'),
        sb.from('withdrawals').select('*').order('week_ending_date',{ascending:false}),
        sb.from('hh_tournament_stats').select('*').order('entry_date',{ascending:false}),
        sb.from('config_changes').select('*').order('created_at',{ascending:false}),
      ]);
      const myWs=(wsr.data&&wsr.data[0])||null; setWs(myWs);
      const ehSolo=myWs?myWs.kind==='solo':!!(profile&&(profile.role==='guest'||profile.role==='solo'));
      // a config é SEMPRE a linha mais antiga. Só cria a padrão se o banco RESPONDEU e está
      // realmente vazio (primeiro uso) — falha transitória de leitura NUNCA pode virar
      // "cria outra config" (isso já duplicou a tabela e bagunçou a banca uma vez).
      let c=(cfg.data&&cfg.data[0])||null;
      if(!c&&!cfg.error&&ehSolo){
        // solo sem config = primeiro uso: onboarding de 3 passos cria a config com o nome da pessoa
        setNeedsSetup(true);
        setTours(t.data||[]); setLedger(l.data||[]); setWallets(pw.data||[]); setWds(w.data||[]); setHh(hhr.data||[]); setChgs(cc.data||[]);
        return;
      }
      if(!c&&!cfg.error){
        const r=await sb.from('pool_config').insert({}).select().single();
        c=r.data||null;
        if(!c){ const r2=await sb.from('pool_config').select('*').order('created_at',{ascending:true}); c=(r2.data&&r2.data[0])||null; }
      }
      if(!c){ console.error('pool_config indisponível, tentando de novo…',cfg.error); if(!configRef.current) setTimeout(loadAll,2500); return; }
      setNeedsSetup(false);
      setConfig(c); setTours(t.data||[]); setLedger(l.data||[]); setWallets(pw.data||[]); setWds(w.data||[]); setHh(hhr.data||[]); setChgs(cc.data||[]);
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
      if(p.eventType==='INSERT') return list.some(x=>x.id===p.new.id)?list:[p.new,...list];
      if(p.eventType==='UPDATE') return list.map(x=>x.id===p.new.id?p.new:x);
      if(p.eventType==='DELETE') return list.filter(x=>x.id!==p.old.id);
      return list;
    });
    // avisa o OUTRO jogador quando um torneio fora da grade chega pelo tempo real (não avisa quem lançou)
    const onTour=p=>{
      apply(setTours)(p);
      if(p.eventType==='INSERT' && p.new && p.new.player && !localIds.current.has(p.new.id) && configRef.current){
        const c=configRef.current, mx=abiMaxFor(c,p.new.player,p.new.entry_date);
        if(num(p.new.buyin)>mx) pushToast({tone:C.red,title:`${p.new.player} jogou fora da grade`,text:`${p.new.tournament_name||'Torneio'} · buy-in ${fmt(p.new.buyin)} (máx ${fmt(mx)}). Fique atento e verifique com ${p.new.player.split(' ')[0]}.`});
      }
    };
    const ch=sb.channel('pool-sync')
      .on('postgres_changes',{event:'*',schema:'public',table:'tournaments'},onTour)
      .on('postgres_changes',{event:'*',schema:'public',table:'bankroll_ledger'},apply(setLedger))
      .on('postgres_changes',{event:'*',schema:'public',table:'player_wallets'},apply(setWallets))
      .on('postgres_changes',{event:'*',schema:'public',table:'hh_tournament_stats'},apply(setHh))
      .on('postgres_changes',{event:'*',schema:'public',table:'withdrawals'},apply(setWds))
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

  const [gradeWarn,setGradeWarn]=useState(null); // torneio recém-salvo fora da grade (aviso pro próprio jogador)
  /* CRUD genérico (mesmo padrão do app original) */
  const add = async (table,data,setter,list)=>{
    const {data:row,error}=await sb.from(table).insert(data).select().single();
    if(error){alert('Não consegui salvar. Tente de novo.');console.error(error);return;}
    if(table==='tournaments' && row){
      localIds.current.add(row.id);
      if(config && num(row.buyin)>abiMaxFor(config,row.player,row.entry_date)) setGradeWarn(row); // avisa quem lançou
    }
    setter([row,...list]); setModal(null);
  };
  const del = async (table,id,setter,list)=>{
    const {error}=await sb.from(table).delete().eq('id',id);
    if(error){alert('Não consegui remover.');console.error(error);return;}
    setter(list.filter(x=>x.id!==id));
  };
  const update = async (table,newData,setter,list)=>{
    const {id,created_by,created_at,...payload}=newData;
    const {data:updated,error}=await sb.from(table).update(payload).eq('id',id).select().single();
    if(error){alert('Não consegui atualizar. Tente de novo.');console.error(error);return;}
    setter(list.map(x=>x.id===id?updated:x)); setEditing(null);
  };
  const saveConfig = async patch=>{
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
    setQuickEdit(null);
    const {data,error}=await sb.from('player_wallets').upsert({player,wallet,saldo_inicial},{onConflict:'workspace_id,player,wallet'}).select().single();
    if(error){alert('Não consegui salvar o saldo.');console.error(error);return;}
    setWallets(w=>{ const rest=w.filter(x=>!(x.player===player&&x.wallet===wallet)); return [...rest,data]; });
  };
  /* transferência interna: move saldo de uma carteira pra outra (2 lançamentos casados,
     saída de um lado + entrada do outro). Não muda a banca central (é zero-a-zero);
     só rebalanceia o saldo por jogador/plataforma. "Pool / Reserva" = dinheiro sem dono (player null). */
  const addTransfer = async (out)=>{
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
  /* importa hand histories (.txt ou .zip): parseia no navegador, agrega por torneio e
     sobe SÓ os agregados (upsert por player+site+torneio — reimportar substitui, não duplica) */
  const importHH = async (files,player)=>{
    if(!files.length) return;
    setImp({busy:true,prog:'Lendo arquivos…',res:null});
    const issues=[]; const texts=[];
    // diagnóstico do import: SÓ metadados (nome/tamanho/cabeçalho) — nunca as mãos. Sobe pro
    // hh_import_log no fim, pra dar pra investigar um import que "não foi" sem pedir o arquivo.
    const diag={build:HH_BUILD,ua:String(navigator.userAgent||'').slice(0,140),files:[],zips:[],texts:[]};
    // decodifica dando conta de BOM/UTF-16 (arquivo salvo como "Unicode" no Windows/celular)
    const decodeSmart=u=>{
      if(u[0]===0xFE&&u[1]===0xFF) return new TextDecoder('utf-16be').decode(u);
      if(u[0]===0xFF&&u[1]===0xFE) return new TextDecoder('utf-16le').decode(u);
      let nul=0; const n=Math.min(u.length,400); for(let i=0;i<n;i++) if(u[i]===0) nul++;
      if(nul>n/4) return new TextDecoder(u[0]===0?'utf-16be':'utf-16le').decode(u);   // UTF-16 sem BOM
      return new TextDecoder().decode(u);   // UTF-8 (o decoder já tira o BOM)
    };
    const isZip=u=>u.length>3&&u[0]===0x50&&u[1]===0x4B&&u[2]<=8;   // "PK…" mesmo se renomearam a extensão
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
    if(resumos) issues.unshift(`${resumos} arquivo${resumos!==1?'s':''} ${resumos!==1?'são':'é'} o RESUMO do torneio (resultado, sem as mãos). No PokerCraft, baixe o HAND HISTORY do torneio (as mãos jogadas), não o Tournament Summary.`);
    /* dedup: cada torneio guarda o nº das mãos já importadas (hand_ids). Aqui separamos
       mão NOVA de mão REPETIDA — arquivos sobrepostos (transcript geral + avulsos) podem
       ser importados em qualquer ordem sem contar nada 2x nem perder o que já existia. */
    const grupos={};
    for(const h of allHands){ const k=h.site+'|'+h.tid; (grupos[k]=grupos[k]||[]).push(h); }
    let saved=0, novas=0, repetidas=0, reproc=0; const paraSalvar=[];
    for(const k of Object.keys(grupos)){
      const g=grupos[k], site=g[0].site, tid=g[0].tid;
      const existente=hh.find(x=>x.player===player&&x.site===site&&x.site_tournament_id===tid);
      // linha antiga SEM os campos novos por posição (net/hn): se o arquivo cobre TODAS as
      // mãos já importadas, reprocessa o torneio inteiro — reimportar preenche o bb/100
      // por posição retroativo sem duplicar nada
      const batchIds=new Set(g.map(h=>h.hid).filter(Boolean));
      const upgrade=existente&&Array.isArray(existente.hand_ids)&&existente.hand_ids.length
        &&existente.pos_json&&Object.values(existente.pos_json).some(x=>x&&x.hn==null)
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
      if(error){ issues.push(`lote de torneios ${i+1}+: não salvou (${error.message})`); continue; }
      const recs=(data&&data.length===chunk.length)?data:chunk; saved+=chunk.length;
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

  if(needsSetup&&!config) return <SetupSolo profile={profile} ws={ws} onDone={()=>{setNeedsSetup(false); if(!localStorage.getItem('gb_tour')) setAskTour(true); loadAll();}}/>;
  if(loading||!config) return <div style={{minHeight:'100vh',display:'grid',placeItems:'center'}}><div className="spin"/></div>;

  /* ---- derivados ---- */
  CONFIG_CHANGES=chgs;   // deixa o histórico visível pro abiMaxFor (grade julgada pela época)
  const myName=(profile&&profile.nickname)||String(session.user.email||'').split('@')[0];
  const players=solo?[config.player1_name]:[config.player1_name, config.player2_name];
  // plano do workspace: quem pode usar as Stats (Pro/fundador/time). Gestão de banca é de todos.
  // Sem workspace carregado, conta solo assume 'free' — falha de leitura nunca destrava paywall.
  const plan=ws?ws.plan:(solo?'free':'team');
  const canStats=!solo||['pro','founder','team'].includes(plan);
  // teste grátis de 15 dias: trial_ends_at no futuro = em teste; no passado = bloqueado.
  // null = pool/fundador/assinatura ativa (nunca bloqueia).
  const trialEnds=(ws&&ws.trial_ends_at)?Date.parse(ws.trial_ends_at):null;
  const trialDaysLeft=trialEnds!=null?Math.max(0,Math.ceil((trialEnds-Date.now())/86400000)):null;
  const trialExpired=trialEnds!=null&&Date.now()>trialEnds;
  const makeInit={[players[0]]:num(config.makeup_inicial_player1),[players[1]]:num(config.makeup_inicial_player2)};
  const abiMax=num(config.abi_max), piso=num(config.piso_minimo);
  const sites=(config.sites_permitidos&&config.sites_permitidos.length)?config.sites_permitidos:['PokerStars','GG Poker'];
  const modalidades=(config.modalidades_permitidas&&config.modalidades_permitidas.length)?config.modalidades_permitidas:['MTT','Spin','Cash','Sit & Go'];
  const CURWK=weekEnding(todayISO());

  /* banca central = inicial + resultados dos jogos + movimentos manuais − saques pagos
     (atualiza sozinha a cada torneio lançado; saque de jogador entra pela aba Saques) */
  const resultadosTotal = daily.reduce((s,e)=>s+resultadoDia(e),0);
  const movimentosTotal = ledger.reduce((s,l)=>s+num(l.entrada)-num(l.saida),0);
  const sacadoTotal = wds.reduce((s,w)=>s+num(w.valor_sacado),0);
  const bancaAtual = num(config.banca_inicial)+resultadosTotal+movimentosTotal-sacadoTotal;
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
  players.forEach(p=>{ if(curMakeUp[p]>num(config.makeup_max_recomendado)) alerts.push({tone:C.red,text:`Make-up de ${p} em ${fmt(curMakeUp[p])} — acima do recomendado (${fmt(config.makeup_max_recomendado)}).`}); });
  if(bancaAtual<piso) alerts.push({tone:C.red,text:`Banca atual ${fmt(bancaAtual)} está abaixo do piso mínimo (${fmt(piso)}).`});
  // fora da grade: torneios da semana atual com buy-in acima do ABI máximo DAQUELE jogador (clicável mostra quais/de quem)
  const foraGradeTours=tours.filter(t=>weekEnding(t.entry_date)===CURWK && num(t.buyin)>abiMaxFor(config,t.player,t.entry_date));
  if(foraGradeTours.length) alerts.push({tone:C.red,text:`${foraGradeTours.length} torneio(s) fora da grade nesta semana. Toque para ver quais.`,items:foraGradeTours});
  players.forEach(p=>{ const r=curWeek[p]?curWeek[p].resultado:0; const lim=num(config.stoploss_weekly_pct)*bancaAtual; if(lim>0 && r<0 && r<=-lim) alerts.push({tone:C.red,text:`${p} atingiu o stop loss semanal (${fmt(r)} vs limite ${fmt(-lim)}).`}); });
  daily.filter(e=>weekEnding(e.entry_date)===CURWK).forEach(e=>{ const sl=num(config.stoploss_daily_buyins)*abiMaxFor(config,e.player,e.entry_date); if(sl>0 && resultadoDia(e)<=-sl) alerts.push({tone:C.red,text:`${e.player} bateu o stop loss diário em ${dLabel(e.entry_date)} (${fmt(resultadoDia(e))}, limite ${fmt(-sl)}).`}); });
  // nudge de inatividade: sem registrar torneio há alguns dias -> painel/banca desatualizados.
  // Usa a data do lançamento mais recente (created_at, quando existe; senão a data do torneio).
  if(tours.length>0){
    const ultimo=tours.reduce((m,t)=>{ const d=String(t.created_at||t.entry_date||'').slice(0,10); return d>m?d:m; },'');
    if(ultimo){ const dias=Math.round((Date.parse(todayISO())-Date.parse(ultimo))/86400000);
      if(dias>=2) alerts.push({tone:C.gold,text:`Faz ${dias} dias sem registrar torneios. Se você jogou nesse período, lance os jogos pra manter a banca e as estatísticas em dia.`}); }
  }

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
      {k:'player',label:'Jogador',type:'select',opts:players},
      {k:'tournament_name',label:'Torneio',type:'text',full:true},
      {k:'site',label:'Site',type:'select',opts:sites},
      {k:'modality',label:'Modalidade',type:'select',opts:modalidades},
      {k:'buyin',label:'Buy-in (US$)',type:'money',def:'0'},
      {k:'reentries',label:'Re-entries',type:'int',def:'0'},
      {k:'field_size',label:'Field (jogadores)',type:'int',def:'0'},
      {k:'final_position',label:'Posição final',type:'int'},
      {k:'prize',label:'Premiação (US$)',type:'money',def:'0'},
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
      {k:'player',label:'Jogador',type:'select',opts:players},
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

  /* nav: no celular só o essencial embaixo; o resto abre no "Mais" (menu hambúrguer) */
  const MAIN_TABS=['painel','torneios','diario','stats'];
  const nav=[
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
  ].filter(n=>!solo||n.id!=='saques');  // solo: some só Saques (make-up/split é coisa de pool); Mensal vale pra todos

  /* ---------- mensal ---------- */
  const monthList=[...new Set(allWeeks.map(w=>w.slice(0,7)).concat([todayISO().slice(0,7)]))].sort();
  const monthIdx=monthList.indexOf(month);
  const goMonth=d=>{const i=monthIdx+d; if(i>=0&&i<monthList.length)setMonth(monthList[i]);};
  const monthWeeks=players.flatMap(p=>(weeksByPlayer[p]||[]).filter(w=>w.week.slice(0,7)===month));
  const monthDaily=daily.filter(e=>weekEnding(e.entry_date).slice(0,7)===month);
  const mRes=monthWeeks.reduce((s,w)=>s+w.resultado,0);
  const mLucroDiv=monthWeeks.reduce((s,w)=>s+w.lucroDiv,0);
  const mPool=monthWeeks.reduce((s,w)=>s+w.partePool,0);
  const mTorneios=monthDaily.reduce((s,e)=>s+num(e.qtd_torneios),0);
  const mEntradas=monthDaily.reduce((s,e)=>s+(num(e.qtd_entradas)||num(e.qtd_torneios)),0);
  const mBuyins=monthDaily.reduce((s,e)=>s+num(e.total_buyins),0);
  const mAbi=mEntradas>0?mBuyins/mEntradas:0;
  const mRoi=mBuyins>0?(mRes/mBuyins)*100:0;
  const dayResults=monthDaily.map(e=>({d:e.entry_date,r:resultadoDia(e),p:e.player}));
  const melhorDia=dayResults.length?dayResults.reduce((a,b)=>b.r>a.r?b:a):null;
  const piorDia=dayResults.length?dayResults.reduce((a,b)=>b.r<a.r?b:a):null;
  const monthToursOf=p=>tours.filter(t=>t.player===p && weekEnding(t.entry_date).slice(0,7)===month);
  const perPlayerMonth=players.map(p=>{
    const ed=monthDaily.filter(e=>e.player===p);
    const res=monthWeeks.filter(w=>w.player===p).reduce((s,w)=>s+w.resultado,0);
    const vol=ed.reduce((s,e)=>s+num(e.total_buyins),0);
    const torneios=ed.reduce((s,e)=>s+num(e.qtd_torneios),0);
    const entradas=ed.reduce((s,e)=>s+(num(e.qtd_entradas)||num(e.qtd_torneios)),0);
    const premios=monthToursOf(p).reduce((s,t)=>s+num(t.prize),0);
    const cashes=monthToursOf(p).filter(t=>num(t.prize)>0).length;
    const abi=entradas>0?vol/entradas:0;
    const roi=vol>0?(res/vol)*100:0;
    const itm=torneios>0?(cashes/torneios)*100:0;
    const makeAberto=(()=>{const ws=(weeksByPlayer[p]||[]).filter(w=>w.week.slice(0,7)===month); return ws.length?ws[ws.length-1].makeFinal:makeUpAt(p,month+'-31');})();
    return {p, res, vol, torneios, entradas, premios, cashes, abi, roi, itm, makeAberto};
  });
  const maisLucrativo=perPlayerMonth.length?perPlayerMonth.reduce((a,b)=>b.res>a.res?b:a):null;
  const maiorVolume=perPlayerMonth.length?perPlayerMonth.reduce((a,b)=>b.vol>a.vol?b:a):null;
  // desempenho por site e por modalidade (usa os campos que já são lançados em cada torneio)
  const monthTours=tours.filter(t=>weekEnding(t.entry_date).slice(0,7)===month);
  // "Onde vocês lucram" com filtro Geral/jogador
  const monthToursWho=mensalWho==='Geral'?monthTours:monthTours.filter(t=>t.player===mensalWho);
  const breakdownBy=(key,list)=>{
    const m={};
    list.forEach(t=>{ const k=t[key]||'—'; if(!m[k]) m[k]={k,n:0,inv:0,res:0,premios:0}; const g=m[k]; g.n+=1; g.inv+=totalInvestido(t); g.res+=lucroTorneio(t); g.premios+=num(t.prize); });
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
    const buyins=dd.reduce((s,e)=>s+num(e.total_buyins),0);
    const premios=diaryTours.reduce((s,t)=>s+num(t.prize),0);
    const cashes=diaryTours.filter(t=>num(t.prize)>0).length;
    return {res,torneios,entradas,buyins,premios,
      abi:entradas>0?buyins/entradas:0, roi:buyins>0?(res/buyins)*100:0, itm:torneios>0?(cashes/torneios)*100:0,
      dias:[...new Set(dd.map(e=>e.entry_date))].length};
  })();

  // teste grátis acabou: bloqueia o app inteiro até assinar (dados preservados no banco)
  if(trialExpired) return <>
    <TrialBlocked plan={plan} email={session.user.email} onLogout={sair} onDelete={()=>setDelAcc(true)}/>
    {delAcc&&<DeleteAccountModal nickname={myName} onClose={()=>setDelAcc(false)}/>}
  </>;

  return <div className="wrap">
    {/* sidebar desktop */}
    <aside className="side" style={{flexDirection:'column',width:238,padding:20,borderRight:`1px solid ${C.border}`,position:'sticky',top:0,height:'100vh',gap:6}}>
      <Brand team={!solo}/><div style={{height:6}}/>
      {nav.map(n=><NavBtn key={n.id} Icon={n.Icon} label={n.label} active={view===n.id} onClick={()=>setView(n.id)}/>)}
      <div style={{marginTop:'auto',display:'flex',flexDirection:'column',gap:10}}>
        <div style={{padding:15,borderRadius:16,background:C.plumSoft}}>
          <div style={{fontSize:12.5,color:P,fontWeight:700}}>Banca atual</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,color:P,marginTop:2}}>{fmt(bancaAtual)}</div>
        </div>
        <button onClick={sair} style={{padding:'10px',borderRadius:12,border:`1px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:600,cursor:'pointer',fontSize:13.5}}>Sair</button>
      </div>
    </aside>

    <main style={{flex:1,padding:'22px 16px calc(112px + env(safe-area-inset-bottom))',maxWidth:'100%',minWidth:0}}>
      {/* header mobile */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
        <div className="bottomnav"><Brand small team={!solo}/></div>
        <button className="mobile-only" onClick={sair} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:12,border:`1px solid ${C.border}`,background:'transparent',color:C.inkSoft,fontWeight:600,cursor:'pointer',fontSize:13}}><IcoLogout s={16}/>Sair</button>
      </div>

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
        {installCard&&<Card style={{padding:'14px 16px',display:'flex',alignItems:'center',gap:12,border:`1.5px solid ${P}`,background:C.plumSoft}}>
          <span style={{width:40,height:40,borderRadius:12,background:'#fff',display:'grid',placeItems:'center',color:P,flexShrink:0}}><IcoChip s={22}/></span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:14,color:C.ink}}>Deixe o GrinderBank na tela inicial</div>
            <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.4}}>Abre em tela cheia, como um app de celular — {isIOS()?'toque pra ver como':'um toque e pronto'}.</div>
          </div>
          <button onClick={instalar} style={{padding:'9px 14px',borderRadius:11,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',flexShrink:0}}>{isIOS()?'Como instalar':'Adicionar'}</button>
          <button onClick={dispensarInstall} aria-label="Dispensar" style={{width:30,height:30,borderRadius:9,border:'none',background:'transparent',color:C.inkSoft,cursor:'pointer',display:'grid',placeItems:'center',flexShrink:0}}><IcoX s={16}/></button>
        </Card>}
        <Card style={{padding:22,background:`linear-gradient(135deg,${P},#3B305E)`,border:'none',color:'#fff'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,opacity:.85,fontWeight:600,fontSize:14}}><IcoStack s={17}/>{solo?'Minha banca':'Banca central da pool'}</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:42,fontWeight:600,marginTop:6}}>{fmt(bancaAtual)}</div>
          <div style={{display:'flex',gap:'6px 16px',flexWrap:'wrap',marginTop:8,fontSize:12.5,opacity:.88,fontWeight:600}}>
            <span>Inicial {fmt(config.banca_inicial)}</span>
            <span>Jogos {resultadosTotal>=0?'+':'−'}{fmt(Math.abs(resultadosTotal))}</span>
            {movimentosTotal!==0&&<span>Aportes {movimentosTotal>=0?'+':'−'}{fmt(Math.abs(movimentosTotal))}</span>}
            {sacadoTotal>0&&<span>Saques −{fmt(sacadoTotal)}</span>}
          </div>
          <div style={{marginTop:12}}><Bar2 pct={piso>0?(bancaAtual/piso)*100:100} color="#fff" track="rgba(255,255,255,.22)"/></div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:13.5,opacity:.92}}>
            <span>Piso mínimo {fmt(piso)}</span>
            <span>{bancaAtual>=piso?`${fmt(bancaAtual-piso)} acima do piso`:'abaixo do piso!'}</span>
          </div>
        </Card>

        {alerts.length>0&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
          {alerts.map((a,i)=>{const clickable=a.items&&a.items.length; return <Card key={i} onClick={clickable?()=>setAlertDetail(a):undefined} style={{padding:'14px 16px',display:'flex',alignItems:'center',gap:11,borderLeft:`4px solid ${a.tone}`,cursor:clickable?'pointer':'default'}}>
            <span style={{color:a.tone,flexShrink:0}}><IcoAlert s={20}/></span>
            <span style={{fontSize:13.5,fontWeight:600,color:C.ink,flex:1}}>{a.text}</span>
            {clickable&&<span style={{color:C.inkSoft,fontSize:20,flexShrink:0}}>›</span>}
          </Card>;})}
        </div>}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <Stat Icon={resSemanaAtual>=0?IcoUp:IcoDown} tone={resSemanaAtual>=0?C.greenMid:C.red} bg={resSemanaAtual>=0?C.greenSoft:C.redSoft} label="Resultado da semana" value={fmt(resSemanaAtual)} sub={resSemanaAtual===0&&!daily.some(e=>weekEnding(e.entry_date)===CURWK)?`semana começando · até ${dLabel(CURWK)}`:`semana até ${dLabel(CURWK)}`}/>
          {!solo&&<Stat Icon={IcoAlert} tone={makeUpTotal>0?C.gold:C.greenMid} bg={makeUpTotal>0?C.goldSoft:C.greenSoft} label="Make-up em aberto" value={fmt(makeUpTotal)} sub={players.map(p=>`${p.split(' ')[0]}: ${fmt(curMakeUp[p])}`).join(' · ')}/>}
          {!solo&&<Stat Icon={IcoCashOut} tone={P} bg={C.plumSoft} label="Saque autorizado" value={fmt(saqueAutTotal)} sub="semana atual, respeitando o piso"/>}
          <Stat Icon={IcoChip} tone={C.green} bg={C.greenSoft} label={solo?'Lucro acumulado':'Lucro da pool (acum.)'} value={fmt(solo?resTotalGeral:lucroPoolAcum)} sub={solo?'desde o começo':`pago em saques: ${fmt(totalPago)}`}/>
          {solo&&<Stat Icon={IcoTrophy} tone={C.gold} bg={C.goldSoft} label="Torneios jogados" value={String(tours.length)} sub={`ABI médio ${fmt(tours.length?tours.reduce((s,t)=>s+totalInvestido(t),0)/tours.reduce((s,t)=>s+1+num(t.reentries),0):0)}`}/>}
        </div>

        <StopLossCard players={players} config={config} daily={daily} curWeek={curWeek} bancaAtual={bancaAtual}/>

        {!solo&&<Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 4px'}}>Divisão do dinheiro</h3>
          <div style={{fontSize:12.5,color:C.inkSoft,marginBottom:12}}>O que cada jogador tem autorizado e ainda não sacou, e o que já ficou pra pool. <b>"A receber"</b> é o acumulado (autorizado − pago); o quanto dá pra sacar <b>agora</b> respeita o piso — veja "Saque autorizado" acima.</div>
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
        </Card>}

        <Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 4px'}}>Lucro acumulado por jogador</h3>
          <div style={{fontSize:12.5,color:C.inkSoft,marginBottom:12}}>A curva de cada um ao longo do tempo. Passe o dedo pra ver os valores.</div>
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
      </div>}

      {/* ---------------- TORNEIOS (lançamento: hoje + relatórios dos dias anteriores) ---------------- */}
      {view==='torneios'&&(()=>{
        const today=todayISO();
        const dates=[...new Set(tours.map(t=>t.entry_date))].sort((a,b)=>a<b?1:-1);
        const past=dates.filter(d=>d!==today);
        return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
            <div><div style={{fontSize:13,color:C.inkSoft,fontWeight:600}}>Lança torneio a torneio · o Diário e a banca se ajustam sozinhos</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,lineHeight:1.1}}>Torneios</div></div>
            <button onClick={()=>addTourOn(today)} style={{display:'flex',alignItems:'center',gap:6,background:P,color:'#fff',border:'none',padding:'11px 16px',borderRadius:13,fontWeight:700,fontSize:14.5,cursor:'pointer',flexShrink:0,boxShadow:'0 6px 16px -8px rgba(91,75,138,.7)'}}><IcoPlus s={18}/>Adicionar</button>
          </div>
          <DayCard today date={today} dayTours={tours.filter(t=>t.entry_date===today)} players={players} config={config} onAdd={addTourOn} onEdit={editTour} onDelete={delTour}/>
          {past.length>0&&<div style={{fontSize:13,fontWeight:700,color:C.inkSoft,margin:'4px 2px 0'}}>Dias anteriores</div>}
          {past.slice(0,pastN).map(d=><DayCard key={d} date={d} dayTours={tours.filter(t=>t.entry_date===d)} players={players} config={config} onAdd={addTourOn} onEdit={editTour} onDelete={delTour}/>)}
          <VerMais resta={past.length-pastN} bloco={10} rotulo="dias" onClick={()=>setPastN(n=>n+10)}/>
        </div>;
      })()}

      {/* ---------------- DIÁRIO (resumo por jogador/dia, editável pelos torneios) ---------------- */}
      {view==='diario'&&<div className="ftfade" style={{display:'flex',flexDirection:'column',gap:12}}>
        <div><div style={{fontSize:13,color:C.inkSoft,fontWeight:600}}>Resumo por jogador e dia — monta sozinho dos torneios. Toque num dia pra conferir/corrigir.</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,lineHeight:1.1}}>Diário</div></div>

        {/* filtros */}
        <Card style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12}}>
            <Seg label="Jogador" value={diF.player} options={['Todos',...players]} onChange={v=>setDiF(f=>({...f,player:v}))}/>
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
            <MiniStat label="ROI" value={pctFmt(diAgg.roi)} tone={diAgg.res>=0?C.greenMid:C.red}/>
            <MiniStat label="ITM" value={pctFmt(diAgg.itm)}/>
          </div>
        </Card>}

        {diaryDaily.length?<>
          {diaryDaily.slice(0,diaryN).map(e=><DiaryCard key={e.id} entry={e} dayTours={diaryTours.filter(t=>t.player===e.player&&t.entry_date===e.entry_date)} players={players} config={config} onAdd={addTourOn} onEdit={editTour} onDelete={delTour}/>)}
          <VerMais resta={diaryDaily.length-diaryN} bloco={12} rotulo="dias" onClick={()=>setDiaryN(n=>n+12)}/>
        </>:<Empty>{diFiltroAtivo?'Nenhum torneio nesse filtro/período.':'Sem torneios lançados ainda. Vá em Torneios e lance o primeiro.'}</Empty>}
      </div>}

      {/* ---------------- SEMANAL ---------------- */}
      {view==='semanal'&&<div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
        <Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:'0 0 4px'}}>Geral da pool</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:12}}>Split {pctFmt(num(config.player_pct)*100)} pro jogador · {pctFmt((1-num(config.player_pct))*100)} pra pool</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{padding:14,borderRadius:14,background:C.bg}}><div style={{fontSize:12.5,color:C.inkSoft,fontWeight:700}}>Lucro acumulado da pool</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.green}}>{fmt(lucroPoolAcum)}</div></div>
            <div style={{padding:14,borderRadius:14,background:C.bg}}><div style={{fontSize:12.5,color:C.inkSoft,fontWeight:700}}>Total pago em saques</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:P}}>{fmt(totalPago)}</div></div>
          </div>
        </Card>
        {!solo&&<SemanalGeral geral={geralSemana} curMonth={curMonthISO}/>}
        {players.map(p=><SemanalPlayer key={p} player={p} weeks={weeksByPlayer[p]||[]} config={config} curMonth={curMonthISO} makeUpAtual={curMakeUp[p]} solo={solo}/>)}
      </div>}

      {/* ---------------- MENSAL ---------------- */}
      {view==='mensal'&&<div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <div><div style={{fontSize:13,color:C.inkSoft,fontWeight:600}}>Consolidado de</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:600,lineHeight:1.1}}>{mLabel(month)}</div></div>
          <div style={{display:'flex',gap:8}}><RoundBtn disabled={monthIdx<=0} onClick={()=>goMonth(-1)}>‹</RoundBtn><RoundBtn disabled={monthIdx>=monthList.length-1} onClick={()=>goMonth(1)}>›</RoundBtn></div>
        </div>
        <div style={{fontSize:12,color:C.inkSoft,marginTop:-8,display:'flex',alignItems:'flex-start',gap:6}}><span style={{flexShrink:0,lineHeight:1.4}}><IcoAlert s={14}/></span><span style={{lineHeight:1.4}}>Cada semana conta no mês do <b>domingo que a fecha</b> — por isso um dia do fim do mês pode aparecer no mês seguinte.</span></div>
        <button onClick={()=>setReport({type:'mensal'})} style={{alignSelf:'flex-start',display:'inline-flex',alignItems:'center',gap:6,padding:'9px 14px',borderRadius:12,border:`1.5px solid ${P}`,background:C.plumSoft,color:P,fontWeight:700,fontSize:13,cursor:'pointer'}}>📄 Gerar relatório do mês (PDF)</button>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <Stat Icon={mRes>=0?IcoUp:IcoDown} tone={mRes>=0?C.greenMid:C.red} bg={mRes>=0?C.greenSoft:C.redSoft} label="Resultado do mês" value={fmt(mRes)}/>
          {!solo&&<Stat Icon={IcoChip} tone={C.green} bg={C.greenSoft} label="Lucro dividido" value={fmt(mLucroDiv)} sub={`pool ficou com ${fmt(mPool)}`}/>}
          <Stat Icon={IcoTrophy} tone={C.gold} bg={C.goldSoft} label="Torneios no mês" value={String(mTorneios)} sub={`ABI médio ${fmt(mAbi)}`}/>
          <Stat Icon={IcoPanel} tone={mRoi>=0?C.greenMid:C.red} bg={mRoi>=0?C.greenSoft:C.redSoft} label="ROI do mês" value={pctFmt(mRoi)} sub={`sobre ${fmt(mBuyins)} em buy-ins`}/>
        </div>
        <Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 12px'}}>Por jogador</h3>
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
              <MiniStat label="ITM" value={pctFmt(pm.itm)}/>
            </div>
          </div>)}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:14}}>
            <div style={{padding:12,borderRadius:12,background:C.bg}}><div style={{fontSize:12,color:C.inkSoft,fontWeight:700}}>Mais lucrativo</div><div style={{fontWeight:700,marginTop:2}}>{maisLucrativo?`${maisLucrativo.p} (${fmt(maisLucrativo.res)})`:'—'}</div></div>
            <div style={{padding:12,borderRadius:12,background:C.bg}}><div style={{fontSize:12,color:C.inkSoft,fontWeight:700}}>Maior volume</div><div style={{fontWeight:700,marginTop:2}}>{maiorVolume?`${maiorVolume.p} (${fmt(maiorVolume.vol)})`:'—'}</div></div>
            <div style={{padding:12,borderRadius:12,background:C.greenSoft}}><div style={{fontSize:12,color:C.green,fontWeight:700}}>Melhor dia</div><div style={{fontWeight:700,marginTop:2}}>{melhorDia?<>{dLabel(melhorDia.d)} · {fmt(melhorDia.r)}{melhorDia.d.slice(0,7)!==month&&<span style={{color:C.green,fontWeight:600,fontSize:11}}> · semana deste mês</span>}</>:'—'}</div></div>
            <div style={{padding:12,borderRadius:12,background:C.redSoft}}><div style={{fontSize:12,color:C.red,fontWeight:700}}>Pior dia</div><div style={{fontWeight:700,marginTop:2}}>{piorDia?<>{dLabel(piorDia.d)} · {fmt(piorDia.r)}{piorDia.d.slice(0,7)!==month&&<span style={{color:C.red,fontWeight:600,fontSize:11}}> · semana deste mês</span>}</>:'—'}</div></div>
          </div>
        </Card>
        {monthTours.length>0&&<Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,margin:'0 0 4px'}}>{solo?'Onde você lucra':'Onde vocês lucram'}</h3>
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
        const hands=S('hands');
        const bb100=hands>0?S('net_bb')/hands*100:0;
        const evbb=S('allin_ev_bb'), netbb=S('allin_net_bb'), sorte=netbb-evbb;
        const afc=S('af_calls'), afb=S('af_bets');
        const pos={}; rows.forEach(r=>{ const pj=r.pos_json||{}; Object.keys(pj).forEach(k=>{ if(!pos[k])pos[k]={h:0,v:0,p:0,net:0,hn:0}; pos[k].h+=num(pj[k].h); pos[k].v+=num(pj[k].v); pos[k].p+=num(pj[k].p); pos[k].net+=num(pj[k].net); pos[k].hn+=num(pj[k].hn); }); });
        const POS_ORDER=['EP','MP','CO','BTN','SB','BB'];
        // leituras calculadas UMA vez: alimentam o card "Leituras do jogo" E os toques nas stats
        const insights=hhInsights({hands,vpip:S('vpip_cnt'),pfr:S('pfr_cnt'),tb:S('tb_cnt'),tbOpp:S('tb_opp'),f3b:S('f3b_cnt'),f3bOpp:S('f3b_opp'),steal:S('steal_cnt'),stealOpp:S('steal_opp'),bbdef:S('bbdef_cnt'),bbdefOpp:S('bbdef_opp'),cbet:S('cbet_cnt'),cbetOpp:S('cbet_opp'),fcb:S('fcbet_cnt'),fcbOpp:S('fcbet_opp'),wtsd:S('wtsd_cnt'),wsd:S('wsd_cnt'),wwsf:S('wwsf_cnt'),sawflop:S('sawflop_cnt'),afB:afb,afC:afc,sorte,allinCnt:S('allin_cnt'),pos,bb100});
        const hintFor=k=>insights.find(i=>i.k===k)||null;
        const toggleHint=k=>setStatHint(s=>s===k?null:k);
        // tile com leitura acoplada (só marca ⚠ se existir leitura pra essa stat)
        const tile=(label,cnt,opp,bk,k)=>{ const kk=k||bk; return <StatTile label={label} cnt={cnt} opp={opp} band={HH_BANDS[bk]} hint={hintFor(kk)} open={statHint===kk} onToggle={()=>toggleHint(kk)}/>; };
        const hintBox=keys=>{ const i=keys.includes(statHint)?hintFor(statHint):null; return i?<StatHintBox i={i} onClose={()=>setStatHint(null)}/>:null; };
        const verd=hands>=300?hintFor('bb100'):null;   // veredito bb/100 × sorte (ponto mais nobre da tela)
        const VERD_C={red:C.red,gold:C.gold,green:C.greenMid,info:P};
        return <div className="ftfade" style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><div style={{fontSize:13,color:C.inkSoft,fontWeight:600}}>Estatísticas de jogo a partir dos hand histories — só agregados sobem pro banco.</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:600,lineHeight:1.1}}>Stats</div></div>

          {/* importação */}
          <Card style={{padding:18}}>
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
          </Card>

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
              `VPIP ${pctS(S('vpip_cnt'),hands)} · PFR ${pctS(S('pfr_cnt'),hands)}`,
              `3-bet ${pctS(S('tb_cnt'),S('tb_opp'))} · Fold pra 3-bet ${pctS(S('f3b_cnt'),S('f3b_opp'))}`,
              `Roubo de blinds ${pctS(S('steal_cnt'),S('steal_opp'))} · BB defende ${pctS(S('bbdef_cnt'),S('bbdef_opp'))}`,
              `C-bet flop ${pctS(S('cbet_cnt'),S('cbet_opp'))} · Fold pra c-bet ${pctS(S('fcbet_cnt'),S('fcbet_opp'))}`,
              `WWSF ${pctS(S('wwsf_cnt'),S('sawflop_cnt'))} · WTSD ${pctS(S('wtsd_cnt'),S('sawflop_cnt'))} · W$SD ${pctS(S('wsd_cnt'),S('wtsd_cnt'))}`,
              'Definições: WWSF e WTSD = % sobre flops vistos; W$SD = % sobre showdowns; bb/100 em fichas; sorte = all-in EV (só cartas viradas, PKO/ICM fora).',
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
                  <div style={{minWidth:0}}><div style={{fontWeight:800,fontSize:13,color:TONE[i.tone].c}}>{i.t}</div><div style={{fontSize:12.5,color:C.ink,lineHeight:1.5,marginTop:2}}>{i.x}</div></div>
                </div>)}
              </div>}
            </Card>;
          })()}


          <Card style={{padding:18}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,margin:'0 0 10px'}}>Pré-flop</h3>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8}}>
              {tile('VPIP',S('vpip_cnt'),hands,'vpip')}
              {tile('PFR',S('pfr_cnt'),hands,'pfr')}
              {tile('3-bet',S('tb_cnt'),S('tb_opp'),'tb')}
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
              {tile('WTSD',S('wtsd_cnt'),S('sawflop_cnt'),'wtsd')}
              {tile('W$SD',S('wsd_cnt'),S('wtsd_cnt'),'wsd')}
            </div>
            {hintBox(['cbet','fcb','wwsf','wtsd','wsd'])}
            <div style={{fontSize:11.5,color:C.inkSoft,marginTop:10,lineHeight:1.5}}>WWSF e WTSD = % sobre os <b>flops vistos</b> · W$SD = % sobre os <b>showdowns</b> (o HUD da GG usa outra base — detalhe no glossário). Stat com <b>⚠</b> tem uma leitura — toque no número pra ver.</div>
          </Card>
          <Card style={{padding:18}}>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,margin:'0 0 10px'}}>Por posição</h3>
            {POS_ORDER.filter(k=>pos[k]&&pos[k].h>0).map(k=>{const b100=pos[k].hn>0?pos[k].net/pos[k].hn*100:null; const ph=hintFor('pos:'+k); return <div key={k} onClick={ph?()=>toggleHint('pos:'+k):undefined} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${C.border}`,fontSize:13,flexWrap:'wrap',cursor:ph?'pointer':'default',background:statHint==='pos:'+k?C.bg:'transparent',borderRadius:statHint==='pos:'+k?8:0}}>
              <b style={{width:42}}>{k}</b>
              <span style={{color:C.inkSoft,flex:1}}>{pos[k].h} mão{pos[k].h!==1?'s':''}</span>
              <span>VPIP <b>{pctFmt(pos[k].v/pos[k].h*100)}</b></span>
              <span>PFR <b>{pctFmt(pos[k].p/pos[k].h*100)}</b></span>
              <span>BB/100 <b style={{color:b100==null?C.inkSoft:b100>=0?C.greenMid:C.red}}>{b100==null?'—':fmtBB(b100).replace(' bb','')}</b></span>
              {ph&&<span style={{color:{red:C.red,gold:C.gold,green:C.greenMid,info:P}[ph.tone],display:'flex',alignItems:'center'}}><IcoAlert s={14}/></span>}
            </div>;})}
            {hintBox(POS_ORDER.map(k=>'pos:'+k))}
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
                  ? <div style={{fontSize:13.5,color:C.inkSoft,marginTop:4}}>Nenhum all-in com cartas reveladas no período — ainda não há sorte pra medir.</div>
                  : <>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17.5,fontWeight:600,color:tone,marginTop:4}}>
                      {neutro?'Neutro — variância dentro do normal':`Você está ${grau} com ${sorte>=0?'SORTE':'AZAR'}`}
                      <span style={{fontSize:13.5,fontWeight:700}}> ({luck100>=0?'+':'−'}{Math.abs(luck100).toFixed(1).replace('.',',')} bb/100 {sorte>=0?'acima':'abaixo'} do justo)</span>
                    </div>
                    <div style={{fontSize:12.5,color:C.ink,lineHeight:1.6,marginTop:6}}>
                      Seu bb/100 real no período é <b style={{color:bb100>=0?C.greenMid:C.red}}>{fmtBB(bb100)}</b> — tirando a sorte dos all-ins, seria <b style={{color:adj>=0?C.greenMid:C.red}}>{fmtBB(adj)}</b>. Esse segundo número é o termômetro mais honesto do seu jogo.
                      {pctEV!=null&&<> Nos all-ins, você recebeu <b>{Math.abs(pctEV).toFixed(0).replace('.',',')}% {pctEV>=0?'a mais':'a menos'}</b> do que a equity mandava.</>}
                    </div>
                    {curta&&<div style={{fontSize:11.5,color:C.inkSoft,marginTop:6}}>⚠️ Amostra curta ({allins} all-in{allins!==1?'s':''} em {hands} mão{hands!==1?'s':''}) — esse termômetro ainda oscila muito; leve como tendência, não como veredito final.</div>}
                  </>}
              </div>;
            })()}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8,marginBottom:12}}>
              <div style={{padding:'10px 12px',borderRadius:12,background:C.bg}}><div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700}}>O QUE ACONTECEU</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:netbb>=0?C.greenMid:C.red}}>{fmtBB(netbb)}</div></div>
              <div style={{padding:'10px 12px',borderRadius:12,background:C.bg}}><div style={{fontSize:10.5,color:C.inkSoft,fontWeight:700}}>O QUE ERA "JUSTO" (EV)</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:evbb>=0?C.greenMid:C.red}}>{fmtBB(evbb)}</div></div>
              <div style={{padding:'10px 12px',borderRadius:12,background:sorte>=0?C.greenSoft:C.redSoft}}><div style={{fontSize:10.5,color:sorte>=0?C.green:C.red,fontWeight:700}}>SORTE (DIFERENÇA)</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:sorte>=0?C.greenMid:C.red}}>{fmtBB(sorte)}</div></div>
            </div>
            <div style={{fontSize:12.5,color:C.inkSoft,lineHeight:1.6}}>
              Toda vez que o dinheiro entra <b>all-in e as cartas viram</b>, dá pra calcular a chance real da sua mão (a <b>equity</b>). Se AA vs KK fosse pago "na justiça", você levaria ~82% do pote — o <b>EV</b> soma esse valor justo de cada all-in. O <b>"o que aconteceu"</b> é o resultado real. A diferença entre os dois é <b>pura variância</b>: <span style={{color:C.red,fontWeight:700}}>negativa = azar</span>, <span style={{color:C.greenMid,fontWeight:700}}>positiva = sorte</span> — e vale lembrar que ela <b>não diz se o all-in foi uma boa decisão</b>, só separa o resultado da execução.
            </div>
            <div style={{fontSize:12,color:C.inkSoft,marginTop:8,lineHeight:1.5}}>⚠️ <b>Limites da medida</b> (honestidade de reg): ela cobre só os all-ins de cartas viradas. Sorte <b>antes</b> do all-in (cooler, distribuição de cartas, runout sem all-in), <b>bounty de PKO</b> (um call negativo em fichas pode ser positivo em dinheiro pelo prêmio) e <b>ICM de mesa final</b> ficam fora. Use como hipótese forte sobre a variância — não como sentença sobre o seu jogo.</div>
            <div style={{fontSize:12,color:C.inkSoft,marginTop:8,padding:'8px 10px',borderRadius:10,background:C.bg,lineHeight:1.5}}>💡 <b>Na prática:</b> prejuízo com sorte muito negativa = provavelmente é variância, mantém o plano e a grade. Lucro com sorte muito positiva = o winrate real é menor do que parece, não suba de grade ainda. Só all-ins com cartas reveladas entram na conta ({S('allin_cnt')} até aqui).</div>
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
        const foraHH=hhr.filter(r=>num(r.buyin)>abiMaxFor(config,sp,r.entry_date)+0.011);
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
            <div style={{fontSize:12.5,color:C.ink,lineHeight:1.5}}>{foraHH.map(r=>`${r.tournament_name||('#'+r.site_tournament_id)} · ${dLabel(r.entry_date)} · buy-in ${fmt(r.buyin)} (máx da época ${fmt(abiMaxFor(config,sp,r.entry_date))})`).join(' — ')}</div>
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
                  {x.tipo==='ok'&&`Lançado ${fmt(x.t.buyin)} · mãos comprovam ${fmt(x.hh.buyin)} · ${x.hh.hands} mão(s) no arquivo`}
                  {x.tipo==='buyin'&&`Lançado ${fmt(x.t.buyin)} mas as mãos mostram ${fmt(x.hh.buyin)} — confere qual está certo e corrige o lançamento`}
                  {x.tipo==='semlanc'&&`As mãos provam que esse torneio foi jogado (${x.hh.hands} mão(s), buy-in ${fmt(x.hh.buyin)}) mas não há lançamento correspondente na aba Torneios`}
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
              {podePagar&&<button onClick={()=>setModal({type:'wd',initial:{week_ending_date:w.week,player:p,valor_sacado:String(Math.max(0,w.saqueAut-vs)).replace('.',',')}})} style={{padding:'8px 14px',borderRadius:11,border:'none',background:P,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',flexShrink:0}}>Registrar</button>}
            </div>;}):<Empty>Nenhuma semana com saque autorizado ainda.</Empty>;
          })()}
        </Card>
        <ListView title="Pagamentos registrados" onAdd={()=>setModal('wd')} rows={[...wds].sort((a,b)=>a.week_ending_date<b.week_ending_date?1:-1)} empty="Nenhum pagamento registrado."
          renderRow={w=><Row key={w.id}
            onDelete={()=>del('withdrawals',w.id,setWds,wds)}
            onEdit={()=>setEditing({type:'wd',item:w})}
            left={<><span style={{width:40,height:40,borderRadius:12,background:C.plumSoft,display:'grid',placeItems:'center',flexShrink:0,color:pcolor(w.player)}}><IcoCashOut s={19}/></span>
              <div><div style={{fontWeight:700,fontSize:15}}>{w.player}</div><div style={{fontSize:12.5,color:C.inkSoft}}>semana até {dLabel(w.week_ending_date)}{w.observacoes?` · ${w.observacoes}`:''}</div></div></>}
            right={<span style={{fontWeight:800,fontSize:16,color:P,flexShrink:0}}>{fmt(w.valor_sacado)}</span>}/>}/>
      </div>}

      {/* ---------------- BANCA ---------------- */}
      {view==='banca'&&<div className="ftfade" style={{display:'flex',flexDirection:'column',gap:16}}>
        <Card style={{padding:22,background:`linear-gradient(135deg,${P},#3B305E)`,border:'none',color:'#fff'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,opacity:.85,fontWeight:600,fontSize:14}}><IcoStack s={17}/>Banca atual</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:40,fontWeight:600,marginTop:6}}>{fmt(bancaAtual)}</div>
          <div style={{display:'flex',gap:18,marginTop:14,flexWrap:'wrap'}}>
            <div><div style={{fontSize:12.5,opacity:.85}}>Banca inicial</div><div style={{fontWeight:700,fontSize:15}}>{fmt(config.banca_inicial)}</div></div>
            <div><div style={{fontSize:12.5,opacity:.85}}>Resultado dos jogos</div><div style={{fontWeight:700,fontSize:15}}>{resultadosTotal>=0?'+':'−'}{fmt(Math.abs(resultadosTotal))}</div></div>
            <div><div style={{fontSize:12.5,opacity:.85}}>Aportes/movimentos</div><div style={{fontWeight:700,fontSize:15}}>{movimentosTotal>=0?'+':'−'}{fmt(Math.abs(movimentosTotal))}</div></div>
            <div><div style={{fontSize:12.5,opacity:.85}}>Saques pagos</div><div style={{fontWeight:700,fontSize:15}}>−{fmt(sacadoTotal)}</div></div>
          </div>
        </Card>

        <Card style={{padding:20}}>
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
        </Card>

        <ListView title="Movimentos da banca" subtitle="Só aportes e retiradas externas (dinheiro entrando ou saindo da pool). Resultado de jogo entra sozinho pelo Diário, e saque de jogador pela aba Saques — não registre eles aqui de novo." onAdd={()=>setModal('bank')} rows={[...ledger].sort((a,b)=>a.entry_date<b.entry_date?1:-1)} empty="Nenhum movimento na banca."
          renderRow={l=>{const net=num(l.entrada)-num(l.saida); return <Row key={l.id}
            onDelete={()=>del('bankroll_ledger',l.id,setLedger,ledger)}
            onEdit={()=>setEditing({type:'bank',item:l})}
            left={<><span style={{width:40,height:40,borderRadius:12,background:net>=0?C.greenSoft:C.redSoft,display:'grid',placeItems:'center',flexShrink:0,color:net>=0?C.greenMid:C.red}}>{net>=0?<IcoUp s={20}/>:<IcoDown s={20}/>}</span>
              <div><div style={{fontWeight:700,fontSize:15}}>{l.wallet}{l.player?` · ${l.player}`:''}</div><div style={{fontSize:12.5,color:C.inkSoft}}>{dLabel(l.entry_date)}{l.observacao?` · ${l.observacao}`:''}</div></div></>}
            right={<span style={{fontWeight:800,fontSize:16,color:net>=0?C.greenMid:C.red,flexShrink:0}}>{net>=0?'+':'−'}{fmt(Math.abs(net))}</span>}/>;}}/>
      </div>}

      {/* ---------------- CONFIG ---------------- */}
      {view==='config'&&<div className="ftfade">
        <Card style={{padding:20}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,margin:'0 0 4px'}}>Configurações da pool</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:12}}>Toque no lápis pra ajustar. Todos veem a mesma configuração.</div>
          {(solo?[
            {label:'Seu nome',val:config.player1_name,kind:'text',key:'player1_name'},
            {label:'ABI máximo',val:config.abi_max_player1,kind:'money',key:'abi_max_player1',show:fmt(config.abi_max_player1)},
            {label:'Stop loss diário (buy-ins)',val:config.stoploss_daily_buyins,kind:'money',key:'stoploss_daily_buyins',show:String(num(config.stoploss_daily_buyins))},
            {label:'Stop loss semanal',val:config.stoploss_weekly_pct,kind:'percent',key:'stoploss_weekly_pct',show:pctFmt(num(config.stoploss_weekly_pct)*100)},
            {label:'Banca inicial',val:config.banca_inicial,kind:'money',key:'banca_inicial',show:fmt(config.banca_inicial)},
            {label:'Início da semana de referência',val:config.week_start_date,kind:'date',key:'week_start_date',show:config.week_start_date},
            {label:'Sites permitidos',val:config.sites_permitidos,kind:'list',key:'sites_permitidos',show:sites.join(', ')},
            {label:'Modalidades permitidas',val:config.modalidades_permitidas,kind:'list',key:'modalidades_permitidas',show:modalidades.join(', ')},
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
            {label:'Sites permitidos',val:config.sites_permitidos,kind:'list',key:'sites_permitidos',show:sites.join(', ')},
            {label:'Modalidades permitidas',val:config.modalidades_permitidas,kind:'list',key:'modalidades_permitidas',show:modalidades.join(', ')},
          ]).map(row=><div key={row.key} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 0',borderBottom:`1px solid ${C.border}`}}>
            <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:14.5}}>{row.label}</div><div style={{fontSize:13,color:C.inkSoft,marginTop:1,overflow:'hidden',textOverflow:'ellipsis'}}>{row.show!=null?row.show:String(row.val)}</div></div>
            <button onClick={()=>setQuickEdit({label:row.label,kind:row.kind,current:row.val,onSave:nv=>askSaveConfig(row,nv)})} style={{width:38,height:38,borderRadius:11,border:'none',background:C.plumSoft,color:P,cursor:'pointer',display:'grid',placeItems:'center',flexShrink:0}}><IcoPencil s={17}/></button>
          </div>)}
        </Card>
        <Card style={{padding:20,marginTop:16}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:'0 0 4px'}}>Histórico de alterações</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:10}}>Toda mudança nos Ajustes fica registrada aqui e o outro jogador é avisado na hora. A grade ("fora da grade") julga cada torneio pelo ABI que valia <b>na data dele</b>.</div>
          {chgs.length===0&&<Empty>Nenhuma alteração registrada ainda.</Empty>}
          {chgs.slice(0,12).map(c=><div key={c.id} style={{padding:'10px 0',borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontWeight:700,fontSize:13.5}}>{c.resumo}</div>
            <div style={{fontSize:12,color:C.inkSoft,marginTop:1}}>{c.changed_by_name||'—'} · {dLabel(String(c.created_at).slice(0,10))}</div>
          </div>)}
        </Card>
        {solo&&<Card style={{padding:20,marginTop:16}}>
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
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:600,margin:'0 0 4px'}}>Sua conta</h3>
          <div style={{fontSize:13,color:C.inkSoft,marginBottom:14}}>Troca a tua senha quando quiser. Só afeta o teu login.</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={()=>setChangePass(true)} style={{display:'flex',alignItems:'center',gap:8,padding:'12px 18px',borderRadius:12,border:`1px solid ${C.border}`,background:C.surface,color:P,fontWeight:700,fontSize:14.5,cursor:'pointer'}}><IcoLogout s={18}/>Trocar minha senha</button>
            {!isStandalone()&&<button onClick={instalar} style={{display:'flex',alignItems:'center',gap:8,padding:'12px 18px',borderRadius:12,border:`1px solid ${C.border}`,background:C.surface,color:P,fontWeight:700,fontSize:14.5,cursor:'pointer'}}><IcoChip s={18}/>Instalar na tela inicial</button>}
          </div>
          {solo&&<div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
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
      </div>}
    </main>

    {/* nav mobile: só o essencial + "Mais" */}
    <nav className="bottomnav" style={{position:'fixed',bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,padding:'6px 8px calc(6px + env(safe-area-inset-bottom))',gap:2,boxShadow:'0 -8px 24px -16px rgba(0,0,0,.25)',zIndex:20}}>
      {nav.filter(n=>MAIN_TABS.includes(n.id)).map(n=><NavBtn key={n.id} Icon={n.Icon} label={n.label} active={view===n.id} onClick={()=>{setView(n.id);setMenuOpen(false);}} mobile/>)}
      <NavBtn Icon={IcoMenu} label="Mais" active={menuOpen||!MAIN_TABS.includes(view)} onClick={()=>setMenuOpen(true)} mobile/>
    </nav>

    {/* gaveta "Mais" (demais telas) */}
    {menuOpen&&<div onClick={()=>setMenuOpen(false)} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:55}}>
      <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:460,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(26px + env(safe-area-inset-bottom))'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0}}>Todas as telas</h3>
          <button onClick={()=>setMenuOpen(false)} style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {nav.filter(n=>!MAIN_TABS.includes(n.id)).map(n=><button key={n.id} onClick={()=>{setView(n.id);setMenuOpen(false);}} style={{display:'flex',alignItems:'center',gap:10,padding:'16px 14px',borderRadius:14,border:`1.5px solid ${view===n.id?P:C.border}`,background:view===n.id?C.plumSoft:C.warm,color:view===n.id?P:C.ink,fontWeight:700,fontSize:15,cursor:'pointer'}}><n.Icon s={20}/>{n.label}</button>)}
        </div>
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
          <Sec t="Semana a semana">
            {wkRows.length?<table className="reptable"><thead><tr><th>Semana até</th>{!solo&&<th>Jogador</th>}<th>Resultado</th>{!solo&&<><th>Make-up</th><th>Parte do jogador</th><th>Saque autorizado</th><th>Sacado</th></>}</tr></thead>
            <tbody>{wkRows.map((w,i)=><tr key={i}><td>{dLabel(w.week)}</td>{!solo&&<td>{w.pl}</td>}<td style={{color:w.resultado>=0?C.greenMid:C.red,fontWeight:700}}>{fmt(w.resultado)}</td>{!solo&&<><td>{fmt(w.makeAnterior)} → {fmt(w.makeFinal)}</td><td>{fmt(w.parteJog)}</td><td>{fmt(w.saqueAut)}</td><td>{fmt(w.vs)}</td></>}</tr>)}</tbody></table>:<div style={{fontSize:12,color:'#6B6455'}}>Sem semanas fechadas neste mês.</div>}
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
        const pInv=pT.reduce((s,t)=>s+totalInvestido(t),0);
        const pPrem=pT.reduce((s,t)=>s+num(t.prize),0);
        const pRes=pPrem-pInv;
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
        const hands2=S2('hands'), bb100v=hands2>0?S2('net_bb')/hands2*100:0;
        const evbb=S2('allin_ev_bb'), netbb=S2('allin_net_bb'), sorte=netbb-evbb;
        const afb=S2('af_bets'), afc=S2('af_calls');
        const pos2={}; rws.forEach(r=>{ const pj=r.pos_json||{}; Object.keys(pj).forEach(k=>{ if(!pos2[k])pos2[k]={h:0,v:0,p:0,net:0,hn:0}; pos2[k].h+=num(pj[k].h); pos2[k].v+=num(pj[k].v); pos2[k].p+=num(pj[k].p); pos2[k].net+=num(pj[k].net); pos2[k].hn+=num(pj[k].hn); }); });
        const insights=hhInsights({hands:hands2,vpip:S2('vpip_cnt'),pfr:S2('pfr_cnt'),tb:S2('tb_cnt'),tbOpp:S2('tb_opp'),f3b:S2('f3b_cnt'),f3bOpp:S2('f3b_opp'),steal:S2('steal_cnt'),stealOpp:S2('steal_opp'),bbdef:S2('bbdef_cnt'),bbdefOpp:S2('bbdef_opp'),cbet:S2('cbet_cnt'),cbetOpp:S2('cbet_opp'),fcb:S2('fcbet_cnt'),fcbOpp:S2('fcbet_opp'),wtsd:S2('wtsd_cnt'),wsd:S2('wsd_cnt'),wwsf:S2('wwsf_cnt'),sawflop:S2('sawflop_cnt'),afB:afb,afC:afc,sorte,allinCnt:S2('allin_cnt'),pos:pos2,bb100:hands2>0?S2('net_bb')/hands2*100:0});
        titulo=`Relatório do jogador — ${sp2}`;
        sub=solo?`banca + estatísticas de jogo (${repPeriodo})`:`história completa na pool + estatísticas de jogo (${repPeriodo})`;
        const MET=[
          ['VPIP',S2('vpip_cnt'),hands2,HH_BANDS.vpip],['PFR',S2('pfr_cnt'),hands2,HH_BANDS.pfr],
          ['3-bet',S2('tb_cnt'),S2('tb_opp'),HH_BANDS.tb],['Fold pra 3-bet',S2('f3b_cnt'),S2('f3b_opp'),HH_BANDS.f3b],
          ['Roubo de blinds',S2('steal_cnt'),S2('steal_opp'),HH_BANDS.steal],['BB defende',S2('bbdef_cnt'),S2('bbdef_opp'),HH_BANDS.bbdef],
          ['C-bet flop',S2('cbet_cnt'),S2('cbet_opp'),HH_BANDS.cbet],['Fold pra c-bet',S2('fcbet_cnt'),S2('fcbet_opp'),HH_BANDS.fcbet],
          ['WWSF',S2('wwsf_cnt'),S2('sawflop_cnt'),HH_BANDS.wwsf],['WTSD',S2('wtsd_cnt'),S2('sawflop_cnt'),HH_BANDS.wtsd],['W$SD',S2('wsd_cnt'),S2('wtsd_cnt'),HH_BANDS.wsd],
        ];
        const stOf=(c,o,b)=>{ if(!o) return ['sem amostra','#6B6455']; const pv=c/o*100; if(pv>=b[0]&&pv<=b[1]) return ['dentro',C.greenMid]; if(pv>=b[0]-5&&pv<=b[1]+5) return ['atenção',C.gold]; return ['fora',C.red]; };
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
              <Big label="Resultado na pool" value={fmt(pRes)} tone={pRes>=0?C.greenMid:C.red}/>
              <Big label="ROI" value={pInv>0?pctFmt(pRes/pInv*100):'—'} tone={pRes>=0?C.greenMid:C.red}/>
              <Big label="ABI médio" value={pEntr>0?fmt(pInv/pEntr):'—'}/>
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
            {pWk8.length?<table className="reptable"><thead><tr><th>Semana até</th><th>Resultado</th><th>Make-up</th><th>Parte do jogador</th><th>Saque autorizado</th><th>Sacado</th></tr></thead>
            <tbody>{pWk8.map(w=><tr key={w.week}><td>{dLabel(w.week)}</td><td style={{color:w.resultado>=0?C.greenMid:C.red,fontWeight:700}}>{fmt(w.resultado)}</td><td>{fmt(w.makeAnterior)} → {fmt(w.makeFinal)}</td><td>{fmt(w.parteJog)}</td><td>{fmt(w.saqueAut)}</td><td>{fmt(valorSacadoFor(w.week,sp2))}</td></tr>)}</tbody></table>:<div style={{fontSize:12,color:'#6B6455'}}>Sem semanas fechadas ainda.</div>}
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
            <tbody>{MET.map(([nm,c,o,b])=>{ const [lbl,cor]=stOf(c,o,b); return <tr key={nm}><td>{nm}</td><td style={{fontWeight:700}}>{o>0?pctFmt(c/o*100):'—'}</td><td>{c}/{o}</td><td>{b[0]}–{b[1]}%</td><td style={{color:cor,fontWeight:700}}>{lbl}</td></tr>; })}</tbody></table>
          </Sec>
          <Sec t="Por posição">
            {['EP','MP','CO','BTN','SB','BB'].some(k=>pos2[k]&&pos2[k].h>0)?<table className="reptable"><thead><tr><th>Posição</th><th>Mãos</th><th>VPIP</th><th>PFR</th><th>BB/100</th></tr></thead>
            <tbody>{['EP','MP','CO','BTN','SB','BB'].filter(k=>pos2[k]&&pos2[k].h>0).map(k=><tr key={k}><td><b>{k}</b></td><td>{pos2[k].h}</td><td>{pctFmt(pos2[k].v/pos2[k].h*100)}</td><td>{pctFmt(pos2[k].p/pos2[k].h*100)}</td><td>{pos2[k].hn>0?fmtBB(pos2[k].net/pos2[k].hn*100).replace(' bb',''):'—'}</td></tr>)}</tbody></table>:<div style={{fontSize:12,color:'#6B6455'}}>Sem dados de posição.</div>}
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
      <AddModal title={`Novo ${MODAL_TITLE[type]}`} fields={FIELDS[type]} initial={initial} onClose={()=>setModal(null)}
        onSave={d=>add(MODAL_TABLE[type],normalizeRow(type,d),setter,list)}/>);})()}

    {/* modal editar */}
    {editing&&(()=>{const [list,setter]=MODAL_STATE[editing.type]; return (
      <AddModal title={`Editar ${MODAL_TITLE[editing.type]}`} fields={FIELDS[editing.type]} editing={editing.item} onClose={()=>setEditing(null)}
        onEdit={d=>update(MODAL_TABLE[editing.type],normalizeRow(editing.type,d),setter,list)}/>);})()}

    {/* modal quick edit (config) */}
    {quickEdit&&<QuickEditModal label={quickEdit.label} hint={quickEdit.hint} kind={quickEdit.kind} currentValue={quickEdit.current} onClose={()=>setQuickEdit(null)} onSave={quickEdit.onSave}/>}

    {/* modal trocar senha */}
    {changePass&&<ChangePassModal onClose={()=>setChangePass(false)}/>}

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

    {/* detalhe do alerta (fora da grade: quais torneios e de quem) */}
    {alertDetail&&<div onClick={()=>setAlertDetail(null)} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.45)',backdropFilter:'blur(3px)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:55}}>
      <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:480,borderRadius:'24px 24px 0 0',padding:'22px 22px calc(22px + env(safe-area-inset-bottom))',maxHeight:'80vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,margin:0,display:'flex',alignItems:'center',gap:8}}><span style={{color:C.red}}><IcoAlert s={20}/></span>Fora da grade</h3>
          <button onClick={()=>setAlertDetail(null)} style={{width:38,height:38,borderRadius:12,border:'none',background:C.bg,cursor:'pointer',display:'grid',placeItems:'center',color:C.inkSoft}}><IcoX s={20}/></button>
        </div>
        <div style={{fontSize:13,color:C.inkSoft,marginBottom:12,lineHeight:1.5}}>Torneios desta semana com buy-in acima do ABI máximo do jogador. Toque no lápis pra corrigir.</div>
        {sortByCreated(alertDetail.items||[]).map(t=><Row key={t.id} onEdit={()=>{setAlertDetail(null);editTour(t);}} onDelete={()=>{delTour(t); setAlertDetail(d=>d&&{...d,items:d.items.filter(x=>x.id!==t.id)});}}
          left={<><span style={{width:38,height:38,borderRadius:11,background:C.redSoft,display:'grid',placeItems:'center',flexShrink:0,color:C.red}}><IcoTrophy s={18}/></span>
            <div style={{minWidth:0}}><div style={{fontWeight:700,fontSize:14.5}}>{t.tournament_name||'Torneio'} <span style={{color:PLAYER_COLORS[players.indexOf(t.player)]||C.inkSoft,fontWeight:700}}>· {t.player}</span></div>
            <div style={{fontSize:12,color:C.inkSoft,marginTop:2}}>{dLabel(t.entry_date)} · buy-in {fmt(t.buyin)} <span style={{color:C.red,fontWeight:700}}>(máx {fmt(abiMaxFor(config,t.player,t.entry_date))})</span></div></div></>}
          right={<span style={{fontWeight:800,fontSize:15,color:lucroTorneio(t)>=0?C.greenMid:C.red,flexShrink:0}}>{lucroTorneio(t)>=0?'+':'−'}{fmt(Math.abs(lucroTorneio(t)))}</span>}/>)}
        {(!alertDetail.items||!alertDetail.items.length)&&<Empty>Tudo certo agora — nenhum torneio fora da grade.</Empty>}
      </div>
    </div>}

    {/* aviso pro próprio jogador que acabou de lançar fora da grade */}
    {gradeWarn&&<div onClick={()=>setGradeWarn(null)} style={{position:'fixed',inset:0,background:'rgba(20,18,30,.5)',backdropFilter:'blur(3px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60,padding:20}}>
      <div onClick={e=>e.stopPropagation()} className="ftfade" style={{background:C.surface,width:'100%',maxWidth:400,borderRadius:22,padding:24,textAlign:'center'}}>
        <div style={{width:56,height:56,borderRadius:18,background:C.redSoft,color:C.red,display:'grid',placeItems:'center',margin:'0 auto 14px'}}><IcoAlert s={30}/></div>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,margin:'0 0 8px'}}>Atenção — fora da grade!</h3>
        <p style={{fontSize:14,color:C.inkSoft,lineHeight:1.6,margin:'0 0 18px'}}>Esse torneio ({gradeWarn.tournament_name||'buy-in'} {fmt(gradeWarn.buyin)}) está <b style={{color:C.red}}>acima {solo?'do teu ABI máximo':`do ABI máximo de ${gradeWarn.player.split(' ')[0]}`}</b> ({fmt(abiMaxFor(config,gradeWarn.player,gradeWarn.entry_date))}). {solo?'Manter a grade é o que segura tua banca no longo prazo — evita subir de stake no impulso.':'Evite jogar fora da grade — isso fura a gestão da pool. O outro jogador foi avisado.'}</p>
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

    {/* toasts flutuantes (avisos de tempo real, ex: fora da grade do outro jogador) */}
    {toasts.length>0&&<div style={{position:'fixed',top:'calc(12px + env(safe-area-inset-top))',left:0,right:0,display:'flex',flexDirection:'column',alignItems:'center',gap:8,zIndex:70,pointerEvents:'none',padding:'0 12px'}}>
      {toasts.map(t=><div key={t.id} onClick={()=>setToasts(l=>l.filter(x=>x.id!==t.id))} className="ftfade" style={{pointerEvents:'auto',cursor:'pointer',width:'100%',maxWidth:440,background:C.surface,borderLeft:`4px solid ${t.tone||C.red}`,borderRadius:14,boxShadow:'0 10px 30px -10px rgba(0,0,0,.35)',padding:'12px 14px',display:'flex',gap:10,alignItems:'flex-start'}}>
        <span style={{color:t.tone||C.red,flexShrink:0,marginTop:1}}><IcoAlert s={19}/></span>
        <div style={{minWidth:0}}><div style={{fontWeight:800,fontSize:13.5,color:C.ink}}>{t.title}</div><div style={{fontSize:12.5,color:C.inkSoft,marginTop:2,lineHeight:1.4}}>{t.text}</div></div>
      </div>)}
    </div>}
  </div>;
}

/* ---------- raiz ---------- */
function App(){
  const [session,setSession]=useState(undefined);
  const [profile,setProfile]=useState(undefined);
  const [recovery,setRecovery]=useState(false);   // veio pelo link "esqueci minha senha"
  useEffect(()=>{
    if(!sb) return;
    sb.auth.getSession().then(({data})=>setSession(data.session));
    const {data:sub}=sb.auth.onAuthStateChange((e,s)=>{ setSession(s); if(e==='PASSWORD_RECOVERY') setRecovery(true); });
    return ()=>sub.subscription.unsubscribe();
  },[]);
  // primeiro acesso: carrega o perfil do jogador; sem senha trocada, cai no cadastro
  useEffect(()=>{
    if(!session){ setProfile(undefined); return; }
    let on=true;
    (async()=>{
      const {data}=await sb.from('player_profiles').select('*').eq('user_id',session.user.id).maybeSingle();
      if(!on) return;
      // se o e-mail foi trocado no painel do Supabase, atualiza o espelho usado pelo login
      if(data && data.email!==session.user.email) sb.from('player_profiles').update({email:session.user.email}).eq('user_id',session.user.id).then(()=>{});
      // cadastro pendente (conta confirmada por e-mail, ou passo do cadastro que falhou):
      // completa perfil + workspace sozinho com o apelido/WhatsApp guardados no aparelho
      if(!data){
        let pend=null; try{ pend=JSON.parse(localStorage.getItem('gb_signup')||'null'); }catch(e){}
        if(pend&&pend.nickname){
          const {data:novo,error:pe}=await sb.from('player_profiles').insert({user_id:session.user.id,email:session.user.email,nickname:pend.nickname,whatsapp:pend.whatsapp||null,password_changed:true,role:'solo'}).select().single();
          if(!pe&&novo){
            try{ localStorage.removeItem('gb_signup'); }catch(e){}
            try{ await sb.rpc('create_solo_workspace',{ws_name:pend.nickname,plan_escolhido:pend.plan||'gestao'}); }catch(e){ console.error(e); }
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
  if(!CONFIGURED) return <NotConfigured/>;
  // veio do link "esqueci minha senha": trava TUDO até criar a senha nova (sem fechar, sem pular)
  if(recovery) return <RecoveryReset/>;
  if(session===undefined) return <div style={{minHeight:'100vh',display:'grid',placeItems:'center'}}><div className="spin"/></div>;
  if(!session) return <Login/>;
  if(profile===undefined) return <div style={{minHeight:'100vh',display:'grid',placeItems:'center'}}><div className="spin"/></div>;
  if(!profile || !profile.password_changed) return <Onboarding session={session} profile={profile} onDone={setProfile}/>;
  return <Dashboard session={session} profile={profile}/>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
