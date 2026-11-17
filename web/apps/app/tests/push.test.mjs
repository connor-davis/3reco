import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as jsx from 'react/jsx-runtime';
import { load } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));
const ORIGIN = 'https://app.example';

// ---- API client ----

test('push client reads the key and writes the caller subscription only', () => {
  const calls = [];
  const api = load('lib/api/push.ts', {
    './resource': {
      useResource: (...args) => calls.push(args),
      useWrite: (...args) => calls.push(args),
    },
  });
  api.usePushKey();
  assert.deepEqual(plain(calls.pop()), [['push-key'], '/push/key', true]);
  api.useSubscribePush();
  assert.deepEqual(plain(calls.pop()), ['/push/subscriptions', 'POST', []]);
  api.useUnsubscribePush();
  const [path, method, keys, body] = calls.pop();
  assert.equal(path, '/push/unsubscribe');
  assert.equal(method, 'POST');
  assert.deepEqual(plain(keys), []);
  assert.deepEqual(plain(body('https://push.example/x')), {
    endpoint: 'https://push.example/x',
  });
});

// ---- registration ----

test('the worker registers only in production and never breaks the app', async () => {
  const { registerServiceWorker } = load('lib/push/register.ts');
  const registered = [];
  const nav = {
    serviceWorker: {
      register: (url) => {
        registered.push(url);
        return Promise.reject(new Error('blocked'));
      },
    },
  };
  registerServiceWorker(false, nav);
  assert.deepEqual(registered, []);
  registerServiceWorker(true, {});
  registerServiceWorker(true, undefined);
  assert.deepEqual(registered, []);
  registerServiceWorker(true, nav);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(registered, ['/sw.js']);
});

// ---- switch states ----

const browser = load('lib/push/browser.ts');
const facts = (over) => ({
  supported: true,
  serverEnabled: true,
  permission: 'default',
  subscribed: false,
  ...over,
});

test('the switch state follows support, server keys, permission and subscription', () => {
  const state = (over) => browser.alertState(facts(over));
  assert.equal(state({ supported: false }), 'unsupported');
  assert.equal(state({ serverEnabled: false }), 'server-off');
  assert.equal(state({ permission: 'denied' }), 'denied');
  assert.equal(state({ permission: 'denied', subscribed: true }), 'denied');
  assert.equal(state({ permission: 'granted', subscribed: true }), 'on');
  assert.equal(state({ permission: 'granted' }), 'off');
  assert.equal(state({}), 'off');
});

test('support needs a worker, push and notifications', () => {
  const win = (names) => ({
    navigator: names.includes('sw') ? { serviceWorker: {} } : {},
    ...(names.includes('push') ? { PushManager: {} } : {}),
    ...(names.includes('note') ? { Notification: {} } : {}),
  });
  assert.equal(browser.pushSupported(win(['sw', 'push', 'note'])), true);
  assert.equal(browser.pushSupported(win(['push', 'note'])), false);
  assert.equal(browser.pushSupported(win(['sw', 'note'])), false);
  assert.equal(browser.pushSupported(win(['sw', 'push'])), false);
});

function render(state, key = { enabled: true, public_key: 'k' }) {
  const { renderToString } = require('react-dom/server');
  const { PhoneAlerts, alertText } = load(
    'routes/profile/-components/phone-alerts.tsx',
    {
      'react/jsx-runtime': jsx,
      react: require('react'),
      sonner: { toast: {} },
      '@/components/ui/switch': {
        Switch: (props) =>
          jsx.jsx('button', {
            id: props.id,
            role: 'switch',
            'aria-checked': String(!!props.checked),
            disabled: props.disabled,
          }),
      },
      '@/lib/api/push': {
        usePushKey: () => ({ data: key, isPending: false }),
        useSubscribePush: () => ({}),
        useUnsubscribePush: () => ({}),
      },
      '@/lib/push/browser': {
        alertState: () => state,
        pushSupported: () => true,
        permission: () => 'default',
        isSubscribed: () => Promise.resolve(false),
        enablePush: () => null,
        disablePush: () => null,
      },
    }
  );
  return { html: renderToString(jsx.jsx(PhoneAlerts, {})), alertText };
}

