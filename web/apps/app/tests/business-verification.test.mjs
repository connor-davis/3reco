import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('admin users page marks and changes business verification', () => {
  const page = read('../src/routes/admin/users.tsx');

  assert.match(page, /function verifiedBadge/);
  assert.match(page, /user\.role !== 'business'/);
  assert.match(page, /Verify business/);
  assert.match(page, /Remove verification/);
  // Desktop actions cell, phone row status and phone menu all use them.
  assert.match(page, /verifyButton\(row\.original\)/);
  assert.match(page, /verifiedBadge\(user\)/);
  assert.match(page, /onSelect: \(\) => setVerifying\(user\)/);
  assert.match(page, /toast\.error\(error\.message\)/);
});

test('verification call sends the flag and refreshes collectors', () => {
  const api = read('../src/lib/api/admin.ts');

  assert.match(api, /business-verification/);
  assert.match(api, /'PUT'/);
  assert.match(api, /\['collectors'\]/);
});

test('user events refresh the collector list', () => {
  const live = read('../src/lib/live/connection.ts');
  const user = live.slice(live.indexOf("case 'user':"));

  assert.match(
    user.slice(0, user.indexOf("case 'material'")),
    /\['collectors'\]/
  );
});

test('collectors page words differ for verified and unverified businesses', () => {
  const page = read('../src/routes/collectors.tsx');

  assert.match(
    page,
    /Every collector on 3REco\. Your business is verified, so you can see and edit them all\./
  );
  assert.match(
    page,
    /Ask an admin to verify your business to see and edit every collector\./
  );
  assert.match(page, /Verified business/);
  assert.match(read('../src/lib/api/types.ts'), /business_verified: boolean/);
});
