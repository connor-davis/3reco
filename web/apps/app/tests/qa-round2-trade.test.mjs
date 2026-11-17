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

test('invoice details lead with download, summary and totals before collapsible receipts', () => {
  const header = dialog.slice(
    dialog.indexOf('<header'),
    dialog.indexOf('</header>')
  );
  assert.match(header, /<Button[\s\S]*Download invoice/);
  assert.equal((header.match(/Download invoice/g) ?? []).length, 1);
  assert.ok(
    dialog.indexOf('title="Summary"') < dialog.indexOf('title="Items"')
  );
  assert.ok(dialog.indexOf('title="Items"') < dialog.indexOf('<details'));
  assert.match(
    dialog,
    /<details key=\{shown.id\} open=\{shown.receipts.length > 0\}/
  );
  assert.match(dialog, /<summary[\s\S]*Receipts \(\{shown.receipts.length\}\)/);
});
