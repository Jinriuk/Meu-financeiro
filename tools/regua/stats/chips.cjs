// Oráculo do net: stack(mão seguinte) - stack(mão atual) == net(mão atual), mesma mesa/torneio, mãos consecutivas
const fs=require('fs'),path=require('path'),E=require('./engine.cjs');
const SPLIT=/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
const byT={};
for(const d of process.argv.slice(2)) for(const f of fs.readdirSync(d)){
  const txt=E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d,f)))).replace(/\f/g,'\n');
  for(const b0 of txt.split(SPLIT)){ const b=b0.trim(); if(!/^(?:PokerStars Hand|Poker Hand) #/.test(b)) continue;
    let a=null; try{a=E.hhParseHand(b,{});}catch(e){} if(!a) continue;
    const head=b.split(/\r?\n/)[0]; const ts=(head.match(/(\d{4}\/\d{2}\/\d{2} \d{1,2}:\d{2}:\d{2})/)||[])[1];
    const hero=(b.match(/^Dealt to (.+?) \[/m)||[])[1]; const esc=hero.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const stack=Number((b.match(new RegExp('^Seat \\d+: '+esc+' \\((\\d[\\d,]*) in chips','m'))||[])[1].replace(/,/g,''));
    const k=a.site+'|'+a.tid; (byT[k]=byT[k]||[]).push({hid:a.hid,ts,stack,net:a.net_bb*a.bb,bb:a.bb, t: Date.parse(ts.replace(/\//g,'-').replace(' ','T')+'Z')});
  }
}
let pares=0, ok=0, bad=[], diffBB=0;
for(const k in byT){ const L=byT[k].sort((x,y)=>x.t-y.t || (x.hid<y.hid?-1:1));
  for(let i=0;i+1<L.length;i++){ const a=L[i], b=L[i+1]; if(b.t-a.t>15*60*1000) continue; // pausa/reentrada
    pares++; const d=b.stack-a.stack-a.net; if(Math.abs(d)<0.5) ok++; else { diffBB+=Math.abs(d)/a.bb; if(bad.length<6) bad.push({k,hid:a.hid,next:b.hid,stack:a.stack,net:a.net,next_stack:b.stack,dif:d}); } } }
console.log('pares de mãos consecutivas',pares,'conservação OK',ok,'falhas',pares-ok,'(',(100*(pares-ok)/pares).toFixed(2)+'%)'); console.log(bad);
