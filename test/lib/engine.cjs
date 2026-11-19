// Carrega as funções puras do app.js (compilado do app.jsx) num contexto Node isolado, sem React nem banco.
const fs=require('fs'), vm=require('vm'), path=require('path');
const APP=process.env.APP_JS||path.resolve(__dirname,'..','..','app.js');
const src=fs.readFileSync(APP,'utf8');
const cut=src.indexOf('\nconst Svg =');
if(cut<0) throw new Error('marcador "const Svg =" não achado no app.js');
const names=['hhParseHand','parseHH','hhAggregate','mergeHH','hhTotals','hhInsights','hhInsightInput','hhPositions','hhScore','hhEquity','hhCard',
 'HH_ENGINE','HH_SUM_KEYS','HH_COLS','parseSummaries','tsMoney','senhaFraca','tsMesclar','tsEfetivo','bountyTorneio','psTorneiosDoHH','decodeSmart','lucroTorneio','totalInvestido','nominalTorneio','deriveDaily','parseValor','xlsxShared','xlsxAba','xlsxCelulas','lerPlanilhaSamba','faixaPlanilha','lerXlsxSamba','xlsxData','gradeLinha','lerCelulaGrade','gradeSala','gtdDoNome','gradeTipoTorneio','classificarTorneioGrade','gradeDoTorneio','gradeNomeCasa'];
const ctx={window:{},console,TextDecoder,navigator:{userAgent:'node'},localStorage:{getItem(){},setItem(){}},document:{},URL,Blob:function(){}};
ctx.React={createElement(){return null}};
vm.createContext(ctx);
vm.runInContext(src.slice(0,cut)+'\n;globalThis.__E={'+names.map(n=>`${n}:typeof ${n}!=='undefined'?${n}:undefined`).join(',')+'};',ctx);
module.exports=ctx.__E;
