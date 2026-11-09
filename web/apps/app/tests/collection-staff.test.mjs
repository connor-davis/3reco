import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function compile(path, dependencies, suffix = '') {
  const { outputText } = ts.transpileModule(read(path) + suffix, {
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
    Map,
    require(name) {
      if (name in dependencies) return dependencies[name];
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  return exports;
}

const format = compile('../src/lib/format.ts', {});
const limits = compile('../src/lib/limits.ts', {});
const quantity = compile('../src/lib/quantity.ts', { '@/lib/format': format });
const dialog = compile(
  '../src/components/dialogs/collection-dialog.tsx',
  {
    zod: { z },
    '@/lib/format': format,
    '@/lib/quantity': quantity,
    '@/lib/limits': limits,
  },
  '\nexports.picksBusiness = picksBusiness;' +
    '\nexports.businessMissing = businessMissing;' +
    '\nexports.collectionBody = collectionBody;' +
    '\nexports.businessMessage = businessMessage;'
);

const values = {
  business_id: 'biz-1',
  collector_id: 'col-1',
  collection_day: '2026-01-01',
  lines: [{ material_id: 'm', weight: '1,5', price: '4.50' }],
};

test('admin and staff pick a business; business and others do not', () => {
  assert.ok(dialog.picksBusiness('admin'));
  assert.ok(dialog.picksBusiness('staff'));
  assert.ok(!dialog.picksBusiness('business'));
  assert.ok(!dialog.picksBusiness(undefined));
});

test('the business is required for admin and staff only', () => {
  assert.ok(dialog.businessMissing({ business_id: '' }, true));
  assert.ok(!dialog.businessMissing({ business_id: 'biz-1' }, true));
  assert.ok(!dialog.businessMissing({ business_id: '' }, false));
  assert.equal(dialog.businessMessage, 'Select the business that bought this.');
});

test('business_id is sent only when admin or staff picked one', () => {
  const picked = dialog.collectionBody(values, true);
  assert.equal(picked.business_id, 'biz-1');
  assert.equal(picked.items[0].weight, '1.5');

  const own = dialog.collectionBody(values, false);
  assert.ok(!('business_id' in own));
});

test('the page lets admin, staff and business record a collection', () => {
  const page = read('../src/routes/collections.tsx');
  for (const role of ['business', 'admin', 'staff']) {
    assert.match(page, new RegExp(`user\\?\\.role === '${role}'`));
  }
  assert.doesNotMatch(page, /only businesses record/);
});
