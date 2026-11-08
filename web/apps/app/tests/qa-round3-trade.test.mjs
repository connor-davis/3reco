import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function compile(path, mocks = {}, suffix = '') {
  const source = readFileSync(
    new URL(`../src/${path}`, import.meta.url),
    'utf8'
  );
  const { outputText } = ts.transpileModule(source + suffix, {
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
    require: (id) =>
      id === 'react/jsx-runtime'
        ? jsx
        : (mocks[id] ?? new Proxy({}, { get: (_, key) => key })),
  });
  return exports;
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function words(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return [node?.props?.children]
    .flat(Infinity)
    .filter((v) => v != null && typeof v !== 'boolean')
    .map(words)
    .join(' ');
}

test('first overlay click renders the implementation synchronously', () => {
  const Body = () => null;
  const { ResponsiveOverlay } = compile('components/responsive-overlay.tsx', {
    react: { useState: () => [false, () => {}] },
    './responsive-overlay-body': { default: Body },
  });
  assert.equal(ResponsiveOverlay({ open: true }).type, Body);
  assert.equal(ResponsiveOverlay({ open: false }), null);
});

test('Request this material opens the selected lot and keeps the entered quantity', () => {
  let state = false;
  const listing = {
    id: 'lot',
    seller_id: 'seller',
    material_id: 'material',
    weight: '500',
    price: '8',
    review_count: 0,
  };
  const { ListingDetail } = compile(
    'routes/market/listing/$listingId.tsx',
    {
      react: {
        useEffect: () => {},
        useState: () => [
          state,
          (value) => {
            state = value;
          },
        ],
      },
      '@tanstack/react-router': {
        createFileRoute: () => () => ({}),
        useNavigate: () => () => {},
      },
      'react-hook-form': {
        useForm: () => ({
          watch: () => '1.25',
          control: {},
          handleSubmit: () => () => {},
          formState: { errors: {} },
        }),
      },
      '@hookform/resolvers/zod': { zodResolver: () => ({}) },
      zod: {
        z: { object: () => ({}), string: () => ({ superRefine: () => ({}) }) },
      },
      '@/lib/auth/use-auth': {
        useAuth: () => ({ user: { id: 'buyer', role: 'business' } }),
      },
      '@/lib/api/cart': {
        useCart: () => ({ data: { items: [] } }),
        useSaveCart: () => ({}),
      },
      '@/lib/quantity': {
        quantityError: () => undefined,
        weightCounter: () => '',
      },
      '@/lib/format': {
        toGrams: () => 1000,
        formatKg: String,
        formatRate: String,
        formatRand: String,
        lineCents: () => 100,
        plural: String,
      },
      './-components/gallery': {},
    },
    '\nexport { ListingDetail };'
  );
  const tree = ListingDetail({ listing });
  const button = nodes(tree).find(
    (node) => words(node) === 'Request this material'
  );
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  const opened = nodes(ListingDetail({ listing })).find(
    (node) => node.props?.listing === listing
  );
  assert.equal(opened.props.open, true);
  assert.equal(opened.props.initialWeight, '1.25');
});

test('CSV paths carry active transaction type and user role filters', () => {
  const paging = compile('lib/api/paging.ts');
  const { exportPath } = compile('lib/api/exports.ts', { './paging': paging });
  assert.equal(
    exportPath('transactions', { type: 'c2b' }),
    '/admin/exports/transactions?type=c2b'
  );
  assert.equal(
    exportPath('users', { role: 'staff' }),
    '/admin/exports/users?role=staff'
  );
});

test('completed unreviewed trade enables review launch; reviewed trades disable it', () => {
  let items = [{ transaction_id: 'trade' }];
  let state = [];
  let index = 0;
  const { StorePage } = compile(
    'routes/market/store/$sellerId.tsx',
    {
      react: {
        useEffect: () => {},
        useState: (initial) => {
          const at = index++;
          if (!(at in state)) state[at] = initial;
          return [
            state[at],
            (value) => {
              state[at] = value;
            },
          ];
        },
      },
      '@tanstack/react-router': {
        createFileRoute: () => () => ({
          useParams: () => ({ sellerId: 'seller' }),
        }),
      },
      '@/lib/auth/use-auth': {
        useAuth: () => ({ user: { id: 'buyer', role: 'business' } }),
      },
      '@/lib/api/stores': {
        useStore: () => ({ data: { id: 'seller', name: 'Seller' } }),
      },
      '@/lib/api/listings': {
        useStoreListings: () => ({ data: { items: [] } }),
      },
      '@/lib/api/reviews': {
        useReviews: () => ({ data: { items: [] } }),
        useDeleteReview: () => ({}),
        useReviewSummary: () => ({ data: { average: null, count: 0 } }),
        useReviewable: (seller) => {
          assert.equal(seller, 'seller');
          return { isSuccess: true, data: { items } };
        },
      },
      '@/lib/format': { plural: String, formatDate: String },
    },
    '\nexport { StorePage };'
  );
  function render() {
    index = 0;
    return StorePage();
  }
  const button = nodes(render()).find(
    (node) =>
      typeof node.props?.onClick === 'function' &&
      words(node) === 'Leave a review'
  );
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  const dialog = nodes(render()).find(
    (node) => node.props?.storeId === 'seller'
  );
  assert.equal(dialog.props.open, true);
  items = [];
  const exhausted = nodes(render()).find(
    (node) =>
      typeof node.props?.onClick === 'function' &&
      words(node) === 'Leave a review'
  );
  assert.equal(exhausted.props.disabled, true);
});

test('pagination reports the visible range and total on both pages', () => {
  const { Pager } = compile('components/transactions/list-tools.tsx', {
    '@/lib/api/paging': { nextPage: (page) => page.next_cursor },
    './pager-state': {},
  });
  const pager = { pageNumber: 1, params: { limit: 50 }, hasPrevious: false };
  assert.match(
    words(
      Pager({
        pager,
        page: { items: Array(50), next_cursor: 'next' },
        total: 54,
      })
    ),
    /1–50 of 54/
  );
  assert.match(
    words(
      Pager({
        pager: { ...pager, pageNumber: 2, hasPrevious: true },
        page: { items: Array(4) },
        total: 54,
      })
    ),
    /51–54 of 54/
  );
});
