// F0.4: regra de senha do app (a 1ª linha; o servidor também barra pelo painel do Supabase).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine.cjs');
test('senha fraca é recusada com o motivo', () => {
  assert.match(E.senhaFraca('password'), /letras E números/);
  assert.match(E.senhaFraca('password1'), /mais usadas/);
  assert.match(E.senhaFraca('12345678'), /letras E números/);
  assert.match(E.senhaFraca('abc'), /8 caracteres/);
  assert.match(E.senhaFraca('aaaaaaaa'), /letras E números/);
  assert.match(E.senhaFraca('joaozinho2026', ['joaozinho']), /apelido ou e-mail/);
  assert.match(E.senhaFraca('meuemail99', ['meuemail@ex.com']), /apelido ou e-mail/);
});
test('senha boa passa', () => {
  assert.equal(E.senhaFraca('Banca2026grind'), null);
  assert.equal(E.senhaFraca('t1lt-zero-mtt', ['outro', 'x@y.com']), null);
});
