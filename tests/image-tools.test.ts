import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { webHttp } from '../src/web/http.js';

const web = webHttp({ async withClient() { throw new Error('Image tools are local.'); } });

async function fixture(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(120, 64);
    const ctx = canvas.getContext('2d')!;
    for (const [index, color] of ['#172D67', '#E0BF52', '#A02C55'].entries()) {
      ctx.fillStyle = color;
      ctx.fillRect(index * 40, 0, 40, 64);
    }
    return [...new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer())];
  });
  return { name: 'private-fixture.png', mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

test('keyboard image crop and point sampling produce an editable palette and keep it after a file error', async () => {
  await withHttp(web, origin => withBrowserPage(async page => {
    const egress: string[] = [];
    await page.goto(origin + '/en/image-to-palette');
    page.on('request', request => {
      if (!request.url().startsWith(origin) || request.method() !== 'GET' || request.url().includes('private-fixture')) egress.push(request.url());
    });
    await page.locator('#image-file').setInputFiles(await fixture(page));
    await page.locator('#image-canvas').waitFor();
    await page.locator('#crop-x').fill('10');
    await page.locator('#crop-width').fill('100');
    await page.locator('#image-count').fill('3');
    await page.locator('#image-extract').press('Enter');
    await page.locator('.image-color').nth(2).waitFor();
    const colors = await page.locator('.image-color code').allTextContents();
    assert.equal(colors.length, 3);
    await page.locator('#point-x').fill('3');
    await page.locator('#image-point').press('Enter');
    await page.locator('.image-color').nth(3).waitFor();
    assert.equal(await page.locator('.image-color code').first().textContent(), '#172D67');
    await page.locator('#image-file').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('broken') });
    await page.getByText('The previous result is still available.', { exact: false }).waitFor();
    assert.deepEqual((await page.locator('.image-color code').allTextContents()).slice(1), colors);
    await page.locator('#image-apply').press('Enter');
    await page.waitForURL('**/en/palette-studio');
    assert.equal(await page.locator('[data-control="image-0:value"]').inputValue(), '#172D67');
    assert.deepEqual(egress, []);
  }));
});

test('moodboard crop exports real pixels, then saves its assets and placement only after explicit choice', async () => {
  await withHttp(web, origin => withBrowserPage(async page => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(origin + '/en/moodboard');
    const egress: string[] = [];
    page.on('request', request => {
      const url = request.url();
      if ((!url.startsWith(origin) && !url.startsWith('blob:' + origin)) || request.method() !== 'GET') egress.push(url);
    });
    const image = await fixture(page);
    await page.locator('#image-file').setInputFiles([image, { ...image, name: 'second.png' }]);
    await page.locator('#board-preview').waitFor();
    await page.locator('#board-layout').selectOption('two-image');
    await page.locator('#crop-x').fill('80');
    await page.locator('#crop-width').fill('20');
    await page.locator('#focus-x').fill('20');
    await page.locator('#board-caption').fill('Local color study');
    await page.locator('#board-render').press('Enter');
    await page.locator('#board-save').click();
    await page.getByText('Choose whether to keep the source images before saving.').waitFor();
    await page.locator('#board-export').click();
    await page.locator('#export-format').selectOption('png');
    const download = page.waitForEvent('download');
    await page.locator('#export-download').click();
    assert.equal((await readFile((await (await download).path())!)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('#board-preserve').check();
    await page.locator('#board-save').click();
    await page.getByText('Board saved on this device.').waitFor();
    await page.locator('[data-focus-key=collection]').click();
    await page.getByRole('button', { name: 'Open in editor' }).click();
    await page.locator('#board-preview').waitFor();
    assert.equal(await page.locator('#board-caption').inputValue(), 'Local color study');
    assert.equal(await page.locator('#crop-width').inputValue(), '20');
    assert.equal(await page.locator('#focus-x').inputValue(), '20');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(egress, []);
  }));
});
