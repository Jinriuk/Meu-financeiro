const fs=require('fs'),path=require('path'),E=require('./engine.cjs');
const SPLIT=/(?=^(?:PokerStars Hand|PokerStars Game|Mão PokerStars|Poker Hand|GGPoker Hand) #)/m;
let saw=0,sd=0,sawNoPre=0,sdNoPre=0,preAllin=0;
for(const d of process.argv.slice(2)) for(const f of fs.readdirSync(d)){
  const txt=E.decodeSmart(new Uint8Array(fs.readFileSync(path.join(d,f)))).replace(/\f/g,'\n');
  for(const b0 of txt.split(SPLIT)){ const b=b0.trim(); if(!/^(?:PokerStars Hand|Poker Hand) #/.test(b)) continue;
    let a=null; try{a=E.hhParseHand(b,{});}catch(e){} if(!a||!a.sawflop) continue;
    // houve alguma ação (de qualquer um) depois do flop? se não, o dinheiro todo entrou no pré-flop
    const s=b.split(/\*\*\* SUMMARY/)[0]; const fi=s.indexOf('*** FLOP');
    const post=fi>=0?s.slice(fi):''; const acted=/^(.+?): (checks|bets|calls|raises|folds)/m.test(post);
    saw++; if(a.wtsd) sd++;
    if(acted){ sawNoPre++; if(a.wtsd) sdNoPre++; } else preAllin++;
  }
}
console.log('viu flop',saw,'WTSD',(100*sd/saw).toFixed(1)+'%','| all-in pré-flop (sem ação pós-flop)',preAllin,'('+(100*preAllin/saw).toFixed(1)+'% dos flops)','| WTSD sem eles',(100*sdNoPre/sawNoPre).toFixed(1)+'%');
