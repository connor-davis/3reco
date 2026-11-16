import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const sandbox = { exports: {}, require: (name) => imports[name] };
  vm.runInNewContext(outputText, sandbox);
  return sandbox.exports;
}

const { mergeReorder } = load('../src/lib/reorder.ts', {
  './format': load('../src/lib/format.ts'),
});
const past = (material_id, weight) => ({
  material_id,
  material_name: material_id,
  weight,
  price: '1.00',
});
const listing = (material_id, weight) => ({
  id: material_id + '-stock',
  material_id,
  weight,
  price: '9.99',
});
const line = (material_id, weight) => ({
  stock_id: material_id + '-stock',
  material_id,
  weight,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test('merges without losing other lines or mutating inputs', () => {
  const cart = [line('glass', '3'), line('paper', '5')];
  const original = structuredClone(cart);
  const result = mergeReorder(
    [past('glass', '7')],
    [listing('glass', '20')],
    cart
  );
  assert.deepEqual(plain(result.lines), [
    line('glass', '7'),
    line('paper', '5'),
  ]);
  assert.deepEqual(cart, original);
});

test('adds available materials and caps each weight to the live listing', () => {
  const result = mergeReorder(
    [past('glass', '12'), past('paper', '4')],
    [listing('glass', '8.25'), listing('paper', '20')],
    []
  );
  assert.deepEqual(plain(result.lines), [
    line('glass', '8.25'),
    line('paper', '4'),
  ]);
});

test('reports absent and empty materials by name, preserving existing cart lines', () => {
  const result = mergeReorder(
    [past('missing', '4'), past('empty', '1'), past('zero', '0')],
    [listing('empty', '0'), listing('zero', '9')],
    [line('paper', '3')]
  );
  assert.deepEqual(plain(result), {
    lines: [line('paper', '3')],
    skipped: ['missing', 'empty', 'zero'],
  });
});

test('compares exact grams and retains decimal text rather than rounding', () => {
  const result = mergeReorder(
    [past('glass', '0.300'), past('paper', '1000000.011')],
    [listing('glass', '0.299'), listing('paper', '1000000.010')],
    []
  );
  assert.deepEqual(plain(result.lines), [
    line('glass', '0.299'),
    line('paper', '1000000.010'),
  ]);
});

test('equal weights keep the original text', () => {
  const result = mergeReorder(
    [past('glass', '1.000')],
    [listing('glass', '1')],
    []
  );
  assert.equal(result.lines[0].weight, '1.000');
});

test('cart payload contains no historical or live prices', () => {
  const result = mergeReorder(
    [past('glass', '2')],
    [listing('glass', '5')],
    [{ ...line('paper', '1'), price: '99', material_name: 'Paper' }]
  );
  for (const item of result.lines) {
    assert.deepEqual(Object.keys(item).sort(), [
      'material_id',
      'stock_id',
      'weight',
    ]);
  }
});
