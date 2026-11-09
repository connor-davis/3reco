import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const format = load('lib/format.ts');
const helpers = load('components/chat/helpers.ts', { '@/lib/format': format });

test('CO₂e always shows 2 decimals, and market and About drop "saved"', () => {
  assert.equal(format.formatKgFixed(242.5), '242.50');
  assert.equal(format.formatKgFixed('1398.28'), '1 398.28');
  assert.doesNotMatch(source('routes/market/index.tsx'), /co2_kg\)\} saved/);
  assert.doesNotMatch(source('routes/about.tsx'), /saved/);
});

test('the store link has no possessive', () => {
  assert.doesNotMatch(source('components/chat/deal-aside.tsx'), /’s store/);
});

test('collections export says one row per collection', () => {
  assert.match(
    source('routes/transactions/-components/record-list.tsx'),
    /collectionsOnly \? 'One row per collection'/
  );
});

test('request dialog title and hint', () => {
  const text = source('components/dialogs/new-message-dialog.tsx');
  assert.match(text, /title="Request this material"/);
  assert.doesNotMatch(text, /Start a conversation/);
  assert.match(text, /description=\{\s*problem/);
});

test('inbox row says who is waiting, "you" for the viewer', () => {
  const thread = {
    status: 'offered',
    offer_by: 'b',
    offer_version: 2,
    buyer: { id: 'b', name: 'Greenline' },
    seller: { id: 's', name: 'Metro' },
    buyer_confirmed_version: 2,
    seller_confirmed_version: 1,
  };
  assert.match(helpers.threadSummary(thread, 's'), /Waiting for you$/);
  assert.match(helpers.threadSummary(thread, 'b'), /Waiting for Metro$/);
});

test('collectors page says shared directory and has a no-match state', () => {
  const text = source('routes/collectors.tsx');
  assert.match(text, /A shared directory of collectors/);
  assert.match(text, /No matching collectors/);
  assert.match(text, /Clear search/);
  assert.match(text, /collector\.can_edit &&/);
});

test('stock dialog dedupes errors and starts neutral', () => {
  const text = source('components/dialogs/stock-dialog.tsx');
  assert.match(text, /Pick a material, then enter a weight and a price\./);
  assert.doesNotMatch(text, /firstPerField|disabledReason/);
  assert.match(text, /\{pristine &&/);
});

test('non-numeric prices say to enter a number', () => {
  // One shared rule now serves the offer, collection and stock dialogs.
  assert.match(
    source('lib/quantity.ts'),
    /Enter a price as a number, like 22\.80\./
  );
});

test('profile privacy card and read notices are muted', () => {
  assert.match(source('routes/profile/index.tsx'), /title="Privacy"/);
  assert.match(
    source('components/shell/notification-tray-list.tsx'),
    /notice\.read \? 'font-normal text-muted-foreground'/
  );
});
