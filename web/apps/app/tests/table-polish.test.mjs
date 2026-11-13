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

test('page content fills the screen, with no width cap in the app shell', () => {
  const shell = source('components/shell/app-shell.tsx');
  assert.match(shell, /'w-full flex-1'/);
  assert.doesNotMatch(shell, /max-w-/);
});

test('the open chat row uses a neutral fill with a green bar, so its text stays readable', () => {
  const inbox = source('components/chat/inbox.tsx');
  assert.match(inbox, /'bg-muted shadow-\[inset_3px_0_0_var\(--primary\)\]'/);
  assert.doesNotMatch(inbox, /'bg-accent'/);
});
