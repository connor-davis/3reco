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
    '@/components/responsive-overlay': { ResponsiveOverlay: () => null },
    '@/components/ui/chart': tags([
      'ChartContainer',
      'ChartTooltip',
      'ChartTooltipContent',
    ]),
    '@/components/ui/button': { Button: 'button' },
    '@/lib/api/price-history': {
      useCanSeePrices: () => allowed,
      usePriceHistory: () => query,
    },
    '@/lib/format': { formatDate: (day) => day },
  });
}

test('the trend line shows the latest priced week and nothing without a price, permission or material', () => {
  const weeks = [
    { period: '2026-11-02', avg_price: '19.50', status: 'available' },
    { period: '2026-11-09', avg_price: '22.40', status: 'available' },
    { period: '2026-11-16', avg_price: null, status: 'not_enough_deals' },
  ];
  const { PriceHistory, latestPrice, pricePoints } = chart({ data: { weeks } });
  assert.equal(latestPrice(pricePoints(weeks)).avg_price, '22.40');
  const html = renderToStaticMarkup(PriceHistory({ materialId: 'glass' }));
  assert.match(html, /Avg R 22\.40\/kg, week of/);
  assert.match(html, /See trend/);
  assert.doesNotMatch(html, /Not enough deals/);

  const empty = chart({
    data: {
      weeks: [
        { period: '2026-11-16', avg_price: null, status: 'not_enough_deals' },
      ],
    },
  });
  assert.equal(
    renderToStaticMarkup(empty.PriceHistory({ materialId: 'glass' })),
    ''
  );
  assert.equal(PriceHistory({}), null);
  assert.equal(
    chart({ data: { weeks } }, false).PriceHistory({ materialId: 'glass' }),
    null
  );
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

test('the trend line stays out of the page while loading or after an error', () => {
  for (const state of [{ isPending: true }, { isError: true }]) {
    assert.equal(
      renderToStaticMarkup(chart(state).PriceHistory({ materialId: 'glass' })),
      ''
    );
  }
});
