// Valida a referência: (1) all-in decidido no river => EV == resultado real (contabilidade dos potes)
// (2) calibração: heads-up sem side pot, equity prevista x frequência real de vitória
const fs=require('fs'),path=require('path'),R=require('./ref.cjs'),E=require('./engine.cjs');
const SPLIT=/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
// versão instrumentada: recalcula aqui o que preciso (rua final, nº de vivos, equity do herói no pote principal)
let rivN=0, rivBad=0, rivEx=[]; const buckets={}; let huN=0;
for(const d of process.argv.slice(2)) for(const f of fs.readdirSync(d)){
  const txt=E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d,f)))).replace(/\f/g,'\n');
  for(const b0 of txt.split(SPLIT)){ const b=b0.trim(); if(!/^(?:PokerStars Hand|Poker Hand) #/.test(b)) continue;
    let r; try{ r=R.parseHand(b);}catch(e){continue;} if(!r||r.skip||r.ev_bb==null) continue;
    const lines=b.split(/\r?\n/).map(l=>l.trim()); const sumIdx=lines.findIndex(l=>/^\*\*\* SUMMARY/.test(l)); const pre=lines.slice(0,sumIdx<0?lines.length:sumIdx);
    // rua da última ação
    let st=0, last=0; for(const L of pre){ if(/^\*\*\* FLOP/.test(L)) st=1; else if(/^\*\*\* TURN/.test(L)) st=2; else if(/^\*\*\* RIVER/.test(L)) st=3; else if(/^(.+?): (folds|checks|calls|bets|raises)/.test(L)) last=st; }
    if(last===3){ rivN++; if(Math.abs(r.ev_bb-r.net_bb)>1e-6){ rivBad++; if(rivEx.length<3) rivEx.push({hid:r.hid,ev:r.ev_bb,net:r.net_bb}); } }
    // heads-up puro (2 jogadores vivos, sem side pot porque o menor stack define tudo) — calibração
    const shows=[...b.matchAll(/^(.+?): shows \[(.+?)\]/gm)].map(m=>m[1]);
    const folds=new Set([...b.matchAll(/^(.+?): folds/gm)].map(m=>m[1]));
    const live=[...new Set(shows)].filter(x=>!folds.has(x));
    if(last<3 && live.length===2){
      huN++;
      // equity do herói com o board no momento: refaz com enumeração/MC da própria ref
      const board=[]; let stp=0;
      for(const L of pre){ const m=L.match(/^\*\*\* (FLOP|TURN|RIVER) \*\*\* (.*)$/); if(m){ const g=[...m[2].matchAll(/\[([^\]]+)\]/g)].map(x=>x[1].split(' ')); const lg=g[g.length-1]; if(m[1]==='FLOP') lg.forEach(c=>board.push(R.card(c))); else board.push(R.card(lg[lg.length-1])); } }
      const cards=n=>{ const m=b.match(new RegExp('^'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+': shows \\[(.+?)\\]','m')); return m[1].split(' ').map(R.card); };
      const hero=r.hero, vil=live.find(x=>x!==hero); if(!vil) continue;
      const eq=R.equities([cards(hero),cards(vil)], board.slice(0,[0,3,4,5][last]), 3000)[0];
      // resultado real do confronto: o herói levou alguma coisa?
      const won=r.collected>0 ? (b.match(new RegExp('^'+vil.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' collected','m'))?0.5:1) : 0;
      const k=Math.min(9,Math.floor(eq*10)); buckets[k]=buckets[k]||{n:0,eq:0,won:0}; buckets[k].n++; buckets[k].eq+=eq; buckets[k].won+=won;
    }
  }
}
console.log('all-in decidido no river:',rivN,'mãos; EV != real em',rivBad, JSON.stringify(rivEx));
console.log('calibração heads-up (',huN,'mãos): faixa | n | equity média | vitória real | z');
Object.keys(buckets).sort((a,b)=>a-b).forEach(k=>{const x=buckets[k]; const pe=x.eq/x.n, pw=x.won/x.n, sd=Math.sqrt(pe*(1-pe)/x.n); console.log(`${k*10}-${k*10+10}%`.padEnd(8), String(x.n).padStart(5), (100*pe).toFixed(1).padStart(6)+'%', (100*pw).toFixed(1).padStart(6)+'%', ((pw-pe)/(sd||1)).toFixed(2).padStart(6));});
