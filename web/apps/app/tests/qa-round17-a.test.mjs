import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { load, source } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
const format = load('lib/format.ts');
const limits = load('lib/limits.ts');
const quantity = load('lib/quantity.ts', { '@/lib/format': format });

function compile(path, expose) {
  const { outputText } = ts.transpileModule(source(path) + expose, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (id) => {
      if (id === '@/lib/format') return format;
      if (id === '@/lib/limits') return limits;
      if (id === '@/lib/quantity') return quantity;
      if (id === '@/lib/names') return load('lib/names.ts');
      if (id === '@/components/transactions/phone')
        return load('components/transactions/phone.ts');
      if (id.startsWith('@/')) return {};
      return require(id);
    },
  });
  return exports;
}

const collectionPath = 'components/dialogs/collection-dialog.tsx';
const collection = compile(collectionPath, '\nexports.schema = schema;');
const collectorPath = 'components/dialogs/collector-dialog.tsx';
const collector = compile(
  collectorPath,
  '\nexports.schemaFor = schemaFor; exports.toValues = toValues; exports.toInput = toInput;'
);

test('collection line caps accept each boundary and refuse the next hundredth', () => {
  const values = {
    collector_id: 'collector',
    collection_day: format.today(),
    lines: [{ material_id: 'glass', weight: '1000000', price: '100000.00' }],
  };
  assert.equal(collection.schema.safeParse(values).success, true);
  for (const [field, value, message] of [
    ['weight', '1000000.01', 'Weight must be 1 000 000 kg or less.'],
    ['price', '100000.01', 'Price must be R 100 000.00 per kg or less.'],
    ['price', '100000,01', 'Price must be R 100 000.00 per kg or less.'],
  ]) {
    const result = collection.schema.safeParse({
      ...values,
      lines: [{ ...values.lines[0], [field]: value }],
    });
    assert.equal(result.success, false);
    assert.deepEqual(result.error.issues[0].path, ['lines', 0, field]);
    assert.equal(result.error.issues[0].message, message);
  }
  assert.match(
    source('components/dialogs/stock-dialog.tsx'),
    /import \{ stockLimit \} from '@\/lib\/limits'/
  );
});

const contact = {
  name: 'Nomsa Dube',
  email: 'nomsa@example.test',
  street_address: '12 Main Road',
  city: 'Durban',
  province: 'KwaZulu-Natal',
  area_code: 4000,
};

test('a collector starts with no payout and saves without sending empty payout fields', () => {
  assert.equal(collector.toValues().payout_method, '');
  const values = collector.toValues(contact);
  assert.equal(values.payout_method, '');
  assert.equal(collector.schemaFor().safeParse(values).success, true);
  const input = collector.toInput(values);
  assert.equal(
    Object.keys(input).some((key) =>
      /^(bank_|ewallet_|payout_method)/.test(key)
    ),
    false
  );
  const result = collector
    .schemaFor()
    .safeParse({ ...values, bank_name: 'FNB' });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], 'payout_method');
});

test('a picked method requires its fields; explicit None added sends none', () => {
  const values = collector.toValues(contact);
  for (const method of ['bank', 'ewallet']) {
    const result = collector
      .schemaFor()
      .safeParse({ ...values, payout_method: method });
    assert.equal(result.success, false);
    const expected =
      method === 'bank' ? 'bank_account_number' : 'ewallet_payment_id';
    assert.ok(result.error.issues.some((issue) => issue.path[0] === expected));
  }
  const none = { ...values, payout_method: 'none' };
  assert.equal(collector.schemaFor().safeParse(none).success, true);
  assert.equal(collector.toInput(none).payout_method, 'none');
  assert.match(source(collectorPath), /value="none"/);
  assert.match(source(collectorPath), /None added/);
});

test('editing saved details selects their method and a complete switch replaces bank fields', () => {
  const saved = {
    ...contact,
    payout_method: 'bank',
    bank_account_holder_name: 'Nomsa Dube',
    bank_name: 'FNB',
    bank_account_type: 'Savings',
    bank_account_number: '123456789',
    bank_branch_code: '250655',
  };
  assert.equal(collector.toValues(saved).payout_method, 'bank');
  const wallet = {
    ...collector.toValues(saved),
    payout_method: 'ewallet',
    ewallet_platform_name: 'FNB eWallet',
    ewallet_payment_id: '0827770171',
  };
  assert.equal(collector.schemaFor(saved).safeParse(wallet).success, true);
  assert.equal(collector.toValues(wallet).payout_method, 'ewallet');
  const input = collector.toInput(wallet, saved);
  assert.equal(input.ewallet_payment_id, '0827770171');
  for (const key of Object.keys(input).filter((key) => key.startsWith('bank_')))
    assert.equal(input[key], '');
});

test('the collection picker formats dates, disables future days, and amounts fill two tracks', () => {
  const text = source(collectionPath);
  assert.match(text, /formatDate\(field\.value\)/);
  assert.match(
    text,
    /disabled=\{\(day\) => dateKey\(day, 'yyyy-MM-dd'\) > today\(\)\}/
  );
  assert.doesNotMatch(text, /type="date"/);
  assert.match(text, /sm:grid-cols-2 \[&>\[data-slot=field\]\]:min-w-0/);
  assert.match(text, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
});
