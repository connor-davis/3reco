import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

test('G17/G20: toasts stay above the composer; role selection promises no total', () => {
  assert.match(
    source('components/shell/app-shell.tsx'),
    /position="bottom-right"/
  );
  const setup = source('routes/setup.tsx');
  assert.match(setup, /step !== 'type' && \(/);
  assert.doesNotMatch(setup, /'Step 1'/);
  assert.doesNotMatch(setup, /detailSteps\.collector\.length \+ 1/);
});

test('Collect is a separate business group for every business; staff retain access', () => {
  const { navFor } = load('lib/nav.ts', {
    '@/lib/access': load('lib/access.ts'),
  });
  // A business with no collectors yet still needs the way in to add one.
  const groups = navFor('business', 'owner', 'mine');
  const collect = groups.find((group) => group.label === 'Collect');
  assert.deepEqual(
    Array.from(collect.links, (link) => link.to),
    ['/collections', '/collectors']
  );
  assert.ok(
    !groups
      .find((group) => group.label === 'Workspace')
      .links.some((link) => link.to === '/collections')
  );
  for (const role of ['admin', 'staff']) {
    const links = navFor(role).flatMap((group) => group.links);
    for (const path of ['/collections', '/collectors'])
      assert.ok(links.some((link) => link.to === path));
  }
  assert.doesNotMatch(
    source('components/shell/app-sidebar.tsx'),
    /dashboard.data\?\.collects/
  );
});
