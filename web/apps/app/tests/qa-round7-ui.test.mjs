import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const format = load('lib/format.ts');
const helpers = load('components/chat/helpers.ts', { '@/lib/format': format });
const { formatCo2 } = load('lib/impact.ts', {
  '@/lib/api/stats': {},
  '@/lib/format': format,
});

const deal = {
  buyer: { id: 'b', name: 'Greenline' },
  seller: { id: 's', name: 'Metro' },
  status: 'offered',
  offer_by: 's',
  offer_version: 2,
  buyer_confirmed_version: 1,
  seller_confirmed_version: 2,
};

test('qa-round7: request status filter reuses the badge labels', () => {
  const list = source('routes/market/-components/request-list.tsx');
  assert.match(list, /requestStatuses\[value as RequestStatus\]\?\.label/);
  assert.match(source('lib/request-status.ts'), /export const requestStatuses/);
});

test('qa-round7: the filter bar keeps its controls on the Pending tab', () => {
  const list = source('routes/transactions/-components/record-list.tsx');
  assert.match(list, /\{exportKind && !readOnly && \(/);
  assert.match(list, /disabled=\{status !== 'complete'\}/);
});

test('qa-round7: the receipt picker is a styled label over a hidden input', () => {
  const dialog = source('components/dialogs/record-dialogs.tsx');
  assert.match(
    dialog,
    /id="receipt-file"[\s\S]*?className="peer sr-only top-0 left-0"/
  );
  assert.match(dialog, /htmlFor="receipt-file"[\s\S]*?buttonVariants/);
  assert.match(dialog, /peer-focus-visible:ring-3/);
});

test('qa-round7: dashboard and Browse show CO2e with the same decimals', () => {
  assert.equal(formatCo2('167.4'), '167.40 kg CO₂e');
  assert.equal(formatCo2('1236.131'), '1 236.13 kg CO₂e');
  assert.doesNotMatch(source('routes/index.tsx'), /wholeKg/);
  assert.doesNotMatch(source('lib/impact.ts'), /wholeKg/);
});

test('qa-round7: offer wording names the other side and the real status', () => {
  const line = helpers.offerStatusLine;
  assert.equal(line(deal, 's'), 'Waiting for Greenline to confirm.');
  assert.equal(
    line(deal, 'b'),
    'Metro accepted this offer. Please confirm to complete the deal.'
  );
  const fresh = {
    ...deal,
    buyer_confirmed_version: 1,
    seller_confirmed_version: 1,
  };
  assert.equal(
    line(fresh, 's'),
    'Offer sent. Waiting for Greenline to respond.'
  );
  assert.equal(
    line(fresh, 'b'),
    'Metro sent this offer. Please confirm or reject it.'
  );
  assert.doesNotMatch(source('components/chat/cards.tsx'), /They accepted/);
});

test('qa-round7: the listing button says Request this material', () => {
  const page = source('routes/market/listing/$listingId.tsx');
  assert.match(page, /Request this material/);
  assert.doesNotMatch(page, /Message seller/);
});

test('qa-round7: a closed chat draws no empty band', () => {
  const chat = source('components/chat/conversation.tsx');
  assert.match(chat, /!isClosed\(request\) && \(\s*<div[^>]*border-b/);
});

test('qa-round7: the account menu lists each account by name', () => {
  assert.match(
    source('components/shell/account-menu.tsx'),
    /\{session\.name\}/
  );
});

test('qa-round7: staff open View transaction in the all-trades list', () => {
  const cards = source('components/chat/cards.tsx');
  assert.match(cards, /'\/transactions\/sales'/);
  assert.match(cards, /'\/transactions\/purchases'/);
  assert.match(cards, /return '\/transactions';/);
  assert.match(cards, /\$\{transactionsPath\(request, user\)\}\?open=/);
});

test('qa-round7: cart hint and material dialog wording follow the role', () => {
  const page = source('routes/market/listing/$listingId.tsx');
  assert.match(page, /user\?\.role === 'business'\s*\?\s*'Your cart keeps/);
  const dialog = source('components/dialogs/material-dialog.tsx');
  assert.match(dialog, /Add a material to the catalogue/);
  assert.doesNotMatch(dialog, /buy or sell/);
});

test('qa-round7: the stock dialog warns, not blocks, below the default price', () => {
  const dialog = source('components/dialogs/stock-dialog.tsx');
  assert.match(dialog, /const base = stock\?\.base_price \?\? chosen\?\.price/);
  assert.match(dialog, /Below the default price of \$\{formatRate\(base\)\}/);
  assert.match(dialog, /You can still save/);
  assert.doesNotMatch(dialog, /Price must be at least/);
  assert.doesNotMatch(dialog, /baseRef/);
  assert.match(dialog, /mode: 'onChange'/);
  assert.match(
    dialog,
    /disabled=\{busy \|\| !formState\.isValid \|\| !!photoError\}/
  );
  assert.doesNotMatch(
    source('../../../../internal/services/stock/stock.go'),
    /Price must be at least/
  );
});

test('qa-round7: an offer above the requested kg gets a hint, not a block', () => {
  const dialog = source('components/dialogs/offer-dialog.tsx');
  assert.match(dialog, /toGrams\(weight\) > toGrams\(asked\)/);
  assert.match(dialog, /You can still send this\./);
  assert.match(dialog, /request\.items\[index\]\.requested_weight/);
});

test('qa-round7: the two dashboard panels in a row share one height', () => {
  assert.match(source('routes/index.tsx'), /grid gap-4 lg:grid-cols-2/);
});
