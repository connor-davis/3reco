import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { source } from './qa-round2-loader.mjs';

const { outputText } = ts.transpileModule(
  source('components/dialogs/collector-dialog.tsx') +
    '\nexports.toInput = toInput; exports.toValues = toValues; exports.schemaFor = schemaFor;',
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }
);
const exports = {};
vm.runInNewContext(outputText, {
  exports,
  require(name) {
    if (name === 'zod') return { z };
    if (name === '@/lib/names') return { tidyName: (value) => value.trim() };
    if (name === '@/components/transactions/phone')
      return { phoneSchema: z.string() };
    return {};
  },
});

const collector = {
  name: 'Nomsa',
  email: 'nomsa@example.test',
  street_address: '12 Main Road',
  city: 'Durban',
  area_code: 4000,
  province: 'KwaZulu-Natal',
  payout_method: 'bank',
  bank_account_holder_name: 'Nomsa',
  bank_name: 'FNB',
  bank_account_type: 'Savings',
  bank_account_number: '******6789',
  bank_branch_code: '******3456',
};

test('unchanged masked identifiers validate but are omitted from PATCH', () => {
  const values = exports.toValues(collector);
  assert.equal(exports.schemaFor(collector).safeParse(values).success, true);
  const input = exports.toInput(values, collector);
  assert.equal('bank_account_number' in input, false);
  assert.equal('bank_branch_code' in input, false);
  assert.equal(input.city, 'Durban');
});

test('staff contact edits send no payout fields', () => {
  const input = exports.toInput(
    { ...exports.toValues(collector), city: 'Paarl' },
    collector,
    true
  );
  assert.equal(input.city, 'Paarl');
  assert.equal(
    Object.keys(input).some(
      (key) =>
        key.startsWith('bank_') ||
        key.startsWith('ewallet_') ||
        key === 'payout_method'
    ),
    false
  );
  assert.match(
    source('components/dialogs/collector-dialog.tsx'),
    /disabled=\{payoutReadOnly\}/
  );
});

test('a full payout remains editable for the owner', () => {
  const input = exports.toInput(
    {
      ...exports.toValues(collector),
      bank_account_number: '987654321',
      bank_branch_code: '654321',
    },
    collector
  );
  assert.equal(input.bank_account_number, '987654321');
  assert.equal(input.bank_branch_code, '654321');
});
