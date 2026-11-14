import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { source, load } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
function compile(path, mocks = {}, expose = '') {
  const { outputText } = ts.transpileModule(source(path) + expose, {
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
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.'))
        return new Proxy({}, { get: (_, name) => name });
      return require(id);
    },
  });
  return exports;
}
const react = {
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
  useEffect: () => {},
};
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

test('add/edit stock footer never repeats field errors after interaction', () => {
  for (const stock of [undefined, { id: 'lot', price: '2', weight: '10' }]) {
    for (const interacted of [false, true]) {
      const { StockForm } = compile(
        'components/dialogs/stock-dialog.tsx',
        {
          react,
          '@/lib/quantity': {
            weightCounter: () => ({}),
            priceCounter: () => ({}),
          },
          'react-hook-form': {
            useForm: () => ({
              control: {},
              handleSubmit: () => () => {},
              watch: () => '',
              formState: {
                isValid: false,
                isDirty: interacted,
                touchedFields: interacted ? { price: true } : {},
                errors: interacted ? { price: { message: 'Bad price' } } : {},
              },
            }),
          },
          '@/lib/api/materials': { useMaterials: () => ({}) },
          '@/lib/api/stock': {
            useCreateStock: () => ({}),
            useUpdateStock: () => ({}),
            useAddStockPhoto: () => ({}),
          },
        },
        '\nexports.StockForm = StockForm;'
      );
      const footer = nodes(StockForm({ open: true, stock }).props.footer);
      assert.equal(
        footer.filter((node) => node.props.role === 'status').length,
        !stock && !interacted ? 1 : 0
      );
      assert.ok(!JSON.stringify(footer).includes('Bad price'));
    }
  }
});

test('receipt removal encodes both IDs and refreshes the trade after 204', async () => {
  const calls = [];
  const { useDeleteReceipt } = load('lib/api/receipts.ts', {
    './resource': { idPath: encodeURIComponent },
    './client': { api: (...args) => calls.push(args) },
    '@tanstack/react-query': {
      useMutation: (options) => options,
      useQueryClient: () => ({
        invalidateQueries: (options) => calls.push(options),
      }),
    },
  });
  const mutation = useDeleteReceipt('trade/a');
  await mutation.mutationFn('receipt/b');
  await mutation.onSuccess();
  assert.equal(calls[0][0], '/transactions/trade%2Fa/receipts/receipt%2Fb');
  assert.equal(calls[0][1].method, 'DELETE');
  assert.equal(JSON.stringify(calls[1]), '{"queryKey":["transactions"]}');
});

test('receipt remove is restricted and only mutates after confirmation', () => {
  for (const [id, role, allowed] of [
    ['uploader', 'staff', true],
    ['buyer', 'business', true],
    ['seller', 'business', true],
    ['admin', 'admin', true],
    ['staff', 'staff', false],
    ['stranger', 'business', false],
  ]) {
    const calls = [];
    const receipt = {
      id: 'r',
      file_name: 'receipt.png',
      uploaded_by: 'uploader',
    };
    let selected = null;
    const { TradeDetail } = compile('components/dialogs/record-dialogs.tsx', {
      react: {
        useState: (value) =>
          value === null
            ? [
                receipt,
                (value) => {
                  selected = value;
                },
              ]
            : [value, () => {}],
      },
      '@/lib/auth/use-auth': { useAuth: () => ({ user: { id, role } }) },
      '@/components/ui/button-variants': { buttonVariants: () => '' },
      '@/lib/utils': { cn: () => '' },
      '@/lib/api/transactions': {
        useTransaction: () => ({}),
        useDownloadInvoice: () => ({}),
      },
      '@/lib/api/receipts': {
        kinds: ['image/png', 'image/jpeg'],
        maxBytes: 5 * 1024 * 1024,
        maxReceipts: 5,
        useUploadReceipt: () => ({}),
        useDownloadReceipt: () => ({}),
        useDeleteReceipt: () => ({ mutate: (id) => calls.push(id) }),
      },
      '@/lib/format': load('lib/format.ts'),
    });
    const tree = nodes(
      TradeDetail({
        record: {
          id: 't',
          type: 'b2b',
          can_remove_receipts: ['buyer', 'seller', 'admin'].includes(id),
          buyer: { id: 'buyer' },
          seller: { id: 'seller' },
          receipts: [receipt],
          items: [],
          effective_at: '2026-11-08',
          total_price: '2',
        },
      })
    );
    const remove = tree.find(
      (node) => node.props['aria-label'] === 'Remove receipt receipt.png'
    );
    assert.equal(!!remove, allowed);
    if (allowed) {
      remove.props.onClick();
      assert.equal(selected, receipt);
      assert.equal(calls.length, 0);
      tree.find((node) => node.type === 'ConfirmDialog').props.onConfirm();
      assert.deepEqual(calls, ['r']);
    }
    const heading = tree.find(
      (node) =>
        node.type === 'Panel' &&
        typeof node.props.title === 'string' &&
        node.props.title.startsWith('Receipts')
    );
    assert.match(heading.props.title, /Receipts \(1 of 5 allowed\)/);
  }
});

