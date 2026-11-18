// Diferencial: para cada mão, app (hhParseHand) x referência (ref.cjs). Sem EV aqui (rápido).
const fs=require('fs'),path=require('path'),E=require('./engine.cjs'),R=require('./ref.cjs');
const SPLIT=/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
const dirs=process.argv.slice(2);
const F=['vpip','pfr','tbOpp','tb','f3bOpp','f3b','stealOpp','steal','bbdefOpp','bbdef','cbetOpp','cbet','fcbOpp','fcb','sawflop','wwsf','wtsd','wsd','afB','afC','pos','net_bb'];
const diff={}, ex={}; let tot=0, skipped={};
const hands=[];
for(const d of dirs) for(const f of fs.readdirSync(d)){
  const txt=E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d,f)))).replace(/\f/g,'\n');
  for(const b of txt.split(SPLIT)){
    if(!/^(?:PokerStars Hand|Poker Hand) #/.test(b.trim())) continue;
    const why={r:null}; let a=null; try{a=E.hhParseHand(b.trim(),why);}catch(e){a=null;}
    let r=null; try{ r=R.parseHand(b.trim()); }catch(e){ r={skip:'erro_ref:'+e.message}; }
    if(!a||!r||r.skip){ const k=(a?'app_ok':'app_'+why.r)+'/'+(r&&r.skip?'ref_'+r.skip:'ref_ok'); skipped[k]=(skipped[k]||0)+1; if(!ex[k]) ex[k]=[]; if(ex[k].length<2) ex[k].push(b.trim().slice(0,900)); continue; }
    tot++; hands.push({file:f,a,r,raw:null});
    for(const k of F){ let va=a[k], vr=r[k]; if(k==='net_bb'){ va=Math.round(va*1000)/1000; vr=Math.round(vr*1000)/1000; }
      if(va!==vr){ const key=k+': app='+(k==='net_bb'?'≠':va)+' ref='+(k==='net_bb'?'':vr); diff[key]=(diff[key]||0)+1; if(!ex[key]) ex[key]=[]; if(ex[key].length<3) ex[key].push(b.trim()); } }
  }
}
console.log('mãos comparadas',tot); console.log('descartes',skipped);
Object.entries(diff).sort((x,y)=>y[1]-x[1]).forEach(([k,v])=>console.log(String(v).padStart(6),k));
fs.writeFileSync(process.env.OUT||'diff_ex.json',JSON.stringify(ex));
