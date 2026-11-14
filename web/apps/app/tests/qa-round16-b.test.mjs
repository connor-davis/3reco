import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { z } from 'zod';
import { load, source } from './qa-round2-loader.mjs';

function compile(path, mocks = {}, suffix = '', globals = {}) {
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
    ...globals,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === 'react/jsx-runtime') return jsx;
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  return exports;
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}

function words(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  return [tree?.props?.children].flat(Infinity).map(words).join(' ');
}

const hooks = {
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useLayoutEffect: () => {},
};
const format = load('lib/format.ts');
const quantity = load('lib/quantity.ts', { '@/lib/format': format });
const helpers = load('components/chat/helpers.ts', { '@/lib/format': format });
const request = {
  id: 'request',
  status: 'offered',
  offer_version: 2,
  offer_by: 'seller',
  buyer: { id: 'buyer', name: 'Buyer' },
  seller: { id: 'seller', name: 'Seller' },
  items: [],
  updated_at: '2026-11-08T12:00:00Z',
};

function conversation(actions = {}, react = hooks, globals = {}) {
  return compile(
    'components/chat/conversation.tsx',
    {
      react,
      'react-hook-form': {
        useForm: () => ({
          control: {},
          handleSubmit: (fn) => fn,
          formState: { errors: {} },
        }),
      },
      '@hookform/resolvers/zod': { zodResolver: () => {} },
      zod: { z },
      '@/lib/auth/use-auth': {
        useAuth: () => ({ user: { id: 'buyer', role: 'business' } }),
      },
      '@/lib/api/messages': {
        useMessageHistory: () => ({
          data: { pages: [{ items: [] }] },
          isSuccess: true,
        }),
        useReadMessages: () => ({ mutate: () => {} }),
      },
      './use-request-actions': { useRequestActions: () => actions },
      './helpers': helpers,
      sonner: { toast: actions.toast },
    },
    '',
    globals
  ).Conversation;
}

test('B1: pending text and cancel action share centred, wrapping space', () => {
  const tree = conversation()({ request: { ...request, status: 'pending' } });
  const row = nodes(tree).find((node) =>
    node.props?.className?.includes('gap-x-3 gap-y-2')
  );
  assert.match(row.props.className, /flex-wrap items-center/);
  assert.match(words(row), /Waiting for\s+Seller\s+to make an offer/);
  assert.match(words(row), /Cancel request/);
});

test('B2: offer-only resizes follow the bottom and preserve a reader in history', () => {
  const refs = [];
  const effects = [];
  let resize;
  let disconnected = false;
  const observed = [];
  const Conversation = conversation(
    {},
    {
      ...hooks,
      useRef: (current) => {
        const ref = { current };
        refs.push(ref);
        return ref;
      },
      useLayoutEffect: (effect) => effects.push(effect),
    },
    {
      ResizeObserver: class {
        constructor(callback) {
          resize = callback;
        }
        observe(element) {
          observed.push(element);
        }
        disconnect() {
          disconnected = true;
        }
      },
    }
  );
  const tree = Conversation({ request });
  const viewport = { scrollHeight: 1200, clientHeight: 600, scrollTop: 600 };
  refs[0].current = viewport;
  refs[1].current = {};
  const cleanup = effects[1]();
  assert.equal(observed.length, 2);
  viewport.scrollHeight = 1400;
  resize();
  assert.equal(viewport.scrollTop, 1400);

  viewport.scrollTop = 200;
  nodes(tree)
    .find((node) => node.props?.onScroll)
    .props.onScroll();
  viewport.scrollHeight = 1600;
  resize();
  assert.equal(viewport.scrollTop, 200);
  cleanup();
  assert.equal(disconnected, true);
  assert.match(source('lib/live/connection.ts'), /case 'request'/);
  assert.doesNotMatch(
    source('components/chat/conversation.tsx'),
    /setInterval/
  );
});

