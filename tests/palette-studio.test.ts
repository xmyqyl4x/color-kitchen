import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { webHttp } from '../src/web/http.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';

const website = webHttp({ async withClient() { throw new Error('Palette Studio does not need PostgreSQL.'); } });

function draft(page: Page) {
  return page.evaluate(async () => {
    const url = '/src/web/draft.js';
    return (await import(url) as typeof import('../src/web/draft.js')).readActivePalette()!;
  });
}

test('desktop generation is repeat-safe, preserves locks and roles, and only uses Space on the canvas', async () => {
  await withHttp(website, async origin => {
    const otherRequests: string[] = [];
    await withBrowserPage(async page => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (request.method() !== 'GET' || request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
          otherRequests.push(request.url());
        }
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(origin + '/en/palette-studio');
      const firstLock = page.locator('[data-control="swatch-1:lock"]');
      const secondLock = page.locator('[data-control="swatch-2:lock"]');
      await firstLock.focus();
      await page.keyboard.press('Space');
      await secondLock.click();
      assert.equal(await firstLock.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-control="swatch-1:value"]').getAttribute('readonly'), '');
      await page.locator('#palette-role').selectOption('primary');
      await page.locator('#palette-role-color').selectOption('swatch-1');
      const locked = await draft(page);
      await page.locator('#palette-name').fill('Forest study');
      await page.locator('#palette-name').press('End');
      await page.keyboard.press('Space');
      await page.keyboard.type('recipe');
      await page.locator('#palette-name').blur();
      const renamed = await draft(page);
      assert.equal(renamed.name, 'Forest study recipe');
      assert.deepEqual(renamed.palette, locked.palette);

      await page.locator('#palette-canvas').focus();
      await page.keyboard.down('Space');
      await page.keyboard.down('Space');
      await page.keyboard.up('Space');
      const generated = await draft(page);
      assert.equal(generated.revision, renamed.revision + 1);
      assert.notDeepEqual(generated.palette.swatches.slice(2), renamed.palette.swatches.slice(2));
      assert.deepEqual(generated.palette.swatches.slice(0, 2), renamed.palette.swatches.slice(0, 2));
      assert.equal(generated.palette.roles.primary, 'swatch-1');
      await page.locator('#palette-harmony').selectOption('triadic');
      await page.locator('.studio-options summary').click();
      await page.locator('#palette-temperature').selectOption('warm');
      await page.locator('#palette-seed').fill('12345');
      await page.locator('#studio-generate').click();
      const constrained = await draft(page);
      assert.notDeepEqual(constrained.palette, generated.palette);
      assert.deepEqual(constrained.palette.swatches.slice(0, 2), locked.palette.swatches.slice(0, 2));
      assert(constrained.palette.swatches.slice(2).every(({ color }) =>
        color.space === 'oklch' && (color.components[2] >= 315 || color.components[2] < 75)));
      await page.locator('#studio-undo').click();
      assert.deepEqual((await draft(page)).palette, generated.palette);
      await page.locator('#palette-shortcut').uncheck();
      await page.locator('#palette-canvas').focus();
      const beforeDisabled = (await draft(page)).revision;
      await page.keyboard.press('Space');
      assert.equal((await draft(page)).revision, beforeDisabled);
      assert.equal(await page.locator('#palette-canvas').getAttribute('aria-keyshortcuts'), null);
      for (const id of ['swatch-3', 'swatch-4', 'swatch-5']) await page.locator('[data-control="' + id + ':lock"]').click();
      const allLocked = await draft(page);
      await page.locator('#studio-generate').click();
      assert.equal(await page.locator('#studio-status').textContent(), 'Unlock a color to generate new colors.');
      assert.deepEqual(await draft(page), allLocked);
      await page.locator('[data-control="swatch-3:lock"]').click();
      const beforeAdjustment = await draft(page);
      await page.locator('#palette-lightness').press('End');
      await page.locator('#studio-preview').click();
      assert.deepEqual(await draft(page), beforeAdjustment);
      assert(await page.locator('#adjust-preview').isVisible());
      await page.locator('#studio-apply').click();
      const adjusted = await draft(page);
      assert.deepEqual(adjusted.palette.swatches[0], beforeAdjustment.palette.swatches[0]);
      assert.notDeepEqual(adjusted.palette.swatches[2], beforeAdjustment.palette.swatches[2]);
      assert.deepEqual(errors, []);
    });
    assert.deepEqual(otherRequests, []);
  });
});

test('mobile touch users move a locked swatch, save, switch languages and keep their draft', async () => {
  await withHttp(website, async origin => {
    await withBrowserPage(async desktop => {
      const touch = await desktop.context().browser()!.newPage({
        viewport: { width: 320, height: 790 }, hasTouch: true, isMobile: true,
      });
      try {
        await touch.goto(origin + '/es/palette-studio');
        await touch.locator('[data-control="swatch-1:lock"]').tap();
        await touch.locator('[data-control="swatch-1:options"]').tap();
        await touch.locator('[data-control="swatch-1:later"]').tap();
        const afterMove = await draft(touch);
        assert.equal(afterMove.palette.swatches[1]?.id, 'swatch-1');
        assert.equal(afterMove.palette.swatches[1]?.locked, true);
        assert.equal(await touch.locator('[data-swatch-id]').nth(1).getAttribute('data-swatch-id'), 'swatch-1');
        assert(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await touch.locator('#palette-role-color').selectOption('swatch-1');
        await touch.locator('#studio-save').tap();
        await touch.waitForFunction(() => document.getElementById('studio-status')?.textContent === 'Guardada en este dispositivo.');
        await touch.locator('.languages summary').tap();
        await touch.locator('[data-focus-key="language-de"]').tap();
        await touch.waitForURL('**/de/palette-studio');
        await touch.locator('[data-control="swatch-3:value"]').fill('#102030');
        await touch.locator('[data-control="swatch-3:value"]').blur();
        assert.equal((await draft(touch)).palette.roles.background, 'swatch-1');
        await touch.locator('#studio-save').tap();
        await touch.waitForFunction(() => document.getElementById('studio-status')?.textContent === 'Auf diesem Gerät gespeichert.');
        const downloaded = touch.waitForEvent('download');
        await touch.locator('#studio-backup').tap();
        const file = await downloaded;
        const backup = JSON.parse(await readFile((await file.path())!, 'utf8'));
        assert.equal(backup.palette.swatches[1].locked, true);
        assert.equal(backup.palette.roles.background, 'swatch-1');
        assert.equal(backup.name, afterMove.name);
      } finally { await touch.close(); }
    });
  });
});
