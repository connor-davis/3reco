import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
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

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const format = compile('../src/lib/format.ts');
const impact = compile('../src/lib/impact.ts', {
  '@/lib/api/stats': { useStats: () => ({}) },
  '@/lib/format': format,
});

test('formatCo2 says CO₂e in whole kg, from a number or exact text', () => {
  assert.equal(impact.formatCo2(729.4), '729 kg CO₂e');
  assert.equal(impact.formatCo2('729.4'), '729 kg CO₂e');
  assert.equal(impact.formatCo2('3580.105'), '3.6 t CO₂e');
});

test('every impact line goes through formatCo2', () => {
  for (const path of [
    '../src/routes/index.tsx',
    '../src/routes/market/index.tsx',
    '../src/routes/about.tsx',
    '../src/components/dialogs/impact-dialog.tsx',
  ]) {
    const text = source(path);
    assert.match(text, /formatCo2\(/, path);
    assert.doesNotMatch(text, /CO₂ saved|formatKg\([^)]*co2_kg\)/, path);
  }
});

test('browser and email name the invoice the same way', () => {
  const api = compile('../src/lib/api/transactions.ts');
  assert.equal(api.invoiceFilename('63F44O20'), '3REco-Invoice-63F44O20.pdf');
});

test('the first dashboard visit says Welcome, later ones Welcome back', () => {
  const text = source('../src/routes/index.tsx');
  assert.match(text, /first \? 'Welcome, ' : 'Welcome back, '/);
  assert.match(text, /localStorage\.getItem\(key\)/);
});

test('a request with no messages reads "New request" on the dashboard', () => {
  assert.match(
    source('../src/routes/-dashboard/panels.tsx'),
    /\?\? 'New request'/
  );
});

test('the receipt button names the invoice', () => {
  assert.match(
    source('../src/routes/transactions/-components/record-list.tsx'),
    /Invoice and receipts \(\$\{row\.receipts\.length\} of \$\{maxReceipts\}\)/
  );
});
