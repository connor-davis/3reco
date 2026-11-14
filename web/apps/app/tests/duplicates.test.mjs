import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

test('duplicates are admin-only in guards, navigation and titles', () => {
  const { canOpen } = load('lib/access.ts');
  for (const role of ['staff', 'business', 'collector', 'guest', null]) {
    assert.equal(canOpen(role, 'duplicates'), false);
  }
  assert.equal(canOpen('admin', 'duplicates'), true);
  assert.match(source('lib/nav.ts'), /'admin\/duplicates': 'duplicates'/);
  assert.match(source('lib/nav.ts'), /return 'Duplicates'/);
});

test('Duplicates has no nav link; only admins get the button on Collections', () => {
  const { navFor } = load('lib/nav.ts', {
    '@/lib/access': load('lib/access.ts'),
  });
  for (const role of ['admin', 'staff', 'business', 'collector']) {
    const links = navFor(role, 'owner', 'b1').flatMap((group) => group.links);
    assert.equal(
      links.some((link) => link.to === '/admin/duplicates'),
      false,
      role
    );
  }
  const page = source('routes/collections.tsx');
  assert.match(
    page,
    /user\?\.role === 'admin' && \(\s*<LinkButton variant="outline" to="\/admin\/duplicates">/
  );
});

test('transaction and dismissal live events refresh duplicate review and activity', () => {
  const { keysFor } = load('lib/live/connection.ts');
  for (const kind of ['transaction', 'duplicate']) {
    const keys = JSON.stringify(keysFor(kind));
    assert.ok(keys.includes('["admin","duplicates"]'));
    assert.ok(keys.includes('["admin","activity"]'));
  }
});

test('collection mutation sends the opening key as a header and excludes it from JSON', async () => {
  let mutation;
  let request;
  const invalidated = [];
  const { useCreateCollection } = load('lib/api/transactions.ts', {
    './resource': {},
    './paging': {},
    '@tanstack/react-query': {
      useQueryClient: () => ({
        invalidateQueries: ({ queryKey }) => invalidated.push(queryKey),
      }),
      useMutation: (options) => {
        mutation = options;
      },
    },
    './client': {
      api: async (path, options) => {
        request = { path, options };
        return { transaction_id: 'saved' };
      },
      json: (method, body) => ({ method, body: JSON.stringify(body) }),
    },
  });
  useCreateCollection();
  const body = {
    collector_id: 'collector',
    items: [{ material_id: 'glass', weight: '4', price: '5' }],
  };
  assert.deepEqual(
    await mutation.mutationFn({ ...body, idempotencyKey: 'opening-key' }),
    { transaction_id: 'saved' }
  );
  assert.equal(request.options.headers['Idempotency-Key'], 'opening-key');
  assert.deepEqual(JSON.parse(request.options.body), body);
  await mutation.onSuccess();
  assert.equal(invalidated.length, 5);
});
