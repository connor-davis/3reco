import assert from 'node:assert/strict';
import test from 'node:test';
import { source } from './qa-round2-loader.mjs';

const css = source('index.css');
const tints = ['mint', 'peach', 'lilac', 'sky', 'rose', 'butter'];

// Convert OKLCH through linear sRGB and clip to the display gamut before
// applying WCAG's relative luminance weights.
function luminance(value) {
  const match = value.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/);
  assert.ok(match, `Expected an opaque OKLCH colour: ${value}`);
  const [, lightness, chroma, hue] = match.map(Number);
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  const srgb = linear.map((channel) => {
    const clipped = Math.max(0, Math.min(1, channel));
    return clipped <= 0.0031308
      ? 12.92 * clipped
      : 1.055 * clipped ** (1 / 2.4) - 0.055;
  });
  const decoded = srgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );

  return decoded.reduce(
    (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
    0
  );
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('look D has rounded surfaces and readable pastel and text pairs in both modes', () => {
  assert.ok(Number.parseFloat(css.match(/--radius:\s*([^;]+)/)[1]) > 0);
  for (const name of ['md', 'lg', 'xl', '2xl']) {
    assert.ok(
      Number.parseFloat(
        css.match(new RegExp(`--radius-${name}:\\s*([^;]+)`))[1]
      ) > 0
    );
  }

  for (const selector of [':root', '.dark']) {
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    const tokens = Object.fromEntries(
      [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [
        key,
        value,
      ])
    );
    assert.ok(tokens.inner, `${selector}: inner surface`);
    const pairs = tints.map((tint) => [`${tint}-ink`, tint]);
    for (const surface of ['background', 'card', 'inner']) {
      pairs.push(['foreground', surface], ['muted-foreground', surface]);
    }

    for (const [ink, surface] of pairs) {
      assert.ok(
        tokens[ink] && tokens[surface],
        `${selector}: ${ink}/${surface} exist`
      );
      const ratio = contrast(tokens[ink], tokens[surface]);
      assert.ok(
        ratio >= 4.5,
        `${selector}: ${ink}/${surface} is ${ratio.toFixed(2)}:1`
      );
    }
  }
});
