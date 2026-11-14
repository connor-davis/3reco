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

/** A tiny stand-in for React state: one slot per useState call, reset per render. */
function stateful() {
  const slots = [];
  let cursor = 0;
  return {
    reset: () => {
      cursor = 0;
    },
    react: {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (value) => {
            slots[index] = value;
          },
        ];
      },
      useMemo: (make) => make(),
      useEffect: () => {},
    },
  };
}
// Arrays made inside the vm have another prototype; compare their JSON.
const plain = (value) => JSON.parse(JSON.stringify(value));
const cn = (...values) => values.filter(Boolean).join(' ');
const galleryPath = 'routes/market/listing/-components/gallery.tsx';

test('a broken listing card image falls back to the box and recovers on a new URL', () => {
  let failed;
  const { ListingCard } = compile('components/listing-card.tsx', {
    react: {
      useState: () => [
        failed,
        (value) => {
          failed = value;
        },
      ],
    },
    '@/lib/format': load('lib/format.ts'),
  });
  const props = { listing: { image_url: '/broken', weight: '1', price: '2' } };
  const render = () => nodes(ListingCard(props));
  render()
    .find((node) => node.type === 'img')
    .props.onError();
  assert.equal(
    render().some((node) => node.type === 'img'),
    false
  );
  assert.ok(
    render().some((node) => node.type === require('lucide-react').Package)
  );
  props.listing.image_url = '/replacement';
  assert.equal(
    render().find((node) => node.type === 'img').props.src,
    '/replacement'
  );
});

test('a broken gallery photo falls back to the placeholder and recovers on a new URL', () => {
  const state = stateful();
  const { Slide } = compile(
    galleryPath,
    { react: state.react, '@/lib/utils': { cn } },
    '\nexports.Slide = Slide;'
  );
  const props = { src: '/broken', name: 'Glass' };
  const render = () => {
    state.reset();
    return nodes(Slide(props));
  };
  render()
    .find((node) => node.type === 'img')
    .props.onError();
  assert.equal(
    render().some((node) => node.type === 'img'),
    false
  );
  assert.ok(
    render().some((node) => node.type === require('lucide-react').Package)
  );
  props.src = '/replacement';
  assert.equal(
    render().find((node) => node.type === 'img').props.src,
    '/replacement'
  );
});

