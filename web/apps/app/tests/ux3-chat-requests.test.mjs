import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './qa-round2-loader.mjs';

test('request lists: short Offers tab, a word pill, no Business chip', () => {
  const list = source('routes/market/-components/request-list.tsx');
  assert.match(list, /offered: 'Offers'/);
  assert.doesNotMatch(list, /dotOnly/);
  assert.doesNotMatch(list, /TradeTypeLabel/);
  assert.match(list, /canRespond\(request, user\?\.id\)/);
});

test('phone tab rows fade at the right edge', () => {
  assert.match(
    source('components/ui/tabs-variants.ts'),
    /max-lg:\[mask-image:/
  );
});

test('the phone thread gives back the hidden tab bar height', () => {
  const layout = source('components/chat/messages-layout.tsx');
  assert.match(layout, /requestId\s*\?\s*'h-\[calc\(100dvh-3\.5rem\)\]'/);
});

test('the details item lives in the one "..." menu', () => {
  const chat = source('components/chat/conversation.tsx');
  assert.match(chat, /label: 'Request details'/);
  assert.doesNotMatch(chat, /<IconButton/);
});
