import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PaletteDocument } from '../src/browser/document.js';
import { harmonyModes } from '../src/color/effects.js';
import { assertColor, parseColor } from '../src/color/parse.js';
import { applyPaletteCommand, openPaletteSession, previewPaletteEdit, type PaletteCommand,
  type PaletteSession } from '../src/palette/document.js';
import { generatePalette } from '../src/palette/generate.js';

function session(count = 5) {
  const document: PaletteDocument = {
    id: 'fixture-palette', kind: 'palette', schemaVersion: 1,
    name: 'Fixture Palette', revision: 1, updatedAt: 100, palette: generatePalette({ seed: 87 }, count),
  };
  return openPaletteSession(document);
}

function apply(session: PaletteSession, command: PaletteCommand) {
  return applyPaletteCommand(session, command, {
    expectedRevision: session.document.revision, updatedAt: session.document.updatedAt + 1,
  });
}

test('generation is repeatable for every harmony, allowed swatch count and temperature', () => {
  assert.equal(generatePalette({ seed: 1 }).swatches.length, 5);
  for (const harmony of harmonyModes) {
    for (const temperature of ['any', 'warm', 'cool'] as const) {
      for (const count of [2, 5, 12]) {
        const settings = { seed: 0xe25408b4, harmony, temperature };
        const palette = generatePalette(settings, count);
        assert.deepEqual(palette, generatePalette(settings, count));
        assert.equal(new Set(palette.swatches.map(swatch => swatch.id)).size, count);
        for (const { color } of palette.swatches) {
          assertColor(color);
          const hue = color.components[2];
          if (temperature === 'warm') assert(hue >= 315 || hue <= 75);
          if (temperature === 'cool') assert(hue >= 130 && hue <= 295);
        }
      }
    }
  }
  assert.notDeepEqual(generatePalette({ seed: 1 }), generatePalette({ seed: 2 }));
  assert.throws(() => generatePalette({ seed: -1 }), RangeError);
  assert.throws(() => generatePalette({ seed: 1 }, 13), RangeError);
});

test('generation and adjustment preserve locks and role IDs, and a fully locked palette is unchanged', () => {
  let active = apply(session(), { type: 'assign-role', role: 'text', id: 'swatch-1' });
  active = apply(active, { type: 'set-lock', id: 'swatch-1', locked: true });
  const before = active.document.palette;
  assert.throws(() => apply(active, { type: 'set-color', id: 'swatch-1', color: parseColor('#aaa') }), { code: 'locked' });
  const generated = apply(active, { type: 'generate', options: { seed: 420, harmony: 'triadic' } });
  assert.deepEqual(generated.document.palette.swatches[0], before.swatches[0]);
  assert.notDeepEqual(generated.document.palette.swatches[1]?.color, before.swatches[1]?.color);
  assert.deepEqual(generated.document.palette.roles, before.roles);
  const command = { type: 'adjust', lightness: 0.1, chroma: -0.05 } as const;
  const preview = previewPaletteEdit(generated.document.palette, command);
  assert.notDeepEqual(preview, generated.document.palette);
  assert.deepEqual(preview.swatches[0], before.swatches[0]);
  assert.deepEqual(preview, apply(generated, command).document.palette);
  for (const swatch of active.document.palette.swatches) {
    active = apply(active, { type: 'set-lock', id: swatch.id, locked: true });
  }
  assert.equal(apply(active, { type: 'generate', options: { seed: 933 } }), active);
  assert.equal(apply(active, command), active);
});

test('roles follow stable IDs through reorder, duplicate, deletion and history', () => {
  let active = apply(session(), { type: 'assign-role', role: 'text', id: 'swatch-2' });
  active = apply(active, { type: 'assign-role', role: 'surface', id: 'swatch-2' });
  active = apply(active, { type: 'move', id: 'swatch-2', index: 4 });
  assert.equal(active.document.palette.swatches.at(-1)?.id, 'swatch-2');
  assert.equal(active.document.palette.roles.text, 'swatch-2');
  active = apply(active, { type: 'duplicate', id: 'swatch-2', newId: 'copy-2' });
  assert.equal(active.document.palette.swatches.at(-1)?.id, 'copy-2');
  assert.deepEqual(active.document.palette.swatches.at(-1)?.color, active.document.palette.swatches.at(-2)?.color);
  assert.throws(() => apply(active, { type: 'remove', id: 'swatch-2' }), { code: 'bound-role' });
  assert.throws(() => apply(active, { type: 'remove', id: 'swatch-2', roles: { text: 'copy-2' } }), { code: 'bound-role' });
  const updated = apply(active, { type: 'remove', id: 'swatch-2', roles: { text: 'copy-2', surface: null } });
  assert.deepEqual(updated.document.palette.roles, { text: 'copy-2' });
  assert(!updated.document.palette.swatches.some(swatch => swatch.id === 'swatch-2'));
  const undone = apply(updated, { type: 'undo' });
  assert.deepEqual(undone.document.palette, active.document.palette);
  assert.deepEqual(apply(undone, { type: 'redo' }).document.palette, updated.document.palette);
});

test('palette edits are atomic, bounded, and reject stale consumers without altering the draft', () => {
  const start = session(2);
  assert.throws(() => apply(start, { type: 'remove', id: 'swatch-1' }), /at least two/);
  assert.throws(() => apply(start, { type: 'add', id: 'swatch-1', color: parseColor('#fff') }), /unique/);
  const withColor = apply(start, { type: 'add', id: 'custom', color: parseColor('color(display-p3 1 .25 0 / .8)') });
  const changed = apply(withColor, { type: 'set-color', id: 'custom', color: parseColor('#0f08') });
  assert.equal(changed.document.palette.swatches.at(-1)?.color.alpha, 136 / 255);
  assert.throws(() => applyPaletteCommand(changed, { type: 'undo' }, { expectedRevision: 1, updatedAt: 100 }),
    { code: 'stale' });
  const undone = apply(changed, { type: 'undo' });
  assert.deepEqual(undone.document.palette, withColor.document.palette);
  assert(undone.document.revision > changed.document.revision);
  const divergent = apply(undone, { type: 'set-lock', id: 'custom', locked: true });
  assert.equal(apply(divergent, { type: 'redo' }), divergent);
  assert.equal(start.document.palette.swatches.length, 2);
  assert.throws(() => apply(session(12), { type: 'duplicate', id: 'swatch-1', newId: 'overflow' }), /space/);
});
