import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);

// Exercise production components with controlled query/transport boundaries.
// UI primitives are inert so these tests need no browser or added dependency.
function load(relative, overrides = {}) {
  const modules = new Map();
  const primitive = ({ children }) =>
    React.createElement('div', null, children);
  const ui = new Proxy({}, { get: () => primitive });

  function read(url) {
    const key = url.href;
    if (modules.has(key)) return modules.get(key);
    const exports = {};
    modules.set(key, exports);
    const source = readFileSync(url, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    vm.runInNewContext(outputText, {
      exports,
      Error,
      URL,
      require: (name) => {
        if (name in overrides) return overrides[name];
        if (name === '@tanstack/react-router')
          return { createFileRoute: () => (options) => options };
        if (name === '@/components/data-state')
          return read(
            new URL('../src/components/data-state.tsx', import.meta.url)
          );
        if (name === '@/components/stat-card')
          return read(
            new URL('../src/components/stat-card.tsx', import.meta.url)
          );
        if (name === '@/components/link-button')
          return {
            LinkButton: ({ to, children }) =>
              React.createElement('a', { href: to }, children),
          };
        if (name === '@/lib/api/messages')
          return { useInbox: () => ready({ items: [] }) };
        if (name === '@/lib/api/transactions')
          return { useTransactions: () => ready({ items: [] }) };
        if (name === '@/lib/utils')
          return { cn: (...classes) => classes.filter(Boolean).join(' ') };
        if (name === '@/lib/format')
          return read(new URL('../src/lib/format.ts', import.meta.url));
        if (name === '@/lib/api/client') return { ApiError: Error };
        if (name.startsWith('@/components/') || name === 'recharts') return ui;
        if (name.startsWith('.'))
          return read(
            new URL(name + (name.endsWith('schemas') ? '.ts' : '.tsx'), url)
          );
        return require(name);
      },
    });
    return exports;
  }
  return read(new URL(relative, import.meta.url));
}

function ready(data) {
  return { data, isPending: false, isError: false, refetch() {} };
}

const dashboard = {
  from: '2026-10-07T00:00:00+02:00',
  totals: {
    count: 4,
    value: '12345.67',
    weight: '2345.5',
    carbon_savings: '3400',
  },
  series: [{ day: '2026-11-05', weight: '2345.5' }],
  counterparties: [
    { id: 'party-1', name: 'Same name', count: 1, value: '1.00' },
    { id: 'party-2', name: 'Same name', count: 3, value: '12344.67' },
  ],
};

test('dashboard hides retained totals and every activity panel while pending, failed or empty', () => {
  for (const query of [
    { ...ready(dashboard), isPending: true },
    { ...ready(dashboard), isError: true, error: new Error('Connection lost') },
    ready({ ...dashboard, totals: { ...dashboard.totals, count: 0 } }),
  ]) {
    const page = load('../src/routes/index.tsx', {
      '@/lib/auth/use-auth': {
        useAuth: () => ({
          user: { role: 'collector', name: 'Renamed collector' },
        }),
      },
      '@/lib/api/dashboards': { useDashboard: () => query },
      '@/lib/api/stats': {
        useStats: () =>
          ready({ deals: 5, total_kg: '88888', co2_kg: '100', top_stores: [] }),
      },
    });
    const html = renderToStaticMarkup(
      React.createElement(page.Route.component)
    );
    assert.ok(!html.includes('R 12 345.67'));
    assert.ok(!html.includes('2 345.5 kg'));
    assert.ok(!html.includes('Trading partners'));
    assert.ok(!html.includes('Materials on the move'));
    assert.ok(!html.includes('88 888'));
  }
});

test('renaming a collector preserves server totals and distinct partners with identical names', () => {
  const page = load('../src/routes/index.tsx', {
    '@/lib/auth/use-auth': {
      useAuth: () => ({
        user: { role: 'collector', name: 'Renamed collector' },
      }),
    },
    '@/lib/api/dashboards': {
      useDashboard: () => ready({ ...dashboard, collector_linked: true }),
    },
    '@/lib/api/stats': { useStats: () => ready(null) },
  });
  const html = renderToStaticMarkup(React.createElement(page.Route.component));
  assert.ok(html.includes('R 12 345.67'));
  assert.ok(html.includes('2 345.5 kg'));
  assert.equal((html.match(/Same name/g) ?? []).length, 2);
});

test('profile patches omit saved masked identifiers and preserve exact replacement text', async () => {
  const writes = [];
  const profile = {
    id_number: '******1234',
    bank_account_number: '******5678',
    bank_account_type: 'Savings',
  };
  const forms = load('../src/routes/profile/-components/forms.tsx', {
    'react-hook-form': { useForm: () => ({ control: {} }) },
    '@/lib/api/profile': {
      useUpdateProfile: () => ({
        mutateAsync: async (body) => writes.push(body),
      }),
    },
  });
  const personal = forms.PersonalForm({ profile });
  await personal.props.onSave({
    first_name: 'New',
    last_name: 'Name',
    phone: '+27825550148',
    id_number: '',
  });
  assert.equal(writes[0].name, 'New Name');
  assert.ok(!('id_number' in writes[0]));
  assert.ok(!('email' in writes[0]));
  assert.ok(!('firstName' in writes[0]));

  const bank = forms.PayoutForm({ profile });
  const fields = {
    bank_account_holder_name: 'New Name',
    bank_name: 'Bank',
    bank_branch_code: '000001',
    bank_account_type: 'Savings',
    bank_account_number: '',
  };
  await bank.props.onSave(fields);
  assert.ok(!('bank_account_number' in writes[1]));
  await bank.props.onSave({ ...fields, bank_account_number: '0000123456' });
  assert.equal(writes[2].bank_account_number, '0000123456');
  assert.ok(!('payoutMethod' in writes[2]));
});

test('a rejected profile save keeps the form dirty and never reports success', async () => {
  const errors = [];
  const successes = [];
  let resets = 0;
  const values = {
    first_name: 'New',
    last_name: 'Name',
    phone: '+27825550148',
    id_number: '',
  };
  const forms = load('../src/routes/profile/-components/forms.tsx', {
    'react-hook-form': {
      useForm: () => ({
        control: {},
        formState: { errors: {}, isSubmitting: false },
        handleSubmit: (callback) => () => callback(values),
        clearErrors() {},
        setError: (...args) => errors.push(args),
        reset() {
          resets++;
        },
      }),
    },
    sonner: { toast: { success: (message) => successes.push(message) } },
    '@/lib/api/profile': {
      useUpdateProfile: () => ({
        mutateAsync: async () => {
          throw new Error('Save rejected');
        },
      }),
    },
  });
  const element = forms.PersonalForm({ profile: {} });
  const form = element.type(element.props);
  await form.props.onSubmit();
  assert.equal(resets, 0);
  assert.equal(successes.length, 0);
  assert.equal(errors.at(-1)[1].message, 'Save rejected');
});

test('account deletion requires both password and the exact typed confirmation', () => {
  let schema;
  load('../src/routes/profile/-components/privacy-panel.tsx', {
    react: { useState: () => [false, () => {}] },
    'react-hook-form': {
      useForm: (options) => {
        schema = options.resolver;
        return {
          control: {},
          formState: { errors: {} },
          handleSubmit: () => () => {},
        };
      },
    },
    '@hookform/resolvers/zod': { zodResolver: (value) => value },
    '@/lib/api/privacy': {
      usePrivacyNotice: () => ready({ version: '2026-11', accepted: false }),
      useAcceptPrivacyNotice: () => ({}),
      useDownloadMyData: () => ({}),
      useDeleteAccount: () => ({}),
    },
  }).PrivacyPanel();
  assert.equal(
    schema.safeParse({ password: '', confirmation: 'DELETE' }).success,
    false
  );
  assert.equal(
    schema.safeParse({ password: 'secret', confirmation: 'delete' }).success,
    false
  );
  assert.equal(
    schema.safeParse({ password: 'secret', confirmation: 'DELETE' }).success,
    true
  );
});
function findElement(element, predicate) {
  if (Array.isArray(element))
    return element.map((child) => findElement(child, predicate)).find(Boolean);
  if (!React.isValidElement(element)) return undefined;
  if (predicate(element)) return element;
  return findElement(element.props.children, predicate);
}

test('avatar rejects oversized files and only reports success after the upload hook succeeds', () => {
  const state = [];
  const callbacks = [];
  const successes = [];
  const closed = [];
  const cleanup = [];
  let index = 0;
  const mutation = {
    isPending: false,
    mutate: (file, options) => callbacks.push({ file, options }),
  };
  const avatar = load('../src/components/dialogs/avatar-dialog.tsx', {
    react: {
      useState: (initial) => {
        const key = index++;
        if (!(key in state)) state[key] = initial;
        return [
          state[key],
          (value) => {
            state[key] = value;
          },
        ];
      },
      useEffect: (effect) => cleanup.push(effect()),
    },
    sonner: { toast: { success: (message) => successes.push(message) } },
    '@/lib/api/profile': { useProfile: () => ready({ avatar_url: '' }) },
    '@/lib/api/avatar': {
      useUploadAvatar: () => mutation,
      useDeleteAvatar: () => ({ isPending: false }),
    },
  });
  const outer = avatar.AvatarDialog({
    open: true,
    name: 'Collector',
    onOpenChange: (value) => closed.push(value),
  });
  const render = () => {
    index = 0;
    return outer.type(outer.props);
  };
  let body = render();
  let input = findElement(body, (element) => element.props.type === 'file');
  input.props.onChange({
    target: {
      files: [
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', {
          type: 'image/png',
        }),
      ],
    },
  });
  body = render();
  assert.equal(body.props.footer.props.children[1].props.disabled, true);
  assert.equal(callbacks.length, 0);

  input = findElement(body, (element) => element.props.type === 'file');
  const file = new File(['image'], 'photo.png', { type: 'image/png' });
  input.props.onChange({ target: { files: [file] } });
  body = render();
  const upload = body.props.footer.props.children[1];
  assert.equal(upload.props.disabled, false);
  upload.props.onClick();
  assert.equal(callbacks[0].file, file);
  assert.equal(successes.length, 0);
  assert.equal(closed.length, 0);
  callbacks[0].options.onSuccess();
  assert.equal(successes[0], 'Picture uploaded.');
  assert.equal(closed[0], false);
  for (const release of cleanup) release?.();
});

