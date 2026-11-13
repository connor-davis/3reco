import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { source } from './qa-round2-loader.mjs';

test('collector edit uses the server permission in table and phone actions', () => {
  const page = source('routes/collectors.tsx');
  assert.match(page, /collector.can_edit/);
  assert.match(page, /cell: \(\{ row \}\) => actions\(row.original\)/);
  assert.match(page, /<ListRow/);
  assert.match(page, /title="Collector directory"/);
  assert.doesNotMatch(page, /Your collector network|created_by_business_id/);
});

test('phone menus and primary taps follow collector permissions; desktop keeps its actions', () => {
  let role = 'business';
  const changes = [];
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
      if (name === 'react')
        return { useState: (value) => [value, (next) => changes.push(next)] };
      if (name === '@tanstack/react-router')
        return { createFileRoute: () => (route) => route };
      if (name === '@/lib/auth/use-auth')
        return { useAuth: () => ({ user: { role } }) };
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
  for (role of ['business', 'staff', 'admin']) {
    const table = nodes(exports.CollectorsPage()).find(
      (node) => node.type === 'DataTable'
    );
    const actions = table.props.columns.find(
      (column) => column.id === 'actions'
    );
    for (const can_edit of [true, false, undefined]) {
      const row = { name: 'Nomsa', can_edit, city: 'Soweto' };
      const rendered = actions.cell({ row: { original: row } });
      const edit = rendered.props.actions.find(
        (action) => action.label === 'Edit'
      );
      assert.equal(!!edit, can_edit === true);
      const phone = table.props.renderCard(row);
      assert.equal(phone.type, 'ListRow');
      assert.equal(!!phone.props.onOpen, can_edit === true);
      const menuEdit = phone.props.actions.find(
        (action) => action.label === 'Edit'
      );
      const menuRemove = phone.props.actions.find(
        (action) => action.label === 'Remove'
      );
      assert.equal(!!menuEdit, can_edit === true);
      assert.equal(!!menuRemove, role !== 'business');
      if (menuEdit) {
        changes.length = 0;
        menuEdit.onSelect();
        assert.equal(changes[0], row);
        assert.equal(changes[1], true);
      }
      if (menuRemove) {
        assert.equal(menuRemove.destructive, true);
        changes.length = 0;
        menuRemove.onSelect();
        assert.equal(changes[0], row);
      }
      if (!can_edit && role === 'business')
        assert.equal(phone.props.actions.length, 0);
    }
  }
});
