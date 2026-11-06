import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Load the real step helper; it only needs lib/format.ts beside it.
function load(file, imports = {}) {
  const exports = {};
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: 'ES2022' },
  });
  vm.runInNewContext(outputText, {
    exports,
    BigInt,
    require: (name) => imports[name],
  });
  return exports;
}

const format = load('../src/lib/format.ts');
const { stepDecimal, atBound } = load('../src/lib/quantity.ts', {
  '@/lib/format': format,
});

const kg = { places: 2, min: '0.01', max: '100' };

test('steps weights exactly, with no float drift', () => {
  assert.equal(stepDecimal('7713.75', '1', 1, kg), '100.00');
  assert.equal(stepDecimal('0.1', '0.1', 1, { places: 2 }), '0.20');
  assert.equal(stepDecimal('19.99', '1', 1, { places: 2 }), '20.99');
  assert.equal(stepDecimal('0.3', '0.1', -1, { places: 2, min: '0' }), '0.20');
});

test('clamps at min and max', () => {
  assert.equal(stepDecimal('50', '1', 1, kg), '51.00');
  assert.equal(stepDecimal('100', '1', 1, kg), '100.00');
  assert.equal(stepDecimal('1', '1', -1, kg), '0.01');
  assert.equal(stepDecimal('', '1', -1, kg), '0.01');
  assert.equal(stepDecimal('', '1', 1, kg), '1.00');
  assert.equal(stepDecimal('abc', '1', 1, kg), '1.00');
});

test('reports the bound a button would hit', () => {
  assert.equal(atBound('0.01', -1, kg), true);
  assert.equal(atBound('5', -1, kg), false);
  assert.equal(atBound('100', 1, kg), true);
  assert.equal(atBound('99.99', 1, kg), false);
  assert.equal(atBound('999', 1, { places: 2 }), false);
});

test('keeps six places for carbon factors and trims zeros', () => {
  const carbon = { places: 6, min: '0.000001' };

  assert.equal(stepDecimal('0.000001', '0.001', 1, carbon), '0.001001');
  assert.equal(stepDecimal('0.002', '0.001', 1, carbon), '0.003');
  assert.equal(stepDecimal('0.001', '0.001', -1, carbon), '0.000001');
  assert.equal(atBound('0.000001', -1, carbon), true);
});

test('accepts a comma and huge values exactly', () => {
  assert.equal(stepDecimal('1,5', '1', 1, { places: 2 }), '2.50');
  assert.equal(
    stepDecimal('999999999999.99', '1', 1, { places: 2 }),
    '1000000000000.99'
  );
});
