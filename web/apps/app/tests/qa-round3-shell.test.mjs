import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    Intl,
    Date,
    BigInt,
    Number,
    require(name) {
      if (name in dependencies) return dependencies[name];
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  return exports;
}

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const format = compile('../src/lib/format.ts');
const impact = compile('../src/lib/impact.ts', {
  '@/lib/api/stats': { useStats: () => ({}) },
  '@/lib/format': format,
});
const helpers = compile('../src/components/chat/helpers.ts', {
  '@/lib/format': format,
});

test('weights and CO₂e use one rule: kg, thousands spaces, 2 decimals at most', () => {
  assert.equal(format.formatKg('1231.805'), '1 231.81 kg');
  assert.equal(format.formatKg('12000'), '12 000 kg');
  assert.equal(format.formatKg('4799.25'), '4 799.25 kg');
  assert.equal(format.formatKg('0.5'), '0.5 kg');
  assert.equal(format.formatKg(1231.805), '1 231.81 kg');
  assert.equal(impact.formatCo2('3500.4'), '3 500.4 kg CO₂e');
  assert.equal(impact.formatCo2(129.999), '130 kg CO₂e');
  assert.equal(impact.formatCo2(1900.123), '1 900.12 kg CO₂e');
});

test('the About line says "CO₂e saved" with a space and one verb', () => {
  const about = source('../src/routes/about.tsx');
  assert.match(about, /formatCo2\(stats\.co2_kg\)\}\{' '\}\s+saved/);
  assert.match(about, /diverted/);
  assert.doesNotMatch(about, /traded ·/);
});

test('the removed-account marker shows as words everywhere a message shows', () => {
  assert.equal(helpers.messageText('[removed]'), 'Message removed');
  assert.equal(helpers.messageText('Hello'), 'Hello');

  for (const path of [
    '../src/routes/-dashboard/panels.tsx',
    '../src/components/chat/inbox.tsx',
    '../src/components/chat/conversation.tsx',
  ]) {
    assert.match(source(path), /messageText\(/, path);
  }
});

test('unlisting from the edit dialog says the stock is no longer listed', () => {
  const dialog = source('../src/components/dialogs/stock-dialog.tsx');
  assert.match(dialog, /Stock is no longer listed\./);
  assert.match(dialog, /Stock is now listed in the market\./);
});

test('staff opening a chat get a plain refusal with no retry', () => {
  const layout = source('../src/components/chat/messages-layout.tsx');
  assert.match(layout, /staff \|\|/);
  assert.match(layout, /You can't open this chat/);
  assert.match(layout, /No chats to open/);
  const blocked = layout.slice(layout.indexOf('function ChatBlocked'));
  assert.doesNotMatch(
    blocked.slice(0, blocked.indexOf('export function')),
    /Try again|refetch/
  );
});

test('the R / kg field sits on a row wide enough for what was typed', () => {
  const dialog = source('../src/components/dialogs/collection-dialog.tsx');
  assert.doesNotMatch(dialog, /grid-cols-\[1fr_11rem_12rem_auto\]/);
  assert.match(dialog, /sm:grid-cols-\[1fr_1fr_auto\]/);
  assert.match(dialog, /\{material\.name\} is below the base price/);
  assert.match(dialog, /TriangleAlert/);
});

test('phones group in threes and the collector list starts A to Z', () => {
  assert.equal(format.formatPhone('+27835550404'), '+27 83 555 0404');
  assert.equal(format.formatPhone('0835550404'), '083 555 0404');
  assert.equal(format.formatPhone('abc'), 'abc');
  assert.match(
    source('../src/routes/collectors.tsx'),
    /initialSort=\{\[\{ id: 'name'/
  );
});
