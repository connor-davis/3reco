import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// lib/setup.ts only needs isAuthPath from the nav file.
const exports = {};
const source = readFileSync(
  new URL('../src/lib/setup.ts', import.meta.url),
  'utf8'
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: 'ES2022' },
});
vm.runInNewContext(outputText, {
  exports,
  require: () => ({ isAuthPath: (path) => path === '/sign-in' }),
});
const { needsSetup } = exports;

const user = (role, profileComplete) => ({ role, profileComplete });

test('a guest goes to setup from anywhere but the open pages', () => {
  assert.equal(needsSetup(user('guest', false), '/'), true);
  assert.equal(needsSetup(user('guest', false), '/market'), true);
  assert.equal(needsSetup(user(null, false), '/stock'), true);
  for (const path of [
    '/setup',
    '/profile',
    '/profile/x',
    '/about',
    '/terms',
    '/privacy',
    '/sign-in',
  ]) {
    assert.equal(needsSetup(user('guest', false), path), false, path);
  }
});

test('a business or collector with an unfinished profile goes to setup', () => {
  assert.equal(needsSetup(user('business', false), '/'), true);
  assert.equal(needsSetup(user('collector', false), '/market'), true);
  assert.equal(needsSetup(user('business', true), '/'), false);
});

test('admin, staff and signed-out visitors are never sent to setup', () => {
  assert.equal(needsSetup(user('admin', false), '/'), false);
  assert.equal(needsSetup(user('staff', false), '/'), false);
  assert.equal(needsSetup(null, '/'), false);
});
