import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { z } from 'zod';

function compile(path, dependencies = {}, suffix = '') {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8') + suffix;
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      if (name in dependencies) return dependencies[name];
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  return exports;
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

test('cart restores the saved exact weight and sends edited weight at checkout', async () => {
  const writes = [];
  let values;
  const mutation =
    (name, result = {}) =>
    () => ({
      mutateAsync: async (body) => {
        writes.push({ name, body });
        return result;
      },
    });
  const format = compile('../src/lib/format.ts');
  const { CartForm } = compile(
    '../src/routes/cart.tsx',
    {
      'react/jsx-runtime': jsx,
      react: {
        useCallback: (callback) => callback,
        useRef: (current) => ({ current }),
        useState: (value) => [value, () => {}],
      },
      '@tanstack/react-router': {
        createFileRoute: () => (options) => options,
        useNavigate: () => async (body) =>
          writes.push({ name: 'navigate', body }),
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
      '@hookform/resolvers/zod': { zodResolver: () => {} },
      zod: { z },
      '@/lib/api/cart': {
        useSaveCart: mutation('save'),
        useClearCart: mutation('clear'),
      },
      '@/lib/api/requests': {
        useCreateRequest: mutation('create', { id: 'request' }),
      },
      '@/lib/format': format,
      '@/lib/quantity': { quantityError: () => null },
    },
    '\nexport { CartForm };'
  );
  const tree = CartForm({
    sellerId: 'seller',
    name: 'Store',
    items: [
      { stock_id: 'stock', material_id: 'glass', weight: '12.125', price: '8' },
    ],
  });
  assert.equal(values.items[0].weight, '12.125');
  values.items[0].weight = ' 9,750001 ';
  find(tree, (node) => !!node.props?.onValidation).props.onValidation(
    'stock',
    null
  );
  await find(tree, (node) => node.type === 'form').props.onSubmit();
  assert.equal(
    writes.map((write) => write.name).join(','),
    'save,create,clear,navigate'
  );
  assert.equal(writes[0].body.items[0].weight, '9.750001');
  assert.equal(writes[1].body.items[0].weight, '9.750001');
  assert.equal(writes[1].body.seller_id, 'seller');
  assert.equal(Object.hasOwn(writes[1].body.items[0], 'price'), false);
});

test('both offer directions enforce recipient-first confirmation and allow counters', () => {
  const format = compile('../src/lib/format.ts');
  const helpers = compile('../src/components/chat/helpers.ts', {
    '@/lib/format': format,
  });
  for (const maker of ['buyer', 'seller']) {
    const recipient = maker === 'buyer' ? 'seller' : 'buyer';
    const request = {
      buyer: { id: 'buyer' },
      seller: { id: 'seller' },
      status: 'offered',
      offer_by: maker,
      offer_version: 2,
      buyer_confirmed_version: null,
      seller_confirmed_version: null,
    };
    assert.equal(helpers.canRespond(request, maker), false);
    assert.equal(helpers.canRespond(request, recipient), true);
    assert.equal(helpers.canMakeOffer(request, maker), false);
    assert.equal(helpers.canMakeOffer(request, recipient), true);
    assert.equal(helpers.canRespond(request, 'stranger'), false);
    request[`${recipient}_confirmed_version`] = 2;
    assert.equal(helpers.canRespond(request, maker), true);
    assert.equal(helpers.canRespond(request, recipient), false);
    request.offer_version = 3;
    assert.equal(helpers.canRespond(request, maker), false);
    assert.equal(helpers.canRespond(request, recipient), true);
  }
});
