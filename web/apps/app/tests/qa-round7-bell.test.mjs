import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './qa-round2-loader.mjs';

test('bell list can grow and scroll while titles wrap above the actions', () => {
  const list = source('components/shell/notification-tray-list.tsx');
  assert.match(list, /max-h-\[min\(28rem,60dvh\)\]/);
  assert.match(list, /overflow-y-auto/);
  assert.match(list, /<ItemContent className="min-w-0">/);
  assert.match(
    list,
    /<ItemTitle className="[^"]*line-clamp-none[^"]*break-words/
  );
  assert.match(list, /<ItemActions className="[^"]*w-full[^"]*justify-end/);
});
