import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { tradeTypeLabel } from '../src/lib/trade-type.ts';

// Loads badges.tsx with every import stubbed, so its components can be called.
function loadBadges(user) {
  const source = readFileSync(
    new URL('../src/components/badges.tsx', import.meta.url),
    'utf8'
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const stub = new Proxy({}, { get: (_, name) => name });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    Object,
    require(name) {
      if (name === 'react/jsx-runtime') return jsx;
      if (name === '@/lib/trade-type') return { tradeTypeLabel };
      if (name === '@/lib/auth/use-auth') return { useAuth: () => ({ user }) };
      return stub;
    },
  });
  return exports;
}

// Every text and prop value in a rendered element tree, flattened.
const flat = (node) => JSON.stringify(node, (_, v) => v ?? null);

test('trade types read as plain words, in one place', () => {
  assert.equal(tradeTypeLabel('c2b'), 'Collector to business');
  assert.equal(tradeTypeLabel('b2b'), 'Business to business');
});

test('BusinessName adds a labelled check only when verified', () => {
  const { BusinessName } = loadBadges(null);

  assert.match(
    flat(BusinessName({ name: 'Acme', verified: true })),
    /Verified business/
  );
  assert.doesNotMatch(
    flat(BusinessName({ name: 'Acme', verified: false })),
    /Verified business/
  );
  assert.doesNotMatch(
    flat(BusinessName({ name: 'Acme' })),
    /Verified business/
  );
});

test('TradeTypeLabel shows Unverified only when the flag is false', () => {
  const { TradeTypeLabel } = loadBadges(null);
  const shown = (verified) => flat(TradeTypeLabel({ type: 'c2b', verified }));

  assert.match(shown(false), /Unverified/);
  assert.match(shown(false), /Collector to business/);
  assert.doesNotMatch(shown(true), /Unverified/);
  // The dashboard has no per-trade flag, so it shows the plain words.
  assert.doesNotMatch(shown(undefined), /Unverified/);
});

test('the banner shows for an unverified business only', () => {
  const banner = (user) => loadBadges(user).UnverifiedBanner();

  assert.match(
    flat(banner({ role: 'business', business_verified: false })),
    /Your store is hidden from the market until 3REco verifies your business\./
  );
  assert.equal(banner({ role: 'business', business_verified: true }), null);
  assert.equal(banner({ role: 'staff', business_verified: false }), null);
  assert.equal(banner(null), null);
});

test('the banner sits on the profile page and the own store page', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

  assert.match(
    read('../src/routes/profile/index.tsx'),
    /<UnverifiedBanner \/>/
  );
  assert.match(
    read('../src/routes/market/store/$sellerId.tsx'),
    /user\?\.id === sellerId && <UnverifiedBanner \/>/
  );
});
