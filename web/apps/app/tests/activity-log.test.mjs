import test from 'node:test';
import assert from 'node:assert/strict';
import { source, load } from './qa-round2-loader.mjs';

test('only an admin can open the activity log', () => {
  const { canOpen } = load('lib/access.ts');
  assert.equal(canOpen('admin', 'activity'), true);
  for (const role of ['staff', 'business', 'collector', 'guest', null]) {
    assert.equal(canOpen(role, 'activity'), false, String(role));
  }
});

test('the activity log is in the admin Workspace nav and guarded', () => {
  const nav = source('lib/nav.ts');
  assert.match(nav, /label: 'Activity log', to: '\/admin\/activity'/);
  assert.match(nav, /'admin\/activity': 'activity'/);
  assert.match(nav, /return 'Activity log'/);
});

test('the activity page lists who, what and the changed fields', () => {
  const page = source('routes/admin/activity.tsx');
  assert.match(page, /<Guarded page="activity">/);
  assert.match(page, /useActivity\(pager\.params\)/);
  for (const header of ['When', 'Who', 'What', 'Record', 'Changes']) {
    assert.match(page, new RegExp(`header: '${header}'`), header);
  }
  // Plain words, an old to new arrow, and the full list in an overlay.
  assert.match(page, /insert: 'added'/);
  assert.match(page, /edited/);
  assert.match(page, /removed/);
  assert.match(page, /→/);
  assert.match(page, /<ResponsiveOverlay/);
  assert.match(page, /<ListRow/);
  assert.match(page, /<DataState/);
  assert.match(page, /<Pager /);
  assert.match(page, /'System'/);
});
