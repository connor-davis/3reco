import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path, dependencies = {}, suffix = '') {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8') + suffix;
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    Intl,
    Date,
    BigInt,
    Number,
    require(name) {
      if (name in dependencies) return dependencies[name];
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  return exports;
}

const format = compile('../src/lib/format.ts');

test('toCents rounds half up instead of cutting digits', () => {
  assert.equal(format.toCents('0.125'), 13);
  assert.equal(format.toCents('0.124'), 12);
  assert.equal(format.toCents('7819.275'), 781928);
  assert.equal(format.toCents('4.60'), 460);
  assert.equal(format.toCents('abc'), 0);
});

test('lineCents and toCents agree on the same half cent', () => {
  // 12.5 kg at R 0.01 is 0.125, and the server stores 0.13.
  assert.equal(format.lineCents('0.01', '12.5'), 13);
  assert.equal(format.lineCents('0.01', '12.5'), format.toCents('0.125'));
  assert.equal(format.lineCents('2.50', '1.234567'), 309);
});

test('a total is the sum of rounded lines, as the server stores it', () => {
  const lines = [
    ['0.01', '0.5'],
    ['0.03', '0.5'],
    ['0.05', '0.5'],
  ].map(([price, kg]) => format.lineCents(price, kg));
  assert.deepEqual(lines, [1, 2, 3]);
  assert.equal(format.formatRand(lines.reduce((a, b) => a + b, 0)), 'R 0.06');
});
