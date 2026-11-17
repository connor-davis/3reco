import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const access = load('lib/access.ts');
const { tabsFor, hidesTabs } = load('lib/nav.ts', { '@/lib/access': access });
const { activeFilterCount } = load(
  'routes/market/-components/market-search.ts'
);

const raised = (role, hasStock) =>
  tabsFor(role, hasStock).filter((tab) => tab.raised);

test('only a business that holds stock gets the raised Add stock tab', () => {
  const [add] = raised('business', true);
  assert.equal(add.label, 'Add stock');
  assert.equal(add.to, '/stock');
  assert.equal(add.search.new, true);
  assert.equal(raised('business', false).length, 0);
  assert.deepEqual(
    Array.from(tabsFor('business', false), (tab) => tab.label),
    ['Home', 'Search', 'Messages', 'Account']
  );
  for (const role of ['admin', 'staff', 'collector', 'guest', null]) {
    assert.equal(raised(role, true).length, 0, String(role));
  }
});

test('tabs step aside for a listing and a chat thread, not for lists', () => {
  for (const path of ['/market/listing/x', '/messages/x', '/market/req1']) {
    assert.equal(hidesTabs(path), true, path);
  }
  for (const path of [
    '/messages',
    '/market',
    '/market/listing',
    '/market/store/x',
    '/',
    '/stock',
  ]) {
    assert.equal(hidesTabs(path), false, path);
  }
});

test('the Filters count covers material, prices and distance, not the search text', () => {
  assert.equal(activeFilterCount({ q: 'glass' }), 0);
  assert.equal(
    activeFilterCount({
      q: 'glass',
      material_id: 'glass',
      min_price: '1',
      max_price: '2',
      max_km: 25,
    }),
    4
  );
});

test('the market page has no impact banner; sort is in the first row, or the sheet on a phone', () => {
  const page = source('routes/market/index.tsx');
  assert.doesNotMatch(page, /Community impact|useStats/);
  assert.match(page, /sheetOnDesktop/);
  assert.match(page, /action=\{phone \? undefined : sortControl\}/);
  assert.match(page, /<FilterField label="Sort by">\{sortControl\}/);
  assert.match(page, /variant="header"/);
});

test('a card without a photo is short, one with a photo keeps its 4:3 box', () => {
  const card = source('components/listing-card.tsx');
  assert.match(card, /hasPhoto \? 'aspect-\[4\/3\]' : 'h-\[120px\]'/);
  assert.match(card, /bg-muted text-muted-foreground/);
});

test('the new market pieces use theme tokens, not fixed colours', () => {
  for (const path of [
    'routes/market/-components/price-history.tsx',
    'routes/market/-components/save-search.tsx',
    'components/listing-card.tsx',
  ]) {
    assert.doesNotMatch(
      source(path),
      /#[0-9a-fA-F]{3,6}\b|rgb\(|bg-white/,
      path
    );
  }
});
