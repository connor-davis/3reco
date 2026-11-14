import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './qa-round2-loader.mjs';

function pagerHook() {
  const values = [];
  let index = 0;
  const { usePager } = load('components/transactions/pager-state.ts', {
    react: {
      useState(initial) {
        const slot = index++;
        if (!(slot in values)) values[slot] = initial;
        return [values[slot], (next) => (values[slot] = next)];
      },
    },
    '@/lib/api/client': { ApiError: class extends Error {} },
  });
  return (filters = {}) => {
    index = 0;
    return usePager(filters);
  };
}

const { Pager } = load('components/transactions/list-tools.tsx', {
  '@/components/ui/button': { Button: 'button' },
  '@/components/filters': { ChoiceSelect: 'select' },
  '@/lib/api/paging': load('lib/api/paging.ts'),
  '@/lib/format': load('lib/format.ts'),
  '@/lib/utils': { cn: (...values) => values.join(' ') },
});

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function words(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(words).join(' ');
  return words(tree?.props?.children ?? []);
}

test('table paging defaults to 10 and page-size changes clear the cursor stack', () => {
  const render = pagerHook();
  let pager = render({ q: 'glass' });
  assert.equal(pager.params.limit, 10);
  pager.next('second');
  pager = render({ q: 'glass' });
  pager.next('third');
  pager = render({ q: 'glass' });
  assert.equal(pager.pageNumber, 3);
  assert.equal(pager.params.cursor, 'third');

  pager.setLimit(30);
  pager = render({ q: 'glass' });
  assert.equal(pager.params.limit, 30);
  assert.equal(pager.params.cursor, undefined);
  assert.equal(pager.pageNumber, 1);
  assert.equal(pager.hasPrevious, false);
  assert.equal(pager.params.q, 'glass');
  pager.next('new-second');
  pager = render({ q: 'paper' });
  assert.equal(pager.pageNumber, 1);
  assert.equal(pager.params.limit, 30);
  pager.next('paper-second');
  pager = render({ q: 'paper' });
  pager.previous();
  assert.equal(render({ q: 'paper' }).pageNumber, 1);
});

test('Pager keeps its count and 10–50 size options inside one footer on a single page', () => {
  const render = pagerHook();
  const tree = Pager({
    pager: render(),
    page: { items: [{}], has_more: false, next_cursor: null },
    total: 1,
  });
  assert.equal(tree.type, 'div');
  assert.match(tree.props.className, /flex-wrap/);
  assert.match(words(tree.props.children[0]), /1 record/);
  assert.match(words(tree), /1–1 of 1/);
  const select = nodes(tree).find((node) => node.type === 'select');
  assert.equal(select.props.label, 'Rows per page');
  assert.equal(select.props.value, '10');
  assert.equal(
    JSON.stringify(select.props.options),
    '["10","20","30","40","50"]'
  );
  select.props.onChange('50');
  assert.equal(render().params.limit, 50);
  const buttons = nodes(tree).filter((node) => node.type === 'button');
  assert.ok(buttons.every((node) => node.props.disabled));
});

test('Pager omits unknown totals and disables Next for empty or missing cursors', () => {
  const render = pagerHook();
  assert.equal(Pager({ pager: render() }), null);
  for (const page of [
    { items: [{}], has_more: true, next_cursor: null },
    { items: [], has_more: true, next_cursor: 'stale' },
  ]) {
    const tree = Pager({ pager: render(), page, total: 0 });
    const next = nodes(tree).find((node) => words(node) === 'Next');
    assert.equal(next.props.disabled, true);
  }
  const tree = Pager({
    pager: render(),
    page: { items: [{}], has_more: false, next_cursor: null },
  });
  assert.match(words(tree), /Page 1/);
  assert.doesNotMatch(words(tree), /records/);
});
