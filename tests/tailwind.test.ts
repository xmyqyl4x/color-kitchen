import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import postcss, { type Plugin } from 'postcss';
import { compile } from 'tailwindcss';
import { parseColor } from '../src/color/parse.js';
import { checkScaleExample, exportTailwindScale, generateColorScale, inspectBuiltInScale, shades } from '../src/tailwind/scale.js';

const base = parseColor('oklch(.55432 .109876 167.3456 / .72)');

test('named eleven-shade scales preserve the fixed base and manual edits', () => {
  const override = parseColor('#FAFAFA');
  const scale = generateColorScale({ name: '  Forêt Kitchen  ', base, anchor: 700, overrides: { 50: override } });
  assert.equal(scale.name, 'foret-kitchen');
  assert.equal(Object.keys(scale.colors).length, 11);
  assert.deepEqual(scale.colors[700], base);
  assert.deepEqual(scale.colors[50], override);
  assert.deepEqual(generateColorScale({ name: 'dark', base, anchor: 50 }).colors[50], base);
  assert.deepEqual(generateColorScale({ name: 'light', base, anchor: 950 }).colors[950], base);
  assert.throws(() => generateColorScale({ name: 'Kitchen', base, anchor: 700, overrides: { 700: override } }), /non-anchor/);
  assert.throws(() => exportTailwindScale(scale, { version: 4, space: 'oklch', taken: ['Forêt Kitchen'] }), /already exists/);
  assert.throws(() => exportTailwindScale(generateColorScale({ name: 'blue', base }), { version: 3, space: 'srgb' }), /already exists/);
  const result = checkScaleExample(scale, 50, 700, parseColor('#fff'));
  assert(result.ratio > 1);
  assert.equal(result.normal.aa.passes, result.ratio >= 4.5);
});

test('exported v3 config and v4 theme compile the intended utilities with their pinned compilers', async () => {
  const scale = generateColorScale({ name: 'kitchen', base, anchor: 700 });
  const v3 = exportTailwindScale(scale, { version: 3, space: 'srgb' });
  const v4 = exportTailwindScale(scale, { version: 4, space: 'oklch' });
  assert(v3.version === 3 && v4.version === 4);
  const load = createRequire(import.meta.url);
  const tw3 = load('tailwindcss-v3') as (config: unknown) => Plugin;
  const result = await postcss([tw3({
    ...v3.config, content: [{ raw: '<div class="bg-kitchen-700 text-kitchen-50"></div>' }],
  })]).process('@tailwind utilities;', { from: undefined });
  assert.match(result.css, /\.bg-kitchen-700/);
  assert.match(result.css, /\.text-kitchen-50/);
  assert(result.css.includes(v3.colors[700]));
  const modern = await compile(v4.css + '\n@tailwind utilities;');
  const css = modern.build(['bg-kitchen-700', 'text-kitchen-50']);
  assert.match(css, /background-color: var\(--color-kitchen-700\)/);
  assert.match(css, /color: var\(--color-kitchen-50\)/);
  assert(css.includes('--color-kitchen-700: ' + v4.colors[700]));
  assert.deepEqual(parseColor(v4.colors[700]), base);

  const blue3 = inspectBuiltInScale(3, 'blue');
  const blue4 = inspectBuiltInScale(4, 'blue');
  assert.equal(blue3?.colors[500], '#3b82f6');
  assert.equal(blue4?.version, '4.3.5');
  assert(blue4?.colors[500].startsWith('oklch('));
  assert.deepEqual(Object.keys(blue4!.colors).map(Number), [...shades]);
});
