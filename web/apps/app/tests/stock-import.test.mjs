import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dialog = source('../src/components/dialogs/stock-import-dialog.tsx');
const page = source('../src/routes/stock.tsx');
const api = source('../src/lib/api/stock.ts');
const access = source('../src/lib/access.ts');

test('only owners and managers see Import CSV', () => {
  assert.match(page, /canImportStock\(user\) && \(/);
  assert.match(page, /Import CSV/);
  assert.match(access, /export function canImportStock/);
  assert.match(access, /return canSeeTeam\(user\)/);
});

test('upload state explains the columns and offers a sample', () => {
  for (const word of ['material', 'weight_kg', 'price_per_kg', 'listed']) {
    assert.match(dialog, new RegExp(`<strong[^>]*>${word}</strong>`));
  }
  assert.match(dialog, /download="stock-sample\.csv"/);
  assert.match(dialog, /Up to 500 lines and 1 MB per file/);
  assert.match(dialog, /type="file"/);
});

test('publish stays off while any line has an error or an edit is unchecked', () => {
  assert.match(
    dialog,
    /const canPublish = !!lines && !problems\?\.length && !stale && !busy/
  );
  assert.match(dialog, /<Button disabled=\{!canPublish\} onClick=\{publish\}>/);
});

test('each cell can be fixed in place and is checked again on leaving it', () => {
  assert.match(dialog, /onChange=\{\(event\) =>/);
  assert.match(dialog, /onBlur=\{recheck\}/);
  assert.match(dialog, /aria-invalid=\{!!message\}/);
  assert.match(dialog, /preview\.mutate\(lines\.map\(cells\)/);
});

test('errors are written under the cell, not shown by colour alone', () => {
  assert.match(dialog, /\{message && \(/);
  assert.match(dialog, /text-destructive/);
});

test('the table scrolls inside the dialog, not the page', () => {
  assert.match(dialog, /min-w-0 max-w-full/);
  assert.match(dialog, /min-w-\[52rem\]/);
});

test('a refused publish shows the marked lines again', () => {
  assert.match(dialog, /failure\.details as \{ rows\?: StockImportLine\[\]/);
  assert.match(dialog, /if \(marked\) show\(\{ rows: marked \}\)/);
});

test('hooks refresh stock and dashboards after publishing', () => {
  assert.match(api, /'\/stock\/import\/commit'/);
  assert.match(api, /\[\['stock'\], \['dashboards'\]/);
  assert.match(api, /'\/stock\/import\/preview'/);
});
