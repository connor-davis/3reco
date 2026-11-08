import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './qa-round2-loader.mjs';

test('G17/G20: toasts stay above the composer; role selection promises no total', () => {
  assert.match(
    source('components/shell/app-shell.tsx'),
    /position="bottom-right"/
  );
  const setup = source('routes/setup.tsx');
  assert.match(setup, /step === 'type' \?\s*\(\s*'Step 1'/);
  assert.doesNotMatch(setup, /detailSteps\.collector\.length \+ 1/);
});
