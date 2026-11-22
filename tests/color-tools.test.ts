import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webHttp } from '../src/web/http.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';

const web = webHttp({ async withClient() { throw new Error('Color tools are local.'); } });

test('keyboard Contrast Lab uses the unrounded threshold and applies and undoes a previewed fix', async () => {
  await withHttp(web, origin => withBrowserPage(async page => {
    await page.goto(origin + '/en/contrast');
    const fg = page.locator('#contrast-foreground');
    const bg = page.locator('#contrast-background');
    await fg.fill('#070707');
    await bg.fill('#777777');
    await bg.press('Enter');
    assert.equal(await page.locator('#contrast-ratio').textContent(), '4.50 : 1');
    assert.equal(await page.locator('[data-assessment=normal-aa]').getAttribute('data-passes'), 'false');
    await page.locator('#contrast-fix').press('Enter');
    await page.locator('#suggested-color').waitFor();
    assert.equal(await fg.inputValue(), '#070707');
    await page.locator('#contrast-apply').press('Enter');
    assert.equal(await page.locator('[data-assessment=normal-aa]').getAttribute('data-passes'), 'true');
    await page.locator('#contrast-undo').press('Enter');
    assert.equal(await fg.inputValue(), '#070707');
    await fg.fill('#0008');
    await fg.press('Enter');
    await page.getByText('Enter valid colors and an opaque backing when needed.').waitFor();
    await page.locator('#contrast-backing').fill('#FFF');
    await page.locator('#contrast-backing').press('Enter');
    assert.equal(await page.locator('.color-tile').count(), 3);
  }));
});

test('Color Inspector keeps valid typed input after screen-picker cancellation and describes wide gamut numerically', async () => {
  await withHttp(web, origin => withBrowserPage(async page => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'EyeDropper', { configurable: true, value: class {
        open() { return Promise.reject(new DOMException('Fixture', 'AbortError')); }
      } });
    });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(origin + '/en/color-inspector');
    const field = page.locator('#inspector-value');
    await field.fill('color(display-p3 1 0 0 / .5)');
    await field.press('Enter');
    await page.getByText('Converted to sRGB for this result.').waitFor();
    await page.locator('#inspector-screen').press('Enter');
    await page.getByText('Screen picking stopped. Your color is unchanged.').waitFor();
    assert.equal(await field.inputValue(), 'color(display-p3 1 0 0 / .5)');
    await page.locator('#inspector-space').selectOption('display-p3');
    assert.equal(await page.locator('#channel-3').inputValue(), '0.5');
    await page.locator('#channel-3').fill('1');
    await page.locator('#channel-3').blur();
    assert.equal(await field.inputValue(), 'color(display-p3 1 0 0)');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('link', { name: 'Sample an image' }).click();
    await page.waitForURL('**/en/image-to-palette');
  }));
});
