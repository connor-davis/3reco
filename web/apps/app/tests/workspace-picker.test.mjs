import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const access = load('lib/access.ts');
const nav = load('lib/nav.ts', { '@/lib/access': access });
const primitives = new Proxy({}, { get: (_, name) => name });
const nodes = (node) =>
  !node || typeof node !== 'object'
    ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];

function picker(user, items, pathname = '/team', state = {}) {
  const selected = [];
  const navigated = [];
  let refreshed = 0;
  const { WorkspacePicker } = load('components/shell/workspace-picker.tsx', {
    '@tanstack/react-router': {
      useNavigate: () => (value) => navigated.push(value.to),
      useRouterState: () => pathname,
    },
    sonner: { toast: { success() {}, error() {} } },
    '@/components/visuals': primitives,
    '@/components/ui/button': primitives,
    '@/components/ui/dropdown-menu': primitives,
    '@/lib/access': access,
    '@/lib/nav': nav,
    '@/lib/auth/use-auth': { useAuth: () => ({ user }) },
    '@/lib/api/client': { ApiError: Error },
    '@/lib/api/businesses': {
      useMyBusinesses: () => ({
        data: items,
        refetch: () => refreshed++,
        ...state,
      }),
      useSelectBusiness: () => ({
        mutate: (id, callbacks) => selected.push({ id, callbacks }),
      }),
    },
  });
  return {
    tree: WorkspacePicker(),
    selected,
    navigated,
    refreshed: () => refreshed,
  };
}

const owner = {
  id: 'person',
  role: 'business',
  active_business_id: 'a',
  business_role: 'owner',
  businessName: 'Alpha',
};
const businesses = [
  { id: 'a', name: 'Alpha', role: 'owner', has_logo: true },
  { id: 'b', name: 'Beta', role: 'member', has_logo: false },
];

test('workspace picker shows business memberships, active check, logo and role; one membership cannot switch', () => {
  const view = picker(owner, businesses.slice(0, 1));
  const tree = nodes(view.tree);
  assert.ok(
    tree.some((node) => node.props?.['aria-label'] === 'Active workspace')
  );
  assert.ok(tree.some((node) => node.props?.image === '/api/stores/a/logo'));
  assert.ok(tree.some((node) => node.props?.children === 'Owner'));
  const item = tree.find((node) => node.type === 'DropdownMenuItem');
  item.props.onClick();
  assert.equal(view.selected.length, 0);
  view.tree.props.onOpenChange(true);
  assert.equal(view.refreshed(), 1);
});

test('workspace picker is absent for other platform roles and missing active business', () => {
  for (const role of ['admin', 'staff', 'collector', 'guest', null]) {
    assert.equal(picker({ ...owner, role }, businesses).tree, null);
  }
  assert.equal(
    picker({ ...owner, active_business_id: '' }, businesses).tree,
    null
  );
  assert.equal(picker(null, businesses).tree, null);
});

test('workspace selection redirects a newly refused Team route and keeps allowed pages', () => {
  for (const [path, expected] of [
    ['/team', ['/']],
    ['/stock', []],
  ]) {
    const view = picker(owner, businesses, path);
    nodes(view.tree)
      .filter((node) => node.type === 'DropdownMenuItem')[1]
      .props.onClick();
    assert.equal(view.selected[0].id, 'b');
    view.selected[0].callbacks.onSuccess({
      user: { ...owner, active_business_id: 'b', business_role: 'member' },
    });
    assert.deepEqual(view.navigated, expected);
  }
});

test('workspace picker has loading, empty and retry states', () => {
  const loading = nodes(
    picker(owner, undefined, '/', { isPending: true }).tree
  );
  assert.ok(
    loading.some((node) => node.props?.children === 'Loading businesses…')
  );
  const empty = nodes(picker(owner, []).tree);
  assert.ok(
    empty.some((node) => node.props?.children === 'No businesses found.')
  );
  const view = picker(owner, undefined, '/', { isError: true });
  nodes(view.tree)
    .find((node) => node.type === 'DropdownMenuItem')
    .props.onClick();
  assert.equal(view.refreshed(), 1);
});

test('workspace selection refreshes auth, clears private queries, and publishes the existing session change', async () => {
  const calls = [];
  const next = { ...owner, active_business_id: 'b', business_role: 'member' };
  const client = {
    cancelQueries: async () => calls.push('cancel'),
    removeQueries: ({ predicate }) => {
      assert.equal(predicate({ queryKey: ['stock'] }), true);
      assert.equal(predicate({ queryKey: ['auth', 'me'] }), false);
      calls.push('remove');
    },
    setQueryData: (_, user) => {
      assert.deepEqual(user, next);
      calls.push('identity');
    },
  };
  const auth = load('lib/api/auth.ts', {
    '@tanstack/react-query': {
      useQueryClient: () => client,
      useMutation: (options) => options,
    },
    './client': {
      api: async (path) => {
        calls.push(path);
        return { user: next };
      },
      json: (method, body) => ({ method, body }),
    },
  });
  const api = load('lib/api/businesses.ts', { './auth': auth, './client': {} });
  const mutation = api.useSelectBusiness();
  await mutation.mutationFn('b');
  await mutation.onSuccess();
  assert.deepEqual(calls, [
    '/businesses/b/select',
    '/auth/me',
    'cancel',
    'remove',
    'identity',
  ]);
  assert.match(
    source('lib/api/auth.ts'),
    /finally\s*\{[\s\S]*?publishSessionChange\(\)/
  );
});
