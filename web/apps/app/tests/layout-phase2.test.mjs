import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

test('DataTable owns one Panel, a wide table, transparent divided compact rows and keyboard row taps', () => {
  const original = { id: 'trade' };
  for (const compact of [false, true]) {
    const clicks = [];
    const { DataTable } = load('components/data-table.tsx', {
      react: { useState: () => [[], () => {}] },
      '@/components/panel': { Panel: 'Panel' },
      '@/components/ui/button': { Button: 'Button' },
      '@/components/ui/table': {
        Table: 'table',
        TableHeader: 'thead',
        TableBody: 'tbody',
        TableHead: 'th',
        TableCell: 'td',
        TableRow: 'tr',
      },
      '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
      '@/hooks/use-mobile': { useIsCompact: () => compact },
      '@tanstack/react-table': {
        useReactTable: () => ({
          getRowModel: () => ({
            rows: [{ id: '1', original, getVisibleCells: () => [] }],
          }),
          getHeaderGroups: () => [],
        }),
        getCoreRowModel() {},
        getSortedRowModel() {},
        flexRender() {},
      },
    });
    const tree = DataTable({
      fit: true,
      columns: [],
      data: [original],
      renderCard: () => 'Compact row',
      onRowClick: (row) => clicks.push(row),
      rowLabel: () => 'Invoice and receipts',
    });
    assert.equal(tree.type, 'Panel');
    const all = nodes(tree);
    assert.equal(
      all.some((node) => node.type === 'table'),
      !compact
    );
    assert.equal(
      all.some((node) => node.type === 'ul'),
      compact
    );
    if (!compact) {
      assert.equal(
        all.find((node) => node.type === 'table').props.className,
        'table-fixed'
      );
      const row = all.find((node) => node.type === 'tr');
      row.props.onClick();
      let prevented = false;
      row.props.onKeyDown({
        target: 'row',
        currentTarget: 'row',
        key: 'Enter',
        preventDefault: () => {
          prevented = true;
        },
      });
      assert.equal(prevented, true);
      assert.deepEqual(clicks, [original, original]);
    }
  }
  assert.doesNotMatch(
    source('components/data-table.tsx'),
    /even:|nth-child|rounded-lg border|--row-background/
  );
  assert.doesNotMatch(source('components/list-row.tsx'), /--row-background/);
});

test('record rows keep amount, parties, weight and metadata in three shared lines', () => {
  const { ListRow } = load('components/list-row.tsx', {
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    '@tanstack/react-router': { Link: 'Link' },
    '@/components/ui/button': { Button: 'Button' },
    '@/components/ui/dropdown-menu': {},
    '@/components/ui/item': {
      Item: 'Item',
      ItemContent: 'ItemContent',
      ItemDescription: 'ItemDescription',
      ItemMedia: 'ItemMedia',
      ItemTitle: 'ItemTitle',
    },
  });
  const row = ListRow({
    layout: 'record',
    title: 'Steel cans',
    subtitle: 'Zanele Both → Cape Town Recycling',
    value: 'R 2 000 000.00',
    secondaryValue: '1 000 000 kg',
    meta: '08 Nov 2026 · GLH09G54',
    status: 'C2B',
    onOpen() {},
  });
  const all = nodes(row);
  for (const slot of ['record-primary', 'record-parties', 'record-meta'])
    assert.equal(
      all.filter((node) => node.props?.['data-slot'] === slot).length,
      1
    );
  assert.equal(
    all.find((node) => node.props?.['data-slot'] === 'record-row').props
      .children.length,
    3
  );
  const footer = all.find(
    (node) => node.props?.['data-slot'] === 'record-meta'
  );
  assert.doesNotMatch(footer.props.className, /wrap|truncate/);
  assert.ok(!all.some((node) => node.type === 'ItemMedia'));
});

test('compact chart ticks show just the first and last day without duplicates', () => {
  const { axisTicks } = load('routes/-dashboard/impact-chart.tsx', {
    '@/hooks/use-mobile': { useIsCompact: () => true },
    '@/components/ui/chart': {},
    '@/lib/format': load('lib/format.ts'),
  });
  const days = Array.from({ length: 30 }, (_, i) => String(i));
  assert.deepEqual(Array.from(axisTicks(days, true)), ['0', '29']);
  assert.deepEqual(Array.from(axisTicks(['only'], true)), ['only']);
  assert.deepEqual(Array.from(axisTicks([], true)), []);
  assert.ok(axisTicks(days).length > 2);
});

test('trade detail is a guarded route, with allowlisted return lists and legacy open redirects', () => {
  const route = source('routes/transactions/$transactionId.tsx');
  assert.match(route, /createFileRoute\('\/transactions\/\$transactionId'\)/);
  assert.match(route, /<Guarded page="dashboard">/);
  assert.match(route, /lists.includes\(search.from\)/);
  const list = source('routes/transactions/-components/record-list.tsx');
  assert.match(
    list,
    /if \(openId\)[\s\S]*transactionId: openId[\s\S]*replace: true/
  );
  assert.doesNotMatch(list, /TransactionDialog|setOpen/);
  assert.doesNotMatch(
    source('components/dialogs/record-dialogs.tsx'),
    /ResponsiveOverlay/
  );
  const { pageTitleFor, guardedPageFor } = load('lib/nav.ts', {
    '@/lib/access': load('lib/access.ts'),
  });
  for (const role of ['business', 'collector', 'staff', 'admin'])
    assert.equal(pageTitleFor('/transactions/trade', role), 'Invoice');
  assert.equal(guardedPageFor('/transactions/trade'), 'dashboard');
  assert.equal(pageTitleFor('/transactions/trade', 'guest'), 'Not available');
});

test('profile Save and Cancel share ButtonRow, and the dashboard has exactly three top stat tiles', () => {
  const forms = source('routes/profile/-components/forms.tsx');
  assert.match(
    forms,
    /<ButtonRow>[\s\S]*Cancel changes[\s\S]*Save changes[\s\S]*<\/ButtonRow>/
  );
  const page = source('routes/index.tsx');
  const stats = page.slice(
    page.indexOf('<StatGrid threeUp>'),
    page.indexOf('</StatGrid>')
  );
  assert.equal((stats.match(/<StatCard/g) ?? []).length, 3);
  assert.match(source('components/stat-card.tsx'), /grid grid-cols-3/);
  assert.match(source('routes/-dashboard/panels.tsx'), /rows.slice\(0, 5\)/);
  assert.match(
    source('routes/-dashboard/panels.tsx'),
    /import \{ Panel \} from '@\/components\/panel'/
  );
});
