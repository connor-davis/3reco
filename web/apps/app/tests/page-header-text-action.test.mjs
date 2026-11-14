import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

// Text buttons like "Add material" carry an aria-label too, so the header must
// pick out icon buttons by size, not by label, or it squeezes them to 44px.
test('page header sizes icon buttons by their size, not their label', () => {
  assert.doesNotMatch(read('components/page-header.tsx'), /aria-label\]/);
  assert.match(read('components/page-header.tsx'), /button\[data-icon-only\]/);
  assert.match(
    read('components/ui/button.tsx'),
    /data-icon-only=\{size\?\.startsWith\('icon'\)/
  );
});
