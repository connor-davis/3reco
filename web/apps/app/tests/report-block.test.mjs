import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));

test('block events refresh discovery, old chats and the blocked list', () => {
  const { keysFor } = load('lib/live/connection.ts');
  for (const key of [
    'blocks',
    'listings',
    'stores',
    'wanted',
    'requests',
    'messages',
    'cart',
  ]) {
    assert.ok(
      keysFor('block').some((query) => query[0] === key),
      key
    );
  }
  assert.deepEqual(plain(keysFor('report')), []);
});

test('block client scopes the list to the active business and encodes targets', () => {
  const calls = [];
  const client = load('lib/api/blocks.ts', {
    '@/lib/auth/use-auth': {
      useAuth: () => ({ user: { active_business_id: 'business' } }),
    },
    '@/lib/live/connection': { keysFor: () => [['blocks'], ['listings']] },
    './resource': {
      idPath: encodeURIComponent,
      useResource: (...args) => calls.push(args),
      useWrite: (...args) => calls.push(args),
    },
  });
  client.useBlocks();
  assert.deepEqual(plain(calls.pop()), [
    ['blocks', 'business'],
    '/blocks',
    true,
    true,
  ]);
  for (const [hook, method] of [
    [client.useBlock, 'PUT'],
    [client.useUnblock, 'DELETE'],
  ]) {
    hook();
    const [path, verb, keys, body] = calls.pop();
    assert.equal(path('a/b'), '/blocks/a%2Fb');
    assert.equal(verb, method);
    assert.deepEqual(plain(keys), [['blocks'], ['listings']]);
    assert.equal(body('target'), undefined);
  }
});

test('admin report client is disabled for ordinary businesses', () => {
  const calls = [];
  let role = 'business';
  const client = load('lib/api/reports.ts', {
    '@/lib/auth/use-auth': { useAuth: () => ({ user: { role } }) },
    './resource': {
      idPath: encodeURIComponent,
      useResource: (...args) => calls.push(args),
      useWrite: (...args) => calls.push(args),
    },
  });
  client.useAdminReports();
  assert.equal(calls.pop()[3], false);
  role = 'admin';
  client.useAdminReports();
  assert.equal(calls.pop()[3], true);
  client.useResolveReport();
  const [path, method, , body] = calls.pop();
  assert.equal(path({ id: 'a/b' }), '/admin/reports/a%2Fb/resolve');
  assert.equal(method, 'POST');
  assert.deepEqual(plain(body({ id: 'private', action: 'dismiss' })), {
    action: 'dismiss',
  });
});

test('only admins can open reports from navigation or a direct route', () => {
  const { canOpen } = load('lib/access.ts');
  for (const role of ['business', 'staff', 'collector', 'guest', null]) {
    assert.equal(canOpen(role, 'reports'), false);
  }
  assert.equal(canOpen('admin', 'reports'), true);
  assert.match(source('routes/admin/reports.tsx'), /Guarded page="reports"/);
  assert.match(source('lib/nav.ts'), /'admin\/reports': 'reports'/);
});

test('profile Blocked tab is gated for managers and owners and confirms unblock', () => {
  const profile = source('routes/profile/index.tsx');
  const panel = source('routes/profile/-components/blocked-panel.tsx');
  assert.match(profile, /canSeeTeam\(user\)[\s\S]*TabsTrigger value="blocked"/);
  assert.match(profile, /TabsContent value="blocked"/);
  assert.match(profile, /People and businesses you blocked\./);
  assert.match(panel, /useBlocks\(\)/);
  assert.match(panel, /You have not blocked anyone\./);
  assert.match(panel, /ConfirmDialog[\s\S]*confirmLabel="Unblock"/);
  assert.match(panel, /unblock\.mutate\(selected\.party_id/);
});

test('report dialog has fixed reasons, private copy, a length check and pending state', () => {
  const dialog = source('components/dialogs/report-dialog.tsx');
  for (const reason of ['scam', 'wrong_info', 'offensive', 'spam', 'other']) {
    assert.ok(dialog.includes(`value: '${reason}'`));
  }
  assert.match(dialog, /ResponsiveOverlay/);
  assert.match(dialog, /length > 1000/);
  assert.match(dialog, /The business will not be told/);
  assert.match(dialog, /disabled=\{report\.isPending\}/);
  assert.match(dialog, /role="alert"/);
});

test('listing, store and team-aware chat expose shared report and block actions', () => {
  for (const path of [
    'routes/market/listing/$listingId.tsx',
    'routes/market/store/$sellerId.tsx',
    'components/chat/conversation.tsx',
  ]) {
    assert.match(source(path), /<ModerationActions/);
  }
  const menu = source('components/moderation-actions.tsx');
  assert.match(menu, /canSeeTeam\(user\)/);
  assert.match(menu, /RowActions/);
  assert.match(menu, /ConfirmDialog/);
  assert.match(menu, /blocked \? 'Unblock' : 'Block'/);
  assert.match(
    source('components/chat/conversation.tsx'),
    /user\?\.active_business_id \?\? user\?\.id/
  );
});

test('admin reports cover all outcomes and unsuspend with confirmation', () => {
  const admin = source('routes/admin/reports.tsx');
  for (const label of [
    'Dismiss report',
    'Remove listing',
    'Suspend business',
    'Unsuspend business',
  ]) {
    assert.ok(admin.includes(label));
  }
  assert.match(admin, /ConfirmDialog/);
  assert.match(admin, /DataState/);
  assert.match(admin, /report\.status === 'open'/);
  assert.match(admin, /report\.target_kind === 'listing'/);
  assert.match(admin, /unsuspend\.mutate\(selected\.report\.party_id/);
});