test('the Phone alerts switch says plainly what is going on in every state', () => {
  const expected = {
    unsupported: { disabled: true, on: 'false' },
    'server-off': { disabled: true, on: 'false' },
    denied: { disabled: true, on: 'false' },
    off: { disabled: false, on: 'false' },
    on: { disabled: false, on: 'true' },
  };
  for (const [state, want] of Object.entries(expected)) {
    const { html, alertText } = render(state);
    assert.match(html, /Phone alerts/);
    assert.ok(html.includes(alertText[state].replace(/'/g, '&#x27;')), state);
    assert.equal(/disabled=""/.test(html), want.disabled, state);
    assert.ok(html.includes(`aria-checked="${want.on}"`), state);
  }
  assert.match(render('denied').html, /blocked in this browser/);
  assert.match(render('unsupported').html, /cannot show phone alerts/);
  assert.match(render('server-off').html, /not switched on/);
});

// ---- service worker ----

function worker(url = `${ORIGIN}/sw.js`) {
  const handlers = {};
  const store = new Map();
  const deleted = [];
  const shown = [];
  const opened = [];
  const state = { windows: [] };
  const self = {
    location: { origin: ORIGIN, href: url },
    registration: {
      showNotification: (title, options) => shown.push({ title, options }),
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve(state.windows),
      openWindow: (target) => {
        opened.push(target);
        return Promise.resolve();
      },
    },
    skipWaiting: () => undefined,
    addEventListener: (name, fn) => (handlers[name] = fn),
  };
  const fetched = [];
  const context = {
    self,
    URL,
    Promise,
    caches: {
      keys: () =>
        Promise.resolve(['three-assets-v0', 'three-assets-v1', 'other']),
      delete: (name) => deleted.push(name),
      open: () =>
        Promise.resolve({
          match: (request) => Promise.resolve(store.get(request.url)),
          put: (request, response) => store.set(request.url, response),
        }),
    },
    fetch: (request) => {
      fetched.push(request.url);
      const type = request.url.endsWith('/assets/missing.js')
        ? 'text/html'
        : 'text/javascript';
      return Promise.resolve({
        ok: true,
        headers: { get: () => type },
        clone() {
          return this;
        },
      });
    },
  };
  vm.runInNewContext(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
    context
  );
  return { handlers, store, deleted, shown, opened, state, fetched };
}

async function run(handler, event) {
  let work;
  event.waitUntil = (p) => (work = p);
  event.respondWith = (p) => (work = p);
  handler(event);
  return work === undefined ? undefined : await work;
}

const get = (path, method = 'GET') => ({
  url: ORIGIN + path,
  method,
});

test('the worker stores built app files and nothing else', async () => {
  const sw = worker();
  for (const [path, method] of [
    ['/api/notifications', 'GET'],
    ['/api/auth/me', 'GET'],
    ['/api/live', 'GET'],
    ['/api/files/receipt', 'GET'],
    ['/', 'GET'],
    ['/profile', 'GET'],
    ['/site.webmanifest', 'GET'],
    ['/assets/app-1.js', 'POST'],
  ]) {
    const event = { request: get(path, method) };
    sw.handlers.fetch(event);
    assert.equal(
      event.respondWith,
      undefined,
      `${method} ${path} is left alone`
    );
  }
  // Another site's /assets is not ours either.
  const foreign = {
    request: { url: 'https://cdn.example/assets/a.js', method: 'GET' },
  };
  sw.handlers.fetch(foreign);
  assert.equal(foreign.respondWith, undefined);

  await run(sw.handlers.fetch, { request: get('/assets/app-1.js') });
  assert.deepEqual(sw.fetched, [`${ORIGIN}/assets/app-1.js`]);
  assert.ok(sw.store.has(`${ORIGIN}/assets/app-1.js`));

  // The second ask is answered from the store.
  await run(sw.handlers.fetch, { request: get('/assets/app-1.js') });
  assert.equal(sw.fetched.length, 1);

  // A missing file comes back as the app page; it is never kept.
  await run(sw.handlers.fetch, { request: get('/assets/missing.js') });
  assert.equal(sw.store.has(`${ORIGIN}/assets/missing.js`), false);
});

test('a new version drops older stores', async () => {
  const sw = worker();
  await run(sw.handlers.activate, {});
  assert.deepEqual(sw.deleted, ['three-assets-v0']);
});

const alert = (data) => ({ data: { json: () => data } });

test('a push shows the alert with a same-origin link only', async () => {
  const sw = worker();
  await run(
    sw.handlers.push,
    alert({ id: 'n1', title: 'New message', body: 'Hi', link: '/messages' })
  );
  assert.equal(sw.shown[0].title, 'New message');
  assert.equal(sw.shown[0].options.body, 'Hi');
  assert.equal(sw.shown[0].options.tag, 'n1');
  assert.equal(sw.shown[0].options.data.link, '/messages');

  for (const bad of [
    'https://evil.example/x',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    42,
    null,
  ]) {
    await run(sw.handlers.push, alert({ title: 't', link: bad }));
    assert.equal(sw.shown.at(-1).options.data.link, '/', String(bad));
  }

  await run(sw.handlers.push, { data: null });
  assert.equal(sw.shown.at(-1).title, '3REco');
});

test('tapping an alert opens its link in this app, reusing an open window', async () => {
  const sw = worker();
  let closed = 0;
  const click = (link) => ({
    notification: { data: { link }, close: () => closed++ },
  });

  await run(sw.handlers.notificationclick, click('/messages?x=1'));
  assert.deepEqual(sw.opened, [`${ORIGIN}/messages?x=1`]);
  assert.equal(closed, 1);

  // A link that left the app is never followed, even if it got this far.
  await run(sw.handlers.notificationclick, click('https://evil.example/x'));
  assert.equal(sw.opened.at(-1), `${ORIGIN}/`);

  const moves = [];
  sw.state.windows = [
    {
      url: `${ORIGIN}/market`,
      navigate: (target) => moves.push(['navigate', target]),
      focus: () => moves.push(['focus']),
    },
  ];
  await run(sw.handlers.notificationclick, click('/stock'));
  assert.deepEqual(moves, [['navigate', `${ORIGIN}/stock`], ['focus']]);
  assert.equal(sw.opened.length, 2);
});

test('the app is installable: manifest has start page, scope and icons; the page links it', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../public/site.webmanifest', import.meta.url), 'utf8')
  );
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ['192x192', '512x512']
  );
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
});
