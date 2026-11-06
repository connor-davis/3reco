import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const source = readFileSync(
  new URL('../src/lib/names.ts', import.meta.url),
  'utf8'
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: 'ES2022' },
});
vm.runInNewContext(outputText, { exports });
const { tidyName } = exports;

test('leaves names with their own capitals alone', () => {
  for (const name of [
    'McDonald',
    'MacDonald',
    'Mackenzie',
    "O'Brien",
    'van der Merwe',
    'de Villiers',
    'Mary-Jane',
    'Nkosinathi Dlamini',
  ]) {
    assert.equal(tidyName(name), name);
  }
});

test('fixes ALL CAPS and all lower case', () => {
  assert.equal(tidyName('JOHN SMITH'), 'John Smith');
  assert.equal(tidyName('john smith'), 'John Smith');
  assert.equal(tidyName('NKOSINATHI DLAMINI'), 'Nkosinathi Dlamini');
  assert.equal(tidyName('mcdonald'), 'McDonald');
  assert.equal(tidyName("o'brien"), "O'Brien");
  assert.equal(tidyName('MARY-JANE'), 'Mary-Jane');
  assert.equal(tidyName('mackenzie'), 'Mackenzie');
  assert.equal(tidyName('VAN DER MERWE'), 'Van der Merwe');
  assert.equal(tidyName('de villiers'), 'De Villiers');
  assert.equal(tidyName('thabo van der merwe'), 'Thabo van der Merwe');
});

test('trims and collapses spaces', () => {
  assert.equal(tidyName('  Zanele   Dlamini '), 'Zanele Dlamini');
  assert.equal(tidyName(''), '');
});
