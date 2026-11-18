import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import { load } from './qa-round2-loader.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));

test('saved-search client scopes reads and invalidates writes without sending an owner', () => {
  const calls = [];
  const api = load('lib/api/saved-searches.ts', {
    './favourites': { useCanSave: () => true },
    './resource': {
      useResource: (...args) => calls.push(args),
      useWrite: (...args) => calls.push(args),
      idPath: encodeURIComponent,
    },
  });
  api.useSaveSearch();
  assert.deepEqual(plain(calls.pop()), [
    '/saved-searches',
    'POST',
    [['saved-searches'], ['saved']],
  ]);
  api.useDeleteSearch();
  const [path, method, keys, body] = calls.pop();
  assert.equal(path('id/with space'), '/saved-searches/id%2Fwith%20space');
  assert.equal(method, 'DELETE');
  assert.deepEqual(plain(keys), [['saved-searches'], ['saved']]);
  assert.equal(body('id'), undefined);
});

test('save button sends exact current material and price filters, omitting text and distance', () => {
  const sent = [];
  let canSave = true;
  let pending = false;
  const { SaveSearch } = load('routes/market/-components/save-search.tsx', {
    'react/jsx-runtime': jsx,
    '@/components/ui/button': { Button: 'button' },
    '@/components/transactions/pager-state': { errorText: String },
    '@/lib/api/favourites': { useCanSave: () => canSave },
    '@/lib/api/saved-searches': {
      useSaveSearch: () => ({
        isPending: pending,
        mutate: (input) => sent.push(plain(input)),
      }),
    },
    './market-search': load('routes/market/-components/market-search.ts'),
  });
  const search = {
    material_id: 'glass',
    min_price: '7.0100',
    max_price: '9.9900',
    q: 'Cape Town',
    max_km: 25,
    cursor: 'old-page',
  };
  const button = (value) => SaveSearch({ search: value }).props.children[0];
  assert.equal(button(search).props.disabled, false);
  button(search).props.onClick();
  assert.deepEqual(sent, [
    { material_id: 'glass', min_price: '7.0100', max_price: '9.9900' },
  ]);
  button({ material_id: 'glass' }).props.onClick();
  assert.deepEqual(sent[1], {
    material_id: 'glass',
    min_price: '',
    max_price: '',
  });
  assert.equal(button({}).props.disabled, true);
  assert.equal(button({ ...search, min_price: '10' }).props.disabled, true);
  pending = true;
  assert.equal(button(search).props.disabled, true);
  canSave = false;
  assert.equal(SaveSearch({ search }), null);
});

test('saved-search live changes invalidate the personal searches and Saved caches', () => {
  const { keysFor } = load('lib/live/connection.ts');
  assert.deepEqual(plain(keysFor('saved_search', 'id')), [
    ['saved-searches'],
    ['saved'],
  ]);
  assert.deepEqual(plain(keysFor('notification', 'id')), [['notifications']]);
});
