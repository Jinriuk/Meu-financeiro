// Reproduz o importHH do app (app.jsx:2026-2123) sem o banco: decodeSmart + fatias de 400 + parseHH + agrupamento.
const fs=require('fs'), path=require('path'), E=require('./engine.cjs');
const dirs=process.argv.slice(2);
const SPLIT=/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
let all=[], ignored=0, reasons={}, issues=[], files=0;
for(const d of dirs) for(const f of fs.readdirSync(d)){
  const u=new Uint8Array(fs.readFileSync(path.join(d,f))); files++;
  const parts=E.decodeSmart(u).replace(/\f/g,'\n').split(SPLIT);
  for(let j=0;j<parts.length;j+=400){ const r=E.parseHH(parts.slice(j,j+400).join('')); all=all.concat(r.hands); ignored+=r.ignored; for(const k in r.reasons) reasons[k]=(reasons[k]||0)+r.reasons[k]; issues.push(...r.issues); }
}
const g={}; for(const h of all){ const k=h.site+'|'+h.tid; (g[k]=g[k]||[]).push(h); }
const rows=Object.values(g).map(x=>E.hhAggregate(x,'P')[0]);
const S=k=>rows.reduce((s,r)=>s+(+r[k]||0),0);
const hands=S('hands');
const pct=(a,b)=>b?(100*S(a)/S(b)).toFixed(2)+'%':'-';
const ids=new Set(all.map(h=>h.site+'|'+h.hid)); 
console.log(JSON.stringify({files,parsed:all.length,uniqueIds:ids.size,ignored,reasons,issues:issues.slice(0,5),tours:rows.length,hands,
 vpip:(100*S('vpip_cnt')/hands).toFixed(2),pfr:(100*S('pfr_cnt')/hands).toFixed(2),tb:pct('tb_cnt','tb_opp'),f3b:pct('f3b_cnt','f3b_opp'),steal:pct('steal_cnt','steal_opp'),bbdef:pct('bbdef_cnt','bbdef_opp'),
 cbet:pct('cbet_cnt','cbet_opp'),fcb:pct('fcbet_cnt','fcbet_opp'),wwsf:pct('wwsf_cnt','sawflop_cnt'),wtsd:pct('wtsd_cnt','sawflop_cnt'),wsd:pct('wsd_cnt','wtsd_cnt'),af:(S('af_bets')/S('af_calls')).toFixed(2),
 bb100:(S('net_bb')/hands*100).toFixed(2),allin:S('allin_cnt'),allinEV:S('allin_ev_bb').toFixed(1),allinNet:S('allin_net_bb').toFixed(1)},null,1));
if(process.env.DUMP) fs.writeFileSync(process.env.DUMP,JSON.stringify(all));
