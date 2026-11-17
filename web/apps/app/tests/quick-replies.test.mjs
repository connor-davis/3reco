import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import { load, source } from './qa-round2-loader.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));

test('quick-reply client keeps one list per person and never sends an owner', () => {
  const calls = [];
  const api = load('lib/api/quick-replies.ts', {
    './favourites': { useCanSave: () => true },
    './resource': {
      useResource: (...args) => calls.push(args),
      useWrite: (...args) => calls.push(args),
      idPath: encodeURIComponent,
    },
  });
  api.useQuickReplies();
  assert.deepEqual(plain(calls.pop()), [
    ['quick-replies'],
    '/quick-replies',
    true,
    true,
  ]);

  api.useCreateQuickReply();
  const [createPath, createMethod, createKeys, createBody] = calls.pop();
  assert.equal(createPath, '/quick-replies');
  assert.equal(createMethod, 'POST');
  assert.deepEqual(plain(createKeys), [['quick-replies']]);
  assert.deepEqual(plain(createBody('On my way')), { body: 'On my way' });

  api.useUpdateQuickReply();
  const [updatePath, updateMethod, updateKeys, updateBody] = calls.pop();
  assert.equal(updatePath({ id: 'a/b c' }), '/quick-replies/a%2Fb%20c');
  assert.equal(updateMethod, 'PATCH');
  assert.deepEqual(plain(updateKeys), [['quick-replies']]);
  assert.deepEqual(plain(updateBody({ id: 'x', body: 'Hi' })), { body: 'Hi' });

  api.useDeleteQuickReply();
  const [deletePath, deleteMethod, deleteKeys, deleteBody] = calls.pop();
  assert.equal(deletePath('id'), '/quick-replies/id');
  assert.equal(deleteMethod, 'DELETE');
  assert.deepEqual(plain(deleteKeys), [['quick-replies']]);
  assert.equal(deleteBody('id'), undefined);
});

// `state` fills the menu's useState calls in order: open, editing, draft.
function menu(items, state = []) {
  const mutations = [];
  const writer = (name) => () => ({
    isPending: false,
    mutate: (...args) => mutations.push([name, ...args]),
  });
  const { QuickRepliesMenu } = load('components/chat/quick-replies-menu.tsx', {
    react: {
      useState: (initial) => [
        state.length ? state.shift() : initial,
        () => undefined,
      ],
    },
    'react/jsx-runtime': jsx,
    'lucide-react': new Proxy({}, { get: () => 'svg' }),
    sonner: { toast: { error: () => undefined } },
    '@/components/data-state': { DataState: 'data-state' },
    '@/components/responsive-overlay': { ResponsiveOverlay: 'overlay' },
    '@/components/transactions/pager-state': { errorText: String },
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/textarea': { Textarea: 'textarea' },
    '@/lib/api/quick-replies': {
      useQuickReplies: () => ({ data: { items } }),
      useCreateQuickReply: writer('create'),
      useUpdateQuickReply: writer('update'),
      useDeleteQuickReply: writer('delete'),
    },
  });
  const picked = [];
  const tree = QuickRepliesMenu({ onPick: (text) => picked.push(text) });

  return { tree, picked, mutations };
}

// Walks the element tree and returns every element the check accepts.
function find(node, check, found = []) {
  if (Array.isArray(node)) node.forEach((child) => find(child, check, found));
  else if (node && typeof node === 'object') {
    if (check(node)) found.push(node);
    find(node.props?.children, check, found);
  }
  return found;
}

test('tapping a quick reply fills the box and sends nothing', () => {
  const { tree, picked, mutations } = menu([
    { id: 'one', body: 'On my way' },
    { id: 'two', body: 'Thanks!' },
  ]);
  const [reply] = find(
    tree,
    (node) => node.type === 'button' && node.props.children === 'Thanks!'
  );
  reply.props.onClick();

  assert.deepEqual(picked, ['Thanks!']);
  assert.deepEqual(mutations, []);
});

test('the menu shows an empty state with an Add button when there are no replies', () => {
  const { tree } = menu([]);
  const [state] = find(tree, (node) => node.type === 'data-state');

  assert.equal(state.props.isEmpty, true);
  assert.equal(state.props.emptyTitle, 'No quick replies yet');
  assert.equal(state.props.emptyAction.props.children, 'Add a reply');
});

test('saving a new reply creates it and an edit updates it', () => {
  const save = (built) =>
    find(
      built.tree,
      (node) => node.type === 'button' && node.props.children === 'Save reply'
    )[0];

  // An empty draft cannot be saved.
  assert.equal(save(menu([], [true, 'new', '  '])).props.disabled, true);

  const adding = menu([], [true, 'new', '  Hello  ']);
  save(adding).props.onClick();
  assert.deepEqual(
    adding.mutations.map((item) => item.slice(0, 2)),
    [['create', 'Hello']]
  );

  const editing = menu([{ id: 'one', body: 'Old' }], [true, 'one', 'New']);
  save(editing).props.onClick();
  assert.deepEqual(plain(editing.mutations.map((item) => item.slice(0, 2))), [
    ['update', { id: 'one', body: 'New' }],
  ]);
});

test('the chat footer fills the box with the reply and does not call send', () => {
  const chat = source('components/chat/conversation.tsx');
  const start = chat.indexOf('<QuickRepliesMenu');
  const block = chat.slice(start, chat.indexOf('/>', start));

  assert.match(block, /form\.setValue\('content', text/);
  assert.doesNotMatch(block, /actions\.send/);
});
