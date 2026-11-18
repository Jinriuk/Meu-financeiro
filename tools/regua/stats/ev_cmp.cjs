const fs=require('fs'),path=require('path'),E=require('./engine.cjs'),R=require('./ref.cjs');
const SPLIT=/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
const dirs=process.argv.slice(2);
let n=0, appEV=0, appNet=0, refEV=0, refNetOnRef=0, refEVonBoth=0, appEVonBoth=0, netBoth=0, onlyApp=0, onlyRef=0, both=0, folderShow=0, folderShowEVdiff=0;
const big=[]; const reasonsOnlyApp={};
for(const d of dirs) for(const f of fs.readdirSync(d)){
  const txt=E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d,f)))).replace(/\f/g,'\n');
  for(const b0 of txt.split(SPLIT)){ const b=b0.trim(); if(!/^(?:PokerStars Hand|Poker Hand) #/.test(b)) continue;
    let a=null; try{a=E.hhParseHand(b,{});}catch(e){} let r=null; try{r=R.parseHand(b);}catch(e){} if(!a||!r||r.skip) continue; n++;
    // jogador que FOLDOU e mesmo assim aparece em "shows"
    const folders=new Set([...b.matchAll(/^(.+?): folds/gm)].map(m=>m[1].trim()));
    const shownFolders=[...b.matchAll(/^(.+?): shows \[/gm)].map(m=>m[1].trim()).filter(x=>folders.has(x));
    if(a.allin){ appEV+=a.allin.ev; appNet+=a.allin.net; }
    if(r.ev_bb!=null){ refEV+=r.ev_bb; refNetOnRef+=r.net_bb; }
    if(a.allin&&r.ev_bb!=null){ both++; appEVonBoth+=a.allin.ev; refEVonBoth+=r.ev_bb; netBoth+=r.net_bb;
      const dv=a.allin.ev-r.ev_bb; if(shownFolders.length){ folderShow++; folderShowEVdiff+=dv; }
      if(Math.abs(dv)>3) big.push({dv:+dv.toFixed(2),app:+a.allin.ev.toFixed(2),ref:+r.ev_bb.toFixed(2),net:+r.net_bb.toFixed(2),shownFolders:shownFolders.length,hid:r.hid,file:f});
    } else if(a.allin){ onlyApp++; const k=r.evSkip||(r.sdAny?'ref_sem_allin?':'ref_sem_showdown'); reasonsOnlyApp[k]=(reasonsOnlyApp[k]||0)+1; }
    else if(r.ev_bb!=null){ onlyRef++; }
  }
}
const f2=x=>x.toFixed(1);
console.log(JSON.stringify({maos:n,
  app:{allins:'(somatório app)',EV:f2(appEV),net:f2(appNet),sorte:f2(appNet-appEV)},
  ref:{EV:f2(refEV),net:f2(refNetOnRef),sorte:f2(refNetOnRef-refEV)},
  ambos:{n:both,appEV:f2(appEVonBoth),refEV:f2(refEVonBoth),net:f2(netBoth)},
  so_app:onlyApp, motivos_so_app:reasonsOnlyApp, so_ref:onlyRef,
  com_folder_mostrando:{maos:folderShow,soma_diff_ev_bb:f2(folderShowEVdiff)},
  diffs_maiores_que_3bb:big.length},null,1));
big.sort((x,y)=>Math.abs(y.dv)-Math.abs(x.dv)); console.log(big.slice(0,8));
fs.writeFileSync(process.env.OUT||'ev_big.json',JSON.stringify(big));
