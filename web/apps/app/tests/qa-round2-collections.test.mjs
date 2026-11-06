import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

function compile(path, dependencies = {}, suffix = '') {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8') + suffix;
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
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

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const format = compile('../src/lib/format.ts');
const quantity = compile('../src/lib/quantity.ts', { '@/lib/format': format });
const dialogPath = '../src/components/dialogs/collection-dialog.tsx';
const dialog = compile(
  dialogPath,
  { zod: { z }, '@/lib/format': format, '@/lib/quantity': quantity },
  '\nexports.schema = schema;'
);
const parse = (patch) =>
  dialog.schema.safeParse({
    collector_id: 'c',
    collection_day: format.today(),
    lines: [{ material_id: 'm', weight: '1', price: '4.50', ...patch.line }],
    ...patch.top,
  });
const message = (result) => result.error.issues[0].message;

test('today is a South African date string', () => {
  assert.match(format.today(), /^\d{4}-\d{2}-\d{2}$/);
});

test('a collection date after today is refused, today is fine', () => {
  const tomorrow = new Date(Date.now() + 36 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  assert.ok(parse({}).success);
  const late = parse({ top: { collection_day: '2030-01-01' } });
  assert.equal(message(late), 'The collection date cannot be in the future.');
  assert.ok(tomorrow > format.today());
  assert.ok(!parse({ top: { collection_day: tomorrow } }).success);
});

test('the date input has a max of today', () => {
  assert.match(source(dialogPath), /max=\{today\(\)\}/);
});

test('a negative or zero price says "Enter a price above R 0.00."', () => {
  for (const price of ['-1', '0', '0.00', '-0.50']) {
    assert.equal(
      message(parse({ line: { price } })),
      'Enter a price above R 0.00.',
      price
    );
  }
  assert.equal(
    message(parse({ line: { price: '1.234' } })),
    'Use up to 2 decimals.'
  );
});

test('a price of R 0.01 saves, with a warning below the base price', () => {
  assert.ok(parse({ line: { price: '0.01' } }).success);
  const text = source(dialogPath);
  assert.match(text, /below the base price of/);
  assert.match(text, /You can still save/);
});

test('materials are sorted by name', () => {
  assert.match(source(dialogPath), /localeCompare/);
});
