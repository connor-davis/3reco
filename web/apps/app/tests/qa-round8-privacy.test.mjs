import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { source } from './qa-round2-loader.mjs';

const { outputText } = ts.transpileModule(
  source('routes/admin/users.tsx') + '\nexports.eventLabel = eventLabel;',
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
    if (name === '@tanstack/react-router')
      return { createFileRoute: () => () => ({}) };
    if (name === '@/lib/access')
      return { roleLabel: (role) => (role === 'business' ? 'Business' : role) };
    if (name === '@/lib/format') return { formatDateTime: (value) => value };
    return {};
  },
});

test('export activity uses plain export, row and trade labels without raw keys', () => {
  for (const [kind, itemised, type, expected] of [
    [
      'transactions',
      'false',
      'b2b',
      'Transactions (one row per trade, Business trades)',
    ],
    [
      'transactions',
      'true',
      'c2b',
      'Transactions (one row per material, Collector purchases)',
    ],
    [
      'collections',
      'false',
      'c2b',
      'Collections (one row per trade, Collector purchases)',
    ],
  ]) {
    const text = exports.eventLabel({
      kind: 'export',
      details: {
        export_kind: kind,
        filters: { itemised, type, unknown_key: 'raw' },
      },
    });
    assert.equal(text, `Data download · ${expected}`);
    assert.doesNotMatch(
      text,
      /itemised:|type:|c2b|b2b|false|true|unknown_key|raw/
    );
  }
});

test('search, roles, dates and invoice identifiers retain readable audit context', () => {
  assert.equal(
    exports.eventLabel({
      kind: 'export',
      details: {
        export_kind: 'users',
        filters: {
          q: 'Glass',
          role: 'business',
          from: '2026-11-01',
          to: '2026-11-08',
        },
      },
    }),
    'Data download · Users (Search: Glass, Role: Business, From 2026-11-01, To 2026-11-08)'
  );
  assert.equal(
    exports.eventLabel({
      kind: 'admin_full_view',
      details: { invoice_number: 'INV-123' },
    }),
    'Full identifier viewed · invoice INV-123'
  );
  assert.equal(
    exports.eventLabel({ kind: 'new_internal_key', details: {} }),
    'Privacy activity'
  );
});
