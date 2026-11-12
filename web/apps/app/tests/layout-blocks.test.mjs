import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment } from 'react';
import { load, source } from './qa-round2-loader.mjs';

const utils = { cn: (...values) => values.filter(Boolean).join(' ') };

test('PageHeader keeps one action visible and moves secondary actions into More', () => {
  const { PageHeader } = load('components/page-header.tsx', {
    '@/lib/utils': utils,
    '@/components/ui/button': { Button: 'Button' },
    '@/components/ui/dropdown-menu': {
      DropdownMenu: 'Menu',
      DropdownMenuTrigger: 'Trigger',
      DropdownMenuContent: 'Content',
      DropdownMenuItem: 'MenuItem',
    },
  });
  const primary = createElement('button', { key: 'add' }, 'Add');
  const secondary = createElement('button', { key: 'export' }, 'Export');
  const tree = PageHeader({
    title: 'Records',
    actions: createElement(Fragment, null, primary, false, secondary),
  });
  const [visible, menu] = tree.props.children[1].props.children;
  assert.equal(visible.props.children, 'Add');
  assert.equal(menu.type, 'Menu');
  assert.equal(menu.props.children[0].props.render.props['aria-label'], 'More');
  assert.equal(
    menu.props.children[1].props.children[0].props.render.props.children,
    'Export'
  );
});

test('ButtonRow gives two compact actions equal widths and stacks three or more', () => {
  const { ButtonRow } = load('components/button-row.tsx', {
    '@/lib/utils': utils,
  });
  const row = ButtonRow({ children: ['Cancel', 'Save'] });
  assert.match(row.props.className, /\[&>\*\]:flex-1/);
  assert.match(row.props.className, /has-\[>:nth-child\(3\)\]:flex-col/);
  assert.match(row.props.className, /lg:justify-end/);
  assert.match(row.props.className, /\[&>\*\]:min-h-11/);
});

test('line Tabs never wrap, scroll without a scrollbar and keep 46px triggers', () => {
  const { tabsListVariants } = load('components/ui/tabs-variants.ts');
  const classes = tabsListVariants({ variant: 'line' });
  assert.match(classes, /flex-nowrap/);
  assert.match(classes, /overflow-x-auto/);
  assert.match(classes, /scrollbar-width:none/);
  assert.match(source('components/ui/tabs.tsx'), /tabs-list:h-\[46px\]/);
  assert.doesNotMatch(source('routes/profile/index.tsx'), /max-md:flex-wrap/);
});

test('Toolbar stays one row and renders only one copy of its filters', () => {
  for (const compact of [true, false]) {
    const { Toolbar } = load('components/toolbar.tsx', {
      react: { useState: () => [false, () => {}] },
      '@/components/filters': { SearchBox: 'SearchBox' },
      '@/components/responsive-overlay': { ResponsiveOverlay: 'Overlay' },
      '@/components/ui/button': { Button: 'Button' },
      '@/hooks/use-mobile': { useIsMobile: () => compact },
    });
    const filters = 'Filter controls';
    const row = Toolbar({
      label: 'Search',
      value: '',
      onChange() {},
      filters,
      activeFilters: 2,
      onClear() {},
    });
    assert.match(row.props.className, /flex-nowrap/);
    const branch = row.props.children[1];
    if (compact) {
      assert.deepEqual(
        Array.from(branch.props.children[0].props.children.slice(1)),
        ['Filters', ' (2)']
      );
      assert.equal(branch.props.children[1].props.children, filters);
    } else assert.equal(branch.props.children, filters);
  }
});

test('FilterSheet keeps Clear and Show results actions and preserves live values on dismiss', () => {
  const changes = [];
  let cleared = false;
  const { FilterSheet } = load('components/toolbar.tsx', {
    '@/components/filters': {},
    '@/components/responsive-overlay': { ResponsiveOverlay: 'Overlay' },
    '@/components/ui/button': { Button: 'Button' },
    '@/hooks/use-mobile': {},
  });
  const sheet = FilterSheet({
    open: true,
    onOpenChange: (value) => changes.push(value),
    onClear: () => {
      cleared = true;
    },
    children: 'Filters',
  });
  const [clear, show] = sheet.props.footer.props.children;
  clear.props.onClick();
  assert.equal(cleared, true);
  assert.equal(changes.length, 0);
  show.props.onClick();
  assert.deepEqual(changes, [false]);
  assert.match(
    source('components/responsive-overlay-body.tsx'),
    /<ButtonRow>\{footer\}<\/ButtonRow>/
  );
  assert.match(
    source('components/ui/dialog.tsx'),
    /<ButtonRow\s+data-slot="dialog-footer"/
  );
});

test('ActionBar reserves bottom space and pins above the safe-area bottom tabs', () => {
  const { ActionBar, ActionBarSpacer } = load('components/action-bar.tsx', {
    '@/lib/utils': utils,
    '@/components/button-row': { ButtonRow: 'ButtonRow' },
  });
  const bar = ActionBar({
    label: 'Total',
    children: 'Send',
    'data-testid': 'cart-action-bar',
  });
  assert.match(
    ActionBarSpacer().props.className,
    /max-lg:pb-.*safe-area-inset-bottom/
  );
  assert.match(
    bar.props.className,
    /max-lg:bottom-\[calc\(52px\+env\(safe-area-inset-bottom\)\)\]/
  );
  assert.match(bar.props.className, /max-lg:fixed/);
  assert.match(bar.props.className, /lg:justify-end/);
  assert.equal(bar.props['data-testid'], 'cart-action-bar');
  assert.equal(bar.props.children[1].type, 'ButtonRow');
});

test('Panel delegates headings and right-side actions to Section', () => {
  const { Panel } = load('components/panel.tsx', {
    '@/components/page-header': { Section: 'Section' },
  });
  const panel = Panel({
    title: 'Summary',
    action: 'See all',
    children: 'Rows',
  });
  assert.equal(panel.type, 'Section');
  assert.equal(panel.props.panel, true);
  assert.equal(panel.props.action, 'See all');
  assert.match(
    source('components/page-header.tsx'),
    /rounded-2xl bg-muted\/50 p-4 lg:p-6/
  );
});

test('record and request pages remove the duplicate Open messages shortcut', () => {
  for (const path of [
    'routes/transactions/-components/record-list.tsx',
    'routes/transactions/index.tsx',
    'routes/market/-components/request-list.tsx',
  ]) {
    assert.doesNotMatch(source(path), /Open messages/);
  }
  for (const path of [
    'routes/transactions/-components/record-list.tsx',
    'routes/market/-components/request-list.tsx',
    'components/chat/inbox.tsx',
  ]) {
    assert.match(source(path), /<Toolbar/);
    assert.match(source(path), /<FilterTabs/);
  }
});
