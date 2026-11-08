import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './qa-round2-loader.mjs';

test('admin and staff rows never show a profile status', () => {
  const users = source('routes/admin/users.tsx');
  assert.match(
    users,
    /if \(user\.role === 'admin' \|\| user\.role === 'staff'\) return null;/
  );
  // Both the table cell and the phone card go through the one helper.
  assert.equal((users.match(/profileBadge\(/g) ?? []).length, 3);
  assert.equal((users.match(/'Incomplete'/g) ?? []).length, 1);
});

test('a full identifier view names the invoice', () => {
  const users = source('routes/admin/users.tsx');
  assert.match(users, /`\$\{label\} · invoice \$\{invoice\}`/);
});
