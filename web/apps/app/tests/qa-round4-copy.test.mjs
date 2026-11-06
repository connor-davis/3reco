import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { z } from 'zod';

const source = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

function compile(path, { mocks = {}, globals = {}, expose = '' } = {}) {
  const { outputText } = ts.transpileModule(source(path) + expose, {
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
    ...globals,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === 'react/jsx-runtime') return jsx;
      if (name === 'zod') return { z };
      if (name === 'react')
        return {
          useState: (initial) => [
            typeof initial === 'function' ? initial() : initial,
            () => {},
          ],
          useRef: () => ({ current: null }),
          useEffect: () => {},
        };
      if (name === '@tanstack/react-router')
        return { createFileRoute: () => (route) => route };
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  return exports;
}

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

const request = {
  buyer: { id: 'buyer', name: 'Greenline Recycling' },
  seller: { id: 'seller', name: 'Metro Scrap Traders' },
  status: 'offered',
  offer_version: 2,
  buyer_confirmed_version: 2,
  seller_confirmed_version: null,
};
const helpers = compile('components/chat/helpers.ts');

test('closed thread detail names the businesses without repeating the badge', () => {
  for (const status of ['accepted', 'cancelled', 'rejected']) {
    const detail = helpers.threadSummary({ ...request, status });
    assert.equal(detail, 'Greenline Recycling and Metro Scrap Traders');
    assert.doesNotMatch(detail, /Complete|Cancelled|Rejected|Closed/);
  }
  assert.match(
    source('components/chat/conversation.tsx'),
    /!isClosed\(request\) && <DealStepper/
  );
});

test('confirmation copy names the business still to confirm', () => {
  assert.equal(
    helpers.requestLabel(request, 'buyer'),
    'Waiting for Metro Scrap Traders to confirm'
  );
  assert.equal(
    helpers.requestLabel({ ...request, seller_confirmed_version: 2 }, 'seller'),
    'Waiting for Greenline Recycling to confirm'
  );
  assert.match(
    source('components/chat/conversation.tsx'),
    /`\$\{other.name\} will be notified\.`/
  );
});

test('staff dashboard explains that trade chats are unavailable', () => {
  for (const role of ['staff', 'business']) {
    const { RecentThreads } = compile('routes/-dashboard/panels.tsx', {
      expose: '\nexports.RecentThreads = RecentThreads;',
      mocks: {
        '@/lib/auth/use-auth': { useAuth: () => ({ user: { role } }) },
        '@/lib/api/messages': { useInbox: () => ({}) },
      },
    });
    const state = nodes(RecentThreads()).find((node) => node.props.emptyTitle);
    assert.equal(
      state.props.emptyText,
      role === 'staff'
        ? 'Staff do not take part in trade chats.'
        : 'Ask a seller about a listing to start one.'
    );
  }
  assert.match(source('components/chat/inbox.tsx'), /!staff &&/);
});

test('empty notifications have no bulk actions; populated lists keep them', () => {
  for (const items of [
    [],
    [{ id: 'notice', title: 'New request', read: false }],
  ]) {
    const mutation = () => ({});
    const { default: TrayList } = compile(
      'components/shell/notification-tray-list.tsx',
      {
        mocks: {
          '@tanstack/react-router': { useNavigate: () => () => {} },
          '@/lib/api/notifications': {
            useNotifications: () => ({ data: { items } }),
            useUnreadCount: () => ({}),
            useReadNotification: mutation,
            useReadAllNotifications: mutation,
            useDismissNotification: mutation,
            useDismissAllNotifications: mutation,
          },
          '@/lib/format': { formatDate: () => '', formatTime: () => '' },
        },
      }
    );
    const tree = nodes(TrayList({ onNavigate() {} }));
    assert.equal(
      tree.find((node) => node.props.emptyTitle)?.props.emptyTitle,
      'No notifications.'
    );
    assert.equal(
      tree.some((node) => node.props.children === 'Mark all read'),
      items.length > 0
    );
    assert.equal(
      tree.some((node) => node.props.children === 'Dismiss all'),
      items.length > 0
    );
  }
});

test('removed and changed accounts receive different sign-in feedback', () => {
  for (const reason of ['removed', 'ended', '']) {
    const { Route } = compile('routes/sign-in.tsx', {
      globals: { window: { location: { search: `?reason=${reason}` } } },
      mocks: {
        '@tanstack/react-router': {
          createFileRoute: () => (route) => route,
          useNavigate: () => () => {},
        },
        '@/lib/api/auth': { useSignIn: () => ({}) },
        '@hookform/resolvers/zod': { zodResolver: () => () => {} },
        'react-hook-form': {
          useForm: () => ({ handleSubmit: () => () => {}, formState: {} }),
        },
      },
    });
    assert.equal(
      Route.component().props.feedback?.text ?? null,
      reason === 'removed'
        ? 'This account was removed. Contact 3REco if this is a mistake.'
        : reason === 'ended'
          ? 'You were signed out because your account changed.'
          : null
    );
  }
});

test('material validation accepts commas and explains truly invalid numbers', () => {
  const { schema } = compile('components/dialogs/material-dialog.tsx', {
    expose: '\nexports.schema = schema;',
    mocks: { '@/lib/format': { toCents: () => 100 } },
  });
  const material = {
    name: 'Glass',
    carbon_factor: '1,5',
    gw_code: 'GW01',
    price: '1.50',
  };
  assert.equal(schema.safeParse(material).success, true);
  const result = schema.safeParse({ ...material, carbon_factor: '1x5' });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].message, 'Use a number like 1.5.');
});

