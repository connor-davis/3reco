import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { source } from './qa-round2-loader.mjs';

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
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === 'react/jsx-runtime') return jsx;
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  return exports;
}

const hooks = {
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
};
const router = {
  createFileRoute: () => () => ({}),
};

function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}

test('same-tick chat submits send once, then allow intentional repeats and retries', async () => {
  const calls = [];
  let resolve;
  let reject;
  const mutation = {
    isPending: false,
    mutateAsync(input) {
      calls.push(input);
      return new Promise((done, fail) => {
        resolve = done;
        reject = fail;
      });
    },
  };
  const { useRequestActions } = compile(
    'components/chat/use-request-actions.ts',
    {
      react: hooks,
      '@tanstack/react-query': { useQueryClient: () => ({}) },
      '@/lib/api/messages': { useSendMessage: () => mutation },
      '@/lib/api/requests': {
        useAcceptRequest: () => ({}),
        useRequest: () => ({}),
        useRequestAction: () => ({}),
      },
      '@/lib/api/client': { ApiError: class extends Error {} },
    }
  );
  const actions = useRequestActions({ id: 'request' });
  const first = actions.send('Same message');
  assert.equal(await actions.send('Same message'), false);
  assert.equal(calls.length, 1);
  resolve();
  assert.equal(await first, true);

  const repeat = actions.send('Same message');
  assert.equal(calls.length, 2);
  reject(new Error('Offline'));
  assert.equal(await repeat, false);

  const retry = actions.send('Same message');
  assert.equal(calls.length, 3);
  resolve();
  assert.equal(await retry, true);
  assert.match(source('components/chat/conversation.tsx'), /actions.isPending/);
});

test('chat merge keeps one copy per ID, including legitimate same-text messages', () => {
  const { orderedMessages } = compile('components/chat/helpers.ts');
  const first = {
    id: 'a',
    content: 'Hello',
    created_at: '2026-11-01T10:00:00Z',
  };
  const second = { ...first, id: 'b' };
  const merged = orderedMessages([second, first, first]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'a');
  assert.equal(merged[1].id, 'b');
});

function adminPage(list) {
  return compile(
    'routes/admin/users.tsx',
    {
      react: hooks,
      '@tanstack/react-router': router,
      '@/lib/use-debounced': { useDebounced: (value) => value },
      '@/components/transactions/pager-state': {
        usePager: () => ({ params: { limit: 10 }, hasPrevious: false }),
      },
      '@/lib/access': { roleLabel: (value) => value },
      '@/lib/auth/use-auth': { useAuth: () => ({ user: { id: 'admin' } }) },
      '@/lib/api/admin': {
        useAdminUsers: () => list,
        useDeleteUser: () => ({}),
        useSetBusinessVerified: () => ({}),
      },
      '@/lib/api/exports': { useExport: () => ({}) },
      '@/lib/format': {
        plural: (count) => `${count} users`,
        formatDateTime: () => '8 November 2026',
      },
    },
    '\nexports.UsersPage = UsersPage;'
  );
}

test('users shared pager is disabled while fetching or after a failed result', () => {
  const row = { id: 'person' };
  for (const [data, flags, disabled] of [
    [{ items: [], has_more: false }, {}, false],
    [{ items: [], has_more: true, next_cursor: 'stale' }, {}, false],
    [undefined, {}, false],
    [{ items: [row], has_more: true }, {}, false],
    [{ items: [row], has_more: true, next_cursor: 'next' }, {}, false],
    [
      { items: [row], has_more: true, next_cursor: 'next' },
      { isFetching: true },
      true,
    ],
    [
      { items: [row], has_more: true, next_cursor: 'next' },
      { isError: true },
      true,
    ],
  ]) {
    const page = adminPage({
      isFetching: false,
      isError: false,
      data,
      ...flags,
    }).UsersPage();
    const pager = elements(page).find((node) => node.type === 'Pager');
    assert.equal(pager.props.disabled, disabled);
    assert.equal(pager.props.page, data);
  }
  // Both themes share these disabled styles through the Button component.
  assert.match(source('components/ui/button.tsx'), /buttonVariants/);
  const styles = source('components/ui/button-variants.ts');
  assert.match(styles, /disabled:pointer-events-none/);
  assert.match(styles, /disabled:opacity-50/);
});

test('desktop and mobile Activity privacy rows explain the subject without raw IDs', () => {
  const { ActivityPage } = compile(
    'routes/admin/activity.tsx',
    {
      react: hooks,
      '@tanstack/react-router': router,
      '@/lib/use-debounced': { useDebounced: (value) => value },
      '@/components/transactions/pager-state': {
        usePager: () => ({ params: {} }),
      },
      '@/lib/api/admin': { useActivity: () => ({ data: { items: [] } }) },
      '@/lib/access': { roleLabel: (role) => role },
      '@/lib/format': { formatDateTime: () => '8 November 2026, 10:30' },
      '@/lib/privacy-labels': { eventLabel: () => 'Data download' },
    },
    '\nexports.ActivityPage = ActivityPage;'
  );
  const table = elements(ActivityPage()).find(
    (node) => node.type === 'DataTable'
  );
  const record = table.props.columns.find((column) => column.id === 'record');
  for (const [action, expected] of [
    ['export', 'Many people (data download)'],
    ['delete', 'No individual subject'],
  ]) {
    const event = { source: 'privacy', action, row_key: { subject_id: null } };
    assert.equal(
      record.cell({ row: { original: event } }).props.children,
      expected
    );
    const card = table.props.renderCard(event);
    assert.equal(card.type, 'ListRow');
    assert.equal(card.props.actions, undefined);
    assert.equal(card.props.meta, expected);
  }
  const event = {
    source: 'privacy',
    action: 'export',
    row_key: { subject_id: 'person' },
    subject_name: 'Nomsa',
  };
  assert.equal(
    record.cell({ row: { original: event } }).props.children,
    'Nomsa'
  );
  assert.equal(table.props.renderCard(event).props.meta, 'Nomsa');
});

