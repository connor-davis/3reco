import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const access = load('lib/access.ts');
const nav = load('lib/nav.ts', { '@/lib/access': access });

test('business navigation has one Transactions entry and collector navigation stays personal', () => {
  assert.equal(access.canOpen('business', 'transactions'), true);
  assert.equal(access.canOpen('staff', 'transactions'), true);
  assert.equal(access.canOpen('collector', 'transactions'), false);
  for (const role of ['owner', 'manager', 'member']) {
    const links = nav
      .navFor('business', role, 'business-a')
      .flatMap((group) => group.links);
    assert.equal(
      JSON.stringify(
        links
          .filter((link) => link.to.startsWith('/transactions'))
          .map((link) => [link.label, link.to])
      ),
      JSON.stringify([['Transactions', '/transactions']])
    );
  }
});

function routePage(path, role, search = {}) {
  const module = load(path, {
    '@tanstack/react-router': {
      createFileRoute: () => (config) => ({
        ...config,
        useSearch: () => search,
        useNavigate: () => () => {},
      }),
      Navigate: 'Navigate',
    },
    '@/components/access-guard': { Guarded: 'Guarded' },
    '@/lib/auth/use-auth': {
      useAuth: () => ({
        user: { id: 'person', role, active_business_id: 'business-a' },
      }),
    },
    './-components/record-list': { RecordList: 'RecordList' },
  });
  return {
    route: module.Route,
    page: () => {
      const child = module.Route.component().props.children;
      return child.type(child.props);
    },
  };
}

test('validated transaction filters select their list and export without changing staff views', () => {
  for (const [filter, kind, exportKind] of [
    ['all', 'mine', undefined],
    ['bought', 'purchases', 'purchases'],
    ['sold', 'sales', 'sales'],
  ]) {
    const { route, page } = routePage(
      'routes/transactions/index.tsx',
      'business',
      { filter }
    );
    assert.equal(
      route.validateSearch({ filter: 'wrong', open: 12 }).filter,
      'all'
    );
    assert.equal(
      route.validateSearch({ filter, open: 'trade-id' }).open,
      'trade-id'
    );
    const props = page().props;
    assert.equal(props.kind, kind);
    assert.equal(props.exportKind, exportKind);
    assert.equal(props.businessFilter, filter);
    assert.equal(
      props.exportHint,
      filter === 'all' ? 'Pick Bought or Sold to export' : undefined
    );
    assert.equal(props.typeFilter, false);
  }
  for (const role of ['admin', 'staff']) {
    const props = routePage('routes/transactions/index.tsx', role, {
      filter: 'sold',
    }).page().props;
    assert.equal(props.kind, 'mine');
    assert.equal(props.exportKind, 'transactions');
    assert.equal(props.typeFilter, true);
    assert.equal(props.businessFilter, undefined);
  }
});

test('old business bookmarks preserve their open trade and collectors retain Sales', () => {
  for (const [path, filter] of [
    ['purchases', 'bought'],
    ['sales', 'sold'],
  ]) {
    const { route, page } = routePage(
      `routes/transactions/${path}.tsx`,
      'business',
      { open: 'trade-id' }
    );
    assert.equal(route.validateSearch({ open: 1 }).open, undefined);
    assert.equal(route.validateSearch({ open: 'trade-id' }).open, 'trade-id');
    const redirect = page();
    assert.equal(redirect.type, 'Navigate');
    assert.equal(redirect.props.to, '/transactions');
    assert.equal(redirect.props.search.filter, filter);
    assert.equal(redirect.props.search.open, 'trade-id');
    assert.equal(redirect.props.replace, true);
  }
  const sales = routePage('routes/transactions/sales.tsx', 'collector').page();
  assert.equal(sales.type, 'RecordList');
  assert.equal(sales.props.kind, 'sales');
  assert.equal(sales.props.readOnly, true);
});

test('unified rows label direction on both desktop and phone and reset cursor scope', () => {
  const page = source('routes/transactions/-components/record-list.tsx');
  assert.match(page, /row.buyer.id === user\?\.active_business_id/);
  assert.match(page, /direction\(row.original\)/);
  assert.match(page, /direction\(row\)/);
  assert.match(page, /label="Bought or sold"/);
  assert.match(page, /usePager\(50, \{ \.\.\.filters, kind \}\)/);
  assert.match(page, /!!exportHint/);
});
