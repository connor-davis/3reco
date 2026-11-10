import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { source } from './qa-round2-loader.mjs';

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
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        return new Proxy({}, { get: (_, name) => name });
      }
      return require(id);
    },
  });
  return exports;
}

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

const format = compile('lib/format.ts', {});
const quantity = compile('lib/quantity.ts', { '@/lib/format': format });
const limits = compile('lib/limits.ts', {});
const mb = 1024 * 1024;
const png = (name, size = 10) => ({ name, type: 'image/png', size });

/** Mount the dialog with a tiny state store; render() runs it again. */
function mount({ failing = [] } = {}) {
  const slots = [];
  let cursor = 0;
  const calls = [];
  const toasts = [];
  const closed = [];
  let resets = 0;

  const { CollectionDialog } = compile(
    'components/dialogs/collection-dialog.tsx',
    {
      react: {
        useState: (initial) => {
          const slot = cursor++;
          if (!(slot in slots)) slots[slot] = initial;
          return [slots[slot], (next) => (slots[slot] = next)];
        },
        useRef: (value) => ({ current: value }),
      },
      sonner: {
        toast: {
          success: (text) => toasts.push(['success', text]),
          warning: (text) => toasts.push(['warning', text]),
        },
      },
      'react-hook-form': {
        useForm: () => ({
          control: {},
          watch: () => [{ material_id: 'm', weight: '1', price: '2' }],
          handleSubmit: (fn) => () =>
            fn({
              collector_id: 'c',
              collection_day: '2026-01-01',
              lines: [{ material_id: 'm', weight: '1', price: '2' }],
            }),
          reset: () => resets++,
          setError: () => {},
          formState: { errors: {} },
        }),
        useFieldArray: () => ({ fields: [] }),
      },
      '@/lib/api/materials': { useMaterials: () => ({}) },
      '@/lib/api/collectors': { useCollectorSelection: () => ({}) },
      '@/lib/api/stores': { useStores: () => ({}) },
      '@/lib/auth/use-auth': {
        useAuth: () => ({ user: { role: 'business' } }),
      },
      '@/lib/api/transactions': {
        useCreateCollection: () => ({
          isPending: false,
          mutateAsync: async (body) => {
            calls.push(['create', body]);
            return { transaction_id: 'trade-1' };
          },
        }),
      },
      '@/components/ui/button-variants': { buttonVariants: () => '' },
      '@/lib/utils': { cn: () => '' },
      '@/lib/api/receipts': {
        kinds: ['image/png', 'image/jpeg'],
        maxBytes: 5 * mb,
        maxReceipts: 5,
        useUploadReceipt: () => ({
          mutateAsync: async ({ id, file }) => {
            calls.push(['upload', id, file.name]);
            if (failing.includes(file.name)) throw new Error('nope');
          },
        }),
      },
      '@/lib/format': format,
      '@/lib/quantity': quantity,
      '@/lib/limits': limits,
    }
  );

  const root = () => {
    cursor = 0;
    return CollectionDialog({
      open: true,
      onOpenChange: (v) => closed.push(v),
    });
  };
  const render = () => nodes(root());
  const save = () => root().props.footer;
  const input = () =>
    render().find((n) => n.props?.id === 'collection-receipts');
  const pick = (...files) => {
    input().props.onChange({ target: { files, value: 'x' } });
  };
  const alerts = () =>
    render()
      .filter((n) => n.props?.role === 'alert')
      .map((n) => n.props.children);
  const names = () =>
    render()
      .filter((n) => n.props?.label?.startsWith('Remove receipt '))
      .map((n) => n.props.label);

  return {
    calls,
    toasts,
    closed,
    resets: () => resets,
    save,
    input,
    pick,
    alerts,
    names,
  };
}

async function submit(view) {
  await view.save().props.onClick();
}

test('two receipts are uploaded one after another to the new collection id', async () => {
  const view = mount();
  view.pick(png('a.png'), png('b.png'));
  assert.deepEqual(view.names(), [
    'Remove receipt a.png',
    'Remove receipt b.png',
  ]);

  await submit(view);

  assert.deepEqual(
    view.calls.map((call) => call.slice(0, 3)),
    [
      ['create', view.calls[0][1]],
      ['upload', 'trade-1', 'a.png'],
      ['upload', 'trade-1', 'b.png'],
    ]
  );
  assert.deepEqual(view.toasts, [
    ['success', 'Collection recorded with 2 receipts.'],
  ]);
  assert.equal(view.resets(), 1);
  assert.deepEqual(view.closed, [false]);
  assert.deepEqual(view.names(), []);
});

test('with no receipts the old message stays', async () => {
  const view = mount();
  await submit(view);

  assert.deepEqual(view.toasts, [['success', 'Collection recorded.']]);
  assert.equal(view.calls.length, 1);
});

test('a failed receipt keeps the collection and names the file', async () => {
  const view = mount({ failing: ['b.png'] });
  view.pick(png('a.png'), png('b.png'));

  await submit(view);

  assert.equal(view.calls.filter((call) => call[0] === 'upload').length, 2);
  assert.deepEqual(view.toasts, [
    [
      'warning',
      'Collection recorded, but b.png did not upload. Add them from Invoice and receipts.',
    ],
  ]);
  assert.equal(view.resets(), 1);
  assert.deepEqual(view.closed, [false]);
});

test('wrong type, big files and a sixth file are refused at pick time', () => {
  const view = mount();

  view.pick({ name: 'a.pdf', type: 'application/pdf', size: 10 });
  assert.deepEqual(view.alerts(), ['Choose a PNG or JPEG image.']);

  view.pick(png('big.png', 5 * mb + 1));
  assert.deepEqual(view.alerts(), ['The image is over 5 MB.']);
  assert.deepEqual(view.names(), []);

  view.pick(
    png('1.png'),
    png('2.png'),
    png('3.png'),
    png('4.png'),
    png('5.png')
  );
  assert.equal(view.names().length, 5);
  assert.equal(view.input(), undefined, 'the add button hides at five');
});

test('a sixth file in one pick is refused with a message', () => {
  const view = mount();

  view.pick(
    png('1.png'),
    png('2.png'),
    png('3.png'),
    png('4.png'),
    png('5.png'),
    png('6.png')
  );

  assert.equal(view.names().length, 5);
  assert.deepEqual(view.alerts(), ['A collection holds at most 5 receipts.']);
});
