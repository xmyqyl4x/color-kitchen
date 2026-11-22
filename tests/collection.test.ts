import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { webHttp } from '../src/web/http.js';

const web = webHttp({ async withClient() { throw new Error('Collection is browser local.'); } });

test('collection saves, tags, duplicates, restores deletion, previews backups and reopens share links', async () => {
  await withHttp(web, origin => withBrowserPage(async page => {
    await page.goto(origin + '/en/palette-studio');
    const swatch = page.locator('[data-control="swatch-1:value"]');
    await swatch.fill('#12345680');
    await swatch.blur();
    await page.locator('#studio-save').click();
    await page.getByText('Saved on this device.').waitFor();
    await page.locator('[data-focus-key=collection]').click();
    const cards = page.locator('.collection-card');
    await cards.first().waitFor();
    await cards.first().getByRole('textbox').fill('Nature, Bleu');
    await cards.first().getByRole('textbox').blur();
    const search = page.locator('#collection-search');
    await search.fill('bleu');
    await cards.first().waitFor();
    await page.reload();
    await cards.first().waitFor();
    assert.equal(await cards.first().getByRole('textbox').inputValue(), 'Nature, Bleu');
    await cards.first().getByRole('button', { name: 'Duplicate' }).click();
    await cards.filter({ hasText: 'Copy' }).waitFor();
    await cards.filter({ hasText: 'Copy' }).getByRole('button', { name: 'Delete' }).click();
    await cards.filter({ hasText: 'Copy' }).waitFor({ state: 'detached' });
    await page.locator('#collection-undo').click();
    await cards.filter({ hasText: 'Copy' }).waitFor();
    await cards.first().getByRole('button', { name: 'Export' }).click();
    const format = page.locator('#export-format');
    await format.selectOption('jpeg');
    await page.locator('#export-download').click();
    assert.match(await page.locator('#export-status').textContent() ?? '', /Choose an opaque backing/);
    await format.selectOption('png');
    const downloaded = page.waitForEvent('download');
    await page.locator('#export-download').click();
    const png = await readFile((await (await downloaded).path())!);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    await format.selectOption('share');
    const body = await page.locator('#export-text').inputValue();
    assert(!body.includes('Forest Study'));
    const link = body.split('\n\n')[1]!;
    await page.goto(link);
    await page.getByRole('dialog', { name: 'Preview shared colors' }).getByRole('button', { name: 'Open in editor' }).click();
    assert.equal(await page.locator('[data-control="s1:value"]').inputValue(), '#12345680');
    await page.goto(origin + '/en/collection');
    const backup = page.waitForEvent('download');
    await page.locator('#collection-backup').click();
    const filePath = (await (await backup).path())!;
    await page.locator('#collection-import').setInputFiles(filePath);
    const dialog = page.getByRole('dialog', { name: 'Preview backup import' });
    await dialog.getByText('Forest Study', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Restore these items' }).click();
    await dialog.getByText('An item already uses this identifier. Your saved work was kept.').waitFor();
    await dialog.getByRole('button', { name: 'Close' }).click();
    assert.equal(await cards.count(), 2);
  }));
});

test('blocked IndexedDB leaves the active draft exportable from collection', async () => {
  await withHttp(web, origin => withBrowserPage(async page => {
    await page.addInitScript(() => {
      IDBFactory.prototype.open = function () { throw new DOMException('Denied fixture', 'SecurityError'); };
    });
    await page.goto(origin + '/en/palette-studio');
    await page.locator('#studio-generate').click();
    await page.locator('[data-focus-key=collection]').click();
    await page.getByText('Device storage is unavailable.', { exact: false }).waitFor();
    await page.locator('#collection-active').click();
    const download = page.waitForEvent('download');
    await page.locator('#export-download').click();
    const text = await readFile((await (await download).path())!, 'utf8');
    assert.equal(JSON.parse(text).documents[0].palette.swatches.length, 5);
  }));
});
