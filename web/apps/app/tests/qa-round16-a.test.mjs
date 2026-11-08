import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { load, source } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);

test('A1: both Add account buttons send add and redirect', () => {
  const search =
    /to: '\/sign-in',\s*search: \{ add: true, redirect: location\.href \}/;
  assert.match(source('components/shell/account-menu.tsx'), search);
  assert.match(source('routes/profile/-components/sessions-panel.tsx'), search);
});

test('M1: the material price cap message groups the thousands', () => {
  const mocks = { '@/lib/format': load('lib/format.ts', {}) };
  const { outputText } = ts.transpileModule(
    source('components/dialogs/material-dialog.tsx') +
      '\nexports.schema = schema;',
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }
  );
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    URLSearchParams,
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        return new Proxy({}, { get: (_, name) => name });
      }
      return require(id);
    },
  });
  const result = exports.schema.safeParse({
    name: 'Copper',
    gw_code: 'GW13',
    price: '100000.01',
    carbon_factor: '2.25',
  });
  assert.equal(
    result.error.issues[0].message,
    'Price must be R 100 000.00 per kg or less.'
  );
});
