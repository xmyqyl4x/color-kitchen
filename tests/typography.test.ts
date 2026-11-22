import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseColor } from '../src/color/parse.js';
import { catalogFont, fontCoverage, selectFont, typographyCss } from '../src/typography/fonts.js';
import { styleText } from '../src/typography/styled-text.js';
import { withBrowserPage } from './browser.js';

const sourceSans = catalogFont({ family: 'Source Sans 3', weight: 400, scripts: ['Latn'] });

test('styled text preserves original Unicode and whole unsupported grapheme clusters', () => {
  const input = 'A 9 e\u0301 É ß Ñ 你 👨‍👩‍👧‍👦 🇫🇷';
  const result = styleText(input, 'bold', 'fr');
  assert.equal(result.original, input);
  assert.equal(result.styled, '𝐀 𝟗 e\u0301 É ß Ñ 你 👨‍👩‍👧‍👦 🇫🇷');
  assert.equal(result.transformed, 2);
  assert.equal(result.unsupported, 7);
  assert.equal(styleText('Ah9', 'italic', 'en').styled, '𝐴ℎ9');
  assert.equal(styleText('Aa0', 'monospace', 'pt').styled, '𝙰𝚊𝟶');
});

test('font coverage and CSS respect static weights, axes and fallback graphemes', () => {
  assert.deepEqual(fontCoverage(sourceSans, 'Été São Größe Ñandú', 'fr'),
    { coverage: 'scripts', supported: true, fallback: [] });
  assert.deepEqual(fontCoverage(sourceSans, 'A你👩‍💻ع', 'en').fallback, ['你', '👩‍💻', 'ع']);
  const subset = { ...sourceSans, glyphRanges: [[65, 90]] } as const;
  assert.deepEqual(fontCoverage(subset, 'ABÑ', 'es').fallback, ['Ñ']);
  assert.equal(selectFont(sourceSans, { weight: 700 }).weight, 400);
  assert.throws(() => selectFont(sourceSans, { weight: 400, axes: { wdth: 100 } }), /Unsupported font axis/);
  const variable = { ...sourceSans, axes: { wght: { min: 200, max: 900, default: 400 }, wdth: { min: 75, max: 125, default: 100 } } };
  assert.throws(() => selectFont(variable, { weight: 450, axes: { wdth: 160 } }), /outside its range/);
  const css = typographyCss(variable, { weight: 450, size: 36, lineHeight: 1.3, spacing: 0.1, color: parseColor('#215845') });
  assert.match(css, /font-family: "Source Sans 3", system-ui, sans-serif;/);
  assert.match(css, /font-variation-settings: "wght" 450, "wdth" 100;/);
});

test('the checked-in licensed font renders accented Latin text in Chromium', async () => {
  const bytes = await readFile(new URL('../../catalog/fonts/SourceSans3-Regular.woff2', import.meta.url));
  await withBrowserPage(async page => {
    await page.evaluate(async raw => {
      const font = new FontFace('Pinned source sans', Uint8Array.from(raw));
      await font.load();
      document.fonts.add(font);
      const example = document.createElement('p');
      example.id = 'example';
      example.style.fontFamily = '"Pinned source sans", monospace';
      example.textContent = 'Été São Größe Ñandú';
      document.body.append(example);
    }, [...bytes]);
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#example' });
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    assert(fonts.some(font => font.isCustomFont && font.glyphCount >= 16));
    assert(!fonts.some(font => !font.isCustomFont && font.glyphCount > 0));
  });
});
