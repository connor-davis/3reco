import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './qa-round2-loader.mjs';

test('qa-round18 L1 (round 21): Trading partners sizes to content with its summary under the list', () => {
  const panels = source('routes/-dashboard/panels.tsx');
  assert.doesNotMatch(panels, /h-full/);
  assert.match(panels, /mt-auto flex flex-wrap/);
  // Exact: integer cents and counts summed from the same rows the list shows.
  assert.match(panels, /sum \+ toCents\(party\.value\)/);
  assert.match(panels, /sum \+ party\.count/);
  assert.match(panels, /View all trades/);
  // Admin rows list a trade under both partners, so they are never summed.
  assert.match(panels, /platformTotals\?\.count \?\?/);
  assert.match(
    source('routes/index.tsx'),
    /platformTotals=\{staff \? dashboard\.totals : undefined\}/
  );
  assert.match(
    source('routes/index.tsx'),
    /tradesTo=\{collector \? '\/transactions\/sales' : '\/transactions'\}/
  );
});

test('qa-round18 H1: Collector header sorts on the server and says so to assistive tech', () => {
  const page = source('routes/collectors.tsx');
  assert.match(
    page,
    /serverSort=\{\{ id: 'name', desc, onChange: setDesc \}\}/
  );
  assert.match(page, /order: desc \? 'desc' : undefined/);
  assert.match(page, /Sorted Z to A/);

  const table = source('components/data-table.tsx');
  assert.match(table, /manualSorting: !!serverSort/);
  assert.match(table, /aria-sort=/);
  assert.match(table, /'ascending'/);
  assert.match(table, /'descending'/);
  assert.match(source('lib/api/paging.ts'), /order\?: string/);
});
