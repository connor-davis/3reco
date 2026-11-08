import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/lib/live/use-live.ts', import.meta.url),
  'utf8'
);

test('a guest is rechecked on a timer and signed out, with no guest socket', () => {
  assert.match(source, /GUEST_RECHECK_MS = 30_000/);
  assert.match(source, /setInterval\(/);
  assert.match(source, /readMe\(\)[\s\S]*endSession\(client, 'ended'\)/);
  // The socket still opens only for a signed-in non-guest.
  assert.match(source, /if \(!userId \|\| !live\) return;/);
});
