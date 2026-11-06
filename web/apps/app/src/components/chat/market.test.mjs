import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient, InfiniteQueryObserver } from '@tanstack/react-query';
import * as jsx from 'react/jsx-runtime';

function load(relative, dependencies = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
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
    Error,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports;
}

const format = load('../../lib/format.ts');
const helpers = load('./helpers.ts', { '@/lib/format': format });
const request = {
  id: 'request',
  seller: { id: 'seller', name: 'Same name' },
  buyer: { id: 'buyer', name: 'Same name' },
  status: 'pending',
  items: [
    { offer_price: '4.60', offer_weight: '1250.50' },
    { offer_price: '0.30', offer_weight: '0.25' },
  ],
};

test('request actions use participant IDs and only API states', () => {
  assert.equal(helpers.canMakeOffer(request, 'seller'), true);
  assert.equal(helpers.canMakeOffer(request, 'buyer'), false);
  assert.equal(helpers.canMakeOffer(request, 'outsider'), false);
  assert.equal(helpers.canRespond(request, 'buyer'), false);
  const offered = { ...request, status: 'offered' };
  assert.equal(helpers.canRespond(offered, 'buyer'), true);
  assert.equal(helpers.canRespond(offered, 'seller'), false);
  for (const status of ['accepted', 'rejected', 'cancelled']) {
    assert.equal(helpers.isClosed({ ...request, status }), true);
    assert.equal(helpers.canMakeOffer({ ...request, status }, 'seller'), false);
    assert.equal(helpers.canRespond({ ...request, status }, 'buyer'), false);
  }
  assert.equal(helpers.counterpartyOf(request, 'seller').id, 'buyer');
  assert.equal(helpers.counterpartyOf(request, 'buyer').id, 'seller');
  assert.equal(helpers.requestTotal(request), 575238);
  assert.equal(
    helpers.requestTotal({
      ...request,
      items: [{ offer_price: null, offer_weight: null }],
    }),
    0
  );
});

test('messages append by actual time, deduplicate page overlap and retain input order', () => {
  const messages = [
    { id: 'latest', created_at: '2026-11-05T09:00:00Z' },
    { id: 'first', created_at: '2026-11-05T10:00:00+02:00' },
    { id: 'middle', created_at: '2026-11-05T08:30:00Z' },
    { id: 'middle', created_at: '2026-11-05T08:30:00Z' },
  ];
  const result = helpers.orderedMessages(messages);
  assert.equal(
    result.map((message) => message.id).join(','),
    'first,middle,latest'
  );
  assert.equal(messages[0].id, 'latest');
});

function messageHooks(api, live = []) {
  return load('../../lib/api/messages.ts', {
    './resource': { idPath: encodeURIComponent },
    './paging': {
      queryString(values) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(values))
          if (value !== undefined) query.set(key, value);
        return `?${query}`;
      },
    },
    '@tanstack/react-query': { useInfiniteQuery: (options) => options },
    '../auth/use-auth': { useAuth: () => ({ user: { id: 'buyer' } }) },
    './client': { api },
  });
}

test('message history follows forward cursors and live refetch reaches appended messages', async () => {
  let appended = false;
  const calls = [];
  const hooks = messageHooks(async (path) => {
    calls.push(path);
    const cursor = new URL(path, 'http://local').searchParams.get('cursor');
    return cursor
      ? {
          items: [
            { id: 'second', created_at: '2026-11-05T08:30:00Z' },
            ...(appended
              ? [{ id: 'newest', created_at: '2026-11-05T09:00:00Z' }]
              : []),
          ],
          has_more: false,
          next_cursor: null,
        }
      : {
          items: [{ id: 'first', created_at: '2026-11-05T08:00:00Z' }],
          has_more: true,
          next_cursor: 'opaque+cursor/',
        };
  });
  const options = hooks.useMessageHistory('request/id');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const observer = new InfiniteQueryObserver(client, options);
  const release = observer.subscribe(() => {});
  try {
    await observer.refetch();
    await observer.fetchNextPage();
    assert.equal(observer.getCurrentResult().data.pages.length, 2);
    assert.ok(calls.some((path) => path.includes('opaque%2Bcursor%2F')));
    appended = true;
    await client.invalidateQueries({
      queryKey: ['messages', 'history', 'request/id'],
    });
    const stream = helpers.orderedMessages(
      observer.getCurrentResult().data.pages.flatMap((page) => page.items)
    );
    assert.equal(
      stream.map((message) => message.id).join(','),
      'first,second,newest'
    );
    assert.equal(observer.getCurrentResult().hasNextPage, false);
    assert.equal(options.queryKey.at(-1), 'buyer');
  } finally {
    release();
    client.clear();
  }
});

