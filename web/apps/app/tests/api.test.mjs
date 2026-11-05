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
      if (name === '../live/use-live') return { useLiveTopics() {} };
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
    assert.equal(calls[0], '/messages/inbox?limit=100');
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

test('socket shares subscriptions, invalidates topics, reconnects and stops denied topics', () => {
  const sockets = [];
  const pending = new Map();
  let timerId = 0;
  const invalidations = [];
  const states = [];
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
      this.onclose?.();
    }
  }
  const { LiveConnection } = load('../src/lib/live/connection.ts', {
    window: { location: { href: 'https://3reco.test/stock' } },
    WebSocket: Socket,
    setTimeout: (callback, delay) => {
      const id = ++timerId;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => pending.delete(id),
  });
  const connection = new LiveConnection({
    invalidateQueries: (options) => invalidations.push(options),
  });
  const listener = { keys: [['stock']], status: (state) => states.push(state) };
  const releaseFirst = connection.subscribe('stock:user', listener);
  const releaseSecond = connection.subscribe('stock:user', { ...listener });
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url.href, 'wss://3reco.test/api/live');
  sockets[0].open();
  assert.equal(
    invalidations.length,
    0,
    'first open keeps bootstrap queries fresh'
  );
  assert.equal(
    sockets[0].sent.filter((message) => message.type === 'subscribe').length,
    1
  );
  sockets[0].message({ type: 'changed', topic: 'stock:user', id: 'row' });
  assert.equal(
    invalidations.length,
    1,
    'shared observers invalidate once per event'
  );
  releaseFirst();
  assert.equal(
    sockets[0].sent.filter((message) => message.type === 'unsubscribe').length,
    0
  );

  invalidations.length = 0;
  sockets[0].message({ type: 'changed', topic: 'stock:user', id: 'row' });
  assert.equal(JSON.stringify(invalidations), '[{"queryKey":["stock"]}]');
  sockets[0].message({ type: 'pong' });
  assert.equal(invalidations.length, 1);
  sockets[0].message({ type: 'resync' });
  assert.equal(invalidations[1], undefined);

  sockets[0].close();
  assert.equal(pending.size, 1);
  const releaseMarket = connection.subscribe('market', {
    ...listener,
    keys: [['listings']],
  });
  assert.equal(
    sockets.length,
    1,
    'subscribe during backoff must not open another connection'
  );
  const [id, retry] = [...pending][0];
  assert.ok(retry.delay >= 1000 && retry.delay < 1250);
  pending.delete(id);
  retry.callback();
  invalidations.length = 0;
  sockets[1].open();
  assert.equal(invalidations.length, 1, 'reconnect recovers missed events');
  assert.equal(invalidations[0], undefined);
  assert.equal(
    sockets[1].sent.filter((message) => message.type === 'subscribe').length,
    2
  );

  invalidations.length = 0;
  sockets[1].message({ type: 'denied', topic: 'stock:user' });
  sockets[1].message({ type: 'changed', topic: 'stock:user' });
  assert.equal(invalidations.length, 0);
  assert.ok(states.includes('denied'));
  releaseSecond();
  releaseMarket();
  assert.equal(sockets[1].readyState, 3);
  assert.equal(pending.size, 0);
});
