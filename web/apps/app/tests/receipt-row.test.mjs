import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { source, load } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
function compile(path, mocks) {
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
    URL,
    require: (id) =>
      id in mocks
        ? mocks[id]
        : id.startsWith('@/') || id.startsWith('.')
          ? new Proxy({}, { get: (_, name) => name })
          : require(id),
  });
  return exports;
}
const nodes = (node) =>
  !node || typeof node !== 'object'
    ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];

test('a 60 character receipt name truncates inside its row and keeps its actions in a menu', () => {
  const name = `receipt-${'a'.repeat(48)}.jpg`;
  assert.equal(name.length, 60);
  const { TradeDetail } = compile('components/dialogs/record-dialogs.tsx', {
    react: { useState: (value) => [value, () => {}] },
    '@/lib/auth/use-auth': {
      useAuth: () => ({ user: { id: 'u', role: 'admin' } }),
    },
    '@/components/ui/button-variants': { buttonVariants: () => '' },
    '@/lib/utils': { cn: () => '' },
    '@/lib/api/transactions': {
      useTransaction: () => ({}),
      useDownloadInvoice: () => ({}),
    },
    '@/lib/api/receipts': {
      kinds: [],
      maxBytes: 1,
      maxReceipts: 5,
      useUploadReceipt: () => ({}),
      useDownloadReceipt: () => ({}),
      useDeleteReceipt: () => ({}),
    },
    '@/lib/format': load('lib/format.ts'),
  });
  const tree = nodes(
    TradeDetail({
      record: {
        id: 't',
        type: 'b2b',
        buyer: { id: 'b' },
        seller: { id: 's' },
        items: [],
        effective_at: '2026-11-08',
        total_price: '2',
        receipts: [{ id: 'r', file_name: name, uploaded_by: 'u' }],
      },
    })
  );
  const label = tree.find((node) => node.props?.title === name);
  assert.match(label.props.className, /\bmin-w-0\b/);
  assert.match(label.props.className, /\btruncate\b/);
  assert.ok(
    tree.some((node) => node.props?.['aria-label'] === `Remove receipt ${name}`)
  );
});
