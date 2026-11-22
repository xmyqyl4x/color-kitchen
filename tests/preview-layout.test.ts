import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseColor } from '../src/color/parse.js';
import { toHex } from '../src/color/convert.js';
import { composePreview, type Template } from '../src/preview/layout.js';
import { composeMoodboard, coverCrop, type MoodboardInput } from '../src/preview/moodboard.js';
import { generatePalette } from '../src/palette/generate.js';

test('preview roles survive reordering and variants use actual rendered contrast pairs', () => {
  const palette = {
    swatches: [{ id: 'ink', color: parseColor('#000'), locked: true }, { id: 'paper', color: parseColor('#fff'), locked: false }],
    roles: { text: 'ink', surface: 'paper' },
  };
  const variant = { theme: 'light', viewport: 'desktop' } as const;
  for (const template of ['landing', 'dashboard', 'editorial', 'shop-card'] satisfies Template[]) {
    const light = composePreview(template, variant, palette);
    assert.deepEqual(light, composePreview(template, variant, { ...palette, swatches: [...palette.swatches].reverse() }));
    assert(light.blocks.some(block => block.pair?.ratio === 21));
    const dark = composePreview(template, { theme: 'dark', viewport: 'mobile' }, palette);
    assert.equal(dark.width, 360);
    assert.notEqual(toHex(dark.background).hex, toHex(light.background).hex);
    assert(dark.blocks.every(block => block.rect.x + block.rect.width <= dark.width + 1e-8));
  }
  assert.throws(() => composePreview('landing', variant, { ...palette, roles: { text: 'missing' } }), /unavailable swatch/);
});

test('cover crop respects a portrait source, a restricted crop and focus controls', () => {
  const source = { id: 'portrait', width: 300, height: 900, crop: { x: 0, y: 0.2, width: 1, height: 0.6 } };
  assert.deepEqual(coverCrop({ ...source, focus: [0, 0] }, { width: 200, height: 100 }), { x: 0, y: 180, width: 300, height: 150 });
  assert.deepEqual(coverCrop({ ...source, focus: [1, 1] }, { width: 200, height: 100 }), { x: 0, y: 570, width: 300, height: 150 });
  assert.throws(() => coverCrop({ ...source, crop: { x: 0.9, y: 0, width: 0.3, height: 1 } }, { width: 10, height: 10 }), RangeError);
});

test('all moodboard layouts retain clean export bounds and editable caption and legend', () => {
  const source: MoodboardInput = {
    layout: 'bottom-strip', width: 480, height: 400, spacing: 8, padding: 14,
    images: [{ id: 'one', width: 248, height: 800 }, { id: 'two', width: 1024, height: 576 }],
    palette: generatePalette({ seed: 77 }), background: parseColor('#fff'), caption: '  Local inspiration  ', legend: true,
  };
  for (const layout of ['bottom-strip', 'side-strip', 'two-image', 'square'] as const) {
    const plan = composeMoodboard({ ...source, layout });
    assert.equal(plan.frames.length, 2);
    assert.equal(plan.caption?.text, 'Local inspiration');
    assert(plan.swatches.every(item => item.showLegend));
    for (const item of [...plan.frames, ...plan.swatches, plan.caption!]) {
      const { x, y, width, height } = item.rect;
      assert(x >= 14 && y >= 14 && x + width <= 466 + 1e-8 && y + height <= 386 + 1e-8);
    }
    if (layout === 'square') assert.equal(plan.frames[0]?.rect.width, plan.frames[0]?.rect.height);
  }
  assert.throws(() => composeMoodboard({ ...source, width: 64, padding: 60 }), /does not fit/);
  assert.throws(() => composeMoodboard({ ...source, width: 5000, height: 5000 }), /Invalid moodboard/);
});
