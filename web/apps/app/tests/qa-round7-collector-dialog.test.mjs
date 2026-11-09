import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as jsx from 'react/jsx-runtime';
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

test('duplicate phone server errors attach to Phone rather than the last payout field', async () => {
  const errors = [];
  class ApiError extends Error {}
  const failure = new ApiError(
    'A collector with that phone number already exists.'
  );
  const values = exports.toValues(collector);
  const compiled = ts.transpileModule(
    source('components/dialogs/collector-dialog.tsx') +
      '\nexports.CollectorForm = CollectorForm;',
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }
  );
  const form = {};
  vm.runInNewContext(compiled.outputText, {
    exports: form,
    require(name) {
      if (name === 'zod') return { z };
      if (name === 'react/jsx-runtime') return jsx;
      if (name === 'react') return { useState: () => ['', () => {}] };
      if (name === '@/lib/api/client') return { ApiError };
      if (name === '@/lib/names') return { tidyName: (value) => value };
      if (name === '@/lib/auth/use-auth')
        return { useAuth: () => ({ user: { role: 'admin' } }) };
      if (name === '@/components/transactions/phone')
        return { phoneSchema: z.string() };
      if (name === '@hookform/resolvers/zod')
        return { zodResolver: () => () => {} };
      if (name === 'react-hook-form')
        return {
          useForm: () => ({
            control: {},
            watch: () => 'bank',
            handleSubmit: (callback) => () => callback(values),
            setError: (...args) => errors.push(args),
          }),
        };
      if (name === '@/lib/api/collectors')
        return {
          useCreateCollector: () => ({
            mutateAsync: async () => {
              throw failure;
            },
          }),
          useUpdateCollector: () => ({}),
        };
      return {};
    },
  });
  await form.CollectorForm({ open: true }).props.footer.props.onClick();
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], 'phone');
  assert.equal(errors[0][1].message, failure.message);
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

test('picked payout methods require complete details; staff contact edits omit payout', () => {
  const blank = exports.toValues({
    ...collector,
    bank_account_holder_name: '',
    bank_name: '',
    bank_account_type: '',
    bank_account_number: '',
    bank_branch_code: '',
  });
  for (const payout_method of ['bank', 'ewallet']) {
    const values = { ...blank, payout_method };
    assert.equal(exports.schemaFor().safeParse(values).success, false);
    const partial =
      payout_method === 'bank'
        ? { ...values, bank_name: 'FNB' }
        : { ...values, ewallet_platform_name: 'FNB eWallet' };
    assert.equal(exports.schemaFor().safeParse(partial).success, false);
    assert.equal(
      exports.schemaFor(collector, true).safeParse(partial).success,
      true
    );
  }
  const complete = {
    ...exports.toValues(collector),
    bank_account_number: '123456789',
    bank_branch_code: '250655',
  };
  assert.equal(exports.schemaFor().safeParse(complete).success, true);
  assert.equal(
    exports.schemaFor().safeParse({ ...complete, bank_account_number: '123' })
      .success,
    false
  );
});