test('not-found has a recovery link and request headings never use the raw id', () => {
  const { NotFound } = compile('components/not-found.tsx');
  const tree = nodes(NotFound());
  assert.equal(
    tree.find((node) => node.props.title)?.props.title,
    'Page not found'
  );
  assert.equal(tree.find((node) => node.props.to)?.props.to, '/');
  assert.match(source('routes/__root.tsx'), /notFoundComponent: NotFound/);
  const { titleFor } = compile('components/shell/topbar.tsx', {
    expose: '\nexports.titleFor = titleFor;',
    mocks: {
      '@/lib/nav': { isRequestPath: (path) => path.startsWith('/messages/') },
    },
  });
  assert.equal(titleFor('/missing'), 'Page not found');
  assert.equal(titleFor('/messages/raw-request-id'), 'Messages');
  assert.doesNotMatch(
    source('components/chat/deal-aside.tsx'),
    /\{request.id\}/
  );
  assert.match(
    source('components/chat/conversation.tsx'),
    /request.id.slice\(-8\).toUpperCase\(\)/
  );
});

test('first-visit greeting stays stable through rerenders and changes on the next mount', () => {
  const storage = new Map();
  let state;
  let mounted = false;
  let effect;
  const { useFirstVisit } = compile('routes/index.tsx', {
    expose: '\nexports.useFirstVisit = useFirstVisit;',
    globals: {
      localStorage: {
        getItem: (key) => storage.get(key),
        setItem: (key, value) => storage.set(key, value),
      },
    },
    mocks: {
      react: {
        useState: (initial) => {
          if (!mounted) {
            state = initial();
            mounted = true;
          }
          return [state];
        },
        useEffect: (next) => {
          effect = next;
        },
      },
    },
  });
  assert.equal(useFirstVisit('buyer'), true);
  effect();
  assert.equal(useFirstVisit('buyer'), true);
  mounted = false;
  assert.equal(useFirstVisit('buyer'), false);
});

test('listing waits for typed errors and hides material codes from buyers', () => {
  const listing = source('routes/market/listing/$listingId.tsx');
  assert.match(listing, /weight.trim\(\) &&/);
  assert.match(listing, /own && listing.gw_code/);
  assert.doesNotMatch(listing, /Enter a valid quantity/);
  assert.match(listing, /problem\s*\? '-'/);
});