test('B3: offer layout collapses unused slots and still validates both fields', () => {
  const text = source('components/dialogs/offer-dialog.tsx');
  assert.doesNotMatch(text, /min-h-32|className="h-10"/);
  assert.match(text, /errors.root\?\.message &&/);
  const { schema } = compile(
    'components/dialogs/offer-dialog.tsx',
    { zod: { z }, '@/lib/quantity': quantity, '@/lib/format': format },
    '\nexport { schema };'
  );
  const result = schema.safeParse({
    items: [{ material_id: 'm', available: '10', weight: '', price: '' }],
  });
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error.issues.map((issue) => issue.path.at(-1)),
    ['weight', 'price']
  );
  assert.equal(
    schema.safeParse({
      items: [{ material_id: 'm', available: '10', weight: '2', price: '1' }],
    }).success,
    true
  );
});

for (const status of ['offered', 'accepted']) {
  test(`B4: fresh ${status} status determines confirmation feedback`, async () => {
    const calls = [];
    const messages = [];
    const { useRequestActions } = compile(
      'components/chat/use-request-actions.ts',
      {
        react: hooks,
        '@tanstack/react-query': { useQueryClient: () => ({}) },
        '@/lib/api/messages': { useSendMessage: () => ({}) },
        '@/lib/api/requests': {
          useRequestAction: () => ({}),
          useAcceptRequest: () => ({
            mutateAsync: async (input) => {
              calls.push(['accept', input.offer_version]);
              return { transaction_id: 'same-id-for-both' };
            },
          }),
          useRequest: (id) => ({
            data: { status: status === 'accepted' ? 'offered' : 'accepted' },
            refetch: async (options) => {
              calls.push(['refetch', id, options.throwOnError]);
              return { data: { status } };
            },
          }),
        },
      }
    );
    const actions = useRequestActions(request);
    const Conversation = conversation({
      ...actions,
      toast: { success: (message) => messages.push(message) },
    });
    const tree = Conversation({ request });
    await nodes(tree)
      .find((node) => node.type === 'OfferCard')
      .props.onAccept();
    // The event handler intentionally returns void; drain the promise chain.
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [
      ['accept', 2],
      ['refetch', 'request', true],
    ]);
    assert.deepEqual(messages, [
      status === 'accepted'
        ? 'Trade complete. Invoice created.'
        : 'Confirmation saved.',
    ]);
  });
}

test('B5: export success and failure have separate feedback', () => {
  const messages = [];
  let callbacks;
  const { RecordList } = compile(
    'routes/transactions/-components/record-list.tsx',
    {
      react: hooks,
      '@tanstack/react-router': {
        useSearch: () => ({}),
        useLocation: () => ({ pathname: '/transactions/sales' }),
        useNavigate: () => () => {},
      },
      '@/lib/format': format,
      '@/lib/trade-type': compile('lib/trade-type.ts'),
      '@/lib/auth/use-auth': { useAuth: () => ({ user: {} }) },
      '@/lib/api/transactions': {
        useTransaction: () => ({}),
        useDownloadInvoice: () => ({}),
        useTransactions: () => ({ data: { items: [] } }),
        useTransactionTotals: () => ({ data: { count: 1 } }),
      },
      '@/components/transactions/pager-state': {
        usePager: () => ({ params: {} }),
        errorText: (error) => error.message,
      },
      '@/lib/use-debounced': { useDebounced: (value) => value },
      '@/lib/api/exports': {
        useExport: () => ({
          mutate: (_, options) => {
            callbacks = options;
          },
        }),
      },
      sonner: {
        toast: {
          success: (text) => messages.push(['success', text]),
          error: (text) => messages.push(['error', text]),
        },
      },
    }
  );
  const tree = RecordList({ kind: 'sales', exportKind: 'sales' });
  const toolbar = nodes(tree).find(
    (node) => node.props?.label === 'Search records'
  );
  nodes(toolbar.props.action)
    .find((node) => node.props?.onClick && words(node).trim() === 'Export')
    .props.onClick();
  assert.equal(messages.length, 0);
  callbacks.onSuccess();
  callbacks.onError(new Error('Download failed.'));
  assert.deepEqual(messages, [
    ['success', 'Export downloaded.'],
    ['error', 'Download failed.'],
  ]);
});

