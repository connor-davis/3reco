import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { load, source } from './qa-round2-loader.mjs';

const require = createRequire(import.meta.url);
const format = load('lib/format.ts');
const react = {
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
  useEffect: () => {},
};

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
    require: (id) => {
      if (id in mocks) return mocks[id];
      if (id === 'react') return react;
      if (id === '@/lib/format') return format;
      if (id === '@/lib/names') return load('lib/names.ts');
      if (id === '@/components/transactions/phone')
        return load('components/transactions/phone.ts');
      if (id.startsWith('@/') || id.startsWith('.'))
        return new Proxy({}, { get: (_, name) => name });
      return require(id);
    },
  });
  return exports;
}

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

function text(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  return [node.props?.children].flat(Infinity).map(text).join(' ');
}

const dialogPath = 'components/dialogs/collector-dialog.tsx';
const exposeDialog =
  '\nexports.schemaFor = schemaFor; exports.toValues = toValues; exports.toInput = toInput; exports.CollectorForm = CollectorForm;';
const dialog = compile(dialogPath, {}, exposeDialog);
const collector = {
  id: 'collector',
  name: 'Nomsa Dube',
  email: '',
  phone: '+27825550141',
  street_address: '12 Main Road',
  city: 'Durban',
  area_code: 4000,
  province: 'KwaZulu-Natal',
};

test('H2: the missing contact requirement appears once on Email', () => {
  const values = { ...dialog.toValues(collector), phone: '' };
  const result = dialog.schemaFor().safeParse(values);
  assert.equal(result.success, false);
  const issues = result.error.issues.filter(
    (issue) => issue.message === 'Add an email or a phone number.'
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path[0], 'email');

  for (const [field, value] of [
    ['email', 'bad'],
    ['phone', '123'],
  ]) {
    const invalid = dialog.schemaFor().safeParse({ ...values, [field]: value });
    assert.equal(invalid.success, false);
    assert.ok(invalid.error.issues.some((issue) => issue.path[0] === field));
  }
});

test('H3: grouped phone prefills validate and serialize without spaces', () => {
  const values = dialog.toValues(collector);
  assert.equal(values.phone, '+27 82 555 0141');
  assert.equal(dialog.schemaFor(collector).safeParse(values).success, true);
  assert.equal(dialog.toInput(values, collector).phone, collector.phone);
  assert.equal(
    dialog.toInput({ ...values, phone: '082 555 0142' }, collector).phone,
    '0825550142'
  );
});

function collectorForm(role, saved = collector) {
  const writes = [];
  const messages = [];
  let submit;
  let values;
  const form = compile(
    dialogPath,
    {
      '@/lib/auth/use-auth': { useAuth: () => ({ user: { role } }) },
      'react-hook-form': {
        useForm: (options) => {
          values = options.values;
          return {
            control: {},
            watch: (key) => values[key],
            handleSubmit: (callback) => {
              submit = callback;
              return () => {};
            },
          };
        },
      },
      '@/lib/api/collectors': {
        useCreateCollector: () => ({}),
        useUpdateCollector: () => ({
          mutateAsync: (input) => writes.push(input),
        }),
      },
      sonner: {
        toast: {
          info: (message) => messages.push(message),
          success: (message) => messages.push(message),
        },
      },
    },
    exposeDialog
  );
  const tree = form.CollectorForm({ collector: saved, onOpenChange: () => {} });
  return { tree, writes, messages, values, submit: (input) => submit(input) };
}

test('H3: saving an unchanged grouped phone skips PATCH; an edit saves', async () => {
  const form = collectorForm('business');
  await form.submit(form.values);
  assert.equal(form.writes.length, 0);
  assert.deepEqual(form.messages, ['No changes to save.']);
  await form.submit({ ...form.values, phone: '+27 82 555 0142' });
  assert.equal(form.writes.length, 1);
  assert.equal(form.writes[0].phone, '+27825550142');
});

test('S8: staff see contact copy and a disabled blank payout state', async () => {
  const form = collectorForm('staff');
  assert.equal(
    form.tree.props.description,
    'Update this collector’s contact details.'
  );
  const fieldset = nodes(form.tree).find((node) => node.type === 'fieldset');
  assert.equal(fieldset.props.disabled, true);
  assert.match(text(fieldset), /None added/);
  assert.equal(
    nodes(fieldset).some((node) => node.props.name === 'payout_method'),
    false
  );
  await form.submit({ ...form.values, city: 'Paarl' });
  assert.equal(form.writes.length, 1);
  assert.equal(form.writes[0].city, 'Paarl');
  assert.equal(
    Object.keys(form.writes[0]).some((key) =>
      /^(bank_|ewallet_|payout_method)/.test(key)
    ),
    false
  );
});

