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
const format = compile('lib/format.ts');

test('cart stays out of sidebar, More and command navigation; its route stays available', () => {
  const access = compile('lib/access.ts');
  const { navFor, pageTitleFor } = compile('lib/nav.ts', {
    '@/lib/access': access,
  });
  for (const role of [
    'business',
    'collector',
    'staff',
    'admin',
    'guest',
    null,
  ]) {
    assert.equal(
      navFor(role)
        .flatMap((group) => group.links)
        .some((link) => link.to === '/cart'),
      false
    );
  }
  assert.equal(pageTitleFor('/cart', 'business'), 'Your cart');
});

test('only a loaded business account gets the header cart component', () => {
  for (const role of [
    'business',
    'collector',
    'staff',
    'admin',
    'guest',
    null,
  ]) {
    for (const isLoading of [false, true]) {
      const { Topbar } = compile('components/shell/topbar.tsx', {
        '@tanstack/react-router': { useRouterState: () => '/market' },
        '@/lib/auth/use-auth': {
          useAuth: () => ({ user: role ? { role } : null, isLoading }),
        },
        '@/lib/nav': { pageTitleFor: () => 'Browse materials' },
        '@/lib/utils': { cn: (...values) => values.join(' ') },
      });
      const tree = nodes(Topbar({ onSearch: () => {} }));
      assert.equal(
        tree.some((node) => node.type === 'HeaderCart'),
        role === 'business' && !isLoading
      );
    }
  }
});

test('header cart sums visible lines across stores, caps the badge and hides it at zero', () => {
  for (const [items, count, badge] of [
    [[], 0, undefined],
    [[{ item_count: 1 }], 1, 1],
    [[{ item_count: 1 }, { item_count: 2 }], 3, 3],
    [[{ item_count: 9 }], 9, 9],
    [[{ item_count: 5 }, { item_count: 7 }], 12, '9+'],
  ]) {
    const { HeaderCart } = compile('components/shell/header-cart.tsx', {
      '@/lib/api/cart': { useCartStores: () => ({ data: { items } }) },
      '@/lib/format': format,
    });
    const tree = HeaderCart();
    assert.equal(
      tree.props.label,
      count ? `Cart, ${format.plural(count, 'item')}` : 'Cart'
    );
    assert.equal(tree.props.render.props.to, '/cart');
    assert.equal(
      nodes(tree).find((node) => node.type === 'Badge')?.props.children,
      badge
    );
  }
  const { HeaderCart } = compile('components/shell/header-cart.tsx', {
    '@/lib/api/cart': { useCartStores: () => ({}) },
    '@/lib/format': format,
  });
  assert.equal(HeaderCart().props.label, 'Cart');
});

test('adding a listing keeps the existing lines and shows a toast without navigating', async () => {
  const writes = [];
  const toasts = [];
  const navigations = [];
  const { ListingDetail } = compile(
    'routes/market/listing/$listingId.tsx',
    {
      react: { useState: (value) => [value, () => {}] },
      '@tanstack/react-router': {
        createFileRoute: () => (options) => options,
        useNavigate:
          () =>
          (...args) =>
            navigations.push(args),
      },
      'react-hook-form': {
        useForm: () => ({
          watch: () => '2.5',
          handleSubmit: (fn) => fn,
          formState: { errors: {} },
          setError: (...args) => assert.fail(`Unexpected form error: ${args}`),
        }),
      },
      '@hookform/resolvers/zod': { zodResolver: () => {} },
      '@/lib/auth/use-auth': {
        useAuth: () => ({ user: { id: 'buyer', role: 'business' } }),
      },
      '@/lib/api/cart': {
        useCart: () => ({
          data: {
            items: [
              { stock_id: 'other', material_id: 'glass', weight: '1' },
              { stock_id: 'lot', material_id: 'glass', weight: '4' },
            ],
          },
        }),
        useSaveCart: () => ({ mutateAsync: async (body) => writes.push(body) }),
      },
      '@/lib/format': format,
      '@/lib/quantity': compile('lib/quantity.ts', { '@/lib/format': format }),
      sonner: { toast: { success: (...args) => toasts.push(args) } },
    },
    '\nexport { ListingDetail };'
  );
  const tree = ListingDetail({
    listing: {
      id: 'lot',
      seller_id: 'seller',
      material_id: 'glass',
      weight: '10',
      price: '2',
      review_count: 0,
    },
  });
  await nodes(tree)
    .find((node) => node.type === 'form')
    .props.onSubmit({ weight: ' 2,5 ' });
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [
    {
      items: [
        { stock_id: 'other', material_id: 'glass', weight: '1' },
        { stock_id: 'lot', material_id: 'glass', weight: '2.5' },
      ],
    },
  ]);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0][0], 'Added to your cart.');
  assert.equal(toasts[0][1].id, 'cart-saved');
  assert.equal(navigations.length, 0);
});
