import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GuideProviderInput } from '../src/guide/service.js';
import { guideHttp, guidePath } from '../src/http/guide.js';
import { locales } from '../src/model/locales.js';
import { webHttp } from '../src/web/http.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';

test('anonymous Guide keeps local mode offline and carries explicit context across hosted turns in all locales', async () => {
  const calls: GuideProviderInput[] = [];
  const names = { en: 'Try this shade.', fr: 'Essayez cette teinte.', es: 'Prueba este tono.',
    pt: 'Experimente este tom.', de: 'Probieren Sie diesen Farbton.' };
  const host = guideHttp({ now: () => new Date(), timeoutMs: 50, admission: { async reserve() { return { accepted: true }; } },
    provider: { generate(request) {
      calls.push(request);
      return request.prompt === 'timeout' ? new Promise(() => {}) : Promise.resolve({
        message: names[request.locale], colors: ['#0055AA'], roles: [{ name: 'primary', index: 0 }],
        contrasts: [{ foreground: '#000', background: '#FFF', backing: null }],
      });
    } },
  });
  const site = webHttp({ async withClient() { throw new Error('Guide uses its own HTTP dependency.'); } });
  await withHttp(request => new URL(request.url).pathname === guidePath ? host(request) : site(request), origin => withBrowserPage(async page => {
    await page.goto(origin + '/en/palette-studio');
    await page.locator('#palette-name').fill('Private collection title');
    await page.locator('#palette-name').blur();
    const before = await page.evaluate(() => sessionStorage.getItem('ck-active-palette'));
    for (const locale of locales) {
      await page.goto(origin + '/' + locale + '/color-guide');
      assert.equal(await page.locator('#guide-mode').inputValue(), 'local');
      const count = calls.length;
      await page.locator('#guide-submit').click();
      await page.locator('#guide-result .guide-chip').first().waitFor();
      assert.equal(calls.length, count);
      await page.locator('#guide-mode').selectOption('hosted');
      await page.locator('#guide-prompt').fill('Find a color');
      await page.locator('#guide-submit').click();
      await page.locator('[data-turn=assistant]').first().waitFor();
      assert.equal(await page.locator('[data-turn=assistant]').first().textContent(), names[locale]);
      assert.deepEqual(calls.at(-1)?.colors, []);
      await page.locator('#guide-share').check();
      await page.locator('#guide-swatches input').first().check();
      await page.locator('#guide-prompt').fill('A little darker');
      await page.locator('#guide-submit').click();
      await page.locator('[data-turn=assistant]').nth(1).waitFor();
      assert.equal(calls.at(-1)?.history.length, 2);
      assert.equal(calls.at(-1)?.colors.length, 1);
      if (locale === 'en') {
        await page.getByRole('button', { name: 'Preview palette changes' }).click();
        assert.equal(await page.evaluate(() => sessionStorage.getItem('ck-active-palette')), before);
        assert.match(await page.locator('#guide-result ul').textContent() ?? '', /21 : 1/);
        await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
        await page.getByText('Suggestion applied to the active palette.').waitFor();
        const after = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ck-active-palette')!));
        assert.equal(after.palette.roles.primary, 'swatch-1');
        await page.locator('#guide-undo').click();
        await page.getByText('Previous palette restored.').waitFor();
        const recovered = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ck-active-palette')!));
        assert.deepEqual(recovered.palette, JSON.parse(before!).palette);
      }
    }
    assert.equal(calls.length, 10);
    assert.doesNotMatch(JSON.stringify(calls), /Private collection title|swatch-1/);
    await page.goto(origin + '/en/color-guide');
    await page.locator('#guide-mode').selectOption('hosted');
    await page.locator('#guide-prompt').fill('timeout');
    await page.locator('#guide-submit').click();
    await page.getByText('Your prompt is still here.', { exact: false }).waitFor();
    assert.equal(await page.locator('#guide-prompt').inputValue(), 'timeout');
    await page.locator('#guide-mode').selectOption('local');
    await page.locator('#guide-submit').click();
    await page.getByText('Try this palette as a starting point.').waitFor();
    assert.equal(calls.length, 11);
  }));
});
