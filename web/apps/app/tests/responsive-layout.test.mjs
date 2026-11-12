import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { source } from './qa-round2-loader.mjs';

test('phone shell includes tablets and stops at 1024px; table and aside rules stay separate', () => {
  let width = 390;
  const exports = {};
  const { outputText } = ts.transpileModule(source('hooks/use-mobile.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  vm.runInNewContext(outputText, {
    exports,
    require: () => ({
      useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    }),
    window: {
      matchMedia: (query) => {
        const [, direction, limit] = query.match(/(max|min)-width: (\d+)px/);
        return {
          matches: direction === 'max' ? width <= +limit : width >= +limit,
        };
      },
    },
  });
  for (width of [390, 820, 1023, 1024, 1099, 1100, 1280, 1359, 1360, 1920]) {
    assert.equal(exports.useIsMobile(), width < 1024, `shell at ${width}`);
    assert.equal(exports.useIsCompact(), width < 1100, `table at ${width}`);
    assert.equal(exports.useIsWide(), width >= 1360, `aside at ${width}`);
  }

  assert.match(source('components/shell/app-sidebar.tsx'), /max-lg:hidden/);
  assert.match(source('components/shell/bottom-tabs.tsx'), /lg:hidden/);
  assert.match(
    source('components/shell/app-shell.tsx'),
    /pb-\[3\.25rem\] lg:pb-0/
  );
  assert.match(
    source('components/shell/topbar.tsx'),
    /hidden min-w-0 lg:block/
  );
});

test('touch sizes and the chat back link follow the phone shell (below lg), not 780px', () => {
  for (const file of [
    'components/ui/button-variants.ts',
    'components/ui/input.tsx',
    'components/chat/conversation.tsx',
  ]) {
    assert.doesNotMatch(source(file), /\[78[01]px\]/, file);
  }
  assert.match(source('components/ui/button-variants.ts'), /max-lg:min-h-11/);
  assert.match(
    source('components/chat/conversation.tsx'),
    /Back to messages[\s\S]*?lg:hidden/
  );
});
