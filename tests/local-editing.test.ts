import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatMessage } from '../src/i18n/bundles.js';
import { locales } from '../src/model/locales.js';
import { withBrowserPage } from './browser.js';

test('the local editing contract preserves revisions, lock state, tool handoff and explicit apply without HTTP calls', async () => {
  const requests: string[] = [];
  const result = await withBrowserPage(async page => {
    page.on('request', request => {
      if (['fetch', 'xhr'].includes(request.resourceType())) requests.push(request.url());
    });
    return page.evaluate(async () => {
      const url = '/src/browser/editing.js';
      const { createPaletteEditing, createGradientEditing, colorTools, EditingError } =
        await import(url) as typeof import('../src/browser/editing.js');
      const dbUrl = '/src/browser/database.js';
      const repoUrl = '/src/browser/repository.js';
      const { openWorkspaceDatabase } = await import(dbUrl) as typeof import('../src/browser/database.js');
      const { workspaceRepository } = await import(repoUrl) as typeof import('../src/browser/repository.js');
      const database = await openWorkspaceDatabase('consumer-editing');
      const initial = { id: 'initial', name: 'Café', kind: 'palette', revision: 1, updatedAt: 0, schemaVersion: 1,
        palette: colorTools.newPalette({ seed: 5 }) } as const;
      const api = createPaletteEditing(workspaceRepository(database), initial, { now: () => 2, newId: () => 'copy' });
      const code = (action: () => unknown) => {
        try { action(); return null; }
        catch (error) { return error instanceof EditingError ? error.messageId : null; }
      };
      try {
        const v1 = api.snapshot();
        const locked = api.edit({ type: 'set-lock', id: 'swatch-1', locked: true }, v1.version);
        const stale = code(() => api.edit({ type: 'set-lock', id: 'swatch-2', locked: true }, v1.version));
        const refused = code(() => api.propose({ type: 'apply-suggestion', changes: [
          { id: 'swatch-1', color: colorTools.inspect('#123').color },
        ] }, locked.version));
        const planned = api.propose({ type: 'generate', options: { seed: 500, temperature: 'warm' } }, locked.version);
        const unchangedBeforeApply = api.snapshot();
        const generated = api.apply(planned);
        const consumed = code(() => api.apply(planned));
        const reverted = api.edit({ type: 'undo' }, generated.version);
        const assigned = api.edit({ type: 'assign-role', role: 'primary', id: 'swatch-1' }, reverted.version);
        const moved = api.edit({ type: 'move', id: 'swatch-1', index: 4 }, assigned.version);
        const preview = api.preview('landing', { theme: 'light', viewport: 'mobile' });
        const contrast = api.contrast({ foregroundId: 'swatch-1', backgroundId: 'swatch-2' });
        const saved = await api.save();
        const gradient = createGradientEditing({ id: 'g1', name: 'Gradient', kind: 'gradient', schemaVersion: 1,
          revision: 1, updatedAt: 1, type: 'linear', interpolation: 'srgb', stops: [
            { id: 'start', position: 0, color: colorTools.inspect('#f00').color },
            { id: 'end', position: 1, color: colorTools.inspect('#00f').color },
          ] });
        const gradientV1 = gradient.snapshot();
        gradient.edit({ type: 'reverse' }, gradientV1.version);
        const steps = gradient.sample(2).map(value => colorTools.inspect(value.color).hex.hex);
        const staleGradient = code(() => gradient.edit({ type: 'reverse' }, gradientV1.version));
        const scale = colorTools.tailwind.generate({ name: 'recipe', base: initial.palette.swatches[0]!.color, anchor: 500 });
        const css = colorTools.tailwind.export(scale, { version: 4, space: 'oklch' });
        return { stale, refused, consumed, steps, staleGradient, saved: saved.name, contrast: contrast.ratio > 1,
          planDiverged: JSON.stringify(locked.document.palette) !== JSON.stringify(planned.preview),
          roleFollowed: preview.roles.primary.components.join() === moved.document.palette.swatches[4]!.color.components.join(),
          previewIsPure: unchangedBeforeApply.version.revision === locked.version.revision,
          undoRestored: JSON.stringify(reverted.document.palette) === JSON.stringify(locked.document.palette),
          lockSurvived: generated.document.palette.swatches[0]!.locked &&
            JSON.stringify(generated.document.palette.swatches[0]) === JSON.stringify(locked.document.palette.swatches[0]),
          tailwind: css.version === 4 && css.css.includes('--color-recipe-500'),
        };
      } finally { database.close(); }
    });
  });
  assert.deepEqual(requests, []);
  assert.deepEqual(result, {
    stale: 'editing.error.stale', refused: 'editing.error.locked', consumed: 'editing.error.invalid',
    steps: ['#0000FF', '#FF0000'], staleGradient: 'editing.error.stale', saved: 'Café', contrast: true,
    planDiverged: true, roleFollowed: true, previewIsPure: true, undoRestored: true, lockSurvived: true, tailwind: true,
  });
  assert.equal(new Set(locales.map(locale => formatMessage(locale, 'editing.error.locked'))).size, 5);
});
