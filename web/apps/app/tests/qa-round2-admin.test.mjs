import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './qa-round2-loader.mjs';

test('G18: privacy desktop and phone rows render names and roles without raw IDs', () => {
  const users = source('routes/admin/users.tsx');
  const cell = users.slice(
    users.indexOf('function PartyCell'),
    users.indexOf('function PrivacyEvents')
  );
  assert.match(cell, /name \?\? 'Unknown'/);
  assert.match(cell, /\{role\}/);
  assert.doesNotMatch(cell, /\bid\b|ID \{/);
  assert.equal(
    (
      users.match(
        /name=\{(?:row\.original|event)\.(?:actor|subject)_name\}/g
      ) ?? []
    ).length,
    4
  );
});
