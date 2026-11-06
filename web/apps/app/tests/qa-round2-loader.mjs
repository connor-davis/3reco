import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
export const source = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

export function load(path, mocks = {}) {
  const { outputText } = ts.transpileModule(source(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.'))
        throw new Error(`Missing mock ${id}`);
      return require(id);
    },
  });
  return exports;
}
