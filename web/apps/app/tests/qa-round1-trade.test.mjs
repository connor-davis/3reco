import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { z } from 'zod';

function compile(path, dependencies = {}, suffix = '') {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8') + suffix;
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    encodeURIComponent,
    require(name) {
      if (name in dependencies) return dependencies[name];
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  return exports;
}

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function words(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  return [node?.props?.children].flat(Infinity).map(words).join(' ');
}

const format = compile('../src/lib/format.ts');
const quantity = compile('../src/lib/quantity.ts', { '@/lib/format': format });
const request = {
  id: 'request',
  status: 'offered',
  offer_version: 2,
  offer_by: 'seller',
  buyer: { id: 'buyer', name: 'Buyer' },
  seller: { id: 'seller', name: 'Seller' },
  buyer_confirmed_version: null,
  seller_confirmed_version: null,
  items: [],
  updated_at: '2026-11-06T12:00:00Z',
};
const helpers = compile('../src/components/chat/helpers.ts', {
  '@/lib/format': format,
});

test('offer status follows the author and both confirmation versions', () => {
  assert.equal(
    helpers.requestLabel(request, 'admin'),
    'Offer awaiting confirmation'
  );
  assert.equal(helpers.requestLabel(request, 'buyer'), 'Offer received');
  assert.equal(helpers.requestLabel(request, 'seller'), 'Offer sent');
  const counter = { ...request, offer_by: 'buyer' };
  assert.equal(helpers.requestLabel(counter, 'buyer'), 'Offer sent');
  assert.equal(helpers.requestLabel(counter, 'seller'), 'Offer received');
  const confirmed = { ...request, seller_confirmed_version: 2 };
  assert.equal(
    helpers.requestLabel(confirmed, 'buyer'),
    'Waiting for you to confirm'
  );
  assert.equal(
    helpers.requestLabel(confirmed, 'seller'),
    'Waiting for the other party to confirm'
  );
  assert.equal(
    helpers.requestLabel({ ...request, seller_confirmed_version: 1 }, 'buyer'),
    'Offer received'
  );
});

test('completed card opens the retained trade for either participant after reload', () => {
  for (const [user, route] of [
    ['buyer', 'purchases'],
    ['seller', 'sales'],
  ]) {
    const { InvoiceCard } = compile('../src/components/chat/cards.tsx', {
      'react/jsx-runtime': jsx,
      '@/lib/format': format,
      '@/lib/auth/use-auth': { useAuth: () => ({ user: { id: user } }) },
      '@/lib/api/transactions': { useDownloadInvoice: () => ({}) },
      './helpers': helpers,
    });
    const tree = InvoiceCard({
      request: {
        ...request,
        status: 'accepted',
        transaction_id: 'retained trade',
      },
    });
    const link = nodes(tree).find((node) => words(node) === 'View transaction');
    assert.equal(link.props.to, `/transactions/${route}?open=retained%20trade`);
  }
});

test('offer card identifies the current status with a timestamp and singular count', () => {
  const { OfferCard } = compile('../src/components/chat/cards.tsx', {
    'react/jsx-runtime': jsx,
    '@/lib/format': format,
    '@/lib/auth/use-auth': { useAuth: () => ({ user: { id: 'buyer' } }) },
    './helpers': helpers,
  });
  const tree = OfferCard({
    request: {
      ...request,
      items: [{ material_id: 'm', offer_weight: '1.25', offer_price: '8.12' }],
    },
  });
  assert.match(words(tree), /1 material/);
  assert.doesNotMatch(words(tree), /1 materials/);
  assert.ok(
    nodes(tree).some(
      (node) =>
        node.type === 'time' && node.props.dateTime === request.updated_at
    )
  );
});

test('counter dialog title matches the action', () => {
  const { OfferDialog } = compile(
    '../src/components/dialogs/offer-dialog.tsx',
    {
      'react/jsx-runtime': jsx,
      zod: { z },
    }
  );
  assert.equal(
    OfferDialog({ request, open: false }).props.title,
    'Counter offer'
  );
  assert.equal(
    OfferDialog({ request: { ...request, status: 'pending' }, open: false })
      .props.title,
    'Make an offer'
  );
});

test('message seller starts with empty weight and sends only the explicit exact weight', async () => {
  let values;
  const writes = [];
  const listing = {
    id: 'stock',
    material_id: 'material',
    seller_id: 'seller',
    weight: '100',
    material_name: 'Copper',
    seller_name: 'Seller',
  };
  const { NewMessageForm, NewMessageDialog } = compile(
    '../src/components/dialogs/new-message-dialog.tsx',
    {
      'react/jsx-runtime': jsx,
      react: { useState: (value) => [value, () => {}] },
      'react-hook-form': {
        useForm: ({ defaultValues }) => {
          values = defaultValues;
          return {
            watch: (key) => values[key],
            handleSubmit: (fn) => () => fn(values),
            setError: (field, error) => writes.push({ field, error }),
            formState: { errors: {} },
          };
        },
      },
      '@hookform/resolvers/zod': { zodResolver: () => {} },
      zod: { z },
      '@/lib/api/listings': {
        useListings: () => ({ data: { items: [listing] } }),
      },
      '@/lib/api/requests': {
        useCreateRequest: () => ({
          mutateAsync: async (body) => {
            writes.push(body);
            return { id: 'request' };
          },
        }),
      },
      '@tanstack/react-router': { useNavigate: () => async () => {} },
      '@/lib/quantity': quantity,
      sonner: { toast: { success: () => {}, dismiss: () => {} } },
    },
    '\nexport { NewMessageForm };'
  );
  const tree = NewMessageForm({ listing, onDone: () => {} });
  assert.equal(values.weight, '');
  assert.match(NewMessageDialog({ open: false }).props.description, /48 hours/);
  const submit = nodes(tree).find((node) => node.type === 'form').props
    .onSubmit;
  for (const weight of ['', '0', '-1', 'hello', '100.01']) {
    values.weight = weight;
    await submit();
    assert.equal(writes.at(-1).field, 'weight');
  }
  values.weight = '1.25';
  await submit();
  assert.equal(writes.at(-1).items[0].weight, '1.25');
});

test('cart search never invents an empty seller parameter', () => {
  const { Route } = compile('../src/routes/cart.tsx', {
    '@tanstack/react-router': { createFileRoute: () => (options) => options },
    zod: { z },
  });
  assert.equal(Object.keys(Route.validateSearch({})).length, 0);
  assert.equal(Object.keys(Route.validateSearch({ seller_id: '' })).length, 0);
  assert.equal(Route.validateSearch({ seller_id: 'saved' }).seller_id, 'saved');
});

test('listing card has no unexplained Ask shortcut that could reserve stock', () => {
  const { ListingCard } = compile('../src/components/listing-card.tsx', {
    'react/jsx-runtime': jsx,
    '@/lib/format': format,
  });
  const tree = ListingCard({
    listing: { id: 'stock', weight: '1', price: '2', seller_id: 'seller' },
  });
  assert.doesNotMatch(words(tree), /Ask/);
});

test('a fully reserved decimal listing remains visible with both buy controls disabled', () => {
  const { ListingDetail } = compile(
    '../src/routes/market/listing/$listingId.tsx',
    {
      'react/jsx-runtime': jsx,
      react: { useState: (value) => [value, () => {}] },
      '@tanstack/react-router': {
        createFileRoute: () => (options) => options,
        useNavigate: () => () => {},
      },
      'react-hook-form': {
        useForm: ({ defaultValues }) => {
          assert.equal(defaultValues.weight, '');
          return {
            watch: () => '',
            handleSubmit: () => () => {},
            formState: { errors: {} },
          };
        },
      },
      '@hookform/resolvers/zod': { zodResolver: () => {} },
      zod: { z },
      '@/lib/auth/use-auth': {
        useAuth: () => ({ user: { id: 'buyer', role: 'business' } }),
      },
      '@/lib/api/cart': {
        useCart: () => ({ data: { items: [] } }),
        useSaveCart: () => ({}),
      },
      '@/lib/format': format,
      '@/lib/quantity': quantity,
    },
    '\nexport { ListingDetail };'
  );
  const tree = ListingDetail({
    listing: {
      id: 'stock',
      seller_id: 'seller',
      price: '8.12',
      weight: '0.00',
      average_rating: null,
      review_count: 1,
    },
  });
  assert.match(words(tree), /Fully reserved/);
  assert.match(words(tree), /1 review/);
  for (const label of ['Message seller', 'Add to cart']) {
    assert.equal(
      nodes(tree).find((node) => words(node) === label).props.disabled,
      true
    );
  }
});

test('confirmation and cancellation report the action that succeeded', async () => {
  const messages = [];
  const { Conversation } = compile('../src/components/chat/conversation.tsx', {
    'react/jsx-runtime': jsx,
    react: {
      useState: (value) => [value === null ? 'cancel' : value, () => {}],
      useRef: (current) => ({ current }),
      useCallback: (fn) => fn,
      useEffect: () => {},
      useLayoutEffect: () => {},
    },
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
      useMessageHistory: () => ({ data: { pages: [{ items: [] }] } }),
      useReadMessages: () => ({ mutate: () => {} }),
    },
    './use-request-actions': {
      useRequestActions: () => ({
        accept: async () => true,
        cancel: async () => true,
      }),
    },
    './helpers': helpers,
    sonner: { toast: { success: (message) => messages.push(message) } },
  });
  const tree = Conversation({ request });
  nodes(tree)
    .find((node) => node.type === 'OfferCard')
    .props.onAccept();
  await Promise.resolve();
  nodes(tree)
    .find((node) => node.type === 'ConfirmDialog')
    .props.onConfirm();
  await Promise.resolve();
  assert.deepEqual(messages, ['Confirmation saved.', 'Request cancelled.']);
});

