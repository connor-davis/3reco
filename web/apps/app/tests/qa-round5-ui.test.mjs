import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const { pageTitleFor } = load('lib/nav.ts', {
  '@/lib/access': load('lib/access.ts'),
});
const { roleLabel } = load('lib/access.ts');

test('every page has its own tab title, even the 404', () => {
  assert.equal(pageTitleFor('/'), 'Dashboard');
  assert.equal(pageTitleFor('/transactions'), 'Transactions');
  assert.equal(pageTitleFor('/admin/users', 'admin'), 'User management');
  assert.equal(pageTitleFor('/admin/users', 'staff'), 'Not available');
  assert.equal(pageTitleFor('/materials'), 'Materials');
  assert.equal(pageTitleFor('/messages'), 'Messages');
  assert.equal(pageTitleFor('/sign-in'), 'Sign in');
  assert.equal(pageTitleFor('/no-such-page'), 'Page not found');
  assert.match(source('components/shell/app-shell.tsx'), /· 3REco/);
});

test('toasts sit bottom-right, clear of chat headers', () => {
  assert.match(
    source('components/shell/app-shell.tsx'),
    /position="bottom-right"/
  );
  assert.match(
    source('components/ui/sonner.tsx'),
    /mobileOffset=\{\{ bottom: 72 \}\}/
  );
});

test('role labels are capitalised, for known and unknown roles', () => {
  assert.equal(roleLabel('business'), 'Business');
  assert.equal(roleLabel('admin'), 'Admin');
  assert.equal(roleLabel('surprise'), 'Surprise');
  assert.equal(roleLabel(null), '');
});

test('collectors page sorts by name on the server and says which way', () => {
  const page = source('routes/collectors.tsx');
  assert.match(page, /enableSorting: true,\s*meta: \{ main: true \}/);
  assert.match(page, /Sorted A to Z/);
  assert.match(page, /typeof rawTotal === 'number'/);
});

test('collector dialog is neutral for staff and shows a conflict once', () => {
  const dialog = source('components/dialogs/collector-dialog.tsx');
  assert.match(dialog, /'Add a collector'/);
  assert.doesNotMatch(dialog, /Add someone you buy from/);
  assert.match(dialog, /if \(!placed\) setServerError/);
});

test('staff and admin do not get the chat, profile or about extras', () => {
  assert.match(source('components/chat/inbox.tsx'), /!admin && !staff/);
  const profile = source('routes/profile/index.tsx');
  assert.match(profile, /!staff && <TabsTrigger value="bank">/);
  assert.match(profile, /role !== 'collector' && !staff/);
  assert.match(source('routes/about.tsx'), /!isStaffRole\(user\?\.role\)/);
});

test('a read-only admin sees neutral offer wording', () => {
  const cards = source('components/chat/cards.tsx');
  assert.match(cards, /Buyer accepted; waiting for the seller\./);
  assert.match(cards, /Seller accepted; waiting for the buyer\./);
});

test('dashboard CO2 cards use formatCo2 and the receipt button says what it gets', () => {
  const dashboard = source('routes/index.tsx');
  assert.equal(dashboard.match(/formatCo2\(/g).length, 2);
  assert.match(
    source('components/dialogs/record-dialogs.tsx'),
    /Download receipt/
  );
});
