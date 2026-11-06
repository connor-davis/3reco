import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dialog = source('../src/components/dialogs/stock-dialog.tsx');
const page = source('../src/routes/stock.tsx');

test('an error on a field shows once, with no second banner', () => {
  assert.match(dialog, /if \(!named\.length\) setServerError/);
});

test('Add stock shows the base price once a material is picked', () => {
  assert.match(dialog, /const base = stock\?\.base_price \?\? chosen\?\.price/);
  assert.match(dialog, /At least \$\{formatRate\(base\)\}/);
});

test('one figure when nothing is held', () => {
  assert.match(page, /held === null \? \(/);
  assert.match(page, /in stock<\/span>/);
});