test('collector unchanged save skips the request; changed contact still saves', async () => {
  for (const changed of [false, true]) {
    const messages = [];
    const writes = [];
    let submit;
    const { CollectorForm, toValues } = compile(
      'components/dialogs/collector-dialog.tsx',
      {
        react,
        sonner: {
          toast: {
            info: (message) => messages.push(message),
            success: (message) => messages.push(message),
          },
        },
        'react-hook-form': {
          useForm: () => ({
            control: {},
            watch: () => 'bank',
            handleSubmit: (callback) => {
              submit = callback;
              return () => {};
            },
          }),
        },
        '@/lib/auth/use-auth': {
          useAuth: () => ({ user: { role: 'business' } }),
        },
        '@/lib/api/collectors': {
          useCreateCollector: () => ({}),
          useUpdateCollector: () => ({
            mutateAsync: (value) => writes.push(value),
          }),
        },
        '@/lib/names': load('lib/names.ts'),
        '@/components/transactions/phone': load(
          'components/transactions/phone.ts'
        ),
      },
      '\nexports.CollectorForm = CollectorForm; exports.toValues = toValues;'
    );
    const collector = {
      id: 'c',
      name: 'Test Collector',
      email: 'one@example.test',
    };
    CollectorForm({ collector, onOpenChange: () => {} });
    await submit({
      ...toValues(collector),
      ...(changed ? { email: 'two@example.test' } : {}),
    });
    assert.equal(writes.length, changed ? 1 : 0);
    assert.deepEqual(messages, [
      changed ? 'Collector updated.' : 'No changes to save.',
    ]);
  }
});

test('add-account return path uses the safe destination and preserves the origin', () => {
  const { authDestination } = compile('lib/auth/redirect.ts');
  for (const unsafe of [
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/sign-in?add=true',
  ])
    assert.equal(authDestination(unsafe), '/');
  assert.equal(authDestination('/stock?q=glass#item'), '/stock?q=glass#item');
  assert.match(source('routes/sign-in.tsx'), /addingAccount &&/);
  assert.match(
    source('routes/sign-in.tsx'),
    /to=\{authDestination\(params.get\('redirect'\)\)\}/
  );
  assert.match(
    source('components/shell/account-menu.tsx'),
    /redirect: location.href/
  );
});

test('chart provides endpoint space and kg values; metric and privacy copy remain legible', () => {
  const chart = source('routes/-dashboard/impact-chart.tsx');
  assert.match(chart, /padding=\{\{ left: 24, right: 24 \}\}/);
  assert.match(chart, /ticks=\{axisTicks\(/);
  assert.match(chart, /interval=\{0\}/);
  assert.match(chart, /<YAxis[\s\S]*?tickFormatter=\{axisWeight\}/);
  assert.match(chart, /formatKg\(String\(value\)\)/);
  assert.match(source('components/stat-card.tsx'), /whitespace-nowrap/);
  assert.match(
    source('routes/profile/-components/privacy-panel.tsx'),
    /<h3[^>]*>Delete account<\/h3>/
  );
});