test('B6: Request and Add to cart agree for empty, invalid and valid weights', () => {
  let weight = '';
  const { ListingDetail } = compile(
    'routes/market/listing/$listingId.tsx',
    {
      react: hooks,
      '@tanstack/react-router': {
        createFileRoute: () => () => ({}),
        useNavigate: () => () => {},
      },
      'react-hook-form': {
        useForm: () => ({
          watch: () => weight,
          handleSubmit: (fn) => fn,
          formState: { errors: {} },
        }),
      },
      '@hookform/resolvers/zod': { zodResolver: () => {} },
      zod: { z },
      '@/lib/auth/use-auth': {
        useAuth: () => ({ user: { id: 'buyer', role: 'business' } }),
      },
      '@/lib/api/cart': {
        useCart: () => ({ isFetching: false }),
        useSaveCart: () => ({ isPending: false }),
      },
      '@/lib/format': format,
      '@/lib/quantity': quantity,
    },
    '\nexport { ListingDetail };'
  );
  for (const input of ['', '0', '-1', 'abc', '1.234', '11', '1.25']) {
    weight = input;
    const tree = ListingDetail({
      listing: { id: 'lot', seller_id: 'seller', weight: '10', price: '2' },
    });
    for (const label of ['Request this material', 'Add to cart']) {
      const button = nodes(tree).find((node) => words(node).trim() === label);
      assert.equal(button.props.disabled, input !== '1.25', input);
    }
  }
});

test('S2/S7: listing prices print as one run of text and short titles do not reserve a second line', () => {
  const { ListingCard } = compile('components/listing-card.tsx', {
    react: { useState: () => [undefined, () => {}] },
    '@/lib/format': format,
  });
  const tree = ListingCard({ listing: { price: '22.37', weight: '12.5' } });
  assert.equal(
    nodes(tree).find((node) => node.props?.className === 'font-normal'),
    undefined
  );
  assert.match(words(tree), /R\u00a022.37 \/ kg/);
  assert.doesNotMatch(
    nodes(tree).find((node) => node.type === 'h3').props.className,
    /min-h-/
  );
});

test('S3/S4: local dashboard spacing and readable trade pill override inherited defaults', () => {
  assert.match(
    source('routes/-dashboard/panels.tsx'),
    /title="Recent activity"/
  );
  assert.match(source('routes/-dashboard/panels.tsx'), /py-3 first:pt-0/);
  assert.match(
    source('routes/transactions/-components/record-list.tsx'),
    /h-5 px-2 text-xs/
  );
});

test('S5: business access guard offers the unified Transactions page', () => {
  const { Guarded } = compile('components/access-guard.tsx', {
    '@/lib/access': load('lib/access.ts'),
    '@/lib/auth/use-auth': {
      useAuth: () => ({ user: { role: 'business' }, isLoading: false }),
    },
  });
  assert.equal(
    Guarded({ page: 'transactions', children: 'private' }).props.children,
    'private'
  );
  const tree = Guarded({ page: 'materials', children: 'private' });
  const links = nodes(tree).filter((node) => node.type === 'LinkButton');
  assert.deepEqual(
    links.map((node) => node.props.to),
    ['/transactions']
  );
  assert.deepEqual(links.map(words), ['Go to Transactions']);
  assert.equal(
    nodes(tree).some((node) => node.type === 'Navigate'),
    false
  );
});

test('S8: blank weights are concise and typed errors keep their guidance', () => {
  assert.equal(quantity.quantityError('  '), 'Enter a weight.');
  assert.equal(
    quantity.quantityError('abc'),
    'Enter a weight as a number, like 12.5.'
  );
  assert.equal(quantity.quantityError('-1'), 'Enter a weight above 0 kg.');
});
