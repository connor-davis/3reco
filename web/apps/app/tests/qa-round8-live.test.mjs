import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
