import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { source } from './qa-round2-loader.mjs';

test('G18: privacy Activity names and roles do not expose raw IDs', () => {
  const text = source('routes/admin/activity.tsx');
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      text +
        '\nexports.partyText = partyText; exports.whoText = whoText; exports.recordText = recordText;',
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }
    ).outputText,
    {
      exports,
      require: (name) =>
        name === '@tanstack/react-router'
          ? { createFileRoute: () => () => ({}) }
          : name === '@/lib/access'
            ? { roleLabel: (role) => (role === 'business' ? 'Business' : role) }
            : {},
    }
  );
  assert.equal(exports.partyText(null, null), 'Unknown');
  assert.equal(exports.partyText('Nomsa', 'business'), 'Nomsa · Business');
  const line = {
    source: 'privacy',
    actor_id: 'secret-actor',
    actor_name: 'Nomsa',
    actor_role: 'business',
    subject_name: 'Thandi',
    row_key: { subject_id: 'secret-subject' },
  };
  assert.equal(exports.whoText(line), 'Nomsa · Business');
  assert.equal(exports.recordText(line), 'Thandi');
  assert.doesNotMatch(
    exports.whoText(line) + exports.recordText(line),
    /secret-actor|secret-subject/
  );
  assert.match(text, /privacy_events: 'Privacy event'/);
  assert.doesNotMatch(
    source('routes/admin/users.tsx'),
    /<TabsTrigger[^>]*>Privacy events/
  );
});
