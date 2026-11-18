const fs=require('fs'),path=require('path'),E=require('./engine.cjs');
const D=process.argv[2]; const rows=[]; const semNada=[];
for(const f of fs.readdirSync(D)){ const t=E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(D,f)))); const rs=E.parseSummaries(t); if(!rs.length) semNada.push(f); rs.forEach(r=>rows.push({...r,arquivo:f,raw:t})); }
const n=rows.length, by=k=>rows.filter(k).length;
console.log('arquivos',fs.readdirSync(D).length,'resumos lidos',n,'sem leitura',semNada.length);
console.log('sem data',by(r=>!r.date),'sem posição',by(r=>r.position==null),'field 0',by(r=>!r.field),'buyin 0',by(r=>!r.buyin),'com prêmio',by(r=>r.prize>0),'re-entries>0',by(r=>r.reentries>0),'bounty',by(r=>r.bounty),'prêmio em ticket',by(r=>r.premioTicket),'cheiro satélite',by(r=>r.satelite));
// formatos de linha "You received"/"You made" que existem nos arquivos
const linhas={}; rows.forEach(r=>{ (r.raw.match(/^You .*$/gim)||[]).forEach(l=>{ const k=l.replace(/\$[\d.,]+/g,'$X').replace(/\d+(st|nd|rd|th)/g,'Nth').replace(/\d+ re-?entr\w+/,'N re-entries'); linhas[k]=(linhas[k]||0)+1; }); });
console.log('formatos de linha "You ...":',linhas);
const bi={}; rows.forEach(r=>{ const l=(r.raw.match(/^Buy-?in:.*$/m)||['?'])[0].replace(/[\d.]+/g,'N'); bi[l]=(bi[l]||0)+1; }); console.log('formatos de Buy-in:',bi);
// conferência do prêmio: quando há colocação paga na tabela "Nth : Hero, $X", bate com "You received"?
let conf=0, dif=[]; rows.forEach(r=>{ const m=r.raw.match(/^\d+(?:st|nd|rd|th) : Hero, \$([\d.,]+)/m); if(m){ conf++; const v=E.tsMoney(m[1]); if(Math.abs(v-r.prize)>0.005) dif.push({arq:r.arquivo,tabela:v,received:r.prize,linha:(r.raw.match(/^You received.*$/m)||[''])[0]}); } });
console.log('linhas "Nth : Hero, $X" conferidas',conf,'divergências',dif.length, dif.slice(0,5));
const tot=rows.reduce((s,r)=>({inv:s.inv+r.buyin*(1+r.reentries),pr:s.pr+r.prize}),{inv:0,pr:0}); console.log('investido $',tot.inv.toFixed(2),'prêmios $',tot.pr.toFixed(2),'ROI',(100*(tot.pr-tot.inv)/tot.inv).toFixed(1)+'%');
fs.writeFileSync('sums.json',JSON.stringify(rows.map(({raw,...x})=>x)));
