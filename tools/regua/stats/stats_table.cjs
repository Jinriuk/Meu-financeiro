const fs=require('fs'),path=require('path'),E=require('./engine.cjs'),R=require('./ref.cjs');
const SPLIT=/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
const A={},F={}; const inc=(o,k,v=1)=>o[k]=(o[k]||0)+v;
const posA={},posR={};
for(const d of process.argv.slice(2)) for(const f of fs.readdirSync(d)){
  const txt=E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d,f)))).replace(/\f/g,'\n');
  for(const b0 of txt.split(SPLIT)){ const b=b0.trim(); if(!/^(?:PokerStars Hand|Poker Hand) #/.test(b)) continue;
    let a=null,r=null; try{a=E.hhParseHand(b,{});}catch(e){} try{r=R.parseHand(b);}catch(e){} if(!a||!r||r.skip) continue;
    for(const [o,h] of [[A,a],[F,r]]){ inc(o,'hands'); inc(o,'net',h.net_bb); for(const k of ['vpip','pfr','tbOpp','tb','f3bOpp','f3b','stealOpp','steal','bbdefOpp','bbdef','cbetOpp','cbet','fcbOpp','fcb','sawflop','wwsf','wtsd','wsd']) if(h[k]) inc(o,k); inc(o,'afB',h.afB); inc(o,'afC',h.afC); }
    for(const [o,h] of [[posA,a],[posR,r]]){ const p=h.pos; o[p]=o[p]||{h:0,net:0}; o[p].h++; o[p].net+=h.net_bb; }
  }
}
const p=(o,a,b)=>(100*(o[a]||0)/(o[b]||1)).toFixed(1)+'%';
const rows=[['VPIP','vpip','hands'],['PFR','pfr','hands'],['3-bet','tb','tbOpp'],['Fold to 3-bet','f3b','f3bOpp'],['Steal','steal','stealOpp'],['Defesa BB','bbdef','bbdefOpp'],['C-bet','cbet','cbetOpp'],['Fold to c-bet','fcb','fcbOpp'],['WWSF','wwsf','sawflop'],['WTSD','wtsd','sawflop'],['W$SD','wsd','wtsd']];
console.log('stat'.padEnd(14),'app'.padStart(8),'ref'.padStart(8),'  opp app/ref');
for(const [n,a,b] of rows) console.log(n.padEnd(14),p(A,a,b).padStart(8),p(F,a,b).padStart(8),'  ',A[b],'/',F[b]);
console.log('AF'.padEnd(14),(A.afB/A.afC).toFixed(2).padStart(8),(F.afB/F.afC).toFixed(2).padStart(8));
console.log('bb/100'.padEnd(14),(A.net/A.hands*100).toFixed(2).padStart(8),(F.net/F.hands*100).toFixed(2).padStart(8));
console.log('por posição (mãos | bb/100) app x ref:'); for(const k of ['EP','MP','CO','BTN','SB','BB']) console.log(' ',k.padEnd(4),String(posA[k]?.h).padStart(6),(posA[k]?posA[k].net/posA[k].h*100:0).toFixed(1).padStart(8),' | ',String(posR[k]?.h).padStart(6),(posR[k]?posR[k].net/posR[k].h*100:0).toFixed(1).padStart(8));
