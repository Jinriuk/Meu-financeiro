// Leitura da planilha pessoal do Samba (.xlsx). Dados INVENTADOS com o mesmo layout da planilha real
// (aba Jogador: salas na linha 2, saldos na 3, MakeUp/Cashout/Contrato/% com o valor embaixo, grade a partir de "Semanal").
const test = require('node:test');
const assert = require('node:assert');
const E = require('../lib/engine.cjs');
const J = x => JSON.parse(JSON.stringify(x));

const CEL = {
  A1: 'Fulano Exemplo - nick_exemplo', G1: 'Bankroll', H1: 250, I1: 'Profit', J1: 50, M1: 'Lifetime', N1: 550,
  A2: 'PS', B2: 'Party', C2: 'WPN', D2: 'PS.es', E2: 888, F2: 'GG', G2: 'MakeUp', H2: 'Cashout', I2: 'Contrato', J2: '%',
  A3: 100, F3: 150, G3: 200, H3: 500, I3: 46691, J3: '35% até 10k',
  A4: 'nick_exemplo', A5: 46342.9, A7: 'Reload', H7: 'Reta 2', I7: 'Reta 2', J7: 'Reta 2',
  F8: 'GGpoker', G8: 'Semanal', H8: 'até $2,50', I8: 'até $2,50 + $3,20 5k+', J8: 'Até $2',
  G9: 'Reentry semanal', H9: 'até $2,50', I9: 'até $2,50', J9: 'não',
  F10: 'PokerStars', G10: 'Sunday (não engloba turbo)', H10: 'até $5,50', I10: '$1.10', J10: 3.3,
  G11: 'SNG', H11: 1, I11: 1.5,
};

test('lê saldos, MakeUp, Cashout e calcula lucro e lifetime como a planilha', () => {
  const r = J(E.lerPlanilhaSamba(CEL));
  assert.deepStrictEqual(r.saldos.map(s => s.sala), ['PS', 'Party', 'WPN', 'PS.es', '888', 'GG'], 'salas na ordem da planilha');
  assert.strictEqual(r.banca, 250); assert.strictEqual(r.makeup, 200); assert.strictEqual(r.cashout, 500);
  assert.strictEqual(r.lucro, 50); assert.strictEqual(r.lifetime, 550);
  assert.deepStrictEqual(r.avisos, [], 'bankroll e lifetime batem com a planilha');
});

test('nome, apelido, contrato e data de atualização', () => {
  const r = J(E.lerPlanilhaSamba(CEL));
  assert.strictEqual(r.nome, 'Fulano Exemplo - nick_exemplo');
  assert.strictEqual(r.nick, 'nick_exemplo');
  assert.strictEqual(r.contrato_fim, '2027-10-31');
  assert.strictEqual(r.atualizado_em, '2026-11-16');
  assert.deepStrictEqual(r.faixa, { jogador: 0.35, ate: 10000 });
});

test('grade: sala da célula mesclada vale pras linhas de baixo', () => {
  const r = J(E.lerPlanilhaSamba(CEL));
  assert.strictEqual(r.grade.length, 4);
  assert.deepStrictEqual(r.grade[1], { site: 'GGpoker', tipo: 'Reentry semanal', regular: 'até $2,50', prog_ko: 'até $2,50', hyper: 'não' });
  assert.deepStrictEqual(r.grade[3], { site: 'PokerStars', tipo: 'SNG', regular: '1', prog_ko: '1.5', hyper: '' });
  assert.strictEqual(r.grade[2].tipo, 'Sunday (não engloba turbo)', 'linha com comentário entre parênteses não some');
});

test('avisa quando a planilha não fecha', () => {
  const r = J(E.lerPlanilhaSamba({ ...CEL, H1: 999, N1: 1 }));
  assert.strictEqual(r.avisos.length, 2);
});

test('planilha errada: erro claro', () => {
  assert.match(E.lerPlanilhaSamba({ A1: 'outra coisa' }).erro, /MakeUp/);
});

test('percentual do contrato em vários formatos', () => {
  assert.deepStrictEqual(J(E.faixaPlanilha('35% até 10k')), { jogador: 0.35, ate: 10000 });
  assert.deepStrictEqual(J(E.faixaPlanilha('40 % ate 15 mil')), { jogador: 0.4, ate: 15000 });
  assert.deepStrictEqual(J(E.faixaPlanilha('50%')), { jogador: 0.5, ate: null });
  assert.strictEqual(E.faixaPlanilha('sem contrato'), null);
});

test('XML do xlsx: texto compartilhado, valor salvo de fórmula, data e aba pelo nome', () => {
  const shared = J(E.xlsxShared('<sst><si><t>MakeUp</t></si><si><r><t>35% </t></r><r><t>até 10k</t></r></si><si><t>A &amp; B</t></si></sst>'));
  assert.deepStrictEqual(shared, ['MakeUp', '35% até 10k', 'A & B']);
  const xml = '<sheetData><row r="2"><c r="G2" t="s"><v>0</v></c><c r="J2" t="s"><v>1</v></c></row>' +
    '<row r="3"><c r="G3" s="21"><f>IFERROR(__xludf.DUMMYFUNCTION("importRange(...)"),110.0)</f><v>110</v></c>' +
    '<c r="H3" t="str"><f>A1</f><v>texto</v></c><c r="I3" t="inlineStr"><is><t>em linha</t></is></c><c r="K3" s="2"/></row></sheetData>';
  const cel = J(E.xlsxCelulas(xml, shared));
  assert.deepStrictEqual(cel, { G2: 'MakeUp', J2: '35% até 10k', G3: 110, H3: 'texto', I3: 'em linha' });
  const wb = '<workbook><sheets><sheet state="visible" name="Outra" sheetId="2" r:id="rId9"/><sheet name="Jogador" sheetId="1" r:id="rId4"/></sheets></workbook>';
  const rels = '<Relationships><Relationship Id="rId9" Target="worksheets/sheet2.xml"/><Relationship Id="rId4" Type="x" Target="worksheets/sheet1.xml"/></Relationships>';
  assert.strictEqual(E.xlsxAba(wb, rels, 'Jogador'), 'xl/worksheets/sheet1.xml');
  assert.strictEqual(E.xlsxData(46691), '2027-10-31');
});

test('arquivo .xlsx inteiro (exemplo gerado do zero, mesmo layout)', () => {
  const fflate = require('fflate'); const fs = require('fs'); const path = require('path');
  const u = new Uint8Array(fs.readFileSync(path.join(__dirname, '../fixtures/planilha_samba_exemplo.xlsx')));
  const r = J(E.lerXlsxSamba(fflate.unzipSync(u), b => fflate.strFromU8(b)));
  assert.strictEqual(r.makeup, 200); assert.strictEqual(r.cashout, 500); assert.strictEqual(r.banca, 250);
  assert.strictEqual(r.lifetime, 550); assert.strictEqual(r.contrato_fim, '2027-10-31'); assert.strictEqual(r.grade.length, 4);
});
