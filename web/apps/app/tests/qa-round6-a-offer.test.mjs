import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { load, source } from './qa-round2-loader.mjs';

// The format rules live in lib/quantity.ts; the cap is the dialog's own.
function priceErrorFn() {
  const { priceError: priceFormatError } = load('lib/quantity.ts', {
    '@/lib/format': load('lib/format.ts'),
  });
  const { lineCents } = load('lib/format.ts');
  const text = source('components/dialogs/offer-dialog.tsx');
  const start = text.indexOf('const MAX_PRICE_CENTS');
  const end = text.indexOf('// Only a hint');
  const { outputText } = ts.transpileModule(text.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  return vm.runInNewContext(`${outputText}; priceError`, {
    lineCents,
    priceFormatError,
  });
}

test('an offer price gets the right message for each mistake', () => {
  const priceError = priceErrorFn();
  assert.equal(priceError('12.50'), undefined);
  assert.equal(priceError('100000.00'), undefined);
  assert.equal(priceError('12.345'), 'Use up to 2 decimals.');
  assert.equal(priceError('0'), 'Enter a price above R 0.00.');
  assert.equal(priceError('abc'), 'Enter a price as a number, like 22.80.');
  assert.equal(priceError('-5'), 'Enter a price above R 0.00.');
  assert.equal(
    priceError('100000.01'),
    'Price must be R 100 000.00 per kg or less.'
  );
  assert.equal(
    priceError('999999999'),
    'Price must be R 100 000.00 per kg or less.'
  );
});

test('an offer weight is checked against the stock on that line', () => {
  const dialog = source('components/dialogs/offer-dialog.tsx');
  assert.match(dialog, /available: item\.available_weight \?\? ''/);
  assert.match(
    dialog,
    /quantityError\(\s*line\.weight,\s*line\.available \|\| undefined\s*\)/
  );
  // The stock figure is for checking only; the server is not sent it.
  assert.doesNotMatch(dialog, /\.\.\.item,/);
});

test('the offer total shows a dash while a line is invalid', () => {
  const dialog = source('components/dialogs/offer-dialog.tsx');
  assert.match(dialog, /validLines \? formatRand\(total\) : '-'/);
  assert.match(dialog, /Total \{totalText\}/);
  assert.doesNotMatch(dialog, /Total \{formatRand\(total\)\}/);
});

test('dashboard recent collections ask for recorded order', () => {
  assert.match(
    source('routes/-dashboard/panels.tsx'),
    /useTransactions\('sales', \{\s*limit: 5,\s*order: 'recorded'/
  );
});
