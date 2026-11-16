import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, URLSearchParams, BigInt, Number });
  return exports;
}

const search = compile('../src/routes/market/-components/market-search.ts');
const paging = compile('../src/lib/api/paging.ts');

// The compiled code runs in its own realm, so compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

// The router writes the state into the URL and reads it back: simulate both.
function roundTrip(state) {
  const url = new URL('http://app.test/market' + paging.queryString(state));
  return plain(search.parseMarketSearch(Object.fromEntries(url.searchParams)));
}

test('every filter survives a trip through the URL', () => {
  const state = {
    q: 'glass',
    material_id: 'abc123',
    min_price: '2.50',
    max_price: '12',
    max_km: 50,
    cursor: 'next-page',
  };
  assert.deepEqual(roundTrip(state), state);
  // Prices stay exact text: no float turns 2.50 into 2.5.
  assert.equal(roundTrip(state).min_price, '2.50');
});

test('an empty state is an empty URL', () => {
  assert.equal(paging.queryString({}), '');
  assert.deepEqual(roundTrip({}), {});
});

test('a shared link with bad values still opens, minus the bad parts', () => {
  const parsed = search.parseMarketSearch({
    q: 'pet',
    min_price: 'abc',
    max_price: '1e3',
    max_km: '30',
    material_id: 42,
  });
  assert.deepEqual(plain(parsed), { q: 'pet' });
  assert.deepEqual(plain(search.parseMarketSearch({ max_km: '25' })), {
    max_km: 25,
  });
});

test('only the four distance presets are kept', () => {
  assert.deepEqual(plain(search.DISTANCES), [10, 25, 50, 100]);
  for (const km of [10, 25, 50, 100]) {
    assert.equal(search.parseMarketSearch({ max_km: String(km) }).max_km, km);
  }
  for (const km of ['0', '-10', '1000', '5.5', 'far']) {
    assert.equal(search.parseMarketSearch({ max_km: km }).max_km, undefined);
  }
});

test('changing a filter drops the page cursor and keeps the rest', () => {
  const next = search.changeFilter(
    { q: 'glass', cursor: 'page-2', max_km: 25 },
    { material_id: 'm1' }
  );
  assert.deepEqual(plain(next), { q: 'glass', max_km: 25, material_id: 'm1' });
  // Clearing a filter removes its key from the URL.
  const cleared = search.changeFilter(next, { max_km: undefined });
  assert.deepEqual(plain(cleared), { q: 'glass', material_id: 'm1' });
  assert.equal(paging.queryString(cleared), '?q=glass&material_id=m1');
});

test('price range errors match what the server refuses', () => {
  assert.equal(search.priceRangeError('', ''), '');
  assert.equal(search.priceRangeError('3', '3'), '');
  assert.equal(search.priceRangeError('3.00', '3'), '');
  assert.match(search.priceRangeError('5', '4.9999'), /above/);
  assert.match(search.priceRangeError('1e3', ''), /price/);
  assert.equal(search.validPrice('12.50'), true);
  assert.equal(search.validPrice('12.'), false);
  assert.equal(search.validPrice('-1'), false);
});
