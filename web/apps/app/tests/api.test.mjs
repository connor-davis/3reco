import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as query from '@tanstack/react-query';

// Compile the production modules with the app's own TypeScript dependency.
// No browser or test-runner dependency is needed for the transport contracts.
function load(relative, globals = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    URL,
    FormData,
    setTimeout,
    clearTimeout,
    ...globals,
  });
  return exports;
}

test('listing bursts refresh once after 1500 ms of silence while other keys settle at 300 ms', () => {
  let now = 0;
  let timerId = 0;
  let socket;
  const pending = new Map();
  const invalidations = [];
  const { LiveConnection } = load('../src/lib/live/connection.ts', {
    window: { location: { href: 'https://3reco.test/market' } },
    WebSocket: class {
      constructor() {
        socket = this;
      }
      close() {}
    },
    setTimeout: (callback, delay) => {
      const id = ++timerId;
      pending.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: (id) => pending.delete(id),
  });
  const advance = (milliseconds) => {
    now += milliseconds;
    for (const [id, timer] of [...pending]) {
      if (timer.at > now) continue;
      pending.delete(id);
      timer.callback();
    }
  };
  const connection = new LiveConnection({
    invalidateQueries: (options) => invalidations.push(options),
  });
  const event = (kind) =>
    socket.onmessage({ data: JSON.stringify({ type: 'changed', kind }) });
  const listingRefreshes = () =>
    invalidations.filter((options) => options?.queryKey[0] === 'listings');

  connection.start();
  socket.onopen();
  event('listing');
  event('notification');
  advance(250);
  event('listing');
  advance(50);
  assert.equal(listingRefreshes().length, 0);
  assert.equal(
    invalidations.filter((options) => options?.queryKey[0] === 'notifications')
      .length,
    1
  );
  advance(200);
  event('listing');
  advance(1000);
  assert.equal(
    listingRefreshes().length,
    0,
    'the first event deadline was reset'
  );
  advance(499);
  assert.equal(listingRefreshes().length, 0);
  advance(1);
  assert.equal(listingRefreshes().length, 1);
  advance(1500);
  assert.equal(listingRefreshes().length, 1, 'no polling after the burst');

  event('listing');
  socket.onmessage({ data: JSON.stringify({ type: 'resync' }) });
  assert.equal(invalidations.at(-1), undefined);
  advance(1500);
  assert.equal(
    listingRefreshes().length,
    1,
    'resync cancels the delayed refresh'
  );
  event('listing');
  connection.stop();
  advance(1500);
  assert.equal(
    listingRefreshes().length,
    1,
    'stop cancels the delayed refresh'
  );
  assert.equal(pending.size, 0);
});

test('only opted-in public resource lists retain rows across query key changes', async () => {
  const { useResource } = load('../src/lib/api/resource.ts', {
    require: (name) => {
      if (name === '@tanstack/react-query')
        return { ...query, useQuery: (options) => options };
      if (name === '../auth/use-auth')
        return { useAuth: () => ({ user: { id: 'business-user' } }) };
      if (name === './client') return { api: () => new Promise(() => {}) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const client = new query.QueryClient();
  const previous = { items: [{ id: 'old-listing' }] };
  client.setQueryData(['listings', 'first'], previous);

  for (const [keepPrevious, privateQuery, expected] of [
    [true, false, previous],
    [false, false, undefined],
    [true, true, undefined],
  ]) {
    const observer = new query.QueryObserver(client, {
      queryKey: ['listings', 'first'],
      enabled: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      observer.setOptions(
        useResource(
          ['listings', 'next'],
          '/market/listings',
          privateQuery,
          true,
          {
            keepPrevious,
          }
        )
      );
      const result = observer.getCurrentResult();
      assert.equal(result.data, expected);
      assert.equal(result.isFetching, true);
      assert.equal(result.isPlaceholderData, expected !== undefined);
    } finally {
      unsubscribe();
    }
  }
  assert.equal(
    useResource(['listings'], '/market/listings').placeholderData,
    undefined,
    'previous rows are off by default'
  );
  client.clear();
});

test('HTTP preserves decimal strings, credentials, error fields and Retry-After', async () => {
  let request;
  let status = 200;
  const events = [];
  const client = load('../src/lib/api/client.ts', {
    window: { dispatchEvent: (event) => events.push(event.type) },
    Event,
    fetch: async (url, init) => {
      request = { url, init };
      return new Response(
        status === 200
          ? '{"weight":"12.000001"}'
          : '{"code":"invalid","message":"Fix it","fields":{"weight":"Too much"}}',
        {
          status,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        }
      );
    },
  });
  const result = await client.api(
    '/stock',
    client.json('POST', { weight: '12.000001' })
  );
  assert.equal(result.weight, '12.000001');
  assert.equal(request.init.credentials, 'include');
  assert.equal(request.url, '/api/stock');
  assert.equal(JSON.parse(request.init.body).weight, '12.000001');

  status = 429;
  await assert.rejects(client.api('/stock'), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.fields.weight, 'Too much');
    assert.equal(error.retryAfter, '60');
    return true;
  });
  status = 401;
  await assert.rejects(client.api('/auth/me'));
  assert.equal(events.length, 0);
  await assert.rejects(client.api('/stock'));
  assert.equal(events[0], 'api:unauthorized');
});

test('session changes erase old account data and keep the auth observer connected', async () => {
  const client = new query.QueryClient();
  const authKey = ['auth', 'me'];
  client.setQueryData(authKey, { id: 'old-user' });
  client.setQueryData(['stock', 'old-user'], [{ id: 'private-stock' }]);
  const observer = new query.QueryObserver(client, {
    queryKey: authKey,
    enabled: false,
  });
  const observed = [];
  const unsubscribe = observer.subscribe((result) =>
    observed.push(result.data)
  );
  const auth = load('../src/lib/api/auth.ts', {
    require: (name) => {
      if (name === '@tanstack/react-query') return query;
      if (name === './client') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  await auth.replaceSession(client, null);
  assert.equal(client.getQueryData(['stock', 'old-user']), undefined);
  assert.equal(observer.getCurrentResult().data, null);
  client.setQueryData(authKey, { id: 'next-user' });
  assert.equal(observer.getCurrentResult().data.id, 'next-user');
  assert.equal(observed.at(-1).id, 'next-user');
  unsubscribe();
  client.clear();
});

test('inbox badges, preview and list share one cold read and retain cursor paging', async () => {
  const client = new query.QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
  const calls = [];
  let cached;
  const hooks = load('../src/lib/api/messages.ts', {
    require: (name) => {
      if (name === '@tanstack/react-query')
        return {
          useInfiniteQuery: (options) => ({ ...options, data: cached }),
        };
      if (name === '../auth/use-auth')
        return { useAuth: () => ({ user: { id: 'buyer' } }) };
      if (name === '../access') return { canOpen: () => true };
      if (name === './resource') return { idPath: encodeURIComponent };
      if (name === './paging')
        return {
          queryString: (params) =>
            '?' +
            new URLSearchParams(
              Object.entries(params).filter(([, value]) => value !== undefined)
            ),
        };
      if (name === './client')
        return {
          api: async (path) => {
            calls.push(path);
            const next = path.includes('cursor=');
            return {
              items: Array.from({ length: next ? 1 : 6 }, (_, i) => ({
                request_id: `${next ? 'next' : 'first'}-${i}`,
                status: 'offered',
              })),
              has_more: !next,
              next_cursor: next ? null : 'next+page',
            };
          },
        };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const observers = [];
  const releases = [];
  try {
    // Mount these sequentially after the first response, as a routed page does.
    for (const options of [
      hooks.useInbox({ limit: 100 }),
      hooks.useInbox({ limit: 100 }),
      hooks.useInbox({ limit: 4 }),
      hooks.useThreadHistory(),
    ]) {
      const observer = new query.InfiniteQueryObserver(client, options);
      observers.push(observer);
      releases.push(observer.subscribe(() => {}));
      await client.fetchInfiniteQuery(options);
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0], '/messages/inbox?limit=30&q=&filter=all');
    cached = observers[0].getCurrentResult().data;
    assert.equal(hooks.useInbox({ limit: 4 }).data.items.length, 4);
    assert.equal(hooks.useInbox({ limit: 100 }).data.items.length, 6);
    await observers.at(-1).fetchNextPage();
    assert.equal(calls.length, 2);
    assert.ok(calls[1].includes('cursor=next%2Bpage'));
    assert.equal(observers[0].getCurrentResult().data.pages.length, 2);
  } finally {
    for (const release of releases) release();
    client.clear();
  }
});

test('admin inbox searches on the server and keeps one query per search', async () => {
  const paths = [];
  const thread = {
    request_id: 'chat',
    buyer: { id: 'buyer', name: 'Buyer' },
    seller: { id: 'seller', name: 'Seller' },
  };
  const hooks = load('../src/lib/api/messages.ts', {
    require: (name) => {
      if (name === '@tanstack/react-query')
        return {
          useInfiniteQuery: (options) => ({
            ...options,
            data: { pages: [{ items: Array(1000).fill(thread) }] },
          }),
        };
      if (name === '../auth/use-auth')
        return { useAuth: () => ({ user: { id: 'admin', role: 'admin' } }) };
      if (name === '../access') return { canOpen: () => true };
      if (name === './resource') return { idPath: encodeURIComponent };
      if (name === './paging')
        return {
          queryString: (params) =>
            '?' +
            new URLSearchParams(
              Object.entries(params).filter(([, v]) => v !== undefined)
            ),
        };
      if (name === './client')
        return {
          api: async (path) => {
            paths.push(path);
            return { items: [thread], has_more: true, next_cursor: 'older' };
          },
        };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const options = hooks.useThreadHistory('glass', 'offers');
  const page = await options.queryFn({ pageParam: undefined });
  assert.equal(paths[0], '/messages/all?limit=30&q=glass&filter=offers');
  assert.equal(page.items[0].other.name, 'Buyer ↔ Seller');
  assert.equal(page.items[0].unread_count, 0);
  assert.notEqual(
    JSON.stringify(options.queryKey),
    JSON.stringify(hooks.useThreadHistory('paper', 'all').queryKey)
  );
});

test('socket joins without subscribing, settles invalidations per key, reconnects and resyncs', () => {
  const sockets = [];
  const pending = new Map();
  let timerId = 0;
  const invalidations = [];
  class Socket {
    static OPEN = 1;
    readyState = 0;
    sent = [];
    constructor(url) {
      this.url = url;
      sockets.push(this);
    }
    send(value) {
      this.sent.push(JSON.parse(value));
    }
    open() {
      this.readyState = 1;
      this.onopen();
    }
    message(value) {
      this.onmessage({ data: JSON.stringify(value) });
    }
    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1006 });
    }
  }
  const { LiveConnection, keysFor } = load('../src/lib/live/connection.ts', {
    window: { location: { href: 'https://3reco.test/stock' } },
    WebSocket: Socket,
    setTimeout: (callback, delay) => {
      const id = ++timerId;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => pending.delete(id),
  });
  const settle = () => {
    for (const [id, timer] of [...pending]) {
      if (timer.delay !== 300) continue;
      pending.delete(id);
      timer.callback();
    }
  };
  const connection = new LiveConnection({
    invalidateQueries: (options) => invalidations.push(options),
  });
  connection.start();
  connection.start();
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url.href, 'wss://3reco.test/api/live');
  sockets[0].open();
  assert.equal(invalidations.length, 0, 'first open keeps bootstrap queries');
  assert.equal(sockets[0].sent.length, 0, 'the page subscribes to nothing');

  // A burst for one chat refetches each key once, after a short pause.
  for (let i = 0; i < 5; i++)
    sockets[0].message({ type: 'changed', kind: 'request', id: 'r1' });
  assert.equal(invalidations.length, 0, 'events wait for the pause');
  settle();
  const keys = invalidations.map((item) => JSON.stringify(item.queryKey));
  assert.equal(keys.length, keysFor('request', 'r1').length);
  assert.equal(new Set(keys).size, keys.length, 'each key once');
  assert.ok(keys.includes('["messages","history","r1"]'));
  assert.ok(keys.includes('["requests","r1"]'));
  assert.ok(keys.includes('["messages","inbox"]'));

  invalidations.length = 0;
  sockets[0].message({ type: 'changed', kind: 'notification', id: 'n1' });
  sockets[0].message({ type: 'changed', kind: 'nothing-known', id: 'x' });
  sockets[0].message({ type: 'pong' });
  settle();
  assert.equal(
    JSON.stringify(invalidations),
    '[{"queryKey":["notifications"]}]'
  );

  // A resync invalidates everything at once and drops waiting events.
  invalidations.length = 0;
  sockets[0].message({ type: 'changed', kind: 'stock', id: 's1' });
  sockets[0].message({ type: 'resync' });
  assert.equal(invalidations.length, 1);
  assert.equal(invalidations[0], undefined);
  settle();
  assert.equal(invalidations.length, 1, 'a dropped event does not fire later');

  sockets[0].close();
  assert.equal(pending.size, 1);
  connection.start();
  assert.equal(sockets.length, 1, 'no second socket during backoff');
  const [id, retry] = [...pending][0];
  assert.ok(retry.delay >= 1000 && retry.delay < 1250);
  pending.delete(id);
  retry.callback();
  invalidations.length = 0;
  sockets[1].open();
  assert.equal(invalidations.length, 1, 'reconnect recovers missed events');
  assert.equal(invalidations[0], undefined);
  assert.equal(sockets[1].sent.length, 0);

  connection.stop();
  assert.equal(sockets[1].readyState, 3);
  assert.equal(pending.size, 0);
});
