import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseColor } from '../src/color/parse.js';
import { convertColor, toHex, toHsl, toSrgbFallback } from '../src/color/convert.js';
import { checkContrast, suggestForeground } from '../src/color/contrast.js';
import { harmonyHues, shade, tint, tone } from '../src/color/effects.js';

function near(actual: number, expected: number, epsilon = 1e-6) {
  assert(Math.abs(actual - expected) <= epsilon, `${actual} differs from ${expected}`);
}

test('HEX, functional color syntax and alpha preserve supported precision', () => {
  assert.equal(toHex(parseColor('#1aF8')).hex, '#11AAFF88');
  const rgb = parseColor('rgb(12.3456% 0 250.25 / 12.345%)');
  near(rgb.components[0], 0.123456, 1e-12);
  near(rgb.components[2], 250.25 / 255, 1e-12);
  near(rgb.alpha, 0.12345, 1e-12);
  assert.equal(toHex(parseColor('rgba(255, 0, 0, .5)')).hex, '#FF000080');
  assert.equal(toHex(parseColor('hsl(.5turn 100% 50%)')).hex, '#00FFFF');
  assert.equal(toHex(parseColor('hsla(120deg, 100%, 50%, 25%)')).hex, '#00FF0040');
  const lch = parseColor('oklch(63.1234% 50% -30deg / .7)');
  assert.equal(lch.space, 'oklch');
  near(lch.components[0], 0.631234, 1e-12);
  near(lch.components[1], 0.2, 1e-12);
  assert.equal(lch.components[2], 330);
  assert.equal(lch.alpha, 0.7);
  for (const invalid of ['#12345', 'rgb(0 0 256)', 'hsl(90 1 50%)', 'oklch(.4 -1 30)', 'rgb(10, 10, 10 / 1)', 'color(xyz 0 0 0)']) {
    assert.throws(() => parseColor(invalid), RangeError, invalid);
  }
});

test('wide-gamut conversion exposes an sRGB fallback and round-trips ordinary in-gamut colors', () => {
  const redP3 = parseColor('color(DISPLAY-P3 1 0 0 / .75)');
  assert.deepEqual(redP3, { space: 'display-p3', components: [1, 0, 0], alpha: 0.75 });
  const mapped = toSrgbFallback(redP3);
  assert.deepEqual(mapped, { color: { space: 'srgb', components: [1, 0, 0], alpha: 0.75 }, gamutMapped: true });
  const redLch = convertColor(parseColor('#F00'), 'oklch').color;
  near(redLch.components[0], 0.6279553606);
  near(redLch.components[1], 0.2576833077);
  near(redLch.components[2], 29.23388519);
  const source = parseColor('rgb(125.125 89.777 206.123 / 91%)');
  for (const target of ['display-p3', 'oklch'] as const) {
    const back = toSrgbFallback(convertColor(source, target).color).color;
    back.components.forEach((channel, index) => near(channel, source.components[index]!));
    assert.equal(back.alpha, 0.91);
  }
  const cyan = toHsl(parseColor('#00FFFF'));
  assert.equal(cyan.hue, 180);
  assert.equal(cyan.saturation, 1);
  assert.equal(cyan.lightness, 0.5);
});

test('contrast uses unrounded thresholds and rejects a missing backing for transparency', () => {
  const white = parseColor('#fff');
  const black = parseColor('#000');
  assert.equal(checkContrast(black, white).ratio, 21);
  assert.equal(checkContrast(white, white).ratio, 1);
  const close = checkContrast(parseColor('#070707'), parseColor('#777777'));
  assert.equal(close.ratio.toFixed(2), '4.50');
  assert.equal(close.normal.aa.passes, false);
  assert.equal(close.large.aa.passes, true);
  near(checkContrast(parseColor('#6F8F7B'), parseColor('#F8F5EF')).ratio, 3.276012311465193);
  near(checkContrast(parseColor('#3E6452'), parseColor('#F8F5EF')).ratio, 6.127462422138969);

  const translucent = parseColor('rgb(0 0 0 / 50%)');
  assert.throws(() => checkContrast(translucent, white), /opaque backing/);
  assert.throws(() => checkContrast(translucent, white, translucent), /opaque/);
  const layered = checkContrast(translucent, translucent, white);
  assert.deepEqual(layered.background.components, [0.5, 0.5, 0.5]);
  assert.deepEqual(layered.foreground.components, [0.25, 0.25, 0.25]);
  assert.equal(checkContrast(translucent, translucent, black).ratio, 1);
  const fix = suggestForeground(parseColor('#6F8F7B'), parseColor('#F8F5EF'));
  assert(fix);
  assert.equal(checkContrast(fix.color, parseColor('#F8F5EF')).normal.aa.passes, true);
  assert.equal(suggestForeground(black, white), null);
});

test('tints, shades, tones and harmony angles are deterministic', () => {
  const red = parseColor('rgb(255 0 0 / .5)');
  assert.equal(toHex(tint(red, 0.5)).hex, '#FF808080');
  assert.equal(toHex(shade(red, 0.5)).hex, '#80000080');
  assert.equal(toHex(tone(red, 0.5)).hex, '#BF404080');
  assert.deepEqual(harmonyHues(350, 'triadic'), [350, 110, 230]);
  assert.deepEqual(harmonyHues(-40, 'monochromatic'), [320]);
});
