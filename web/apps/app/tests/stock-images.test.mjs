import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { source, load } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
function compile(path, mocks = {}, suffix = '', globals = {}) {
  const { outputText } = ts.transpileModule(source(path) + suffix, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    ...globals,
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/')) return new Proxy({}, { get: (_, name) => name });
      return require(id);
    },
  });
  return exports;
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}

test('listing cards show stock photos and seller logos with a placeholder fallback', () => {
  const { ListingCard } = compile('components/listing-card.tsx', {
    '@/lib/format': load('lib/format.ts'),
  });
  const listing = {
    id: 's1',
    material_name: 'Glass',
    weight: '10',
    price: '8',
    seller_name: 'Green Co',
    image_url: '/photo?v=1',
    seller_avatar_url: '/logo?v=2',
  };
  const tree = nodes(ListingCard({ listing }));
  assert.equal(
    tree.find((node) => node.type === 'img').props.src,
    listing.image_url
  );
  assert.equal(tree.find((node) => node.type === 'img').props.alt, 'Glass');
  assert.equal(
    tree.find((node) => node.type === 'PersonAvatar').props.image,
    listing.seller_avatar_url
  );
  assert.ok(
    !nodes(ListingCard({ listing, showSeller: false })).some(
      (node) => node.type === 'PersonAvatar'
    )
  );
  assert.ok(
    nodes(ListingCard({ listing: { ...listing, image_url: '' } })).some(
      (node) => node.type === require('lucide-react').Package
    )
  );
});

test('gallery shows the stock photo in the smaller responsive frame', () => {
  const { Gallery } = compile('routes/market/listing/-components/gallery.tsx');
  const tree = Gallery({ image: '/photo?v=1', name: 'Glass' });
  assert.match(tree.props.className, /aspect-\[4\/3\]/);
  assert.match(tree.props.className, /max-h-64/);
  assert.match(tree.props.className, /lg:max-w-md/);
  const image = nodes(tree).find((node) => node.type === 'img');
  assert.equal(image.props.alt, 'Glass');
  assert.match(image.props.className, /object-cover object-center/);
  assert.ok(
    nodes(Gallery({ name: 'Glass' })).some(
      (node) => node.props['aria-label'] === 'Material placeholder'
    )
  );
});

test('PersonAvatar renders its image and keeps initials as the fallback', () => {
  const { PersonAvatar } = compile('components/visuals.tsx', {
    '@/lib/format': load('lib/format.ts'),
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  });
  const tree = nodes(PersonAvatar({ name: 'Green Co', image: '/logo?v=2' }));
  assert.equal(
    tree.find((node) => node.type === 'AvatarImage').props.src,
    '/logo?v=2'
  );
  assert.equal(
    tree.find((node) => node.type === 'AvatarFallback').props.children,
    'GC'
  );
  assert.ok(
    !nodes(PersonAvatar({ name: 'Green Co' })).some(
      (node) => node.type === 'AvatarImage'
    )
  );
});

function stockForm(stock) {
  const state = [];
  const effects = [];
  const calls = [];
  let cursor = 0;
  const mutation = (kind) => ({
    isPending: false,
    mutateAsync: async (value) => {
      calls.push([kind, value]);
    },
  });
  const values = {
    material_id: 'm',
    weight: '10',
    price: '8',
    is_listed: true,
  };
  const hooks = {
    useState: (initial) => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [
        state[index],
        (value) => {
          state[index] = value;
        },
      ];
    },
    useRef: (value) => ({ current: value }),
    useEffect: (effect) => effects.push(effect),
  };
  const { StockForm } = compile(
    'components/dialogs/stock-dialog.tsx',
    {
      react: hooks,
      '@hookform/resolvers/zod': { zodResolver: () => () => ({}) },
      'react-hook-form': {
        useForm: () => ({
          control: {},
          handleSubmit: (fn) => () => fn(values),
          watch: (key) => values[key],
          setValue: () => {},
          setError: () => {},
          trigger: () => {},
          formState: {
            isValid: true,
            isDirty: false,
            touchedFields: {},
            errors: {},
          },
        }),
      },
      sonner: { toast: { success: () => {} } },
      '@/lib/api/materials': { useMaterials: () => ({ data: { items: [] } }) },
      '@/lib/api/stock': {
        useCreateStock: () => mutation('create'),
        useUpdateStock: () => mutation('update'),
        useUploadStockImage: () => mutation('upload'),
        useDeleteStockImage: () => mutation('remove'),
      },
      '@/lib/format': load('lib/format.ts'),
      '@/lib/quantity': { priceCounter: () => ({}), weightCounter: () => ({}) },
    },
    '\nexports.StockForm = StockForm;',
    {
      URL: {
        createObjectURL: () => 'blob:preview',
        revokeObjectURL: (url) => calls.push(['revoke', url]),
      },
    }
  );
  const render = () => {
    cursor = 0;
    return StockForm({
      open: true,
      stock,
      onOpenChange: (open) => calls.push(['close', open]),
    });
  };
  const input = (tree) =>
    nodes(tree).find((node) => node.props.id === 'stock-photo');
  const save = (tree) =>
    nodes(tree.props.footer)
      .find((node) => node.type === 'Button')
      .props.onClick();
  return { render, input, save, calls, effects };
}

const item = {
  id: 's1',
  material_id: 'm',
  material_name: 'Glass',
  weight: '10',
  available_weight: '10',
  price: '8',
  base_price: '2',
  is_listed: true,
  image_url: '/old?v=1',
};

test('stock photo field is edit-only, validates files, previews and uploads on Save', async () => {
  const create = stockForm(undefined);
  assert.equal(create.input(create.render()), undefined);
  const form = stockForm(item);
  let tree = form.render();
  const choose = (file) =>
    form.input(tree).props.onChange({ target: { files: [file] } });
  for (const file of [
    { type: 'image/gif', size: 10 },
    { type: 'image/png', size: 0 },
    { type: 'image/png', size: 2 * 1024 * 1024 + 1 },
  ]) {
    choose(file);
    tree = form.render();
    assert.ok(
      nodes(tree).some(
        (node) =>
          node.props.role === 'alert' &&
          node.props.children ===
            'Choose a PNG, JPEG or WebP image up to 2 MiB.'
      )
    );
    assert.equal(
      nodes(tree.props.footer).find((node) => node.type === 'Button').props
        .disabled,
      true
    );
  }
  const file = { type: 'image/webp', size: 100 };
  choose(file);
  tree = form.render();
  assert.equal(
    nodes(tree).find((node) => node.type === 'img').props.src,
    'blob:preview'
  );
  const cleanup = form.effects.at(-2)();
  await form.save(tree);
  assert.deepEqual(
    form.calls.map(([kind]) => kind),
    ['update', 'upload', 'close']
  );
  assert.equal(form.calls[1][1], file);
  cleanup();
  assert.deepEqual(form.calls.at(-1), ['revoke', 'blob:preview']);
});

test('stock photo Remove waits until Save', async () => {
  const form = stockForm(item);
  let tree = form.render();
  nodes(tree)
    .find(
      (node) =>
        node.type === 'Button' && node.props.children === 'Remove picture'
    )
    .props.onClick();
  assert.equal(form.calls.length, 0);
  tree = form.render();
  assert.ok(!nodes(tree).some((node) => node.type === 'img'));
  await form.save(tree);
  assert.deepEqual(
    form.calls.map(([kind]) => kind),
    ['update', 'remove', 'close']
  );
});
