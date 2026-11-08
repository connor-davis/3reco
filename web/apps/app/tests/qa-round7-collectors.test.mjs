import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { source } from './qa-round2-loader.mjs';

test('collector edit uses the server permission in table and phone actions', () => {
  const page = source('routes/collectors.tsx');
  assert.match(page, /collector.can_edit &&/);
  assert.match(page, /cell: \(\{ row \}\) => actions\(row.original\)/);
  assert.match(page, /\{actions\(collector\)\}/);
  assert.match(page, /title="Collector directory"/);
  assert.doesNotMatch(page, /Your collector network|created_by_business_id/);
});

test('only rows with can_edit render an Edit action', () => {
  const { outputText } = ts.transpileModule(
    source('routes/collectors.tsx') +
      '\nexports.CollectorsPage = CollectorsPage;',
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }
  );
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === 'react/jsx-runtime') return jsx;
      if (name === 'react') return { useState: (value) => [value, () => {}] };
      if (name === '@tanstack/react-router')
        return { createFileRoute: () => (route) => route };
      if (name === '@/lib/auth/use-auth')
        return { useAuth: () => ({ user: { role: 'business' } }) };
      if (name === '@/lib/access') return { isStaffRole: () => false };
      if (name === '@/lib/use-debounced')
        return { useDebounced: (value) => value };
      if (name === '@/lib/api/collectors')
        return { useCollectors: () => ({ data: { items: [] } }) };
      if (name === '@/components/transactions/pager-state')
        return { usePager: () => ({ params: {} }) };
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  }
  const table = nodes(exports.CollectorsPage()).find(
    (node) => node.type === 'DataTable'
  );
  const actions = table.props.columns.find((column) => column.id === 'actions');
  for (const can_edit of [true, false, undefined]) {
    const row = { name: 'Nomsa', can_edit };
    const rendered = actions.cell({ row: { original: row } });
    const edit = nodes(rendered).find(
      (node) => node.props.label === 'Edit Nomsa'
    );
    assert.equal(!!edit, can_edit === true);
  }
});
