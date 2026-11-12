import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { source, load } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
function compile(path, mocks, expose = '') {
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
    Error,
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/')) return new Proxy({}, { get: (_, name) => name });
      return require(id);
    },
  });
  return exports;
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
const react = {
  useState: (value) => [value, () => {}],
  useRef: (current) => ({ current }),
  useEffect: () => {},
  useCallback: (callback) => callback,
};

test('receipt removal follows the server permission, including linked collectors', () => {
  for (const [role, permission, uploaded, allowed, canUpload] of [
    ['collector', true, false, true, false],
    ['collector', false, false, false, false],
    ['business', false, false, false, false],
    ['staff', false, false, false, true],
    ['admin', true, false, true, true],
    ['staff', false, true, true, true],
  ]) {
    const { TradeDetail } = compile('components/dialogs/record-dialogs.tsx', {
      react,
      '@/components/ui/button-variants': {
        buttonVariants: () => '',
      },
      '@/lib/utils': {
        cn: (...classes) => classes.filter(Boolean).join(' '),
      },
      '@/lib/auth/use-auth': {
        useAuth: () => ({ user: { id: 'caller', role } }),
      },
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
        useDeleteReceipt: () => ({}),
      },
      '@/lib/format': load('lib/format.ts'),
    });
    const tree = nodes(
      TradeDetail({
        record: {
          id: 'trade',
          type: 'c2b',
          status: 'complete',
          can_remove_receipts: permission,
          buyer: { id: 'buyer' },
          seller: { id: 'collector-record' },
          items: [],
          total_price: '275',
          effective_at: '2026-11-08',
          receipts: [
            {
              id: 'receipt',
              file_name: 'receipt.png',
              uploaded_by: uploaded ? 'caller' : 'buyer',
            },
          ],
        },
      })
    );
    assert.equal(
      tree.some(
        (node) => node.props?.['aria-label'] === 'Remove receipt receipt.png'
      ),
      allowed
    );
    assert.equal(
      tree.some((node) => node.props?.id === 'receipt-file'),
      canUpload
    );
  }
});

test('cart resets from server items and has no duplicate store title', () => {
  const text = source('routes/cart.tsx');
  assert.match(text, /useEffect\(\(\) => \{\s*reset\(\{\s*items: items\.map/);
  assert.match(text, /\}, \[items, reset\]\)/);
  assert.doesNotMatch(text, /CardTitle|CardHeader/);
  assert.match(text, /label="Store cart"/);
});

function cartHarness({ conflict = false } = {}) {
  const writes = [];
  const errors = [];
  let values;
  const items = [
    { stock_id: 'a', material_id: 'glass', weight: '12.5', price: '8' },
    { stock_id: 'b', material_id: 'metal', weight: '5', price: '9' },
  ];
  const { CartForm } = compile(
    'routes/cart.tsx',
    {
      react: {
        ...react,
        useState: (value) => [value, (next) => errors.push(next)],
      },
      sonner: { toast: { success: () => {} } },
      '@tanstack/react-router': {
        createFileRoute: () => () => ({}),
        useNavigate: () => async () => writes.push('navigate'),
      },
      'react-hook-form': {
        useForm: ({ defaultValues }) => {
          values = defaultValues;
          return {
            watch: () => values.items,
            handleSubmit: (callback) => () => callback(values),
            formState: { errors: {} },
          };
        },
        useFieldArray: () => ({ fields: values.items }),
      },
      '@/lib/api/cart': {
        useCart: () => ({ refetch: async () => writes.push('refetch') }),
        useSaveCart: () => ({
          mutateAsync: async (body) => writes.push({ save: body }),
        }),
      },
      '@/lib/api/requests': {
        useCreateRequest: () => ({
          mutateAsync: async (body) => {
            writes.push({ create: body });
            if (conflict)
              throw new Error('Your cart changed. Check it and send again.');
            return { id: 'request' };
          },
        }),
      },
      '@/lib/format': load('lib/format.ts'),
      '@/lib/quantity': { quantityError: () => null },
    },
    '\nexports.CartForm = CartForm;'
  );
  const tree = nodes(
    CartForm({ sellerId: 'seller', items, sending: { current: false } })
  );
  for (const node of tree.filter((node) => node.props?.onValidation)) {
    node.props.onValidation(node.props.stockId, null);
  }
  return { tree, writes, errors, values };
}

test('sending a cart carries edited exact weights without saving stale rows first', async () => {
  const { tree, writes, values } = cartHarness();
  values.items[0].weight = ' 9,750001 ';
  await tree.find((node) => node.type === 'form').props.onSubmit();
  // The server empties the cart when it creates the request, so no clear call.
  assert.equal(writes.length, 2);
  assert.equal(writes[0].create.from_cart, true);
  assert.equal(writes[0].create.items[0].weight, '9.750001');
  assert.deepEqual(writes.slice(1), ['navigate']);
});

test('a changed cart is refetched, with no clear or navigation on refusal', async () => {
  const { tree, writes, errors } = cartHarness({ conflict: true });
  await tree.find((node) => node.type === 'form').props.onSubmit();
  assert.equal(writes.length, 2);
  assert.equal(writes[1], 'refetch');
  assert.ok(errors.includes('Your cart changed. Check it and send again.'));
});

test('removing a row saves the server copy rather than local edited values', async () => {
  const { tree, writes, values } = cartHarness();
  values.items[1].weight = '99';
  await tree.find((node) => node.props?.stockId === 'a').props.onRemove();
  // onRemove starts the async action without awaiting it.
  assert.equal(writes[0].save.items.length, 1);
  assert.equal(writes[0].save.items[0].weight, '5');
});
