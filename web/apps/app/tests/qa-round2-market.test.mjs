import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const requests = source('../src/routes/market/-components/request-list.tsx');
const listing = source('../src/routes/market/listing/$listingId.tsx');
const cart = source('../src/routes/cart.tsx');

test('a closed request does not say "Awaiting offer"', () => {
  assert.match(
    requests,
    /isClosed\(request\)\s*\?\s*'Closed'\s*:\s*'Awaiting offer'/
  );
});

test('incoming rows show kg and price', () => {
  assert.match(
    requests,
    /direction === 'incoming' && <Terms request=\{request\} \/>/
  );
  assert.match(
    requests,
    /\$\{formatKg\(weight\)\} at \$\{formatRate\(price\)\}/
  );
});

test('your own lot has no quantity form or validation', () => {
  assert.match(listing, /\{!own && \(\s*<>\s*<DecimalField/);
  assert.match(listing, /This is your own lot\. Edit it from Stock\./);
});

test('an empty cart shows one empty state with a button', () => {
  assert.match(cart, /emptyTitle="Your cart is empty"/);
  assert.match(cart, /emptyText="Browse materials to add some\."/);
  assert.match(
    cart,
    /emptyAction=\{<LinkButton to="\/market">Browse materials/
  );
});
