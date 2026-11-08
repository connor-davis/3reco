import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './qa-round2-loader.mjs';

test('B1: a sent request does not bounce the buyer back to /cart', () => {
  const cart = source('routes/cart.tsx');
  assert.match(cart, /!sending\.current/);
  assert.match(cart, /sending\.current = true;\s*await clear\.mutateAsync/);
  // A failed send lets a later hand-removal redirect again.
  assert.match(cart, /catch \(cause\) \{\s*sending\.current = false;/);
  // Removing the last item by hand still replaces the URL with /cart.
  assert.match(
    cart,
    /navigate\(\{ to: '\/cart', search: \{\}, replace: true \}\)/
  );
});

test('H1: a bad price is explained when the field is left', () => {
  const dialog = source('components/dialogs/collection-dialog.tsx');
  assert.match(dialog, /mode: 'onTouched'/);
  assert.match(dialog, /validLines \? formatRand\(total\) : '-'/);
});

test('H4: the invoice line shows two decimals, like the PDF and CSV', () => {
  const dialogs = source('components/dialogs/record-dialogs.tsx');
  assert.match(dialogs, /formatKgFixed\(item\.weight\)\} kg/);
});

test('S1: the sign-up consent sentence stays whole, error below', () => {
  const fields = source('components/form-fields.tsx');
  assert.match(fields, /<span>\{label\}<\/span>[\s\S]*<\/Field>\s*<FieldError/);
});

test('S3: the story panel always keeps its footer slot', () => {
  const shell = source('components/auth-shell.tsx');
  assert.match(
    shell,
    /<div className="min-h-5">\s*\{community\.query\.isSuccess/
  );
});

test('S5: the material price unit shows once', () => {
  const dialog = source('components/dialogs/material-dialog.tsx');
  assert.match(dialog, /label="Base price"/);
  assert.doesNotMatch(dialog, /Base price \(R/);
});

test('S7: top-store names line up with the rank line', () => {
  assert.match(source('routes/index.tsx'), /className="min-h-11 px-0"/);
});
