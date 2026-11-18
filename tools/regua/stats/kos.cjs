const fs=require('fs'),path=require('path'),E=require('./engine.cjs');
const SPLIT=/(?=^(?:Poker Hand) #)/m; const ko={};
for(const f of fs.readdirSync(process.argv[2])){
  const txt=fs.readFileSync(path.join(process.argv[2],f),'utf8');
  for(const b0 of txt.split(SPLIT)){ const b=b0.trim(); if(!/^Poker Hand #/.test(b)) continue;
    const tid=(b.match(/Tournament #(\d+)/)||[])[1]; const stacks={}; [...b.matchAll(/^Seat \d+: (.+?) \(([\d,]+) in chips/gm)].forEach(m=>stacks[m[1]]=+m[2].replace(/,/g,''));
    const pre=b.split('*** SUMMARY')[0]; const heroCol=/^Hero collected/m.test(pre); if(!heroCol) continue;
    // quem foi all-in e NÃO coletou nada; se o total que ele pôs == stack inicial, quebrou
    const inv={}; const add=(n,x)=>inv[n]=(inv[n]||0)+x; let commit={};
    for(const L of pre.split(/\r?\n/)){ let m; L.trim();
      if(/^\*\*\* (FLOP|TURN|RIVER)/.test(L)) commit={};
      if(m=L.match(/^(.+?): posts the ante ([\d,]+)/)) add(m[1],+m[2].replace(/,/g,''));
      else if(m=L.match(/^(.+?): posts (?:small|big) blind ([\d,]+)/)){ const x=+m[2].replace(/,/g,''); add(m[1],x); commit[m[1]]=(commit[m[1]]||0)+x; }
      else if(m=L.match(/^(.+?): (calls|bets) ([\d,]+)/)){ const x=+m[3].replace(/,/g,''); add(m[1],x); commit[m[1]]=(commit[m[1]]||0)+x; }
      else if(m=L.match(/^(.+?): raises [\d,]+ to ([\d,]+)/)){ const to=+m[2].replace(/,/g,''); add(m[1],to-(commit[m[1]]||0)); commit[m[1]]=to; }
      else if(m=L.match(/^Uncalled bet \(([\d,]+)\) returned to (.+)$/)) add(m[2],-m[1].replace(/,/g,''));
    }
    const collectors=new Set([...pre.matchAll(/^(.+?) collected/gm)].map(m=>m[1]));
    for(const n in inv){ if(n==='Hero'||collectors.has(n)) continue; if(stacks[n]&&inv[n]>=stacks[n]) ko[tid]=(ko[tid]||0)+1; }
  }
}
const sums=require('./sums.json'); let bounty=0, comKO=0, semGrana=[];
for(const s of sums){ if(!s.bounty) continue; bounty++; const k=ko[s.tid]||0; if(k>0){ comKO++; if(s.prize===0) semGrana.push({tid:s.tid,nome:s.name,kos:k,posicao:s.position,field:s.field,premio:s.prize}); } }
console.log('PKO com resumo',bounty,'| PKO em que o herói eliminou alguém',comKO,'| desses, com prêmio $0 no resumo',semGrana.length); console.log(semGrana.slice(0,6));
