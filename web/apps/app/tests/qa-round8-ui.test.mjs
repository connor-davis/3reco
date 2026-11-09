import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { source } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
function compile(path, mocks = {}, expose = '') {
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
const format = compile('lib/format.ts');
const quantity = compile('lib/quantity.ts', { '@/lib/format': format });
const react = {
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
  useEffect: () => {},
};

test('request quantity errors wait for touch while Send stays disabled until valid', () => {
  for (const touched of [false, true]) {
    for (const weight of ['', '-1', '1.005', '3', '1.50']) {
      const { NewMessageForm } = compile(
        'components/dialogs/new-message-dialog.tsx',
        {
          react,
          '@tanstack/react-router': { useNavigate: () => () => {} },
          'react-hook-form': {
            useForm: () => ({
              control: {},
              watch: () => weight,
              handleSubmit: () => () => {},
              formState: { touchedFields: { weight: touched }, errors: {} },
            }),
          },
          '@/lib/api/listings': { useListings: () => ({}) },
          '@/lib/api/requests': {
            useCreateRequest: () => ({ isPending: false }),
          },
          '@/lib/quantity': quantity,
        },
        '\nexports.NewMessageForm = NewMessageForm;'
      );
      const tree = nodes(
        NewMessageForm({
          listing: { id: 'lot', weight: '2' },
          initialWeight: '',
        })
      );
      const invalid = weight !== '1.50';
      assert.equal(
        tree.find((node) => node.props.type === 'submit').props.disabled,
        invalid
      );
      assert.equal(
        tree.some((node) => node.props.role === 'alert'),
        touched && invalid
      );
      // The quantity hint shows only while the quantity is wrong.
      assert.equal(
        tree.some((node) => node.props.description?.includes('above 0 kg')),
        invalid
      );
    }
  }
});

test('material carbon errors distinguish invalid/nonpositive numbers from excess precision', () => {
  const { schema } = compile(
    'components/dialogs/material-dialog.tsx',
    {
      '@/lib/format': format,
    },
    '\nexports.schema = schema;'
  );
  for (const [carbon_factor, message] of [
    ['abc', 'Enter a number.'],
    ['-1', 'Enter a number above 0.'],
    ['0', 'Enter a number above 0.'],
    ['0.000', 'Enter a number above 0.'],
    ['1.005', 'Use up to 2 decimals, for example 1.50.'],
    ['0.001', 'Use up to 2 decimals, for example 1.50.'],
  ]) {
    const result = schema.safeParse({
      name: 'Glass',
      gw_code: 'GW1',
      price: '2',
      carbon_factor,
    });
    assert.equal(result.error.issues[0].message, message);
    assert.equal(result.error.issues.length, 1);
  }
  for (const carbon_factor of ['1.50', '1,5', '0.01']) {
    assert.equal(
      schema.safeParse({
        name: 'Glass',
        gw_code: 'GW1',
        price: '2',
        carbon_factor,
      }).success,
      true
    );
  }
});

test('collection total is absent for invalid weight and returns after correction', () => {
  for (const weight of ['1.005', '', '-1', '1.50']) {
    const { CollectionDialog } = compile(
      'components/dialogs/collection-dialog.tsx',
      {
        react,
        'react-hook-form': {
          useForm: () => ({
            control: {},
            watch: () => [{ material_id: 'm', weight, price: '2' }],
            handleSubmit: () => () => {},
            formState: { errors: {} },
          }),
          useFieldArray: () => ({ fields: [] }),
        },
        '@/lib/api/materials': { useMaterials: () => ({}) },
        '@/lib/api/collectors': { useCollectorSelection: () => ({}) },
        '@/lib/api/stores': { useStores: () => ({}) },
        '@/lib/auth/use-auth': {
          useAuth: () => ({ user: { role: 'business' } }),
        },
        '@/lib/api/transactions': { useCreateCollection: () => ({}) },
        '@/lib/format': format,
        '@/lib/quantity': quantity,
        '@/lib/limits': compile('lib/limits.ts'),
      }
    );
    const tree = nodes(CollectionDialog({ open: true }));
    assert.equal(
      tree.find((node) => node.props.className === 'tabular-nums').props
        .children,
      weight === '1.50' ? 'R 3.00' : '-'
    );
  }
});

test('disabled stock submission leaves field errors out of the footer', () => {
  for (const values of [
    { material_id: '', weight: '', price: '', is_listed: true },
    { material_id: 'm', weight: '1', price: '1', is_listed: true },
  ]) {
    const { StockForm } = compile(
      'components/dialogs/stock-dialog.tsx',
      {
        react,
        'react-hook-form': {
          useForm: () => ({
            control: {},
            watch: (name) => (name ? values[name] : values),
            handleSubmit: () => () => {},
            formState: { isValid: false, isDirty: true },
          }),
        },
        '@/lib/api/materials': {
          useMaterials: () => ({ data: { items: [{ id: 'm', price: '2' }] } }),
        },
        '@/lib/api/stock': {
          useCreateStock: () => ({}),
          useUpdateStock: () => ({}),
        },
        '@/lib/format': format,
        '@/lib/quantity': quantity,
      },
      '\nexports.StockForm = StockForm;'
    );
    const footer = StockForm({ open: true }).props.footer;
    const hint = nodes(footer).find((node) => node.props.role === 'status');
    assert.equal(hint, undefined);
    assert.ok(nodes(footer).some((node) => node.props.disabled));
  }
});

test('completed chat copy follows participation and the store link names its destination', () => {
  const request = {
    buyer: { id: 'b', name: 'Buyer' },
    seller: { id: 's', name: 'Seller' },
    items: [],
    updated_at: '2026-11-08T12:00:00Z',
    created_at: '2026-11-08T12:00:00Z',
  };
  for (const [id, role] of [
    ['b', 'business'],
    ['s', 'business'],
    ['a', 'admin'],
    ['x', 'staff'],
  ]) {
    const mocks = {
      '@/lib/auth/use-auth': { useAuth: () => ({ user: { id, role } }) },
      '@/lib/api/transactions': { useDownloadInvoice: () => ({}) },
      '@/lib/format': { ...format, formatTime: () => '' },
      './helpers': { requestTotal: () => 0, requestLabel: () => '' },
    };
    const { InvoiceCard } = compile('components/chat/cards.tsx', mocks);
    assert.ok(
      nodes(InvoiceCard({ request })).some(
        (node) =>
          node.props.children ===
          (id === 'b' || id === 's'
            ? 'The transaction and invoice are in your records.'
            : 'The transaction and invoice are in the trade records.')
      )
    );
    const { DealAside } = compile('components/chat/deal-aside.tsx', mocks);
    const link = nodes(DealAside({ request })).find(
      (node) => node.props.to === '/market/store/$sellerId'
    );
    assert.equal(link.props.params.sellerId, id === 's' ? 'b' : 's');
    assert.ok(link.props.children.includes(id === 's' ? 'Buyer' : 'Seller'));
  }
});

test('verify success confirms once and offers Sign in', () => {
  const { Route } = compile('routes/verify-email.tsx', {
    react,
    '@tanstack/react-router': {
      createFileRoute: () => (route) => ({
        ...route,
        useSearch: () => ({ token: 'token' }),
      }),
    },
    '@/lib/api/auth': {
      useVerifyEmail: () => ({ isSuccess: true }),
      useSendVerification: () => ({}),
    },
    '@/lib/api/client': { ApiError: Error },
  });
  const shell = Route.component();
  assert.equal(shell.props.title, 'Email verified.');
  assert.equal(shell.props.description, 'Sign in to continue.');
  assert.equal(shell.props.feedback, null);
  assert.ok(
    nodes(shell.props.footer).some((node) => node.props.children === 'Sign in')
  );
});

test('catalogue factors share a formatter and order is explained; row actions keep a stable width', () => {
  const materials = source('routes/materials.tsx');
  assert.match(materials, /Listed by material name, A–Z/);
  assert.match(materials, /formatKgFixed\(row.original.carbon_factor\)/);
  assert.match(materials, /formatKgFixed\(material.carbon_factor\)/);
  assert.equal(format.formatKgNumber('1.5000'), format.formatKgNumber('1.5'));
  const rows = source('routes/transactions/-components/record-list.tsx');
  assert.match(rows, /className="w-44 shrink-0"[\s\S]*?Invoice and receipts/);
  assert.doesNotMatch(rows, /Invoice and receipts \(/);
});

test('listing distinguishes signed-in browsers and remaining copy is role neutral', () => {
  const listing = source('routes/market/listing/$listingId.tsx');
  assert.match(listing, /user.role === 'admin' \|\| user.role === 'staff'/);
  assert.match(listing, /staff and administrators cannot request materials/);
  assert.match(listing, /Only business accounts can request/);
  assert.match(listing, /Sign in as a business/);
  assert.match(source('routes/collectors.tsx'), /leave the directory/);
  assert.match(source('routes/profile/index.tsx'), /Your address and area/);
  const privacy = source('routes/profile/-components/privacy-panel.tsx');
  assert.doesNotMatch(privacy, /<h3[^>]*>Download my data|<h3[^>]*>Your data/);
  assert.match(privacy, /'Preparing download…' : 'Download'/);
  assert.match(
    source('routes/market/store/$sellerId.tsx'),
    /'Be the first to review this store\.'/
  );
});