test('Message store chooses available stock for the quantity dialog without creating a request', () => {
  let picked;
  const listing = { id: 'available', weight: '1.25' };
  const { StorePage } = compile(
    '../src/routes/market/store/$sellerId.tsx',
    {
      'react/jsx-runtime': jsx,
      react: {
        useState: (value) => [
          value,
          (next) => {
            picked = next;
          },
        ],
      },
      '@tanstack/react-router': {
        createFileRoute: () => (options) => ({
          ...options,
          useParams: () => ({ sellerId: 'seller' }),
        }),
      },
      '@/lib/auth/use-auth': {
        useAuth: () => ({ user: { id: 'buyer', role: 'business' } }),
      },
      '@/lib/api/stores': {
        useStore: () => ({
          data: { name: 'Seller', created_at: request.updated_at },
        }),
      },
      '@/lib/api/listings': {
        useStoreListings: () => ({
          data: { items: [{ id: 'reserved', weight: '0.00' }, listing] },
        }),
      },
      '@/lib/api/reviews': {
        useReviewable: () => ({ data: { items: [] }, isSuccess: true }),
        useReviews: () => ({ data: { items: [] } }),
        useReviewSummary: () => ({ data: { count: 0, average: null } }),
        useDeleteReview: () => ({}),
      },
      '@/lib/format': format,
    },
    '\nexport { StorePage };'
  );
  const tree = StorePage();
  nodes(tree)
    .find((node) => words(node) === 'Message store')
    .props.onClick();
  assert.equal(picked.id, 'available');
  assert.equal(
    nodes(tree).find((node) => node.type === 'NewMessageDialog').props.open,
    false
  );
});
