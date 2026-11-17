import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { load, source } from './qa-round2-loader.mjs';

function client(user) {
  return load('lib/api/stats.ts', {
    '@tanstack/react-query': { useQuery: (options) => options },
    './resource': { useResource: () => ({}) },
    '../auth/use-auth': { useAuth: () => ({ user }) },
    './client': { api: (path, options) => ({ path, options }) },
  });
}

test('seller stats key follows both account and active business and refreshes on navigation', () => {
  for (const user of [
    null,
    { role: 'collector' },
    { role: 'guest' },
    { role: 'admin' },
  ]) {
    assert.equal(client(user).useSellerStats().enabled, false);
  }
  for (const business_role of ['owner', 'manager', 'member']) {
    const query = client({
      id: 'person',
      active_business_id: 'seller',
      business_role,
    }).useSellerStats();
    assert.equal(query.enabled, true);
    assert.deepEqual(Array.from(query.queryKey), [
      'seller-stats',
      'seller',
      'person',
    ]);
    assert.equal(query.queryFn({}).path, '/stats/seller');
    assert.equal(query.refetchOnMount, 'always');
    assert.equal(query.refetchInterval, undefined);
  }
});

const tags = (names) => Object.fromEntries(names.map((name) => [name, 'div']));
const { ApiError } = load('lib/api/client.ts');
const { DataState } = load('components/data-state.tsx', {
  '@/components/ui/alert': tags(['Alert', 'AlertDescription', 'AlertTitle']),
  '@/components/ui/button': { Button: 'button' },
  '@/components/ui/empty': tags([
    'Empty',
    'EmptyContent',
    'EmptyDescription',
    'EmptyHeader',
    'EmptyMedia',
    'EmptyTitle',
  ]),
  '@/components/ui/skeleton': { Skeleton: 'div' },
  '@/lib/api/client': { ApiError },
});

function panel(query) {
  const { SellerStatsPanel } = load('routes/-dashboard/seller-stats.tsx', {
    '@/components/data-state': { DataState },
    '@/components/panel': {
      Panel: ({ title, children }) =>
        createElement('section', { 'aria-label': title }, children),
    },
    '@/lib/api/stats': { useSellerStats: () => ({ refetch() {}, ...query }) },
    '@/lib/format': {
      plural: (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`,
    },
  });
  return renderToStaticMarkup(SellerStatsPanel());
}

const empty = {
  views: { days_7: 0, days_30: 0, lifetime: 0 },
  listings: [],
  replies: { requests: 0, within_day: 0 },
};

test('listing panel has loading, retry and empty states independent of settled trades', () => {
  assert.match(panel({ isPending: true }), /Loading listing views/);
  const failed = panel({ isError: true });
  assert.match(failed, /couldn&#x27;t load/);
  assert.match(failed, /Try again/);
  const html = panel({ data: empty });
  assert.match(html, /No listing views in the last 30 days yet/);
  assert.match(html, /No requests received in the last 90 days yet/);
  for (const label of ['Last 7 days', 'Last 30 days', 'Lifetime'])
    assert.ok(html.includes(label));
  assert.match(
    source('routes/index.tsx'),
    /<\/DataState>[\s\S]*<SellerStatsPanel/
  );
});

test('panel shows totals, five ranked listings and own reply counts in plain words', () => {
  const html = panel({
    data: {
      views: { days_7: 17, days_30: 31, lifetime: 105 },
      replies: { requests: 6, within_day: 4 },
      listings: Array.from({ length: 7 }, (_, i) => ({
        id: String(i),
        material_name: `Material ${i}`,
        is_listed: i !== 0,
        views: { days_7: 1, days_30: 7 - i, lifetime: 10 },
      })),
    },
  });
  assert.match(html, /You replied within a day to 4 of 6 requests/);
  assert.match(html, /Material 0 \(unlisted\)/);
  assert.match(html, /Material 4/);
  assert.doesNotMatch(html, /Material 5/);
  assert.match(html, />105</);
});

test('reply badge only renders the public boolean on both seller surfaces', () => {
  const { ReplySpeedBadge } = load('components/badges.tsx', {
    '@/components/ui/alert': tags(['Alert', 'AlertDescription']),
    '@/components/ui/badge': {
      Badge: ({ children }) => createElement('span', null, children),
    },
    '@/components/ui/popover': tags([
      'Popover',
      'PopoverContent',
      'PopoverTrigger',
    ]),
    '@/lib/auth/use-auth': { useAuth: () => ({}) },
    '@/lib/utils': { cn: (...values) => values.join(' ') },
    '@/lib/request-status': { requestStatuses: {}, statusTint: () => 'mint' },
    '@/lib/trade-type': { tradeTypeLabel: () => '' },
  });
  assert.equal(ReplySpeedBadge({ usuallyWithinDay: false }), null);
  assert.equal(ReplySpeedBadge({}), null);
  assert.match(
    renderToStaticMarkup(ReplySpeedBadge({ usuallyWithinDay: true })),
    /Usually replies within 1 day/
  );
  for (const route of ['listing/$listingId.tsx', 'store/$sellerId.tsx']) {
    assert.match(
      source(`routes/market/${route}`),
      /<ReplySpeedBadge[\s\S]*usually_replies_within_day/
    );
  }
});

test('existing request and stock hub events refresh private seller stats', () => {
  const { keysFor } = load('lib/live/connection.ts');
  for (const kind of ['request', 'stock']) {
    assert.ok(keysFor(kind).some((key) => key[0] === 'seller-stats'));
  }
});
