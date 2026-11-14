import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './qa-round2-loader.mjs';

const dialog = source('components/dialogs/collector-dialog.tsx');
const page = source('routes/collectors.tsx');
const types = source('lib/api/types.ts');
const live = source('lib/live/connection.ts');

test('the server flag decides who edits payout, not the role name', () => {
  assert.match(types, /can_edit_payout: boolean/);
  assert.match(
    dialog,
    /payoutReadOnly = !!collector && !collector\.can_edit_payout/
  );
  assert.doesNotMatch(dialog, /user\?\.role === 'staff'/);
  assert.match(dialog, /disabled=\{payoutReadOnly\}/);
});

test('a shared row is editable when the server says so, with no payout flag needed', () => {
  assert.match(page, /collector\.can_edit\s*\? \[\{ label: 'Edit'/);
  assert.match(page, /collector\.can_edit \? \(\) => openForm\(collector\)/);
});

test('a refused payout change shows the API message in the dialog', () => {
  assert.match(dialog, /setServerError\(/);
});

test('collector changes reach every open page over the live socket', () => {
  assert.match(live, /case 'collector':\s*return \[\['collectors'\]\]/);
  assert.match(live, /\['business'\],\s*\['collectors'\]/);
});
