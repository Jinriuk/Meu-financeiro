// Carrega as funções puras do app.js (compilado do app.jsx) num contexto Node isolado.
const fs=require('fs'), vm=require('vm'), path=require('path');
const APP=process.env.APP_JS||path.resolve(process.cwd(),'app.js');
const src=fs.readFileSync(APP,'utf8');
const cut=src.indexOf('\nconst Svg =');
const body=src.slice(0,cut);
const names=['hhParseHand','parseHH','hhAggregate','mergeHH','hhScore','hhEquity','hhCard','hhNum','parseSummaries','tsMoney','tsModalidade',
 'deriveDaily','computeWeeks','saqueStatus','weekEnding','weekStart','weekInMonth','abiMaxFor','nominalTorneio','totalInvestido','lucroTorneio',
 'resultadoDia','abiMedioDia','gradeStatus','tourStatus','parseValor','hhInsights','HH_SUM_KEYS','decodeSmart','isZip','tsCheiroSatelite','tsNorm','addDaysISO','mKey'];
const ctx={window:{},console,TextDecoder,navigator:{userAgent:'node'},localStorage:{getItem(){},setItem(){}},document:{},Date,Math,JSON,Set,Map,Array,Object,String,Number,RegExp,parseFloat,parseInt,isNaN,URL,Blob:function(){}};
ctx.React={createElement(){return null}};
vm.createContext(ctx);
vm.runInContext(body+'\n;globalThis.__E={'+names.map(n=>`${n}:typeof ${n}!=='undefined'?${n}:undefined`).join(',')+',setCC:(x)=>{CONFIG_CHANGES=x}};',ctx);
module.exports=ctx.__E;
