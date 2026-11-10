import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const format = load('lib/format.ts');
const { formatCo2 } = load('lib/impact.ts', {
  '@/lib/api/stats': {},
  '@/lib/format': format,
});

test('qa-round6-ui: the dashboard shows CO2 with the same decimals as every page', () => {
  assert.equal(formatCo2('1414.1'), '1 414.10 kg CO₂e');
  assert.doesNotMatch(source('routes/index.tsx'), /wholeKg/);
});

const wrapper = ({ children }) => createElement('div', null, children);
test('qa-round6-ui: Visit store targets the other business for buyer and seller', () => {
  let userId = 'buyer';
  const { DealAside } = load('components/chat/deal-aside.tsx', {
    '@/components/badges': { StatusBadge: wrapper },
    '@/components/link-button': {
      LinkButton: ({ params, children }) =>
        createElement(
          'a',
          { href: `/market/store/${params.sellerId}` },
          children
        ),
    },
    '@/lib/format': format,
    '@/lib/auth/use-auth': { useAuth: () => ({ user: { id: userId } }) },
    '@/lib/api/listings': {},
    './helpers': { requestLabel: () => 'Pending', requestTotal: () => 0 },
  });
  const request = {
    buyer: { id: 'buyer', name: 'Buyer' },
    seller: { id: 'seller', name: 'Seller' },
    items: [],
    created_at: '2026-11-06T10:00:00Z',
  };
  const render = () =>
    renderToStaticMarkup(createElement(DealAside, { request }));
  assert.match(render(), /href="\/market\/store\/seller"/);
  userId = 'seller';
  assert.match(render(), /href="\/market\/store\/buyer"/);
});

test('qa-round6-ui: material summaries use cached request items in inbox and dashboard', () => {
  const { ThreadMaterials } = load('components/chat/cards.tsx', {
    '@/components/link-button': {},
    '@/components/ui/button': {},
    '@/components/ui/card': {},
    '@/lib/auth/use-auth': {},
    '@/lib/api/transactions': {},
    '@/lib/format': format,
    './helpers': {},
    '@/lib/api/requests': {
      useRequest: (id) => {
        assert.equal(id, 'request');
        return {
          data: {
            items: [
              {
                material_name: 'Aluminium cans',
                requested_weight: '12.75',
                offer_weight: null,
              },
            ],
          },
        };
      },
    },
  });
  assert.match(
    renderToStaticMarkup(
      createElement(ThreadMaterials, { requestId: 'request' })
    ),
    /Aluminium cans · 12.75 kg/
  );
  for (const path of [
    'components/chat/inbox.tsx',
    'routes/-dashboard/panels.tsx',
  ]) {
    assert.match(
      source(path),
      /<ThreadMaterials requestId=\{thread.request_id\}/
    );
  }
});

test('qa-round6-ui: create state is discarded after save and stock validates while typing', () => {
  for (const entity of ['Collector', 'Stock']) {
    assert.match(
      source(`components/dialogs/${entity.toLowerCase()}-dialog.tsx`),
      new RegExp(
        `return props.open \\? <${entity}Form \\{\\.\\.\\.props\\} /> : null`
      )
    );
  }
  assert.match(
    source('components/dialogs/material-dialog.tsx'),
    /reset\(\);\s*onOpenChange\(false\)/
  );
  const stock = source('components/dialogs/stock-dialog.tsx');
  assert.match(stock, /mode: 'onChange'/);
  assert.match(stock, /disabled=\{busy \|\| !formState.isValid\}/);
});

test('qa-round6-ui: seller reviews, staff collector actions and guest breadcrumbs match roles', () => {
  const store = source('routes/market/store/$sellerId.tsx');
  assert.match(store, /user\?\.id === sellerId &&/);
  assert.match(store, /Buyers review your store after a completed trade\./);
  assert.doesNotMatch(store, /You have reviewed all eligible trades/);
  assert.equal(
    source('routes/collectors.tsx').match(/!directory &&/g).length,
    2
  );
  assert.match(source('components/shell/topbar.tsx'), /user.role !== 'guest'/);
  assert.match(
    source('routes/profile/-components/sessions-panel.tsx'),
    /roleLabel\(session.role\)/
  );
  assert.match(
    source('routes/profile/-components/sessions-panel.tsx'),
    /formatTime\(session.createdAt\)/
  );
  assert.doesNotMatch(source('routes/cart.tsx'), /Keep browsing/);
});

test('qa-round6-ui: route titles override the shell fallback after cached navigation', () => {
  assert.match(
    source('components/shell/app-shell.tsx'),
    /useLayoutEffect\(\(\) => \{\s*document.title/
  );
  assert.match(
    source('routes/market/store/$sellerId.tsx'),
    /document.title = `\$\{name\} · 3REco`/
  );
  assert.match(
    source('routes/market/listing/$listingId.tsx'),
    /document.title = `\$\{query.data.material_name\} · 3REco`/
  );
});

test('qa-round6-ui: transaction status shares the wrapping records filter bar', () => {
  const records = source('routes/transactions/-components/record-list.tsx');
  const start = records.indexOf(
    '<div className="mb-6 flex flex-wrap items-center gap-3">'
  );
  const status = records.indexOf('label="Transaction status"');
  const search = records.indexOf('label="Search records"');
  const dates = records.indexOf('placeholder="From – to date"');
  assert.ok(start >= 0 && status > start && search > status && dates > search);
  assert.match(
    records.slice(start, search),
    /value=\{status\}\s*onChange=\{setStatus\}/
  );
  assert.match(records, /shrink-0 justify-center px-3 text-sm sm:w-40/);
  assert.match(
    records,
    /shrink-0 text-right font-semibold tabular-nums sm:ml-0 sm:w-32/
  );
});

test('qa-round6-ui: the shared table clips cell backgrounds inside its rounded border', () => {
  assert.match(
    source('components/data-table.tsx'),
    /className="overflow-hidden rounded-2xl border"/
  );
  assert.match(
    source('routes/transactions/-components/record-list.tsx'),
    /<ItemGroup className="gap-0 overflow-hidden rounded-2xl border sm:gap-4"/
  );
});
