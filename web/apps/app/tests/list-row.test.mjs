import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { source } from './qa-round2-loader.mjs';

test('ListRow only renders a menu for actions, beside the primary body and switch', () => {
  const exports = {};
  const { outputText } = ts.transpileModule(source('components/list-row.tsx'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  vm.runInNewContext(outputText, {
    exports,
    require: (name) =>
      name === 'react/jsx-runtime'
        ? jsx
        : new Proxy({}, { get: (_, key) => key }),
  });
  const children = (node) =>
    [node.props.children].flat(Infinity).filter(Boolean);
  const { ListRow } = exports;
  for (const actions of [undefined, []]) {
    const row = ListRow({ title: 'Nomsa', actions });
    assert.equal(children(row).length, 1);
    assert.equal(children(row)[0].props.render, undefined);
  }

  let opened = 0;
  let selected = 0;
  const toggle = jsx.jsx('button', {
    role: 'switch',
    'aria-label': 'Listed: PET',
  });
  const row = ListRow({
    title: 'PET',
    onOpen: () => opened++,
    trailing: toggle,
    actions: [
      { label: 'Remove PET', destructive: true, onSelect: () => selected++ },
    ],
  });
  const [body, trailing, menu] = children(row);
  assert.equal(body.type, 'Item');
  assert.equal(body.props.render.type, 'button');
  body.props.render.props.onClick();
  assert.equal(opened, 1);
  assert.equal(trailing.props.children, toggle);
  assert.equal(menu.type, 'DropdownMenu');
  assert.ok(!children(body).includes(menu));
  assert.ok(!children(body).includes(trailing));
  const [trigger, popup] = children(menu);
  assert.equal(
    trigger.props.render.props['aria-label'],
    'More actions for PET'
  );
  const [action] = children(popup);
  assert.equal(action.props.children, 'Remove PET');
  assert.equal(action.props.variant, 'destructive');
  action.props.onClick();
  assert.equal(selected, 1);

  const linked = children(
    ListRow({
      title: 'Trade',
      to: '/messages/$requestId',
      params: { requestId: 'one' },
    })
  )[0];
  assert.equal(linked.props.render.type, 'Link');
  assert.equal(linked.props.render.props.params.requestId, 'one');
});
