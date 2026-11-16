import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// share.ts has no imports, so it can be compiled and run on its own.
const { outputText } = ts.transpileModule(read('../src/lib/share.ts'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const sandbox = { exports: {}, URL, encodeURIComponent };
vm.runInNewContext(outputText, sandbox);
const { whatsAppUrl } = sandbox.exports;

const origin = 'https://app.3reco.test';

function sharedText(link) {
  return decodeURIComponent(link.slice('https://wa.me/?text='.length));
}

test('the link opens wa.me with the text parameter', () => {
  const link = whatsAppUrl('Hi', '/market/store/1', origin);

  assert.ok(link.startsWith('https://wa.me/?text='));
});

test('the page address is absolute, not relative', () => {
  const link = whatsAppUrl('Hi', '/market/listing/abc', origin);

  assert.equal(
    sharedText(link),
    'Hi https://app.3reco.test/market/listing/abc'
  );
});

test('special characters are encoded and survive a decode', () => {
  const text = 'Rock & Roll + Café #1 100% Zoë on 3REco';
  const link = whatsAppUrl(text, '/market/store/1', origin);
  const query = link.slice('https://wa.me/?text='.length);

  // Nothing that could cut the query short is left raw.
  assert.doesNotMatch(query, /[&+# ]/);
  assert.equal(sharedText(link), `${text} ${origin}/market/store/1`);
});

test('a price with a decimal comma is kept as shown', () => {
  const text = 'PET at R 12,50 / kg on 3REco';
  const link = whatsAppUrl(text, '/market/listing/1', origin);

  assert.match(sharedText(link), /^PET at R 12,50 \/ kg on 3REco /);
});

test('both pages show the share button to everyone', () => {
  const listing = read('../src/routes/market/listing/$listingId.tsx');
  const store = read('../src/routes/market/store/$sellerId.tsx');
  const button = read('../src/components/whatsapp-share.tsx');

  assert.match(listing, /<WhatsAppShare/);
  assert.match(listing, /\/market\/listing\/\$\{listing\.id\}/);
  assert.match(store, /<WhatsAppShare/);
  assert.match(store, /\/market\/store\/\$\{sellerId\}/);
  assert.match(button, /Share on WhatsApp/);
  assert.match(button, /rel="noopener noreferrer"/);
});
