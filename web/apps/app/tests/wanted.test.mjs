import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

test('wanted is a business page, in the sidebar, titles and guards', () => {
  const access = load('lib/access.ts');
  for (const role of ['admin', 'staff', 'collector', 'guest', null]) {
    assert.equal(access.canOpen(role, 'wanted'), false, String(role));
  }
  assert.equal(access.canOpen('business', 'wanted'), true);

  const { navFor, pageTitleFor, guardedPageFor } = load('lib/nav.ts', {
    '@/lib/access': access,
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
  });
  const links = navFor('business').flatMap((group) => group.links);
  assert.ok(links.some((link) => link.to === '/wanted'));
  assert.equal(guardedPageFor('/wanted'), 'wanted');
  assert.equal(pageTitleFor('/wanted', 'business'), 'Wanted');
  assert.equal(pageTitleFor('/wanted', 'collector'), 'Not available');
});

test('a wanted event and a request event both refresh the wanted lists', () => {
  const { keysFor } = load('lib/live/connection.ts');
  assert.ok(JSON.stringify(keysFor('wanted')).includes('["wanted"]'));
  assert.ok(JSON.stringify(keysFor('request', 'r1')).includes('["wanted"]'));
});

test('only a verified business sees the browse list; every post shows its states', () => {
  const page = source('routes/wanted.tsx');
  assert.match(
    page,
    /user\?\.business_verified && \([\s\S]*<TabsContent value="browse" keepMounted>[\s\S]*<WantedBrowse \/>/
  );

  const mine = source('routes/-components/wanted-mine.tsx');
  assert.match(mine, /No wanted posts yet/);
  assert.match(mine, /No replies yet/);
  assert.match(mine, /Close post/);
  assert.match(mine, /\/market\/\$requestId/);

  const browse = source('routes/-components/wanted-browse.tsx');
  assert.match(browse, /Nothing wanted right now/);
  assert.match(browse, /You replied\. Open the chat/);
});

test('the wanted api sends exact decimals as strings and one offer line', () => {
  const api = source('lib/api/wanted.ts');
  assert.match(api, /weight: string;/);
  assert.match(api, /max_price: string \| null;/);
  assert.match(api, /items: \[/);
  assert.doesNotMatch(api, /Number\(/);

  const form = source('routes/-components/wanted-form.tsx');
  assert.match(form, /Leave empty to take any price\./);
  assert.match(form, /Not your address\./);
  assert.match(form, /value: '7'/);
  assert.match(form, /value: '30'/);
});

test('the wanted form starts the area from the profile and never overwrites', () => {
  const { roughArea, areaToPrefill } = load('lib/wanted-area.ts');

  assert.equal(
    roughArea({ city: 'Pretoria', province: 'Gauteng' }),
    'Pretoria, Gauteng'
  );
  assert.equal(roughArea({ city: 'Pretoria', province: '' }), 'Pretoria');
  assert.equal(roughArea({ city: ' ', province: 'Gauteng' }), 'Gauteng');
  assert.equal(roughArea(undefined), '');
  assert.equal(roughArea({ city: null, province: null }), '');

  // The street address and area code are never used.
  const profile = {
    city: 'Pretoria',
    province: 'Gauteng',
    street_address: '12 Main Road',
    area_code: '0002',
  };
  assert.equal(roughArea(profile), 'Pretoria, Gauteng');
  assert.ok(!roughArea(profile).includes('Main Road'));
  assert.ok(!roughArea(profile).includes('0002'));

  // An empty, untouched box takes it, including when the profile loads late.
  assert.equal(
    areaToPrefill('', false, 'Pretoria, Gauteng'),
    'Pretoria, Gauteng'
  );
  // Typed words stay, and so does a box the person cleared on purpose.
  assert.equal(areaToPrefill('Durban', false, 'Pretoria, Gauteng'), null);
  assert.equal(areaToPrefill('', true, 'Pretoria, Gauteng'), null);
  // No profile area: nothing to fill.
  assert.equal(areaToPrefill('', false, ''), null);

  const form = source('routes/-components/wanted-form.tsx');
  assert.match(form, /type === 'change'\) typed\.current = true/);
  assert.match(form, /form\.reset\(\{ \.\.\.empty, area: suggested \}\)/);
  assert.doesNotMatch(
    source('routes/-components/wanted-reply.tsx'),
    /roughArea/
  );
});
