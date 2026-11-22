import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPaletteShare, maxPaletteFragmentBytes } from '../src/browser/share.js';
import { parseColor } from '../src/color/parse.js';
import { captureEligibility, collectChromeSwatches, prepareChromeHandoff } from '../src/extension/capture.js';
import { webHttp } from '../src/web/http.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';

test('Chrome capture requires the current tab gesture and permits normal HTTP pages only', () => {
  const context = { active: true, permission: 'granted' as const, userGesture: true,
    tabId: 7, invocationTabId: 7, url: 'https://example.test/private?secret=fixture' };
  assert.equal(captureEligibility(context), 'allowed');
  assert.equal(captureEligibility({ ...context, userGesture: false }), 'gesture-required');
  assert.equal(captureEligibility({ ...context, invocationTabId: 8 }), 'gesture-required');
  assert.equal(captureEligibility({ ...context, active: false }), 'gesture-required');
  assert.equal(captureEligibility({ ...context, permission: 'denied' }), 'permission-denied');
  for (const url of ['chrome://settings/', 'file:///C:/private.txt', 'data:text/plain,page',
    'https://chromewebstore.google.com/detail/fixture', 'https://chromewebstore.google.com./detail/fixture',
    'https://chrome.google.com/webstore/category/extensions']) {
    assert.equal(captureEligibility({ ...context, url }), 'restricted-page', url);
  }
});

test('capture deduplicates exact sRGB coordinates and reports wider-gamut conversion', () => {
  const values = collectChromeSwatches(['#AABBCC80', '#aabbcc80', '#aabbcc', 'color(display-p3 1 0 0)', 'invalid']);
  assert.equal(values.status, 'ready');
  if (values.status !== 'ready') assert.fail();
  assert.equal(values.swatches.length, 3);
  assert.deepEqual(values.swatches[0], { color: parseColor('#aabbcc80'), sourceSpace: 'srgb', gamutMapped: false });
  assert.deepEqual(values.swatches[1]?.color, parseColor('#aabbcc'));
  assert.equal(values.swatches[2]?.color.space, 'srgb');
  assert.equal(values.swatches[2]?.sourceSpace, 'display-p3');
  assert.equal(values.swatches[2]?.gamutMapped, true);
  assert.deepEqual(collectChromeSwatches(Array(257).fill('#fff')), { status: 'too-large' });
});

test('handoff requires confirmation, a canonical Studio destination and a bounded selection', () => {
  const approved = 'https://colors.example.test';
  const colors = [parseColor('#FAAD0080'), parseColor('#147')];
  const target = approved + '/fr/palette-studio';
  assert.deepEqual(prepareChromeHandoff({ approvedOrigin: approved, destination: target, confirmed: false, swatches: colors }),
    { status: 'confirmation-required' });
  for (const destination of ['https://example.test/fr/palette-studio', approved + '/ja/palette-studio',
    target + '?source=page', target + '#old', approved + '/fr/highlight']) {
    assert.deepEqual(prepareChromeHandoff({ approvedOrigin: approved, destination, confirmed: true, swatches: colors }),
      { status: 'invalid-destination' });
  }
  for (const swatches of [colors.slice(0, 1), Array(13).fill(colors[0])]) {
    assert.deepEqual(prepareChromeHandoff({ approvedOrigin: approved, destination: target, confirmed: true, swatches }),
      { status: 'invalid-selection' });
  }
  const transfer = prepareChromeHandoff({ approvedOrigin: approved, destination: target, confirmed: true,
    swatches: [{ ...colors[0]!, pageUrl: 'https://private.example.test/' } as typeof colors[number], colors[1]!] });
  assert.equal(transfer.status, 'ready');
  if (transfer.status !== 'ready') assert.fail();
  const url = new URL(transfer.url);
  assert(url.hash.length <= maxPaletteFragmentBytes);
  assert.deepEqual(readPaletteShare(url.hash).swatches.map(swatch => swatch.color), colors);
  const decoded = Buffer.from(url.hash.slice('#palette='.length), 'base64url').toString('utf8');
  assert(!decoded.includes('private.example'));
  assert.deepEqual(Object.keys(JSON.parse(decoded)).sort(), ['roles', 'swatches', 'v']);
});

test('a generated Chrome handoff opens the existing Palette Studio preview and sends no source metadata', async () => {
  const site = webHttp({ async withClient() { throw new Error('Palette Studio uses device-local storage.'); } });
  await withHttp(site, origin => withBrowserPage(async page => {
    const colors = [parseColor('#FAAD0080'), parseColor('#147')];
    const transfer = prepareChromeHandoff({ approvedOrigin: origin, destination: origin + '/en/palette-studio',
      confirmed: true, swatches: colors });
    assert.equal(transfer.status, 'ready');
    if (transfer.status !== 'ready') assert.fail();
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(transfer.url);
    const preview = JSON.parse(await page.locator('dialog textarea').inputValue());
    assert.deepEqual(preview.swatches, colors);
    assert(requests.every(request => request.startsWith(origin + '/') && !request.includes('#palette=')));
    await page.locator('dialog button').nth(1).click();
    await page.locator('dialog[open]').waitFor({ state: 'hidden' });
    const opened = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ck-active-palette') ?? 'null'));
    assert.deepEqual(opened.palette.swatches.map((swatch: { color: unknown }) => swatch.color), colors);
  }));
});
