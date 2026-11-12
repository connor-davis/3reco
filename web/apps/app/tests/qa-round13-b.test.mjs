import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import { z } from 'zod';
import * as jsx from 'react/jsx-runtime';
import { load, source } from './qa-round2-loader.mjs';

const format = load('lib/format.ts', {});
const quantity = load('lib/quantity.ts', { '@/lib/format': format });

function collectionSchema() {
  const { outputText } = ts.transpileModule(
    source('components/dialogs/collection-dialog.tsx') +
      '\nexports.schema = schema;',
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }
  );
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (id) => {
      if (id === 'zod') return { z };
      if (id === '@/lib/format') return format;
      if (id === '@/lib/quantity') return quantity;
      if (id === '@/lib/limits') return load('lib/limits.ts');
      return {};
    },
  });
  return exports.schema;
}

const messages = (lines) =>
  collectionSchema()
    .safeParse({ collector_id: 'c', collection_day: '2020-01-01', lines })
    .error.issues.map((issue) => issue.message);
const TOTAL = 'The total must be at least R 0.01.';

test('C2: bad numbers show their own error and not the total error', () => {
  for (const price of ['abc', '-1']) {
    const found = messages([{ material_id: 'm', weight: '1', price }]);
    assert.ok(found.length > 0);
    assert.ok(!found.includes(TOTAL), `${price}: ${found}`);
  }
});

test('C2: a real R 0.00 total still shows the total error', () => {
  const found = messages([{ material_id: 'm', weight: '0.01', price: '0.10' }]);
  assert.deepEqual(found, [TOTAL]);
});

test('B3: Add account sends the add and redirect search', () => {
  const text = source('routes/profile/-components/sessions-panel.tsx');
  assert.match(
    text,
    /to: '\/sign-in',\s*search: \{ add: true, redirect: location\.href \}/
  );
});

test('B4b: store page cards hide the seller, market cards keep it', () => {
  const { ListingCard } = load('components/listing-card.tsx', {
    react: { useState: () => [undefined, () => {}] },
    '@/components/visuals': { PersonAvatar: 'avatar' },
    'react/jsx-runtime': jsx,
    '@tanstack/react-router': { Link: 'a' },
    'lucide-react': { Package: 'svg' },
    '@/components/ui/card': { Card: 'div', CardContent: 'div' },
    '@/components/badges': { BusinessName: ({ name }) => name },
    '@/lib/format': format,
  });
  const listing = {
    id: 'l',
    weight: '1',
    price: '2',
    seller_id: 's',
    seller_name: 'Green Co',
    material_name: 'Glass',
  };
  const words = (node) => JSON.stringify(node);
  assert.match(words(ListingCard({ listing })), /Green Co/);
  assert.doesNotMatch(
    words(ListingCard({ listing, showSeller: false })),
    /Green Co/
  );
  assert.match(
    source('routes/market/store/$sellerId.tsx'),
    /<ListingCard[^>]*showSeller=\{false\}/
  );
});

test('A1: the setup wizard is keyed by role', () => {
  assert.match(
    source('routes/setup.tsx'),
    /<Wizard\s+key=\{guest \? 'guest' : user\.role\}/
  );
});

test('S3: bell action row is left aligned', () => {
  const text = source('components/shell/notification-tray-list.tsx');
  assert.doesNotMatch(text, /justify-end/);
  assert.match(text, /<ItemActions className="w-full flex-wrap justify-start/);
});
