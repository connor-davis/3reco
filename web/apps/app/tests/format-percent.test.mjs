import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function compile(path, dependencies, suffix = '') {
  const { outputText } = ts.transpileModule(read(path) + suffix, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    Intl,
    Date,
    BigInt,
    Number,
    Map,
    require(name) {
      if (name in dependencies) return dependencies[name];
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  return exports;
}

const format = compile('../src/lib/format.ts', {});

test('formatPercent shows up, down, no change and new', () => {
  assert.deepEqual(
    { ...format.formatPercent('120', '100') },
    { label: '20%', dir: 'up' }
  );
  assert.deepEqual(
    { ...format.formatPercent('75', '100') },
    { label: '25%', dir: 'down' }
  );
  assert.deepEqual(
    { ...format.formatPercent(5, 5) },
    { label: 'No change', dir: 'flat' }
  );
  assert.deepEqual(
    { ...format.formatPercent('3', '0') },
    { label: 'New', dir: 'new' }
  );
});
