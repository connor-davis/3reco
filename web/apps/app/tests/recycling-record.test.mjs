import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { source, load } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
const format = load('lib/format.ts');

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
const textOf = (node) =>
  [node?.props?.children].flat(Infinity).filter((x) => typeof x === 'string');

test('the batch recycling record opens from the transaction header overflow', () => {
  let open = false;
  const { RecyclingRecordButton } = compile(
    'components/dialogs/recycling-record-dialog.tsx',
    {
      react: {
        useState: () => [
          open,
          (value) => {
            open = value;
          },
        ],
      },
    }
  );
  const tree = nodes(RecyclingRecordButton());
  const menu = tree.find((node) => node.type === 'RowActions');
  assert.equal(menu.props.name, 'transactions');
  assert.equal(menu.props.actions[0].label, 'Recycling record');
  menu.props.actions[0].onSelect();
  assert.equal(open, true);
});

test('this month runs to today and last month covers whole days across year ends', () => {
  const range = (which, day) => JSON.stringify(format.monthRange(which, day));
  assert.equal(
    range('this', '2026-11-17'),
    JSON.stringify({ from: '2026-11-01', to: '2026-11-17' })
  );
  assert.equal(
    range('last', '2026-11-17'),
    JSON.stringify({ from: '2026-10-01', to: '2026-10-31' })
  );
  assert.equal(
    range('last', '2026-01-05'),
    JSON.stringify({ from: '2025-12-01', to: '2025-12-31' })
  );
  assert.equal(
    range('last', '2024-03-31'),
    JSON.stringify({ from: '2024-02-01', to: '2024-02-29' })
  );
});

// A tiny useState: values live in a list, so a re-render sees the earlier answers.
function dialog(initial = []) {
  const calls = [];
  const values = [...initial];
  let slot = 0;
  const mutate = (input, handlers) => calls.push({ input, handlers });
  const { RecyclingRecordDialog } = compile(
    'components/dialogs/recycling-record-dialog.tsx',
    {
      react: {
        useState: (value) => {
          const index = slot++;
          if (!(index in values)) values[index] = value;
          return [values[index], (next) => (values[index] = next)];
        },
      },
      sonner: { toast: { success: () => {}, error: () => {} } },
      '@/lib/api/transactions': {
        useDownloadPeriodRecord: () => ({ mutate, isPending: false }),
      },
      '@/lib/format': {
        monthRange: format.monthRange,
        today: () => '2026-11-17',
      },
    }
  );
  const render = () => {
    slot = 0;
    const tree = nodes(
      RecyclingRecordDialog({ open: true, onOpenChange: () => {} })
    );
    return {
      tree,
      footer: tree.find((node) => node.props?.footer).props.footer,
      choices: tree.filter(
        (node) => node.props?.['aria-pressed'] !== undefined
      ),
    };
  };

  return { render, calls, values };
}

test('the dialog offers this month, last month and custom dates, and downloads the pick', () => {
  const { render, calls, values } = dialog();

  assert.equal(
    render().choices.flatMap(textOf).join('|'),
    'This month|Last month|Custom dates'
  );

  render().footer.props.onClick();
  assert.equal(
    JSON.stringify(calls.at(-1).input),
    JSON.stringify({ from: '2026-11-01', to: '2026-11-17' })
  );

  render()
    .choices.find((node) => textOf(node).includes('Last month'))
    .props.onClick();
  assert.equal(values[0], 'last');

  render().footer.props.onClick();
  assert.equal(
    JSON.stringify(calls.at(-1).input),
    JSON.stringify({ from: '2026-10-01', to: '2026-10-31' })
  );
});

test('custom dates need both days in order before Download works', () => {
  const { render, values } = dialog(['custom', '', '']);
  const says = (message) =>
    render().tree.some((node) => textOf(node).includes(message));

  assert.equal(render().footer.props.disabled, true);
  assert.ok(says('Pick a start and an end date.'));

  values[1] = '2026-03-31';
  values[2] = '2026-03-01';
  assert.equal(render().footer.props.disabled, true);
  assert.ok(says('The end date cannot be before the start date.'));

  values[2] = '2026-03-31';
  assert.equal(render().footer.props.disabled, false);
  assert.ok(render().tree.some((node) => node.props?.id === 'record-from'));
});

test('the trade menu offers Recycling record only for a completed trade', () => {
  const recorded = [];
  const { TradeDetail } = compile('components/dialogs/record-dialogs.tsx', {
    '@tanstack/react-router': { useNavigate: () => () => {} },
    '@/lib/api/cart': { useSaveCart: () => ({}) },
    '@/components/ui/button-variants': { buttonVariants: () => '' },
    '@/lib/utils': { cn: () => '' },
    react: { useState: (value) => [value, () => {}] },
    '@/lib/auth/use-auth': {
      useAuth: () => ({ user: { id: 'u', role: 'admin' } }),
    },
    '@/lib/api/transactions': {
      useTransaction: () => ({}),
      useDownloadInvoice: () => ({}),
      useDownloadRecord: () => ({
        isPending: false,
        mutate: (trade) => recorded.push(trade.id),
      }),
    },
    '@/lib/api/receipts': {
      kinds: [],
      maxBytes: 1,
      maxReceipts: 5,
      useUploadReceipt: () => ({}),
      useDownloadReceipt: () => ({}),
      useDeleteReceipt: () => ({}),
    },
    '@/lib/format': format,
  });
  const trade = (status) => ({
    id: 't-' + status,
    type: 'b2b',
    status,
    invoice_number: 'ABCD1234',
    buyer: { id: 'b' },
    seller: { id: 's' },
    items: [],
    effective_at: '2026-11-08',
    total_price: '2',
    receipts: [],
  });
  const item = (status) =>
    nodes(TradeDetail({ record: trade(status) })).find((node) =>
      textOf(node).includes('Recycling record')
    );

  assert.equal(item('pending'), undefined);
  assert.equal(item('cancelled'), undefined);
  item('complete').props.onClick();
  assert.equal(recorded.join(','), 't-complete');
});