test('S8: saved payout methods remain selected and business starts with no method', () => {
  for (const method of ['bank', 'ewallet']) {
    const form = collectorForm('staff', {
      ...collector,
      payout_method: method,
    });
    const controller = nodes(form.tree).find(
      (node) => node.props.name === 'payout_method'
    );
    assert.ok(controller);
    const choices = controller.props.render({
      field: { value: form.values.payout_method },
    });
    const radios = nodes(choices).find((node) => node.type === 'RadioGroup');
    assert.equal(radios.props.value, method);
    assert.doesNotMatch(text(form.tree), /None added/);
  }
  assert.equal(collectorForm('business').values.payout_method, '');
});

test('S4: table columns retain sticky edges without partial vertical dividers', () => {
  const table = source('components/data-table.tsx');
  assert.doesNotMatch(table, /border-[lr](?:\s|['"])/);
  assert.match(table, /left-0/);
  assert.match(table, /right-0/);
  assert.match(table, /overflow-hidden rounded-2xl border/);
  for (const route of ['materials', 'collectors']) {
    assert.doesNotMatch(
      source(`routes/${route}.tsx`),
      /border-[lr](?:\s|['"])/
    );
  }
});

test('S6: read history reserves the unread dot space without an Unread label', () => {
  const notices = [false, true].map((read) => ({
    id: String(read),
    read,
    title: 'Collection saved',
    body: 'Details',
    created_at: '2026-11-08T08:00:00Z',
  }));
  const mutation = () => ({});
  const { default: TrayList } = compile(
    'components/shell/notification-tray-list.tsx',
    {
      '@tanstack/react-router': { useNavigate: () => () => {} },
      '@/lib/api/notifications': {
        useNotifications: () => ({ data: { items: notices } }),
        useUnreadCount: () => ({ data: { count: 1 } }),
        useReadNotification: mutation,
        useReadAllNotifications: mutation,
        useDismissNotification: mutation,
        useDismissAllNotifications: mutation,
      },
    }
  );
  const titles = nodes(TrayList({ onNavigate: () => {} })).filter(
    (node) => node.type === 'ItemTitle'
  );
  assert.equal(titles.length, 2);
  const slots = titles.map((title) =>
    nodes(title).find((node) => node.type === 'span')
  );
  for (const slot of slots)
    assert.match(slot.props.className, /mr-2 inline-block size-2/);
  assert.equal(slots[0].props['aria-label'], 'Unread');
  assert.equal(slots[1].props['aria-label'], undefined);
  assert.equal(slots[1].props['aria-hidden'], true);
  assert.match(slots[1].props.className, /bg-transparent/);
  assert.match(titles[1].props.className, /text-muted-foreground/);
});

test('S9: admin cards omit repeated names while participant summaries remain', () => {
  for (const role of ['admin', 'business']) {
    const thread = {
      request_id: 'request',
      status: 'accepted',
      activity_at: '2026-11-08T08:00:00Z',
      buyer: { id: 'buyer', name: 'Buyer Store' },
      seller: { id: 'seller', name: 'Seller Store' },
      other: {
        name: role === 'admin' ? 'Buyer Store ↔ Seller Store' : 'Seller Store',
      },
      unread_count: 0,
    };
    const helpers = load('components/chat/helpers.ts', {
      '@/lib/format': format,
    });
    const { Inbox } = compile('components/chat/inbox.tsx', {
      '@/lib/auth/use-auth': {
        useAuth: () => ({ user: { role, id: 'buyer' } }),
      },
      '@/lib/api/messages': {
        useThreadHistory: () => ({ data: { pages: [{ items: [thread] }] } }),
      },
      '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
      './helpers': helpers,
    });
    const tree = Inbox({ onNew: () => {} });
    const card = nodes(tree).find(
      (node) => node.props.to === '/messages/$requestId'
    );
    assert.ok(card);
    const content = text(card);
    if (role === 'admin') {
      assert.equal(content.split('Buyer Store').length - 1, 1);
      assert.equal(content.split('Seller Store').length - 1, 1);
      assert.match(text(tree), /can't send messages/);
    } else {
      assert.match(content, /Buyer Store and Seller Store/);
    }
  }
});