test('listing cards show stock photos and seller logos with a placeholder fallback', () => {
  const { ListingCard } = compile('components/listing-card.tsx', {
    react: { useState: () => [undefined, () => {}] },
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

test('gallery without photos shows the placeholder in the smaller responsive frame', () => {
  const state = stateful();
  const { Gallery } = compile(galleryPath, {
    react: state.react,
    '@/lib/utils': { cn },
  });
  const tree = Gallery({ name: 'Glass' });
  assert.match(tree.props.className, /aspect-\[4\/3\]/);
  assert.match(tree.props.className, /max-h-64/);
  assert.match(tree.props.className, /lg:max-w-md/);
  assert.ok(
    nodes(tree).some(
      (node) => node.props['aria-label'] === 'Material placeholder'
    )
  );
  assert.ok(
    nodes(Gallery({ images: [], name: 'Glass' })).some(
      (node) => node.props['aria-label'] === 'Material placeholder'
    )
  );
});

test('gallery lists every photo with thumbnails that jump to it', () => {
  const state = stateful();
  const { Gallery } = compile(galleryPath, {
    react: state.react,
    '@/lib/utils': { cn },
  });
  const images = ['/a?v=1', '/b?v=1', '/c?v=1'];
  const render = () => {
    state.reset();
    return nodes(Gallery({ images, name: 'Glass' }));
  };
  let tree = render();
  const slides = tree.filter((node) => node.type?.name === 'Slide');
  assert.deepEqual(
    slides.map((node) => node.props.src),
    images
  );
  assert.ok(tree.some((node) => node.type === 'CarouselPrevious'));
  assert.ok(tree.some((node) => node.type === 'CarouselNext'));

  const scrolled = [];
  tree
    .find((node) => node.props.setApi)
    .props.setApi({
      scrollTo: (index) => scrolled.push(index),
      selectedScrollSnap: () => 0,
      on: () => {},
      off: () => {},
    });
  tree = render();
  const thumbs = tree.filter(
    (node) => node.type === 'button' && node.props.onClick
  );
  assert.equal(thumbs.length, 3);
  assert.equal(thumbs[2].props['aria-label'], 'Show photo 3 of 3');
  thumbs[2].props.onClick();
  assert.deepEqual(scrolled, [2]);
});

test('gallery with one photo has no arrows or thumbnails', () => {
  const state = stateful();
  const { Gallery } = compile(galleryPath, {
    react: state.react,
    '@/lib/utils': { cn },
  });
  const tree = nodes(Gallery({ images: ['/a?v=1'], name: 'Glass' }));
  assert.equal(tree.filter((node) => node.type?.name === 'Slide').length, 1);
  assert.ok(!tree.some((node) => node.type === 'CarouselNext'));
  assert.ok(!tree.some((node) => node.type === 'button'));
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

function stockForm(stock, options = {}) {
  const state = [];
  const effects = [];
  const calls = [];
  let cursor = 0;
  const mutation = (kind) => ({
    isPending: false,
    mutateAsync: async (value) => {
      calls.push([kind, value]);
      if (kind === 'create') return { id: 'new1' };
      if (kind === 'addPhoto' && options.uploadFails) throw new Error('boom');
    },
  });
  const values = {
    material_id: 'm',
    weight: '10',
    price: '8',
    is_listed: true,
    ...options.values,
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
          setValue: (name, value) => {
            values[name] = value;
            calls.push(['set', name, value]);
          },
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
      sonner: {
        toast: {
          success: () => {},
          warning: (message) => calls.push(['warning', message]),
        },
      },
      './stock-photos': { StockPhotos: 'StockPhotos' },
      '@/lib/api/materials': {
        useMaterials: () => ({ data: { items: options.items ?? [] } }),
      },
      '@/lib/api/stock': {
        useCreateStock: () => mutation('create'),
        useUpdateStock: () => mutation('update'),
        useAddStockPhoto: () => mutation('addPhoto'),
      },
      '@/lib/format': load('lib/format.ts'),
      '@/lib/quantity': {
        ...load('lib/quantity.ts', {
          '@/lib/format': load('lib/format.ts'),
        }),
        priceCounter: () => ({}),
        weightCounter: () => ({}),
      },
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
  const pick = (tree, id) =>
    nodes(tree)
      .find((node) => node.props.onPick)
      .props.onPick(id);
  const photos = (tree) =>
    nodes(tree).find((node) => node.type === 'StockPhotos');
  return { render, input, save, calls, effects, pick, values, photos };
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
  photos: [{ id: 'p1', url: '/old?v=1' }],
};

test('photos of an existing line save on their own; Save only saves the text fields', async () => {
  const form = stockForm(item);
  const tree = form.render();
  assert.equal(form.input(tree), undefined);
  assert.equal(form.photos(tree).props.stock, item);
  await form.save(tree);
  assert.deepEqual(
    form.calls.map(([kind]) => kind),
    ['update', 'close']
  );
});

test('a photo problem blocks Save until it is cleared', () => {
  const form = stockForm(item);
  form.photos(form.render()).props.onError('Too big.');
  const tree = form.render();
  assert.equal(form.photos(tree).props.error, 'Too big.');
  assert.equal(
    nodes(tree.props.footer).find((node) => node.type === 'Button').props
      .disabled,
    true
  );
});

test('Add stock uploads every picked photo, in order, with the created id', async () => {
  const form = stockForm(undefined);
  let tree = form.render();
  const first = { type: 'image/png', size: 9 };
  const second = { type: 'image/webp', size: 9 };
  form.photos(tree).props.onStaged([first, second]);
  tree = form.render();
  await form.save(tree);
  assert.deepEqual(
    form.calls.map(([kind]) => kind),
    ['create', 'addPhoto', 'addPhoto', 'close']
  );
  assert.equal(form.calls[1][1].id, 'new1');
  assert.equal(form.calls[1][1].file, first);
  assert.equal(form.calls[2][1].file, second);
});

test('a photo that fails after create warns and does not create again', async () => {
  const form = stockForm(undefined, { uploadFails: true });
  let tree = form.render();
  form.photos(tree).props.onStaged([{ type: 'image/png', size: 9 }]);
  tree = form.render();
  await form.save(tree);
  assert.equal(form.calls.filter(([kind]) => kind === 'create').length, 1);
  assert.deepEqual(form.calls.at(-1), ['close', false]);
  assert.ok(
    form.calls.some(
      ([kind, message]) =>
        kind === 'warning' &&
        message ===
          'Stock added, but the photo did not upload. Edit the stock to try again.'
    )
  );
});

function photoField(options = {}) {
  const state = stateful();
  const calls = [];
  const saved = [
    { id: 'p1', url: '/a' },
    { id: 'p2', url: '/b' },
    { id: 'p3', url: '/c' },
  ];
  const props = {
    stock: options.stock === false ? undefined : { id: 's1', photos: saved },
    staged: options.staged ?? [],
    onStaged: (files) => {
      calls.push(['staged', files]);
      props.staged = files;
    },
    error: '',
    onError: (message) => calls.push(['error', message]),
    disabled: false,
    name: 'Glass',
  };
  const mutation = (kind) => ({
    isPending: false,
    mutateAsync: async (value) => {
      calls.push([kind, value]);
      return { photos: saved };
    },
  });
  const { StockPhotos } = compile(
    'components/dialogs/stock-photos.tsx',
    {
      react: state.react,
      '@/lib/api/stock': {
        useAddStockPhoto: () => mutation('add'),
        useDeleteStockPhoto: () => mutation('remove'),
        useReorderStockPhotos: () => mutation('reorder'),
      },
      '@/components/transactions/pager-state': {
        errorText: (error) => error.message,
      },
    },
    '',
    {
      URL: {
        createObjectURL: (file) => `blob:${file.name}`,
        revokeObjectURL: () => {},
      },
    }
  );
  const render = () => {
    state.reset();
    return nodes(StockPhotos(props));
  };
  const button = (tree, label) =>
    tree.find((node) => node.props['aria-label'] === label);
  const choose = (files) =>
    render()
      .find((node) => node.props.id === 'stock-photo')
      .props.onChange({ target: { files, value: '' } });
  return { render, calls, button, choose };
}

test('photo field refuses bad files and more than 8 photos, and sends nothing', async () => {
  const field = photoField();
  for (const file of [
    { type: 'image/gif', size: 10 },
    { type: 'image/png', size: 0 },
    { type: 'image/png', size: 2 * 1024 * 1024 + 1 },
  ]) {
    field.calls.length = 0;
    await field.choose([file]);
    assert.deepEqual(field.calls.at(-1), [
      'error',
      'Choose a PNG, JPEG or WebP image up to 2 MiB.',
    ]);
    assert.ok(!field.calls.some(([kind]) => kind === 'add'));
  }
  field.calls.length = 0;
  const png = { type: 'image/png', size: 5 };
  await field.choose([png, png, png, png, png, png]);
  assert.deepEqual(field.calls.at(-1), [
    'error',
    'A stock item can have up to 8 photos.',
  ]);
  assert.ok(!field.calls.some(([kind]) => kind === 'add'));
});

test('photo field on an existing line adds, moves and removes right away', async () => {
  const field = photoField();
  const file = { type: 'image/webp', size: 100 };
  await field.choose([file]);
  assert.deepEqual(plain(field.calls.find(([kind]) => kind === 'add')), [
    'add',
    { id: 's1', file },
  ]);

  for (const [label, expected] of [
    ['Move photo 1 down', ['reorder', ['p2', 'p1', 'p3']]],
    ['Move photo 3 up', ['reorder', ['p1', 'p3', 'p2']]],
    ['Remove photo 2', ['remove', 'p2']],
  ]) {
    field.calls.length = 0;
    field.button(field.render(), label).props.onClick();
    await Promise.resolve();
    assert.deepEqual(
      plain(field.calls.find(([kind]) => kind !== 'error')),
      expected
    );
  }

  const tree = field.render();
  assert.equal(field.button(tree, 'Move photo 1 up').props.disabled, true);
  assert.equal(field.button(tree, 'Move photo 3 down').props.disabled, true);
  assert.ok(tree.some((node) => node.props.children === 'Cover'));
});

test('photo field on a new line stages, reorders and removes locally', () => {
  const one = { type: 'image/png', size: 1, name: 'one' };
  const two = { type: 'image/png', size: 1, name: 'two' };
  const field = photoField({ stock: false, staged: [one, two] });
  field.button(field.render(), 'Move photo 2 up').props.onClick();
  assert.deepEqual(plain(field.calls.at(-1)), ['staged', [two, one]]);
  field.button(field.render(), 'Remove photo 1').props.onClick();
  assert.deepEqual(plain(field.calls.at(-1)), ['staged', [one]]);
  assert.ok(
    !field.calls.some(([kind]) => ['add', 'reorder', 'remove'].includes(kind))
  );
});

const materials = [
  { id: 'm', name: 'Glass', price: '5.00' },
  { id: 'n', name: 'Tin', price: '9.50' },
];

test('picking a material fills its default price when the price is empty or still the old default', () => {
  const empty = stockForm(undefined, {
    items: materials,
    values: { price: '' },
  });
  empty.pick(empty.render(), 'n');
  assert.deepEqual(empty.calls[0], ['set', 'price', '9.50']);

  const old = stockForm(undefined, {
    items: materials,
    values: { price: '5' },
  });
  old.pick(old.render(), 'n');
  assert.deepEqual(old.calls[0], ['set', 'price', '9.50']);
});

test('picking a material never overwrites a price the user typed', () => {
  const form = stockForm(undefined, {
    items: materials,
    values: { price: '7.25' },
  });
  form.pick(form.render(), 'n');
  assert.equal(form.calls.length, 0);
});

test('a price below the default warns but does not block Save', async () => {
  const form = stockForm(undefined, {
    items: materials,
    values: { price: '1' },
  });
  const tree = form.render();
  assert.ok(
    nodes(tree).some(
      (node) =>
        node.props.children ===
        'Below the default price of R 5.00 / kg. You can still save.'
    )
  );
  assert.equal(
    nodes(tree.props.footer).find((node) => node.type === 'Button').props
      .disabled,
    false
  );
  await form.save(tree);
  assert.equal(form.calls[0][0], 'create');
});

test('editing stock keeps its saved price', () => {
  const form = stockForm({ ...item, price: '2.00' }, { items: materials });
  assert.equal(form.calls.length, 0);
});
