import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const files = execFileSync('git', ['ls-files', 'src'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => file.endsWith('.tsx'));
const read = (file) => readFileSync(new URL(file, root), 'utf8');

// Every page goes back the same way, so the look and the words never drift.
test('the shared back button shows an arrow and "Go back"', () => {
  const button = read('src/components/back-button.tsx');
  assert.match(button, /<ArrowLeft data-icon="inline-start" \/>/);
  assert.match(button, /Go back/);
  assert.match(button, /router\.history\.back\(\)/);
});

// Empty-state buttons like "Back to dashboard" are destinations, not a back
// arrow, so this only bans a hand-made arrow.
test('no page draws its own back arrow', () => {
  for (const file of files) {
    if (file.endsWith('back-button.tsx')) continue;
    assert.doesNotMatch(read(file), /<ArrowLeft\b/, file);
  }
});

test('detail pages use the shared back button', () => {
  for (const file of [
    'src/routes/market/listing/$listingId.tsx',
    'src/routes/transactions/$transactionId.tsx',
    'src/components/chat/conversation.tsx',
  ]) {
    assert.match(read(file), /<BackButton\s+fallback=/, file);
  }
});
