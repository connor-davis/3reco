import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activity = readFileSync(
  new URL('../src/routes/admin/activity.tsx', import.meta.url),
  'utf8'
);

// Native date inputs render as blank boxes with no label on Android, so the
// activity log uses the shared picker like every other filter sheet.
test('activity log filters dates with the shared range picker', () => {
  assert.doesNotMatch(activity, /type="date"/);
  assert.match(activity, /<DateRangePicker/);
  assert.match(activity, /placeholder="From – to date"/);
  assert.match(activity, /format\(range\.from, 'yyyy-MM-dd'\)/);
  assert.match(activity, /format\(range\.to, 'yyyy-MM-dd'\)/);
});
