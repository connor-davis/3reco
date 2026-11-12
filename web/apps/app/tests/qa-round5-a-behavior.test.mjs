import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { source } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
function compile(path, mocks = {}, suffix = '') {
  const { outputText } = ts.transpileModule(source(path) + suffix, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    URLSearchParams,
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        return new Proxy({}, { get: (_, name) => name });
      }
      return require(id);
    },
  });
  return exports;
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

test('material schema rejects price/carbon precision and puts required errors on their fields', () => {
  const { schema } = compile(
    'components/dialogs/material-dialog.tsx',
    { '@/lib/format': compile('lib/format.ts') },
    '\nexports.schema = schema;'
  );
  const input = {
    name: 'Copper',
    gw_code: 'GW13',
    price: '1.50',
    carbon_factor: '2.25',
  };
  assert.equal(schema.safeParse(input).success, true);
  for (const price of ['', '0', '-1', '1.001', '100000.01', '1e2']) {
    const result = schema.safeParse({ ...input, price });
    assert.equal(result.success, false, price);
    assert.equal(result.error.issues[0].path[0], 'price');
  }
  assert.equal(
    schema.safeParse({ ...input, price: '100000.00' }).success,
    true
  );
  for (const carbon_factor of ['0', '-1', '0.001']) {
    assert.equal(schema.safeParse({ ...input, carbon_factor }).success, false);
  }
  const blank = schema.safeParse({ ...input, name: '  ' });
  assert.equal(blank.error.issues[0].path[0], 'name');
});

test('material add/edit reject normalized catalog duplicates inline', async () => {
  for (const editing of [false, true]) {
    const errors = [];
    let writes = 0;
    const values = {
      name: ' copper ',
      gw_code: ' gw13 ',
      price: '2',
      carbon_factor: '1',
    };
    const { MaterialDialog } = compile(
      'components/dialogs/material-dialog.tsx',
      {
        react: { useState: () => ['', () => {}] },
        'react-hook-form': {
          useForm: () => ({
            control: {},
            setError: (...args) => errors.push(args),
            handleSubmit: (callback) => () => callback(values),
          }),
        },
        '@/lib/api/materials': {
          useMaterialCatalog: () => ({
            data: [{ id: 'existing', name: 'Copper', gw_code: 'GW13' }],
          }),
          useCreateMaterial: () => ({ mutateAsync: () => writes++ }),
          useUpdateMaterial: () => ({ mutateAsync: () => writes++ }),
        },
        '@/lib/quantity': { priceCounter: () => ({}) },
      }
    );
    const dialog = MaterialDialog({
      open: true,
      material: editing ? { id: 'other', ...values } : undefined,
    });
    await dialog.props.footer.props.onClick();
    assert.deepEqual(
      errors.map(([name]) => name),
      ['name', 'gw_code']
    );
    assert.equal(writes, 0);
  }
});

test('make offer and counter disable Send for invalid prices even with stale form validity', () => {
  for (const status of ['pending', 'offered']) {
    for (const price of ['', '0', '-1', '1.001', 'NaN', '1.50']) {
      const items = [{ material_id: 'm', weight: '1', price }];
      const { OfferForm, schema } = compile(
        'components/dialogs/offer-dialog.tsx',
        {
          'react-hook-form': {
            useForm: () => ({
              control: {},
              watch: () => items,
              handleSubmit: () => () => {},
              formState: { isValid: true, errors: {} },
            }),
            useFieldArray: () => ({ fields: [{ id: 'field' }] }),
          },
          '@/lib/api/requests': { useOffer: () => ({ isPending: false }) },
          '@/lib/quantity': {
            quantityError: () => undefined,
            priceError: compile('lib/quantity.ts').priceError,
            priceCounter: () => ({}),
            weightCounter: () => ({}),
          },
          '@/lib/format': { lineCents: () => 0, formatRand: () => 'R 0.00' },
        },
        '\nexports.OfferForm = OfferForm; exports.schema = schema;'
      );
      const tree = OfferForm({
        request: { id: 'r', status, items: [{ material_name: 'Glass' }] },
      });
      const button = nodes(tree).find((node) => node.props?.type === 'submit');
      assert.equal(
        button.props.disabled,
        price !== '1.50',
        `${status}: ${price}`
      );
      const result = schema.safeParse({ items });
      if (price !== '1.50') {
        assert.equal(result.error.issues[0].path.join('.'), 'items.0.price');
      }
    }
  }
});

test('export client forwards all filters and uses descriptive SAST filenames', async () => {
  const calls = [];
  const { useExport } = compile('lib/api/exports.ts', {
    '@tanstack/react-query': { useMutation: (options) => options },
    './paging': compile('lib/api/paging.ts'),
    './client': { download: (...args) => calls.push(args) },
  });
  await useExport('transactions').mutationFn({
    q: 'Greenline',
    type: 'c2b',
    itemised: true,
    from: '2026-11-04T22:00:00Z',
    to: '2026-11-05T21:59:59Z',
  });
  assert.match(calls[0][0], /q=Greenline/);
  assert.match(calls[0][0], /type=c2b/);
  assert.equal(
    calls[0][1],
    '3REco-transactions-c2b-by-material-2026-11-05-2026-11-05-filtered.csv'
  );
});

test('transaction export passes current search and disables empty or stale-filter downloads', () => {
  const text = source('routes/transactions/-components/record-list.tsx');
  assert.match(text, /type: filters.type,\s*q,/);
  assert.match(text, /!totals.data\?\.count/);
  assert.match(text, /totals.isFetching/);
  assert.match(text, /query.trim\(\) !== q/);
});

test('admin cannot remove their own account; export audit shows kind and filters', () => {
  const { UsersPage, eventLabel } = compile(
    'routes/admin/users.tsx',
    {
      react: { useState: (value) => [value, () => {}] },
      '@tanstack/react-router': { createFileRoute: () => () => ({}) },
      '@/lib/auth/use-auth': { useAuth: () => ({ user: { id: 'self' } }) },
      '@/lib/use-debounced': { useDebounced: (value) => value },
      '@/lib/api/admin': {
        useAdminUsers: () => ({ data: { items: [] } }),
        useDeleteUser: () => ({}),
        useSetBusinessVerified: () => ({}),
      },
      '@/lib/api/exports': { useExport: () => ({}) },
      '@/lib/access': { roleLabel: (role) => role },
      '@/lib/format': { plural: () => '' },
    },
    '\nexports.UsersPage = UsersPage; exports.eventLabel = eventLabel;'
  );
  const tree = UsersPage();
  const table = nodes(tree).find((node) => node.props?.columns);
  const action = table.props.columns.find((column) => column.id === 'actions');
  assert.equal(action.cell({ row: { original: { id: 'self' } } }), null);
  assert.ok(action.cell({ row: { original: { id: 'other' } } }));
  assert.equal(
    eventLabel({
      kind: 'export',
      details: {
        export_kind: 'transactions',
        filters: { q: 'Glass', role: '' },
      },
    }),
    'Data download · Transactions (one row per trade, Search: Glass)'
  );
});
