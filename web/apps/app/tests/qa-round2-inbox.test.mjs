import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load, source } from './qa-round2-loader.mjs';

const helpers = load('components/chat/helpers.ts', { '@/lib/format': {} });
const thread = {
  buyer: { id: 'b', name: 'Greenline' },
  seller: { id: 's', name: 'Metro' },
  status: 'offered',
  offer_by: 's',
  offer_version: 2,
  buyer_confirmed_version: null,
  seller_confirmed_version: null,
};

test('G19: closed inbox rows and every offer confirmation state', () => {
  for (const status of ['cancelled', 'rejected'])
    assert.equal(
      helpers.threadSummary({ ...thread, status }),
      'Greenline and Metro'
    );
  assert.equal(
    helpers.threadSummary({ ...thread, status: 'accepted' }),
    'Greenline and Metro'
  );
  assert.match(
    helpers.threadSummary(thread),
    /Offer by Metro.*Waiting for both sides/
  );
  assert.match(
    helpers.threadSummary({ ...thread, buyer_confirmed_version: 2 }),
    /Waiting for Metro$/
  );
  assert.match(
    helpers.threadSummary({ ...thread, seller_confirmed_version: 2 }),
    /Waiting for Greenline$/
  );
  assert.match(
    helpers.threadSummary({ ...thread, offer_by: 'b' }),
    /Offer by Greenline/
  );
});

test('G13/G28: sender gets a waiting sentence; completion keeps material terms', () => {
  const wrapper = ({ children }) => createElement('div', null, children);
  const format = {
    formatKg: (n) => `${n} kg`,
    formatRate: (n) => `R ${n} / kg`,
    formatTime: () => 'now',
    formatRand: (n) => `R ${n}`,
    lineCents: () => 100,
    plural: (n) => `${n} material`,
  };
  const cards = load('components/chat/cards.tsx', {
    '@/lib/api/requests': {},
    '@/components/link-button': { LinkButton: wrapper },
    '@/components/ui/button': { Button: wrapper },
    '@/components/ui/card': Object.fromEntries(
      ['Card', 'CardContent', 'CardFooter', 'CardHeader', 'CardTitle'].map(
        (key) => [key, wrapper]
      )
    ),
    '@/lib/auth/use-auth': { useAuth: () => ({ user: { id: 's' } }) },
    '@/lib/api/transactions': { useDownloadInvoice: () => ({}) },
    '@/lib/format': format,
    './helpers': { ...helpers, requestTotal: () => 100 },
  });
  const request = {
    ...thread,
    updated_at: '2026-11-06',
    items: [
      {
        material_id: 'm',
        material_name: 'Aluminium cans',
        offer_weight: '200',
        offer_price: '23.40',
      },
    ],
  };
  const offer = renderToStaticMarkup(
    createElement(cards.OfferCard, { request })
  );
  assert.match(offer, /Waiting for Greenline to respond/);
  const complete = renderToStaticMarkup(
    createElement(cards.InvoiceCard, {
      request: { ...request, status: 'accepted' },
    })
  );
  assert.match(complete, /Aluminium cans.*200 kg.*R 23.40 \/ kg/);
});

test('G14/G29/G30: unread footer, card empty states and explicit system rendering', () => {
  assert.match(
    source('components/chat/inbox.tsx'),
    /!threads.some\(\(thread\) => thread.unread_count > 0\)/
  );
  assert.match(source('components/chat/inbox.tsx'), /End of list/);
  const chat = source('components/chat/conversation.tsx');
  assert.match(
    chat,
    /!messages.length &&\s*request.status !== 'offered' &&\s*request.status !== 'accepted'/
  );
  assert.match(chat, /message.system \? \(/);
  assert.match(chat, /aria-label="System event"/);
  assert.match(chat, /System ·/);
});

test('G15: no eligible review keeps both submit and launch disabled', () => {
  assert.match(
    source('components/dialogs/review-dialog.tsx'),
    /!eligible.data\?\.items.length/
  );
  const store = source('routes/market/store/$sellerId.tsx');
  assert.match(store, /!eligible.data\?\.items.length/);
  assert.match(store, /Reviews are for completed purchases from this store\./);
});