test('message and inbox histories page by cursor', () => {
  const live = [];
  const hooks = messageHooks(async () => ({}), live);
  hooks.useMessageHistory('request');
  const inbox = hooks.useThreadHistory();
  assert.equal(
    inbox.getNextPageParam({ has_more: true, next_cursor: 'opaque' }),
    'opaque'
  );
  assert.equal(
    inbox.getNextPageParam({ has_more: false, next_cursor: null }),
    undefined
  );
});

test('conversation renders incoming and sent messages at the tail and scrolls there', () => {
  let messages = [
    {
      id: 'old',
      sender_id: 'seller',
      content: 'Old message',
      created_at: '2026-11-05T08:00:00Z',
    },
  ];
  let effects = [];
  let refIndex = 0;
  const scrolled = [];
  const refs = [
    { current: { scrollIntoView: (options) => scrolled.push(options.block) } },
    { current: null },
  ];
  const component = new Proxy({}, { get: (_, name) => name });
  const deps = {
    'react/jsx-runtime': jsx,
    react: {
      useEffect: (effect) => effects.push(effect),
      useRef: () => refs[refIndex++],
      useState: (value) => [value, () => {}],
    },
    'react-hook-form': {
      useForm: () => ({ control: {}, handleSubmit: () => () => {} }),
    },
    '@hookform/resolvers/zod': { zodResolver: () => {} },
    zod: {
      z: {
        object: () => ({}),
        string: () => ({
          trim() {
            return this;
          },
          min() {
            return this;
          },
          max() {
            return this;
          },
        }),
      },
    },
    '@/lib/auth/use-auth': {
      useAuth: () => ({ user: { id: 'buyer', role: 'business' } }),
    },
    '@/lib/api/messages': {
      useMessageHistory: () => ({
        data: { pages: [{ items: messages }] },
        hasNextPage: false,
      }),
      useReadMessages: () => ({ mutate: () => {} }),
    },
    '@/lib/format': format,
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    './helpers': helpers,
    './use-request-actions': {
      useRequestActions: () => ({ isPending: false }),
    },
  };
  for (const name of [
    '@tanstack/react-router',
    'lucide-react',
    '@/components/badges',
    '@/components/confirm-dialog',
    '@/components/data-state',
    '@/components/form-fields',
    '@/components/icon-button',
    '@/components/dialogs/offer-dialog',
    '@/components/responsive-overlay',
    '@/components/visuals',
    '@/components/ui/button',
    '@/components/ui/scroll-area',
    './cards',
    './deal-aside',
    './deal-stepper',
  ])
    deps[name] = component;
  const { Conversation } = load('./conversation.tsx', deps);
  function render() {
    effects = [];
    refIndex = 0;
    const tree = Conversation({ request: { ...request, items: [] } });
    for (const effect of effects) effect();
    return tree;
  }
  render();
  messages = [
    {
      id: 'sent',
      sender_id: 'buyer',
      content: 'Newest sent message',
      created_at: '2026-11-05T09:00:00Z',
    },
    ...messages,
  ];
  const tree = render();
  function findLog(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.role === 'log') return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = findLog(child);
      if (found) return found;
    }
    return null;
  }
  const log = findLog(tree);
  assert.equal(
    log.props.children.at(-1).props.children[0].props.children,
    'Newest sent message'
  );
  assert.equal(scrolled.join(','), 'end,end');
});

test('expired offers keep the API conflict message and refresh the request', async () => {
  const { ApiError } = load('../../lib/api/client.ts');
  const message = 'This offer ran out. Ask the seller for a new offer.';
  const errors = [];
  const invalidated = [];
  const idle = { isPending: false, mutateAsync: async () => ({}) };
  const hooks = load('./use-request-actions.ts', {
    react: { useState: () => [null, (value) => errors.push(value)] },
    '@tanstack/react-router': { useNavigate: () => () => {} },
    '@tanstack/react-query': {
      useQueryClient: () => ({
        invalidateQueries: async (value) => invalidated.push(value),
      }),
    },
    '@/lib/auth/use-auth': { useAuth: () => ({ user: { id: 'buyer' } }) },
    '@/lib/api/client': { ApiError },
    '@/lib/api/requests': {
      useAcceptRequest: () => ({
        ...idle,
        mutateAsync: async () => {
          throw new ApiError(
            409,
            { code: 'conflict', message, fields: null },
            null
          );
        },
      }),
      useRequestAction: () => idle,
    },
    '@/lib/api/messages': { useSendMessage: () => idle },
  });
  assert.equal(await hooks.useRequestActions(request).accept(), false);
  assert.equal(errors.at(-1), message);
  assert.equal(invalidated[0].queryKey.join(','), 'requests,request');
});