test('review submits against the selected eligible transaction rather than the store ID', async () => {
  const posted = [];
  const successes = [];
  let target;
  const values = {
    transaction_id: 'trade-17',
    rating: 5,
    comment: 'Good trade.',
  };
  const dialog = load('../src/components/dialogs/review-dialog.tsx', {
    'react-hook-form': {
      useForm: () => ({
        control: {},
        formState: { errors: {} },
        watch: () => values.transaction_id,
        handleSubmit: (callback) => () => callback(values),
        reset() {},
        setError() {},
      }),
    },
    sonner: { toast: { success: (message) => successes.push(message) } },
    '@/lib/api/reviews': {
      useReviewable: () =>
        ready({
          items: [
            {
              transaction_id: values.transaction_id,
              created_at: '2026-11-05T10:00:00+02:00',
            },
          ],
        }),
      useCreateReview: (id) => {
        target = id;
        return { mutateAsync: async (body) => posted.push(body) };
      },
    },
  }).ReviewDialog({ open: true, onOpenChange() {}, storeId: 'seller-8' });
  await dialog.props.footer.props.onClick();
  assert.equal(target, 'trade-17');
  assert.equal(posted[0].rating, 5);
  assert.equal(posted[0].comment, 'Good trade.');
  assert.ok(!('storeId' in posted[0]));
  assert.equal(successes[0], 'Review posted.');
});
