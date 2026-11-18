import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));

test('live collector changes refresh the queue and the collector list', () => {
  const { keysFor } = load('lib/live/connection.ts');
  assert.deepEqual(plain(keysFor('collector_change')), [
    ['collector-changes'],
    ['collectors'],
  ]);
});

test('only admin and staff open the collector changes page', () => {
  const { canOpen } = load('lib/access.ts');
  assert.equal(canOpen('admin', 'collectorChanges'), true);
  assert.equal(canOpen('staff', 'collectorChanges'), true);
  assert.equal(canOpen('business', 'collectorChanges'), false);
  assert.equal(canOpen('collector', 'collectorChanges'), false);
  assert.match(source('lib/nav.ts'), /to: '\/collector-changes'/);
  assert.match(source('lib/nav.ts'), /'collector-changes': 'collectorChanges'/);
});

test('the dialog tells a non-creator that staff approve, then says it was sent', () => {
  const dialog = source('components/dialogs/collector-dialog.tsx');
  assert.match(dialog, /collector\?\.needs_approval/);
  assert.match(dialog, /Changes go to 3REco staff for approval\./);
  assert.match(dialog, /result\.pending \? 'Sent for approval\.'/);
});

test('a collector with a waiting change shows a Change pending badge', () => {
  const page = source('routes/collectors.tsx');
  assert.match(page, /row\.original\.pending_change/);
  assert.match(page, /Change pending/);
  assert.match(page, /Edits to others go to 3REco staff for approval/);
  assert.doesNotMatch(page, /You can edit the ones you added\./);
});

test('the queue page approves at once and asks for an optional reason to reject', () => {
  const page = source('routes/collector-changes.tsx');
  assert.match(page, /approve\.mutate\(change\.id/);
  assert.match(page, />\s*Approve\s*</);
  assert.match(page, /Reason \(optional\)/);
  assert.match(page, /reject\.mutate\(\s*\{ id: rejecting\.id, reason \}/);
});

test('the queue client posts to the staff routes with only the reason', () => {
  const calls = [];
  const client = load('lib/api/collector-changes.ts', {
    '@/lib/access': { isStaffRole: (role) => role === 'staff' },
    '@/lib/auth/use-auth': { useAuth: () => ({ user: { role: 'staff' } }) },
    './resource': {
      idPath: encodeURIComponent,
      useResource: (...args) => calls.push(args),
      useWrite: (...args) => calls.push(args),
    },
  });
  client.useCollectorChanges();
  assert.deepEqual(plain(calls.pop()), [
    ['collector-changes'],
    '/admin/collector-changes',
    true,
    true,
  ]);

  client.useApproveCollectorChange();
  const [approve, , , approveBody] = calls.pop();
  assert.equal(approve('a b'), '/admin/collector-changes/a%20b/approve');
  assert.deepEqual(plain(approveBody('a b')), {});

  client.useRejectCollectorChange();
  const [reject, , , rejectBody] = calls.pop();
  assert.equal(
    reject({ id: 'x', reason: 'no' }),
    '/admin/collector-changes/x/reject'
  );
  assert.deepEqual(plain(rejectBody({ id: 'x', reason: 'no' })), {
    reason: 'no',
  });
});
