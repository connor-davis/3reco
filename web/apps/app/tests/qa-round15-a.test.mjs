import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { load, source } from './qa-round2-loader.mjs';

function stockSchema(original) {
  const text = source('components/dialogs/stock-dialog.tsx');
  const rules = text.slice(
    text.indexOf('const decimal'),
    text.indexOf('// Any positive price')
  );
  const { outputText } = ts.transpileModule(rules, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const quantity = load('lib/quantity.ts', {
    '@/lib/format': load('lib/format.ts'),
  });
  return vm.runInNewContext(`${outputText}; schema`, {
    z,
    ...quantity,
    ...load('lib/limits.ts'),
  })(original);
}

const values = {
  material_id: 'glass',
  weight: '1',
  price: '8',
  is_listed: true,
};

test('manual stock caps accept the boundaries and reject the next hundredth exactly', () => {
  const schema = stockSchema();
  assert.equal(
    schema.safeParse({ ...values, weight: '1000000', price: '100000.00' })
      .success,
    true
  );
  for (const [field, value, message] of [
    ['weight', '1000000.01', 'Weight must be 1 000 000 kg or less.'],
    ['weight', '99999999999', 'Weight must be 1 000 000 kg or less.'],
    ['weight', '999999999999999999999', 'Weight must be 1 000 000 kg or less.'],
    ['price', '100000.01', 'Price must be R 100 000.00 per kg or less.'],
    ['price', '100000,01', 'Price must be R 100 000.00 per kg or less.'],
  ]) {
    const result = schema.safeParse({ ...values, [field]: value });
    assert.equal(result.success, false);
    assert.equal(result.error.issues[0].path[0], field);
    assert.equal(result.error.issues[0].message, message);
  }
});

test('stock edits preserve unchanged over-cap amounts, including accumulated precision', () => {
  const original = { ...values, weight: '1000001.000000', price: '100001.00' };
  const schema = stockSchema(original);
  assert.equal(
    schema.safeParse({ ...original, is_listed: false }).success,
    true
  );
  assert.equal(
    schema.safeParse({ ...original, weight: '1000001.00', price: '100001' })
      .success,
    true
  );
  assert.equal(schema.safeParse({ ...original, price: '9' }).success, true);
  assert.equal(schema.safeParse({ ...original, weight: '2' }).success, true);
  assert.equal(
    schema.safeParse({ ...original, weight: '1000002' }).success,
    false
  );
  assert.equal(
    schema.safeParse({ ...original, price: '100002' }).success,
    false
  );
  const dialog = source('components/dialogs/stock-dialog.tsx');
  assert.match(
    dialog,
    /weight: sameAmount\(weight, stock\.weight\) \? undefined : weight/
  );
  assert.match(
    dialog,
    /price: sameAmount\(price, stock\.price\) \? undefined : price/
  );
});

test('the stock footer reserves hint space; offer errors use space only when shown', () => {
  for (const file of ['stock-dialog.tsx']) {
    const dialog = source(`components/dialogs/${file}`);
    assert.match(dialog, /className="h-10"/);
    assert.equal((dialog.match(/className="min-h-32"/g) ?? []).length, 0);
    assert.match(
      dialog,
      /<DialogFooter>\s*<Button[\s\S]*?<\/Button>\s*<\/DialogFooter>/
    );
    assert.ok(
      dialog.indexOf('className="h-10"') < dialog.indexOf('<DialogFooter>')
    );
  }
  const offer = source('components/dialogs/offer-dialog.tsx');
  assert.doesNotMatch(offer, /className="(?:h-10|min-h-32)"/);
  assert.match(offer, /errors.root\?\.message &&/);
  assert.match(
    offer,
    /<DialogFooter>\s*<Button[\s\S]*?<\/Button>\s*<\/DialogFooter>/
  );
});

test('the stock and offer fields keep their units in labels only', () => {
  for (const file of ['stock-dialog.tsx', 'offer-dialog.tsx']) {
    const dialog = source(`components/dialogs/${file}`);
    assert.equal((dialog.match(/label="Weight \(kg\)"/g) ?? []).length, 1);
    assert.equal((dialog.match(/label="Price \(R \/ kg\)"/g) ?? []).length, 1);
    assert.equal((dialog.match(/unit: undefined/g) ?? []).length, 2);
  }
});

test('public review cards show the material context supplied by the server', () => {
  assert.match(
    source('routes/market/store/$sellerId.tsx'),
    /\{review\.materials\}/
  );
  assert.match(
    source('lib/api/types.ts'),
    /interface Review \{[^}]*materials: string;/
  );
});
