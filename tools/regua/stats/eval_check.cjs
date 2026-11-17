const R=require('./ref.cjs'), E=require('./engine.cjs');
// frequências teóricas de 7 cartas (133.784.560 combinações)
const TEO=[23294460,58627800,31433400,6461620,6180020,4047644,3473184,224848,41584].map(x=>x/133784560);
const NOMES=['carta alta','par','dois pares','trinca','sequência','flush','full house','quadra','straight flush'];
const N=3000000, cnt=new Array(9).fill(0); let disc=0, ex=[];
const deal=()=>{const d=[];while(d.length<7){const c=Math.floor(Math.random()*52);if(!d.includes(c))d.push(c);}return d;};
for(let i=0;i<N;i++){const a=deal();cnt[R.category(R.eval7(a))]++;}
NOMES.forEach((nm,i)=>{const f=cnt[i]/N;const sd=Math.sqrt(TEO[i]*(1-TEO[i])/N);console.log(nm.padEnd(15),(100*f).toFixed(4)+'%','teórico',(100*TEO[i]).toFixed(4)+'%','z=',((f-TEO[i])/sd).toFixed(2));});
// comparação de ORDEM entre o avaliador de referência e o hhScore do app: mesmo resultado em pares de mãos
const M=2000000;
for(let i=0;i<M;i++){const d=[];while(d.length<9){const c=Math.floor(Math.random()*52);if(!d.includes(c))d.push(c);}
 const board=d.slice(4), a=d.slice(0,2).concat(board), b=d.slice(2,4).concat(board);
 const r=Math.sign(R.eval7(a)-R.eval7(b)), s=Math.sign(E.hhScore(a)-E.hhScore(b));
 if(r!==s){disc++; if(ex.length<5) ex.push({a,b,r,s});}}
console.log('pares comparados',M,'divergências ref x app:',disc, JSON.stringify(ex));
