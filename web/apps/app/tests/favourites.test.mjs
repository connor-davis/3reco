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

test('buyers get a Saved link, guests and visitors do not', () => {
  assert.ok(links('business').includes('/saved'));
  assert.ok(links('collector').includes('/saved'));
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
});

test('hearts and the Follow button sit where the map puts them', () => {
  assert.match(source('components/listing-card.tsx'), /<FavouriteButton/);
  assert.match(
    source('routes/market/listing/$listingId.tsx'),
    /<FavouriteButton/
  );

  const store = source('routes/market/store/$sellerId.tsx');
  assert.ok(store.indexOf('<WhatsAppShare') < store.indexOf('<FollowButton'));
  // A store's own people are never offered a Follow button for it.
  assert.match(store, /user\?\.id !== sellerId/);
  assert.match(store, /active_business_id !== sellerId/);
});

test('the buttons say what they do and what state they are in', () => {
  const button = source('components/favourite-button.tsx');

  assert.match(button, /aria-pressed=\{saved\}/);
  assert.match(button, /aria-pressed=\{following\}/);
  assert.match(button, /Remove \$\{name\} from saved/);
  assert.match(button, /Unfollow \$\{name\}/);
  // Guests and visitors see neither.
  assert.equal((button.match(/if \(!canSave\) return null/g) ?? []).length, 2);
});

test('the Saved page has loading, empty and error states in both lists', () => {
  const page = source('routes/saved.tsx');

  assert.equal((page.match(/<DataState/g) ?? []).length, 2);
  assert.match(page, /Nothing saved yet/);
  assert.match(page, /You don't follow any stores/);
  assert.match(page, /createFileRoute\('\/saved'\)/);
  assert.match(page, /<Guarded page="saved">/);
});
