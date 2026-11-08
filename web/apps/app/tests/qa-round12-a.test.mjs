import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

function load(path, globals = {}, requires = {}) {
  const { outputText } = ts.transpileModule(source(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    URL,
    setTimeout,
    clearTimeout,
    require: (name) => requires[name] ?? {},
    ...globals,
  });
  return exports;
}

function ending() {
  const assigned = [];
  const auth = load(
    'lib/api/auth.ts',
    {
      window: {
        location: {
          pathname: '/stock',
          assign: (url) => assigned.push(url),
        },
      },
    },
    { './client': {}, '@tanstack/react-query': {} }
  );
  const client = {
    cancelQueries: async () => undefined,
    removeQueries: () => undefined,
    setQueryData: () => undefined,
  };
  return { assigned, end: (reason) => auth.endSession(client, reason) };
}

test('HA1: the removed reason wins over a later generic sign-out', async () => {
  const { assigned, end } = ending();
  await end('removed');
  await end('ended');
  await end(undefined);
  assert.deepEqual(assigned, ['/sign-in?reason=removed']);
});

test('HA1: removed still speaks after a weaker reason started the end', async () => {
  const { assigned, end } = ending();
  await end('ended');
  await end('ended');
  await end('removed');
  assert.deepEqual(assigned, [
    '/sign-in?reason=ended',
    '/sign-in?reason=removed',
  ]);
});

function connect(stillSignedIn) {
  const sockets = [];
  const ended = [];
  class Socket {
    constructor() {
      sockets.push(this);
    }
    close() {}
  }
  const { LiveConnection } = load('lib/live/connection.ts', {
    window: { location: { href: 'https://3reco.test/stock' } },
    WebSocket: Socket,
  });
  const connection = new LiveConnection(
    { invalidateQueries: () => undefined },
    (reason) => ended.push(reason),
    stillSignedIn
  );
  connection.start();
  return { sockets, ended, connection };
}

test('HA1: a close that names the removal ends the tab as removed, with no extra check', async () => {
  let asked = 0;
  const { sockets, ended } = connect(async () => {
    asked++;
    return false;
  });
  sockets[0].onclose({ code: 4401, reason: 'account-removed' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ended, ['removed']);
  assert.equal(asked, 0);
});

test('HA1: a drop with no reason checks the session at once and ends it when gone', async () => {
  const { sockets, ended, connection } = connect(async () => false);
  sockets[0].onclose({ code: 1006, reason: '' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ended, ['ended']);
  connection.stop();
});

test('HA1: a drop while still signed in only reconnects', async () => {
  const { sockets, ended, connection } = connect(async () => true);
  sockets[0].onclose({ code: 1006, reason: '' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ended, []);
  connection.stop();
});

test('SN4: an empty payout reads "None added" only when the reader may see payouts', () => {
  const page = source('routes/collectors.tsx');
  assert.match(
    page,
    /collector\.can_view_payout \? 'None added' : 'Not shared'/
  );
});

test('SN1: the collector dialog asks for a six digit branch code', () => {
  const dialog = source('components/dialogs/collector-dialog.tsx');
  assert.ok(
    dialog.includes(String.raw`/^\d{6}$/.test(values.bank_branch_code.trim())`)
  );
  assert.match(dialog, /Enter a 6-digit branch code\./);
});

test('SN2: the collection dialog blocks a total under one cent and drops the unit words', () => {
  const dialog = source('components/dialogs/collection-dialog.tsx');
  assert.match(dialog, /The total must be at least R 0\.01\./);
  assert.match(dialog, /lineCents\(item\.price, item\.weight\)/);
  assert.match(dialog, /label="Weight"/);
  assert.match(dialog, /label="Price"/);
  assert.doesNotMatch(dialog, /Weight \(kg\)|R \/ kg/);
});
