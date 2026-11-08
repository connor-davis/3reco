import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const format = load('lib/format.ts');
const { quantityError, priceError } = load('lib/quantity.ts', {
  '@/lib/format': format,
});
const helpers = load('components/chat/helpers.ts', { '@/lib/format': format });
const access = load('lib/access.ts');

test('H1: only the seller may make the first offer on a pending request', () => {
  const request = {
    buyer: { id: 'b' },
    seller: { id: 's' },
    status: 'pending',
    offer_by: null,
  };
  assert.equal(helpers.canMakeOffer(request, 's'), true);
  assert.equal(helpers.canMakeOffer(request, 'b'), false);
  assert.match(source('components/chat/conversation.tsx'), /to make an offer/);
});

test('H2: an inbox row says "both sides" when both are waiting', () => {
  const thread = {
    buyer: { id: 'b', name: 'Greenline' },
    seller: { id: 's', name: 'Metro' },
    status: 'offered',
    offer_by: 's',
    offer_version: 2,
    buyer_confirmed_version: null,
    seller_confirmed_version: null,
  };
  assert.match(helpers.threadSummary(thread, 'b'), /Waiting for both sides$/);
  assert.match(
    helpers.threadSummary({ ...thread, buyer_confirmed_version: 2 }, 's'),
    /Waiting for you$/
  );
});

test('H3: the role gate writes the role as a label', () => {
  assert.equal(access.roleLabel('business'), 'Business');
  assert.doesNotMatch(source('components/access-guard.tsx'), /toLowerCase/);
});

test('S1/L1: a bad weight or price gets the right reason', () => {
  const above = 'Enter a weight above 0 kg.';
  assert.equal(quantityError('-1'), above);
  assert.equal(quantityError('-5'), above);
  assert.equal(quantityError('0'), above);
  assert.equal(quantityError('abc'), 'Enter a weight as a number, like 12.5.');
  assert.equal(quantityError(''), 'Enter a weight as a number, like 12.5.');
  assert.equal(quantityError('1.234'), 'Use up to 2 decimals.');
  assert.equal(quantityError('12.5'), null);
  assert.equal(priceError('-1'), 'Enter a price above R 0.00.');
  assert.equal(priceError('0'), 'Enter a price above R 0.00.');
  assert.equal(priceError('abc'), 'Enter a price as a number, like 22.80.');
  assert.equal(priceError('1.234'), 'Use up to 2 decimals.');
  assert.equal(priceError('22.5'), undefined);
});

test('S1: the stock form uses the shared rules', () => {
  const text = source('components/dialogs/stock-dialog.tsx');
  assert.match(text, /quantityError\(value\)/);
  assert.match(text, /priceError\(value\)/);
});

test('S2: the deal panel hides "held" at zero', () => {
  assert.match(
    source('components/chat/deal-aside.tsx'),
    /toGrams\(listing\.data\.held_weight\) > 0/
  );
});

test('S3: each incoming row is one link to the chat', () => {
  const text = source('routes/market/-components/request-list.tsx');
  assert.match(text, /<Link\s+to="\/market\/\$requestId"/);
  assert.doesNotMatch(text, /Open chat/);
});

test('S4: adding an account has its own heading', () => {
  const text = source('routes/sign-in.tsx');
  assert.match(
    text,
    /addingAccount\s*\? 'Add another account\.'[\s\S]*: 'Welcome back\.'/
  );
});

test('S7: stock Edit and Remove names carry weight and price', () => {
  const text = source('routes/stock.tsx');
  assert.match(
    text,
    /formatKg\(item\.weight\)\} at \$\{formatRate\(item\.price\)/
  );
  assert.match(text, /Edit \$\{lot\}/);
  assert.match(text, /Remove \$\{lot\}/);
});

test('A1: staff see their own Collections subtitle', () => {
  const text = source('routes/collections.tsx');
  assert.match(text, /canRecord\s*\? 'Record materials bought/);
  assert.match(text, /: 'Review collections across the marketplace/);
});
