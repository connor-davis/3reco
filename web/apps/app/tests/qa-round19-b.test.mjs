import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { source } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
function compile(path, mocks = {}, expose = '') {
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
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.'))
        return new Proxy({}, { get: (_, name) => name });
      return require(id);
    },
  });
  return exports;
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
const words = (node) =>
  nodes(node)
    .flatMap((item) => [item.props?.children].flat(Infinity))
    .filter((child) => typeof child === 'string')
    .join('');

const access = compile('lib/access.ts');
const format = compile('lib/format.ts');
const nav = compile('lib/nav.ts', { '@/lib/access': access });

test('H1: every refused page is "Not available"; open pages keep their name', () => {
  const rows = [
    ['/', 'dashboard', 'Dashboard'],
    ['/messages', 'messages', 'Messages'],
    ['/messages/abc', 'messages', 'Messages'],
    ['/market/incoming', 'incoming', 'Incoming requests'],
    ['/market/outgoing', 'outgoing', 'Outgoing requests'],
    ['/materials', 'materials', 'Materials'],
    ['/stock', 'stock', 'Stock'],
    ['/collectors', 'collectors', 'Collectors'],
    ['/collections', 'collections', 'Collections'],
    ['/transactions', 'transactions', 'Transactions'],
    ['/transactions/purchases', 'purchases', 'Purchases'],
    ['/transactions/sales', 'sales', 'Sales'],
    ['/cart', 'cart', 'Your cart'],
    ['/profile', 'profile', 'Your profile'],
    ['/admin/users', 'users', 'User management'],
  ];
  const roles = ['guest', 'admin', 'staff', 'business', 'collector', null];
  for (const [path, page, title] of rows) {
    assert.equal(nav.guardedPageFor(path), page, path);
    for (const role of roles) {
      const expected = access.canOpen(role, page) ? title : 'Not available';
      assert.equal(nav.pageTitleFor(path, role), expected, `${path} ${role}`);
    }
    // Still loading: the plain title, never a flash of "Not available".
    assert.equal(nav.pageTitleFor(path, undefined), title, `${path} loading`);
  }
  assert.equal(nav.guardedPageFor('/market/some-request'), undefined);
  assert.equal(nav.guardedPageFor('/constructor'), undefined);
  assert.equal(nav.pageTitleFor('/market', 'collector'), 'Browse materials');
  assert.equal(nav.pageTitleFor('/missing', 'collector'), 'Page not found');
  for (const file of ['topbar', 'app-shell']) {
    const src = source(`components/shell/${file}.tsx`);
    assert.match(src, /const \{ user, isLoading \} = useAuth\(\)/);
    assert.match(src, /isLoading \? undefined : \(user\?\.role \?\? null\)/);
    assert.doesNotMatch(src, /pageTitleFor\(pathname, user\?/);
  }
  assert.match(
    source('components/shell/topbar.tsx'),
    /role === 'business' && !!user\?\.active_business_id/
  );
});

test('H2: a removed account’s message reads as one', () => {
  const { messageText } = compile('components/chat/helpers.ts', {
    '@/lib/format': format,
  });
  assert.equal(messageText('[removed]'), 'Message from a removed account');
  assert.equal(messageText('Hello'), 'Hello');
  for (const file of ['conversation', 'inbox'])
    assert.match(source(`components/chat/${file}.tsx`), /messageText\(/);
});

class ApiError extends Error {
  constructor(status) {
    super('No such store.');
    this.status = status;
  }
}

test('H3: a 404 shows the empty state with no retry; other errors keep Try again', () => {
  const { DataState } = compile('components/data-state.tsx', {
    '@/lib/api/client': { ApiError },
  });
  const render = (status) =>
    DataState({
      query: {
        isPending: false,
        isError: true,
        error: new ApiError(status),
        refetch: () => {},
      },
      icon: 'Icon',
      emptyTitle: 'Gone',
      emptyText: 'Elsewhere',
      emptyAction: 'Go',
      children: 'page',
    });
  const missing = words(render(404));
  assert.match(missing, /Gone/);
  assert.match(missing, /Go/);
  assert.doesNotMatch(missing, /Try again/);
  const broken = words(render(500));
  assert.match(broken, /Try again/);
  assert.doesNotMatch(broken, /Gone/);

  const store = source('routes/market/store/$sellerId.tsx');
  assert.match(store, /emptyTitle="This store is no longer on 3REco\."/);
  assert.match(store, /emptyText="Browse materials to find other stores\."/);
  assert.match(
    store,
    /<LinkButton to="\/market">Browse materials<\/LinkButton>/
  );
});

test('H4: "removed" is said once on the sign-in page', () => {
  const src = source('routes/sign-in.tsx');
  assert.match(src, /'Account removed\.'/);
  assert.doesNotMatch(src, /This account was removed\./);
  assert.match(src, /You were signed out because your account changed\./);
});

test('H5: the role dialog names the account', () => {
  assert.match(
    source('routes/admin/users.tsx'),
    /title=\{`Change the role of \$\{user\.name\}\?`\}/
  );
});

test('H6: material price says what is wrong', () => {
  const { schema } = compile(
    'components/dialogs/material-dialog.tsx',
    { '@/lib/format': format },
    '\nexports.schema = schema;'
  );
  const message = (price) => {
    const result = schema.safeParse({
      name: 'Glass',
      carbon_factor: '1.5',
      gw_code: 'GW1',
      price,
    });
    return result.success ? '' : result.error.issues[0].message;
  };
  assert.equal(message('100000.001'), 'Use up to 2 decimals.');
  assert.equal(message('12.345'), 'Use up to 2 decimals.');
  assert.equal(message('0'), 'Enter a price above R 0.00.');
  assert.equal(message(''), 'Enter a price above R 0.00.');
  assert.equal(message('abc'), 'Enter a price above R 0.00.');
  assert.equal(message('12.5'), '');
});

test('H7: carbon factors always show 2 decimals', () => {
  assert.equal(format.formatKgFixed('9'), '9.00');
  assert.equal(format.formatKgFixed('1.5'), '1.50');
  assert.equal(format.formatKgFixed('0.9'), '0.90');
  assert.doesNotMatch(source('routes/materials.tsx'), /formatKgNumber/);
});

test('S1: panels size to their content, side-by-side panels share one height', () => {
  const panels = source('routes/-dashboard/panels.tsx');
  assert.match(panels, /min-h-0 flex-1 divide-y overflow-y-auto/);
  assert.match(panels, /mt-auto flex flex-wrap/);
  assert.match(panels, /sum \+ toCents\(party\.value\)/);
  assert.match(source('routes/index.tsx'), /grid gap-4 lg:grid-cols-2/);
});

test('S2: the whole price is one run of text', () => {
  const { ListingCard } = compile('components/listing-card.tsx', {
    react: { useState: () => [undefined, () => {}] },
    '@/lib/format': format,
  });
  const tree = ListingCard({ listing: { price: '22.37', weight: '12.5' } });
  const price = nodes(tree).find(
    (node) =>
      node.type === 'p' && node.props.className === 'font-semibold tabular-nums'
  );
  assert.equal(price.props.children, 'R 22.37 / kg');
  assert.doesNotMatch(source('components/listing-card.tsx'), /font-normal/);
});

test('S5: chart ticks come from the data, so every load is the same', () => {
  const { axisTicks } = compile('routes/-dashboard/impact-chart.tsx');
  const days = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.UTC(2026, 9, 10 + i)).toISOString().slice(0, 10)
  );
  const ticks = axisTicks(days);
  assert.deepEqual(ticks, [
    '2026-10-10',
    '2026-10-17',
    '2026-10-24',
    '2026-10-31',
    '2026-11-08',
  ]);
  assert.deepEqual(axisTicks(days), ticks);
  assert.deepEqual(axisTicks(['a']), ['a']);
  assert.deepEqual(axisTicks([]), []);
  assert.deepEqual(axisTicks(['a', 'b', 'c', 'd', 'e']), ['a', 'e']);
  const src = source('routes/-dashboard/impact-chart.tsx');
  assert.match(src, /ticks=\{axisTicks\(/);
  assert.match(src, /interval=\{0\}/);
});

test('S6: dialog fields sit one even gap apart', () => {
  assert.doesNotMatch(
    source('components/dialogs/stock-dialog.tsx'),
    /min-h-32/
  );
  const offer = source('components/dialogs/offer-dialog.tsx');
  assert.match(offer, /<fieldset key=\{field\.id\} className="space-y-4">/);
  assert.match(offer, /<legend className="font-medium">/);
  assert.doesNotMatch(offer, /<legend[^>]*mb-2/);
});

test('S7: empty transaction lists name the thing', () => {
  assert.match(
    source('routes/transactions/-components/record-list.tsx'),
    /`\$\{title\} appear here once one is recorded\.`/
  );
});
