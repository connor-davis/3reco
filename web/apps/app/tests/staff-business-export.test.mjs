import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { load, source } from './qa-round2-loader.mjs';

const paging = {};
vm.runInNewContext(
  ts.transpileModule(source('lib/api/paging.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: paging, URLSearchParams }
);
const exports = load('lib/api/exports.ts', {
  './paging': paging,
  './client': {},
});

test('business export paths and filenames include the selected business in both shapes', () => {
  for (const [kind, prefix] of [
    ['transactions', '/admin'],
    ['collections', ''],
  ]) {
    for (const itemised of [false, true]) {
      const params = { business_id: 'business-a', itemised };
      assert.equal(
        exports.exportPath(kind, params),
        `${prefix}/exports/${kind}?business_id=business-a&itemised=${itemised}`
      );
      assert.equal(
        exports.exportFilename(kind, params),
        `3REco-${kind}-business-business-a${itemised ? '-by-material' : ''}.csv`
      );
    }
    assert.equal(
      exports.exportPath(kind, { business_id: '' }),
      `${prefix}/exports/${kind}`
    );
    assert.equal(exports.exportFilename(kind, {}), `3REco-${kind}.csv`);
    assert.equal(
      exports.exportFilename(kind, { business_id: '../a"' }),
      `3REco-${kind}-business-___a_.csv`
    );
  }
});

function find(node, type) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === type) return node;
  for (const child of [
    node.props?.children,
    node.props?.filters,
    node.props?.action,
  ].flat(Infinity)) {
    const found = find(child, type);
    if (found) return found;
  }
}

function listFor(role, collectionsOnly = false, selected = null) {
  const path = 'routes/transactions/-components/record-list.tsx';
  const mocks = {};
  for (const match of source(path).matchAll(/from '(@\/[^']+)'/g)) {
    mocks[match[1]] = new Proxy({}, { get: (_, key) => key });
  }
  let hook = 0;
  let businessChange;
  mocks.react = {
    useState: (initial) => {
      const business = hook++ === 0;
      return [
        business ? selected : initial,
        (value) => {
          if (business) businessChange = value;
        },
      ];
    },
    useEffect: () => {},
  };
  mocks['@tanstack/react-router'] = {
    useLocation: () => ({
      pathname: collectionsOnly ? '/collections' : '/transactions',
    }),
    useNavigate: () => () => {},
    useSearch: () => ({}),
  };
  mocks['@/lib/auth/use-auth'] = { useAuth: () => ({ user: { role } }) };
  mocks['@/lib/api/app-config'] = { useAppConfig: () => ({ demo: false }) };
  mocks['@/lib/use-debounced'] = { useDebounced: (value) => value };
  let listParams, totalsParams, downloadParams;
  mocks['@/components/transactions/pager-state'] = {
    usePager: (params) => ({ params }),
  };
  mocks['@/lib/api/transactions'] = {
    useDownloadInvoice: () => ({}),
    useTransactions: (_, params) => {
      listParams = params;
      return {};
    },
    useTransactionTotals: (_, params) => {
      totalsParams = params;
      return { data: { count: 3 } };
    },
  };
  mocks['@/lib/api/exports'] = {
    useExport: () => ({
      mutate: (params) => {
        downloadParams = params;
      },
    }),
  };
  mocks['@/lib/format'] = {
    formatRand: () => '',
    toCents: () => 0,
    formatKg: () => '',
  };
  mocks['@/lib/trade-type'] = { tradeTypeLabel: (value) => value };
  const { RecordList } = load(path, mocks);
  const tree = RecordList({
    title: 'Records',
    description: '',
    emptyTitle: 'Empty',
    kind: 'mine',
    exportKind: collectionsOnly ? 'collections' : 'transactions',
    businessPicker: true,
    collectionsOnly,
  });
  return {
    tree,
    listParams,
    totalsParams,
    download: () => downloadParams,
    businessChange: () => businessChange,
  };
}

test('record filter picker is visible only to admin and staff on both record lists', () => {
  for (const collectionsOnly of [false, true]) {
    for (const role of ['admin', 'staff', 'business', 'collector', 'guest']) {
      const { tree } = listFor(role, collectionsOnly);
      const staff = role === 'admin' || role === 'staff';
      assert.equal(
        !!find(tree, 'BusinessPicker'),
        staff,
        `${role}, collections=${collectionsOnly}`
      );
      if (staff)
        assert.equal(
          find(tree, 'Toolbar').props.action.props['aria-label'],
          'Export'
        );
    }
  }
});

test('selected business filters list, totals and download; Clear removes the choice', () => {
  for (const collectionsOnly of [false, true]) {
    const selected = {
      value: 'business-a',
      label: 'Business A',
      verified: true,
    };
    const result = listFor('staff', collectionsOnly, selected);
    assert.equal(result.listParams.business_id, 'business-a');
    assert.equal(result.totalsParams.business_id, 'business-a');
    const toolbar = find(result.tree, 'Toolbar');
    toolbar.props.action.props.onClick();
    assert.equal(result.download().business_id, 'business-a');
    assert.equal(find(result.tree, 'BusinessPicker').props.value, selected);
    toolbar.props.onClear();
    assert.equal(result.businessChange(), null);
    assert.equal(
      listFor('staff', collectionsOnly).listParams.business_id,
      undefined
    );
    assert.equal(
      listFor('business', collectionsOnly, selected).listParams.business_id,
      undefined
    );
  }
});

test('picker retains its chosen name across remounts and uses server search', () => {
  const selected = {
    value: 'chosen',
    label: 'Chosen business',
    verified: true,
  };
  let change;
  const combo = new Proxy({}, { get: (_, key) => key });
  const { BusinessPicker } = load('components/business-picker.tsx', {
    react: { useState: () => ['', () => {}] },
    '@/lib/api/stores': { useStores: () => ({ data: { items: [] } }) },
    '@/lib/use-debounced': { useDebounced: (value) => value },
    '@/components/badges': { VerifiedMark: 'VerifiedMark' },
    '@/components/ui/combobox': combo,
  });
  const tree = BusinessPicker({
    value: selected,
    onChange: (value) => {
      change = value;
    },
  });
  const picker = find(tree, 'Combobox');
  assert.equal(picker.props.value, selected);
  assert.equal(picker.props.items[0].label, 'All businesses');
  assert.equal(picker.props.items[1], selected);
  assert.equal(picker.props.filter, null);
  picker.props.onValueChange(picker.props.items[0]);
  assert.equal(change, null);
});
