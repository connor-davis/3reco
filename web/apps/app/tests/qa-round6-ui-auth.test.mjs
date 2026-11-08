import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { source, load } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
function compile(path, mocks) {
  const { outputText } = ts.transpileModule(source(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    URL,
    URLSearchParams,
    require: (name) =>
      name === 'react/jsx-runtime' ? jsx : (mocks[name] ?? require(name)),
  });
  return exports;
}

test('qa-round6-ui: session switch publishes the new user without a signed-out interval', async () => {
  const next = { id: 'buyer', email: 'buyer@qa.test' };
  const published = [];
  let removed = false;
  const client = {
    cancelQueries: async () => {},
    removeQueries: () => {
      removed = true;
    },
    setQueryData: (key, user) => {
      assert.ok(
        removed,
        'old private queries must be removed before publishing'
      );
      published.push(user);
    },
  };
  const calls = [];
  const auth = load('lib/api/auth.ts', {
    '@tanstack/react-query': {
      useQueryClient: () => client,
      useMutation: (options) => options,
    },
    './client': {
      api: async (path) => {
        calls.push(path);
        return path === '/auth/me' ? { user: next } : { ok: true };
      },
      json: (method, body) => ({ method, body }),
    },
  });
  const mutation = auth.useSwitchSession();
  await mutation.mutationFn('device-session');
  await mutation.onSuccess();
  assert.deepEqual(published, [next]);
  assert.deepEqual(calls, ['/auth/sessions/device-session/switch', '/auth/me']);
});

function guard(user, pathname, searchStr = '', isLoading = false) {
  const redirect = compile('lib/auth/redirect.ts', {});
  const guest = compile('lib/auth/guest-only.tsx', {
    './redirect': redirect,
    '@tanstack/react-router': {
      Navigate: 'Navigate',
      useRouterState: () => ({ pathname, searchStr }),
    },
    '@/components/data-state': { RowsSkeleton: 'RowsSkeleton' },
    './use-auth': { useAuth: () => ({ user, isLoading }) },
  });
  return { ...guest, ...redirect, tree: guest.GuestOnly({ children: 'form' }) };
}

test('qa-round6-ui: active sessions skip guest forms and use only safe redirect targets', () => {
  for (const path of [
    '/sign-in',
    '/sign-up',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ]) {
    assert.equal(guard({ id: 'buyer' }, path).tree.props.to, '/');
  }
  assert.equal(
    guard({ id: 'buyer' }, '/sign-in', '?redirect=%2Fstock').tree.props.to,
    '/stock'
  );
  const { authDestination } = guard(null, '/sign-in');
  for (const target of [
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/sign-in',
    '/a/../sign-up',
    '/\n/evil.test',
  ]) {
    assert.equal(authDestination(target), '/');
  }
  assert.equal(
    authDestination('/market?q=glass#results'),
    '/market?q=glass#results'
  );
});

test('qa-round6-ui: signed-out reasons, Add account and token actions keep their forms', () => {
  assert.equal(
    guard(null, '/sign-in', '?reason=removed').tree.props.children,
    'form'
  );
  assert.equal(
    guard(null, '/sign-in', '?reason=ended').tree.props.children,
    'form'
  );
  assert.equal(
    guard({ id: 'buyer' }, '/sign-in', '?add=1&email=new%40qa.test').tree.props
      .children,
    'form'
  );
  assert.equal(
    guard({ id: 'buyer' }, '/verify-email', '?token=token').tree.props.children,
    'form'
  );
  assert.equal(
    guard({ id: 'buyer' }, '/reset-password', '?token=token').tree.props
      .children,
    'form'
  );
  assert.equal(guard(null, '/sign-in', '', true).tree.type, 'RowsSkeleton');
  assert.match(
    source('routes/sign-in.tsx'),
    /email: params.get\('email'\) \?\? ''/
  );
  assert.match(
    source('components/shell/account-menu.tsx'),
    /email: session.email \?\? undefined/
  );
});

test('qa-round6-ui: notification empty states have inset padding and can shrink', () => {
  const tray = source('components/shell/notification-tray-list.tsx');
  assert.match(tray, /flex min-h-0 min-w-0 flex-col/);
  assert.match(tray, /overflow-y-auto p-4/);
  assert.match(tray, /\[&_\[data-slot=empty\]\]:p-6/);
});
