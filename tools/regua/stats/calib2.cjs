const fs=require('fs'),path=require('path'),E=require('./engine.cjs');
const src=fs.readFileSync(path.join(__dirname,'calib.cjs'),'utf8'); // reaproveita pre() e ptPos()
eval(src.slice(src.indexOf('function pre('),src.indexOf('for (const d of process.argv')));
const SPLIT=/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m; const n=s=>Number(String(s).replace(/,/g,''));
const P={},T={},D={}; const pi=(p,k,v=1)=>{P[p]=P[p]||{};P[p][k]=(P[p][k]||0)+v}; const ti=(k,v=1)=>T[k]=(T[k]||0)+v;
for(const d of process.argv.slice(2)) for(const f of fs.readdirSync(d)){
  const txt=E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d,f)))).replace(/\f/g,'\n');
  for(const b0 of txt.split(SPLIT)){ const b=b0.trim(); if(!/^(?:PokerStars Hand|Poker Hand) #/.test(b)) continue;
    const h=pre(b); if(!h.hero||!h.seats.find(s=>s.name===h.hero)) continue; const pp=ptPos(h); const pos=pp.p==='X'?'X':pp.p; const hero=h.hero;
    const A=h.acts.filter(x=>x.street===0&&x.a!=='ante'&&x.a!=='post'); const HA=A.filter(x=>x.who===hero);
    if(!HA.length){ pi(pos,'walk'); continue; }
    pi(pos,'h'); if(HA.some(x=>x.a==='calls'||x.a==='raises')) pi(pos,'vpip'); if(HA.some(x=>x.a==='raises')) pi(pos,'pfr');
    // "raise" do PT4 pode incluir all-in por CALL que cobre o big blind? conta herói que foi all-in pagando (calls ... all-in) sem raise
    if(!HA.some(x=>x.a==='raises')&&HA.some(x=>x.a==='calls'&&x.allin)) pi(pos,'call_allin');
    if(pp.p==='X') D[`N${pp.N}_d${pp.d}`]=(D[`N${pp.N}_d${pp.d}`]||0)+1;
    // 3-bet D: herói enfrenta 1 raise SEM callers depois do raise (exclui squeeze), 1ª decisão
    let raises=0,callersAfter=0,first=true; for(const x of A){ if(x.who===hero){ if(first&&raises===1){ ti('tbD_opp'+(callersAfter?'_sq':'')); if(x.a==='raises') ti('tbD'+(callersAfter?'_sq':'')); } first=false; break; } if(x.a==='raises'){raises++;callersAfter=0;} else if(x.a==='calls'&&raises>=1) callersAfter++; }
  }
}
console.log(JSON.stringify({P,T,D}));
