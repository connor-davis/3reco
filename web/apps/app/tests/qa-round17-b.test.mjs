import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './qa-round2-loader.mjs';

test('C6: icon button tooltips open below, clear of table headers', () => {
  assert.match(
    source('components/icon-button.tsx'),
    /<TooltipContent side="bottom">/
  );
});

test('C7: chart ticks are spaced evenly', () => {
  const chart = source('routes/-dashboard/impact-chart.tsx');
  assert.match(chart, /ticks=\{axisTicks\(/);
  assert.match(chart, /interval=\{0\}/);
  assert.match(chart, /minTickGap=\{32\}/);
});

test('C8: the record list has a footer count from the totals', () => {
  const list = source('routes/transactions/-components/record-list.tsx');
  assert.match(list, /plural\(totals\.data\.count, 'record'\)/);
  assert.match(
    list,
    /flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground/
  );
});

test('C9: the profile phone shows grouped and saves as digits', () => {
  const forms = source('routes/profile/-components/forms.tsx');
  assert.match(forms, /phone: formatPhone\(profile\.phone\)/);
  assert.ok(forms.includes(String.raw`values.phone.replace(/\s/g, '')`));
  assert.ok(
    source('routes/profile/-components/schemas.ts').includes(
      String.raw`value.replace(/\s/g, '')`
    )
  );
});

test('S1: the store owner sees owner copy on empty reviews', () => {
  const page = source('routes/market/store/$sellerId.tsx');
  assert.match(page, /user\?\.id === sellerId/);
  assert.match(page, /Your buyers' reviews will appear here/);
  assert.match(page, /'Be the first to review this store\.'/);
});

test('H1: an empty filter with no search has its own copy', () => {
  const inbox = source('components/chat/inbox.tsx');
  assert.match(inbox, /debouncedSearch\s*\? 'No matching conversations'/);
  assert.doesNotMatch(inbox, /debouncedSearch \|\| filter !== 'all'/);
  for (const text of [
    'No unread conversations',
    'No offers yet',
    'No finished trades yet',
  ])
    assert.ok(inbox.includes(text), text);
});

test('H2: "Choose a store" only shows while no store is chosen', () => {
  const cart = source('routes/cart.tsx');
  assert.match(cart, /sellerId\s*\? selectedCart\.isPending/);
  assert.match(cart, /selectedCart\.data\?\.items\.length/);
});
