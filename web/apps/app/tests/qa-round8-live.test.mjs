import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './qa-round2-loader.mjs';

const source = readFileSync(
  new URL('../src/lib/live/use-live.ts', import.meta.url),
  'utf8'
);

test('every signed-in person, a guest too, holds a live socket and no timer', () => {
  assert.doesNotMatch(source, /GUEST_RECHECK_MS|setInterval\(/);
  assert.match(source, /if \(!userId\) return;/);
  // A socket that drops without a close reason asks whether the sign-in lives.
  assert.match(source, /readMe\(\)\.then\(Boolean\)/);
});

test('collector, request, transaction and stock events refresh dashboard projections', () => {
  const { keysFor } = load('lib/live/connection.ts');
  for (const kind of ['collector', 'request', 'transaction', 'stock'])
    assert.ok(
      keysFor(kind).some((key) => key[0] === 'dashboards'),
      kind
    );
});
