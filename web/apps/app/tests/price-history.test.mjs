import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { load, source } from './qa-round2-loader.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));

function client(user) {
  return load('lib/api/price-history.ts', {
    '@tanstack/react-query': { useQuery: (options) => options },
    '../auth/use-auth': { useAuth: () => ({ user }) },
    './client': { api: (path, options) => ({ path, options }) },
    './resource': { idPath: encodeURIComponent },
  });
}

test('price history client gates roles, encodes material and uses a fixed cache key', () => {
  for (const user of [null, { role: 'guest' }, { role: 'collector' }]) {
    assert.equal(client(user).usePriceHistory('glass').enabled, false);
  }
  for (const user of [
    { role: 'business', active_business_id: 'store', business_role: 'member' },
    { role: 'admin' },
    { role: 'staff' },
  ]) {
    const api = client(user);
    const query = api.usePriceHistory('a/b c');
    assert.equal(query.enabled, true);
    assert.deepEqual(plain(query.queryKey), ['price-history', 'a/b c']);
    assert.equal(query.staleTime, 300000);
    assert.equal(query.queryFn({}).path, '/materials/a%2Fb%20c/price-history');
    assert.equal(api.usePriceHistory('').enabled, false);
  }
});

function chart(query, allowed = true) {
  const tags = (names) =>
    Object.fromEntries(names.map((name) => [name, 'div']));
  return load('routes/market/-components/price-history.tsx', {
    recharts: tags(['CartesianGrid', 'Line', 'LineChart', 'XAxis', 'YAxis']),
    '@/components/ui/card': tags([
      'Card',
      'CardContent',
      'CardDescription',
      'CardHeader',
      'CardTitle',
    ]),
    '@/components/ui/chart': tags([
      'ChartContainer',
      'ChartTooltip',
      'ChartTooltipContent',
    ]),
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/skeleton': { Skeleton: 'div' },
    '@/lib/api/price-history': {
      useCanSeePrices: () => allowed,
      usePriceHistory: () => query,
    },
    '@/lib/format': { formatDate: (day) => day },
  });
}

test('price trend shows the specified empty state and stays hidden without permission or a material', () => {
  const query = {
    data: {
      weeks: [
        { period: '2026-11-16', avg_price: null, status: 'not_enough_deals' },
      ],
    },
  };
  const { PriceHistory } = chart(query);
  assert.match(
    renderToStaticMarkup(PriceHistory({ materialId: 'glass' })),
    /Not enough deals yet to show a price\./
  );
  assert.equal(PriceHistory({}), null);
  assert.equal(chart(query, false).PriceHistory({ materialId: 'glass' }), null);
});

test('exact strings survive chart conversion and suppressed weeks remain gaps', () => {
  const weeks = [
    { period: '2026-11-02', avg_price: '123456789.01', status: 'available' },
    { period: '2026-11-09', avg_price: null, status: 'not_enough_deals' },
    { period: '2026-11-16', avg_price: '6.00', status: 'available' },
  ];
  const { pricePoints } = chart({});
  const points = pricePoints(weeks);
  assert.equal(points[0].avg_price, '123456789.01');
  assert.equal(points[1].price, null);
  assert.equal(points[2].avg_price, '6.00');
  assert.equal(points[2].price, 6);
  assert.match(
    source('routes/market/-components/price-history.tsx'),
    /connectNulls=\{false\}/
  );
  assert.match(
    source('routes/market/-components/price-history.tsx'),
    /item\.payload\.avg_price/
  );
});

test('price trend has loading and recoverable error states', () => {
  assert.match(
    renderToStaticMarkup(
      chart({ isPending: true }).PriceHistory({ materialId: 'glass' })
    ),
    /Loading price trend/
  );
  const html = renderToStaticMarkup(
    chart({ isError: true }).PriceHistory({ materialId: 'glass' })
  );
  assert.match(html, /Price trends could not be loaded/);
  assert.match(html, /Try again/);
});

test('transaction live changes invalidate the aggregate', () => {
  const { keysFor } = load('lib/live/connection.ts');
  assert.ok(keysFor('transaction').some((key) => key[0] === 'price-history'));
});
