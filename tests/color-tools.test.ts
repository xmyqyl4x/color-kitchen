import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webHttp } from '../src/web/http.js';
import { chooseColor, withBrowserPage } from './browser.js';
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
    assert.match(await page.locator('.color-input .color-chip').getAttribute('data-swatch-code') ?? '', /^color\(display-p3/);
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

test('contrast swatch menus paint every option and synchronize keyboard selection, manual entry, and swap', async () => {
  await withHttp(web, origin => withBrowserPage(async page => {
    await page.setViewportSize({ width: 390, height: 840 });
    await page.goto(origin + '/en/palette-studio');
    const color = page.locator('[data-control="swatch-1:value"]');
    await color.fill('#235982');
    await color.blur();
    await page.goto(origin + '/en/contrast');
    const trigger = page.locator('#contrast-fg-swatch-trigger');
    assert.equal(await trigger.locator('.color-chip').getAttribute('data-swatch-code'), '#6F8F7B');
    await trigger.press('ArrowDown');
    assert.equal(await page.locator('#contrast-fg-swatch-trigger + ul [data-swatch-code]').count(), 5);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator(':focus').getAttribute('data-color-option'), 'swatch-1');
    assert.equal(await page.locator(':focus .color-chip > span').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(35, 89, 130)');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#contrast-foreground').inputValue(), '#235982');
    assert.equal(await trigger.locator('.color-chip').getAttribute('data-swatch-code'), '#235982');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'contrast-fg-swatch-trigger');
    await chooseColor(page, 'contrast-bg-swatch', 'swatch-2');
    assert.equal(await page.locator('#contrast-background').inputValue(), '#6F8F7B');
    const sample = page.locator('.color-input:has(#contrast-foreground) .color-chip');
    await page.locator('#contrast-foreground').fill('#0008');
    assert.equal(await sample.getAttribute('data-swatch-code'), '#00000088');
    assert.equal(await trigger.textContent(), 'Manual input');
    assert.equal(await sample.locator('span').evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0.533)');
    await page.locator('#contrast-foreground').fill('invalid');
    assert.equal(await sample.getAttribute('data-swatch-code'), null);
    assert.equal(await page.locator('#contrast-ratio').count(), 0);
    await page.locator('#contrast-foreground').fill('#FFFFFF');
    await page.locator('#contrast-swap').click();
    assert.equal(await sample.getAttribute('data-swatch-code'), '#6F8F7B');
    assert.equal(await trigger.locator('.color-chip').getAttribute('data-swatch-code'), '#6F8F7B');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }));
});

test('other code inputs and export backing show the same swatches', async () => {
  await withHttp(web, origin => withBrowserPage(async page => {
    for (const [path, id, hex] of [['type-playground', 'type-color', '#830540'], ['moodboard', 'board-background', '#146348']] as const) {
      await page.goto(`${origin}/en/${path}`);
      const sample = page.locator('.color-input:has(#' + id + ') .color-chip');
      await sample.waitFor();
      await page.locator('#' + id).fill(hex);
      assert.equal(await sample.getAttribute('data-swatch-code'), hex);
    }
    await page.goto(origin + '/en/gradient-studio');
    const firstColor = page.locator('[data-stop-focus="stop-0:color"]');
    await firstColor.fill('#642880');
    assert.equal(await page.locator('.color-input:has([data-stop-focus="stop-0:color"]) .color-chip').getAttribute('data-swatch-code'), '#642880');
    await page.goto(origin + '/en/color-guide');
    await page.locator('#guide-task').selectOption('contrast');
    await page.locator('#guide-fg').fill('#284688');
    await page.locator('#guide-bg').fill('#FFF');
    assert.equal(await page.locator('.color-input:has(#guide-fg) .color-chip').getAttribute('data-swatch-code'), '#284688');
    await page.locator('#guide-submit').click();
    await page.locator('#guide-result li.color-pair .color-chip').first().waitFor();

    await page.goto(origin + '/en/palette-studio');
    await page.locator('#studio-export').click();
    await page.locator('#export-format').selectOption('jpeg');
    await chooseColor(page, 'export-backing', '#FFFFFF');
    assert.equal(await page.locator('#export-backing-trigger .color-chip').getAttribute('data-swatch-code'), '#FFFFFF');
  }));
});
