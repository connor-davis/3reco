import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

const config = (demo) => ({
  '@/lib/api/app-config': { useAppConfig: () => ({ demo }) },
});
const login = load('lib/demo-logins.ts');

test('the banner shows on the demo and nowhere else', () => {
  const on = load('components/demo-banner.tsx', config(true));
  const off = load('components/demo-banner.tsx', config(false));

  const text = nodes(on.DemoBanner())
    .map((n) => n.props?.children)
    .filter((c) => typeof c === 'string');
  assert.ok(text.includes('Demo: nothing here is real'));
  assert.equal(off.DemoBanner(), null);
});

test('one-click buttons are for buyer, seller and collector only', () => {
  const picked = [];
  const mocks = (demo) => ({
    ...config(demo),
    '@/components/ui/button': { Button: 'button' },
    '@/lib/demo-logins': login,
  });

  assert.equal(
    load('components/demo-logins.tsx', mocks(false)).DemoLogins({
      onPick() {},
    }),
    null
  );

  const tree = load('components/demo-logins.tsx', mocks(true)).DemoLogins({
    onPick: (value) => picked.push(value),
  });
  const buttons = nodes(tree).filter((n) => n.type === 'button');
  assert.equal(buttons.length, 3);

  buttons.forEach((b) => b.props.onClick());
  assert.deepEqual(
    picked.map((p) => p.email),
    ['buyer@demo.test', 'seller@demo.test', 'collector@demo.test']
  );
  assert.ok(picked.every((p) => p.password === login.demoPassword));
  assert.ok(!JSON.stringify(login.demoLogins).includes('admin'));
});

test('sign-up and password reset links are hidden in the demo', () => {
  const page = source('routes/sign-in.tsx');
  assert.match(page, /\{!demo && \(\s*<p>\s*New to 3REco/);
  assert.match(page, /\{!demo && \(\s*<div className="text-right">/);
  assert.match(page, /<DemoLogins /);
});

test('phone alerts are hidden in the demo', () => {
  const page = source('routes/profile/index.tsx');
  assert.match(page, /\{!demo && <TabsTrigger value="alerts">/);
  assert.match(page, /\{!demo && \(\s*<TabsContent value="alerts">/);
});

test('the banner is mounted above the app on every page', () => {
  const root = source('routes/__root.tsx');
  assert.ok(root.indexOf('<DemoBanner />') < root.indexOf('<AppShell>'));
});

test('downloads are hidden in the demo and kept everywhere else', () => {
  const list = source('routes/transactions/-components/record-list.tsx');
  assert.match(list, /const canExport = !readOnly && !demo;/);
  assert.equal((list.match(/canExport/g) ?? []).length, 4);

  const users = source('routes/admin/users.tsx');
  assert.match(users, /action=\{\s*!demo && \(\s*<Button/);

  const business = source('routes/business.tsx');
  assert.match(business, /const canDownload = !readOnly && !demo;/);
  assert.match(business, /\{canDownload && \(\s*<TabsTrigger value="data">/);
  assert.match(business, /\{canDownload && \(\s*<TabsContent value="data">/);

  const privacy = source('routes/profile/-components/privacy-panel.tsx');
  assert.match(
    privacy,
    /\{!demo && \(\s*<section[^>]*>\s*<p[^>]*>\s*Download your profile/
  );
});

test('team invitations are hidden in the demo and kept everywhere else', () => {
  const team = source('routes/team.tsx');
  assert.match(
    team,
    /actions=\{\s*!demo && \(\s*<Button onClick=\{\(\) => setInviting\(true\)\}>/
  );
  assert.match(
    team,
    /if \(demo \|\| \(!owner && invite\.role === 'owner'\)\) return \[\];/
  );
});
