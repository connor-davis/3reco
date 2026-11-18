import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const access = load('lib/access.ts');
const { navFor, pageTitleFor } = load('lib/nav.ts', {
  '@/lib/access': access,
});
const { keysFor } = load('lib/live/connection.ts');

const links = (role) =>
  navFor(role, '', '').flatMap((group) => group.links.map((link) => link.to));

test('every role that can save gets a Saved link, guests and visitors do not', () => {
  for (const role of ['admin', 'staff', 'business', 'collector']) {
    assert.ok(links(role).includes('/saved'), role);
  }
  assert.ok(!links('guest').includes('/saved'));
  assert.ok(!links(null).includes('/saved'));
});

test('the Saved page opens for signed-in roles only', () => {
  for (const role of ['admin', 'staff', 'business', 'collector']) {
    assert.equal(access.canOpen(role, 'saved'), true, role);
  }
  assert.equal(access.canOpen('guest', 'saved'), false);
  assert.equal(access.canOpen(null, 'saved'), false);
});

test('the Saved page has its own tab title', () => {
  assert.equal(pageTitleFor('/saved'), 'Saved');
});

test('a market change refreshes saved listings and followed stores', () => {
  const keys = keysFor('listing', 'abc').map((key) => key.join('/'));
  assert.ok(keys.includes('favourites/list'));
  assert.ok(keys.includes('follows/list'));
  // The one mixed Saved list refreshes with them.
  assert.ok(keys.includes('saved'));
  assert.ok(keysFor('block').some((key) => key.join('/') === 'saved'));
});

test('the client saves and follows by id, as the signed-in person', () => {
  const api = source('lib/api/favourites.ts');

  assert.match(api, /`\/favourites\/\$\{idPath\(id\)\}`,\s*'PUT'/);
  assert.match(api, /`\/favourites\/\$\{idPath\(id\)\}`,\s*'DELETE'/);
  assert.match(api, /`\/follows\/\$\{idPath\(id\)\}`,\s*'PUT'/);
  assert.match(api, /`\/follows\/\$\{idPath\(id\)\}`,\s*'DELETE'/);
  // Every read is private to the person: their id is part of the cache key.
  assert.equal((api.match(/\n {4}true,/g) ?? []).length, 4);
  // Never sent from the page: no owner id in any body.
  assert.doesNotMatch(api, /user_id|owner/);
  // A heart or Follow tap also refreshes the mixed Saved list.
  assert.equal((api.match(/\['saved'\]/g) ?? []).length, 4);
});

test('hearts and the Follow button sit where the map puts them', () => {
  assert.match(source('components/listing-card.tsx'), /<FavouriteButton/);
  assert.match(
    source('routes/market/listing/$listingId.tsx'),
    /<FavouriteButton/
  );

  const store = source('routes/market/store/$sellerId.tsx');
  assert.match(store, /<ModerationActions[\s\S]*label: 'Share on WhatsApp'/);
  // A store's own people are never offered a Follow button for it.
  assert.match(store, /user\?\.id !== sellerId/);
  assert.match(store, /active_business_id !== sellerId/);
});

test('the buttons say what they do and what state they are in', () => {
  const button = source('components/favourite-button.tsx');

  assert.match(button, /aria-pressed=\{saved\}/);
  assert.match(button, /aria-pressed=\{following\}/);
  assert.match(button, /Remove \$\{name\} from saved/);
  // Saving points to the Saved page; unsaving stays quiet.
  assert.match(button, /if \(saved\) return;\s*toast\.success\('Saved'/);
  assert.match(button, /navigate\(\{ to: '\/saved' \}\)/);
  assert.match(button, /Unfollow \$\{name\}/);
  // Guests and visitors see neither.
  assert.equal((button.match(/if \(!canSave\) return null/g) ?? []).length, 2);
});

test('the Saved page is one mixed list with filter chips and its own empty states', () => {
  const page = source('routes/saved.tsx');
  const row = source('routes/-components/saved-row.tsx');

  // One list, one DataState: no tabs and no old pager.
  assert.equal((page.match(/<DataState/g) ?? []).length, 1);
  assert.doesNotMatch(page, /<Tabs|Pager/);
  assert.match(page, /createFileRoute\('\/saved'\)/);
  assert.match(page, /<Guarded page="saved">/);
  // The chip lives in ?show= and the list loads more on request.
  assert.match(page, /validateSearch/);
  assert.match(page, /Load more/);
  for (const text of [
    'Nothing saved yet',
    'No saved listings',
    'No saved searches',
    "You don't follow any stores",
    'On the market page, set filters and tap Save search.',
    'Open a store and tap Follow.',
  ]) {
    assert.ok(page.includes(text), text);
  }
  // Each row names its kind and keeps its own action.
  for (const badge of ['Listing', 'Search', 'Store']) {
    assert.match(row, new RegExp(`<Badge variant="\\w+">${badge}</Badge>`));
  }
  assert.match(row, /<FavouriteButton/);
  assert.match(row, /<FollowButton/);
  assert.match(row, /Delete saved search for/);
});