function cartPage(selectedSeller, cart, stores = []) {
  const navigations = [];
  const effects = [];
  const navigate = (value) => navigations.push(value);
  const { CartPage } = compile(
    'routes/cart.tsx',
    {
      react: { ...hooks, useEffect: (effect) => effects.push(effect) },
      sonner: { toast: { dismiss() {} } },
      '@tanstack/react-router': {
        createFileRoute: () => () => ({
          useSearch: () => ({ seller_id: selectedSeller }),
        }),
        useNavigate: () => navigate,
      },
      '@/lib/api/cart': {
        useCartStores: () => ({ data: { items: stores }, isPending: false }),
        useCart: () => cart,
      },
    },
    '\nexports.CartPage = CartPage;'
  );
  const page = CartPage();
  for (const effect of effects) effect();
  return { page, navigations };
}

test('an authoritative empty selected cart replaces the URL with the root cart', () => {
  const empty = { isSuccess: true, isFetching: false, data: { items: [] } };
  const before = cartPage('seller', {
    ...empty,
    data: { items: [{ stock_id: 'stock' }] },
  });
  assert.equal(before.navigations.length, 0);
  const after = cartPage('seller', empty);
  assert.equal(after.navigations.length, 1);
  assert.equal(after.navigations[0].to, '/cart');
  assert.equal(after.navigations[0].replace, true);
  assert.equal(Object.keys(after.navigations[0].search).length, 0);
  const root = elements(cartPage(undefined, empty).page);
  assert.ok(
    root.some((node) => node.props?.emptyTitle === 'Your cart is empty')
  );
  assert.ok(!root.some((node) => node.props?.emptyTitle === 'No stores found'));
});

test('loading, refetching and failed carts never clear the selected store', () => {
  for (const cart of [
    { isSuccess: false, isPending: true },
    { isSuccess: true, isFetching: true, data: { items: [] } },
    { isSuccess: false, isError: true, data: { items: [] } },
  ]) {
    assert.equal(cartPage('seller', cart).navigations.length, 0);
  }
});

test('collection filenames omit the machine trade type and keep itemised naming', () => {
  const downloads = [];
  const { useExport } = compile('lib/api/exports.ts', {
    '@tanstack/react-query': { useMutation: (options) => options },
    './paging': { queryString: (params) => `?type=${params.type}` },
    './client': { download: (...args) => downloads.push(args) },
  });
  for (const [kind, params, filename] of [
    ['collections', { type: 'c2b' }, '3REco-collections.csv'],
    [
      'collections',
      { type: 'c2b', itemised: true },
      '3REco-collections-by-material.csv',
    ],
    ['purchases', { type: 'b2b' }, '3REco-purchases-b2b.csv'],
  ]) {
    useExport(kind).mutationFn(params);
    const [path, name] = downloads.at(-1);
    assert.equal(name, filename);
    assert.ok(path.includes(`type=${params.type}`));
  }
});

test('receipt validation calls wrong-type and oversized files images', () => {
  const errors = [];
  const uploads = [];
  let stateIndex = 0;
  const { TradeDetail } = compile('components/dialogs/record-dialogs.tsx', {
    react: {
      useState: (value) => {
        const index = stateIndex++;
        return [
          value,
          (next) => {
            if (index === 1) errors.push(next);
          },
        ];
      },
    },
    '@/lib/auth/use-auth': { useAuth: () => ({ user: { id: 'buyer' } }) },
    '@/lib/api/transactions': {
      useTransaction: () => ({}),
      useDownloadInvoice: () => ({}),
    },
    '@/lib/api/receipts': {
      kinds: ['image/png', 'image/jpeg'],
      maxBytes: 5 * 1024 * 1024,
      maxReceipts: 5,
      useUploadReceipt: () => ({ mutate: ({ file }) => uploads.push(file) }),
      useDownloadReceipt: () => ({}),
      useDeleteReceipt: () => ({}),
    },
    '@/lib/format': { formatRand() {}, toCents() {}, formatDate() {} },
    '@/lib/utils': { cn: () => '' },
    '@/components/ui/button-variants': { buttonVariants: () => '' },
  });
  const tree = TradeDetail({
    record: {
      id: 'trade',
      buyer: { id: 'buyer' },
      seller: {},
      items: [],
      receipts: [],
    },
    onClose() {},
  });
  const input = elements(tree).find(
    (node) => node.props?.id === 'receipt-file'
  );
  const pick = (file) =>
    input.props.onChange({ target: { files: [file], value: 'chosen' } });
  pick({ type: 'application/pdf', size: 10 });
  assert.equal(errors.at(-1), 'Choose a PNG or JPEG image.');
  pick({ type: 'image/png', size: 5 * 1024 * 1024 + 1 });
  assert.equal(errors.at(-1), 'The image is over 5 MB.');
  assert.equal(uploads.length, 0);
  pick({ type: 'image/jpeg', size: 5 * 1024 * 1024 });
  assert.equal(uploads.length, 1);
});
