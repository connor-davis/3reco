import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const text = (relative) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

function load(relative) {
  const { outputText } = ts.transpileModule(text(relative), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports });
  return exports;
}

test('F2: no tracked source file holds double-encoded text', () => {
  const files = execFileSync('git', ['ls-files', 'src'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => /\.(tsx?|css|html)$/.test(file));
  const bad = files.filter((file) =>
    /Â|â€/.test(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
  );
  assert.deepEqual(bad, []);
});

test('F11: the invoice file is named after the invoice number', () => {
  assert.match(
    text('../src/lib/api/transactions.ts'),
    /3REco-Invoice-\$\{invoiceNumber\}\.pdf/
  );
  assert.match(
    text('../src/components/dialogs/record-dialogs.tsx'),
    /invoice\.mutate\(shown,/
  );
});

test('F16: a pending trade says who it is waiting for', () => {
  const { waitingFor } = load('../src/lib/waiting.ts');
  const trade = (b, s) => ({
    buyer: { id: 'b' },
    seller: { id: 's' },
    offer_version: 2,
    buyer_confirmed_version: b,
    seller_confirmed_version: s,
  });
  assert.equal(waitingFor(trade(1, 1), 'b'), 'Waiting for you');
  assert.equal(waitingFor(trade(2, 1), 'b'), 'Waiting for the seller');
  assert.equal(waitingFor(trade(1, 2), 's'), 'Waiting for the buyer');
  assert.equal(waitingFor(trade(1, 1), 'admin'), 'Waiting for both sides');
  assert.equal(waitingFor(trade(2, 2), 'b'), 'Both sides confirmed');
});

test('F12: ?open=<id> opens that trade and clears itself on close', () => {
  const src = text('../src/routes/transactions/-components/record-list.tsx');
  assert.match(src, /open: openId/);
  assert.match(src, /useTransaction\(/);
  assert.match(src, /navigate\(\{ to: '\.', search: \{\}/);
});

test('F9: counts use plural()', () => {
  for (const file of [
    'components/dialogs/impact-dialog.tsx',
    'routes/-dashboard/panels.tsx',
    'routes/materials.tsx',
    'routes/stock.tsx',
    'routes/collectors.tsx',
    'routes/admin/users.tsx',
  ]) {
    assert.match(text(`../src/${file}`), /plural\(/, file);
  }
});

test('F21: terms and privacy have a topbar title', () => {
  const src = text('../src/lib/nav.ts');
  assert.match(src, /terms: 'Terms'/);
  assert.match(src, /privacy: 'Privacy'/);
});

test('F20: the chart axis drops the year, the tooltip keeps it', () => {
  const src = text('../src/routes/-dashboard/impact-chart.tsx');
  assert.match(src, /tickFormatter=\{axisDay\}/);
  assert.match(src, /labelFormatter=/);
  assert.match(src, /export const axisDay/);
});

test('F1: the notification list scrolls inside a bounded box', () => {
  const src = text('../src/components/shell/notification-tray-list.tsx');
  assert.match(src, /max-h-\[min\(28rem,60dvh\)\][^"]*overflow-y-auto/);
  assert.match(src, /overflow-x-hidden/);
});

test('F30/F31/F35: role-aware copy', () => {
  assert.match(text('../src/routes/collectors.tsx'), /Collector directory/);
  const inbox = text('../src/components/chat/inbox.tsx');
  assert.match(inbox, /Staff do not take part in trade chats\./);
  assert.match(inbox, /Finished/);
  assert.match(
    text('../src/routes/admin/users.tsx'),
    /Try another name or role\./
  );
});

test('F29: removing a user is honest and has no restore', () => {
  const src = text('../src/routes/admin/users.tsx');
  assert.match(src, /permanent and cannot be undone/);
  assert.doesNotMatch(src, /restore/i);
});

test('F34/F19: a guest or collector opens no private page', () => {
  const { canOpen } = load('../src/lib/access.ts');
  for (const page of ['messages', 'incoming', 'dashboard', 'users']) {
    assert.equal(canOpen(null, page), false);
    assert.equal(canOpen('guest', page), false);
  }
  assert.equal(canOpen('collector', 'messages'), false);
  assert.match(
    text('../src/lib/api/messages.ts'),
    /canOpen\(user\.role, 'messages'\)/
  );
  assert.match(
    text('../src/components/shell/use-badge-counts.ts'),
    /canOpen\(user\.role, 'incoming'\)/
  );
});

test('F18: an error replaces the hint', () => {
  assert.match(
    text('../src/components/form-fields.tsx'),
    /state\.invalid \? undefined : description/
  );
});

test('F17: friendly greeting and a step count that always shows', () => {
  assert.match(text('../src/routes/sign-in.tsx'), /'Welcome\.'/);
  assert.match(
    text('../src/routes/setup.tsx'),
    /Step \{index \+ 1\} of \{total\}/
  );
});

test('F27: a ended session closes the socket for good and signs out', () => {
  const conn = text('../src/lib/live/connection.ts');
  assert.match(conn, /sessionEndedCode = 4401/);
  assert.match(conn, /event\.code === sessionEndedCode/);
  assert.match(
    text('../src/lib/live/use-live.ts'),
    /endSession\(client, reason\)/
  );
  assert.match(text('../src/routes/sign-in.tsx'), /reason/);
});

test('F36: a 401 re-checks the session before signing out', () => {
  const src = text('../src/lib/auth/provider.tsx');
  assert.match(src, /readMe\(/);
  assert.match(src, /endSession\(/);
});
