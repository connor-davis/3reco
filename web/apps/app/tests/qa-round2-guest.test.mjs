import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './qa-round2-loader.mjs';

test('G16: signed-out and guest hooks schedule neither forbidden query', () => {
  for (const user of [
    null,
    { id: 'g', role: 'guest' },
    { id: 'b', role: 'business' },
  ]) {
    const calls = [];
    const mocks = {
      '../auth/use-auth': { useAuth: () => ({ user }) },
      './resource': {
        useResource: (...args) => {
          calls.push(args);
          return { isPending: true };
        },
      },
      './paging': {},
    };
    const stats = load('lib/api/stats.ts', mocks).useStats();
    assert.equal(stats.isPending, user?.role === 'business');
    load('lib/api/notifications.ts', mocks).useUnreadCount();
    assert.equal(calls.length, 2);
    for (const [, path, privateQuery, enabled] of calls) {
      assert.ok(['/stats', '/notifications/unread-count'].includes(path));
      assert.equal(privateQuery, true);
      assert.equal(enabled, user?.role === 'business');
    }
  }
});
