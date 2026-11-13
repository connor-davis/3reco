import test from 'node:test';
import assert from 'node:assert/strict';
import { source, load } from './qa-round2-loader.mjs';

const callers = [
  'routes/collectors.tsx',
  'routes/stock.tsx',
  'routes/materials.tsx',
  'routes/admin/users.tsx',
  'routes/transactions/-components/record-list.tsx',
  'routes/market/-components/request-list.tsx',
];

test('DataTable and its callers have no sticky or shaded edge cells', () => {
  for (const path of ['components/data-table.tsx', ...callers]) {
    assert.doesNotMatch(source(path), /sticky|bg-muted(?!\/)/, path);
  }
});

test('every table ends in an actions menu that does not trigger the row', () => {
  for (const path of callers) {
    assert.match(source(path), /<RowActions/, path);
  }
  const menu = source('components/row-actions.tsx');
  assert.match(menu, /aria-label=\{`Actions for \$\{name\}`\}/);
  assert.match(menu, /size-9/);
  assert.match(menu, /stopPropagation/);
  assert.match(menu, /destructive/);
});

test('collector account numbers are masked to the last four digits', () => {
  const { maskAccount } = load('lib/format.ts');
  assert.equal(maskAccount('0000009382135958'), '•••• 5958');
  assert.equal(maskAccount(''), '');
  const page = source('routes/collectors.tsx');
  assert.match(page, /maskAccount\(collector\.bank_account_number/);
});

test('page content uses the wide max-w-screen-2xl cap in the app shell', () => {
  assert.match(
    source('components/shell/app-shell.tsx'),
    /mx-auto w-full max-w-screen-2xl/
  );
});
