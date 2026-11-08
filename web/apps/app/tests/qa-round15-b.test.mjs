import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(`src/${path}`, 'utf8');

test('qa-round15 HK1: the checkbox keeps one line for its error', () => {
  assert.match(
    source('components/form-fields.tsx'),
    /<div className="min-h-5">\s*<FieldError id=\{errorId\}/
  );
});

test('qa-round15 HK2: the admin stat row is three across', () => {
  assert.match(source('routes/index.tsx'), /<StatGrid threeUp>/);
});

test('qa-round15 HK3: an empty payout reads None added for staff too', () => {
  assert.match(
    source('routes/collectors.tsx'),
    /collector\.can_view_payout \|\| collector\.can_edit\s*\? 'None added'\s*: 'Not shared'/
  );
  const dialog = source('components/dialogs/collector-dialog.tsx');
  assert.match(dialog, /None added/);
  assert.doesNotMatch(dialog, /No payout details saved/);
});

test('qa-round15 HK4: a removed account gets its own title', () => {
  const page = source('routes/sign-in.tsx');
  assert.match(page, /reason === 'removed'\s*\? 'Account removed\.'/);
  assert.match(page, /: 'Welcome back\.'/);
});

test('qa-round15 SN6: the trade pill has room around its words', () => {
  const list = source('routes/transactions/-components/record-list.tsx');
  assert.match(list, /className="h-7 w-40 shrink-0 justify-center px-3"/);
});

test('qa-round15 SN7: the Listed switch has a real label', () => {
  assert.match(
    source('routes/stock.tsx'),
    /aria-label=\{`Listed: \$\{item\.material_name\}`\}/
  );
});

test('qa-round15 SN8: dashboard cards stretch to one height', () => {
  const index = source('routes/index.tsx');
  assert.match(index, /grid gap-6 lg:grid-cols-2/);
  assert.doesNotMatch(index, /grid items-start gap-6 lg:grid-cols-2/);
});

test('qa-round15 SO2: the collector dashboard has one profile link', () => {
  const index = source('routes/index.tsx');
  assert.equal(index.match(/Your profile/g).length, 1);
  assert.doesNotMatch(index, /to: '\/profile', label/);
});
