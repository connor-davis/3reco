import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

function compile(path) {
  const { outputText } = ts.transpileModule(source(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    Intl,
    Date,
    require: () => ({}),
  });
  return exports;
}

test('formatDateTime prints the date and the South African time', () => {
  const { formatDateTime } = compile('lib/format.ts');
  assert.match(formatDateTime('2026-11-05T08:30:00Z'), /^0?5 Nov 2026, 10:30$/);
});

test('privacy events show a time, not just a day', () => {
  const users = source('routes/admin/users.tsx');
  assert.match(users, /formatDateTime\(row\.original\.created_at\)/);
  assert.match(users, /formatDateTime\(event\.created_at\)/);
});

test('counter offer checks the price as you type and blocks Send', () => {
  const dialog = source('components/dialogs/offer-dialog.tsx');
  assert.match(dialog, /Number\(value\) > 0/);
  assert.match(dialog, /Enter a price above R 0\.00\./);
  assert.match(dialog, /mode: 'onChange'/);
  assert.match(
    dialog,
    /disabled=\{offer\.isPending \|\| !form\.formState\.isValid\}/
  );
});

test('counter offer title and button agree', () => {
  const dialog = source('components/dialogs/offer-dialog.tsx');
  assert.match(dialog, /'Send counter offer'/);
  assert.doesNotMatch(dialog, /sm:grid-cols-2/);
});

test('a removed account is told apart from a sign-out', () => {
  const connection = source('lib/live/connection.ts');
  assert.match(connection, /accountRemovedReason = 'account-removed'/);
  assert.match(connection, /event\.reason === accountRemovedReason/);
  assert.match(source('lib/live/use-live.ts'), /endSession\(client, reason\)/);
  assert.match(source('lib/api/auth.ts'), /'ended' \| 'removed'/);
});

test('collectors search waits 150 ms; other pages keep the default', () => {
  assert.match(
    source('routes/collectors.tsx'),
    /useDebounced\(query\.trim\(\), 150\)/
  );
  assert.match(source('lib/use-debounced.ts'), /delay = 300/);
});
