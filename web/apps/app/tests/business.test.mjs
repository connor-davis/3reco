import test from 'node:test';
import assert from 'node:assert/strict';
import { load, source } from './qa-round2-loader.mjs';

const access = load('lib/access.ts');
const { navFor } = load('lib/nav.ts', { '@/lib/access': access });

const person = (business_role) => ({
  role: 'collector',
  active_business_id: 'b1',
  business_role,
});

test('only an Owner or Manager of the active business can open the Business page', () => {
  assert.equal(access.canViewBusiness(person('owner')), true);
  assert.equal(access.canViewBusiness(person('manager')), true);
  assert.equal(access.canViewBusiness(person('member')), false);
  assert.equal(access.canViewBusiness({ role: 'business' }), false);
  assert.equal(access.canViewBusiness(null), false);
});

test('the Business link follows the same rule, and the page keeps its promises', () => {
  const has = (role) =>
    navFor(role.role, role.business_role, role.active_business_id).some(
      (group) => group.links.some((link) => link.to === '/business')
    );
  assert.equal(has(person('owner')), true);
  assert.equal(has(person('manager')), true);
  assert.equal(has(person('member')), false);

  const page = source('routes/business.tsx');
  assert.match(page, /canViewBusiness/);
  assert.match(page, /Deleting a business is not available/);
  assert.match(page, /readOnly/);
  assert.doesNotMatch(page, /max-w-/);
  assert.doesNotMatch(page, /staff/i);
});
