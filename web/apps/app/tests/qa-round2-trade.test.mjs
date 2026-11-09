import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dialog = source('../src/components/dialogs/record-dialogs.tsx');
const list = source('../src/routes/transactions/-components/record-list.tsx');

test('the collector sees Download invoice and the receipts, never an upload', () => {
  assert.doesNotMatch(dialog, /readOnly/);
  assert.match(dialog, /Download invoice/);
  assert.match(dialog, /aria-label="Receipts"/);
  // The buyer, business seller, admins and staff may add a receipt.
  assert.match(dialog, /user\.role === 'admin'/);
  assert.match(dialog, /user\.role === 'staff'/);
  assert.match(dialog, /shown\.buyer\.id === user\.id/);
  assert.match(
    dialog,
    /shown\.type === 'b2b' && shown\.seller\.id === user\.id/
  );
  assert.match(dialog, /canUpload && shown\.receipts\.length < maxReceipts/);
});

test('the sales page no longer hides the detail from collectors', () => {
  assert.doesNotMatch(list, /useTransaction\(readOnly/);
  assert.doesNotMatch(list, /readOnly=\{readOnly\}/);
});
