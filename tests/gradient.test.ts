import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseColor } from '../src/color/parse.js';
import { toHex, toSrgbFallback } from '../src/color/convert.js';
import { gradientCss, gradientPointSampler, gradientSvg, prepareGradient, reverseGradient, sampleGradient,
  type Gradient } from '../src/gradient/gradient.js';
import { withBrowserPage } from './browser.js';

const make = (values: readonly [number, string][], settings: Partial<Gradient> = {}): Gradient => ({
  type: 'linear', angle: 90, interpolation: 'srgb',
  stops: values.map(([position, css], index) => ({ position, id: String(index), color: parseColor(css) })),
  ...settings,
});

test('gradient steps cover endpoints and use the final declaration on a hard edge', () => {
  const gradient = make([[0, '#000'], [0.5, '#f00'], [0.5, '#00f'], [1, '#fff']]);
  const colors = (input: Gradient) => sampleGradient(input, 3).map(step => toHex(step.color).hex);
  assert.deepEqual(colors(gradient), ['#000000', '#0000FF', '#FFFFFF']);
  assert.deepEqual(colors(reverseGradient(gradient)), ['#FFFFFF', '#FF0000', '#000000']);
  assert.equal(toHex(prepareGradient(gradient)(0.25)).hex, '#800000');
  assert.throws(() => sampleGradient(gradient, 13), RangeError);
  assert.throws(() => prepareGradient(make([[0.7, '#000'], [0.2, '#fff']])), /ordered positions/);
});

test('alpha is premultiplied except hue, and SVG capability is explicit', () => {
  const varied = make([[0, '#f00'], [1, '#0000FF00']]);
  assert.equal(toHex(prepareGradient(varied)(0.5)).hex, '#FF000080');
  const polar = make([[0, 'oklch(.6 .05 350)'], [1, 'oklch(.6 .05 10)']], {
    interpolation: 'oklch', huePath: 'longer',
  });
  assert.equal(prepareGradient(polar)(0.5).components[2], 180);
  assert.equal(prepareGradient({ ...polar, huePath: 'shorter' })(0.5).components[2], 0);
  const bounds = { width: 120, height: 80 };
  assert.deepEqual(gradientSvg(varied, bounds), { format: 'raster-required', reason: 'interpolation' });
  assert.deepEqual(gradientSvg({ ...varied, type: 'conic' }, bounds), { format: 'raster-required', reason: 'conic' });
  const svg = gradientSvg(make([[0, '#f00'], [1, '#fff']], { type: 'radial' }), bounds);
  assert(svg.format === 'svg');
  assert.match(svg.svg, /radialGradient.*stop-opacity="1"/);
});

test('CSS gradient samples match Chromium with alpha and linear, radial and conic geometry', async () => {
  await withBrowserPage(async page => {
    const bounds = { width: 101, height: 101 };
    const at = { x: 50, y: 30 };
    for (const gradient of [
      make([[0, '#f00'], [1, '#0000FF00']]),
      make([[0, '#fff'], [0.4, '#f00'], [1, '#000']], { type: 'radial', center: [0.3, 0.25] }),
      make([[0, '#f00'], [1, '#00f']], { type: 'conic', center: [0.4, 0.5], angle: 40 }),
      make([[0, 'oklch(.62 .05 350)'], [1, 'oklch(.62 .05 10)']], { interpolation: 'oklch', huePath: 'longer' }),
    ]) {
      const css = gradientCss(gradient);
      assert(await page.evaluate(background => {
        document.body.style.cssText = 'margin:0;background:white';
        document.body.innerHTML = '<div style="width:101px;height:101px"></div>';
        const box = document.querySelector('div')!;
        box.style.backgroundImage = background;
        return Boolean(box.style.backgroundImage);
      }, css), css);
      const screenshot = await page.locator('div').screenshot();
      const pixel = await page.evaluate(async ({ bytes, x, y }) => {
        const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return Array.from(context.getImageData(x, y, 1, 1).data);
      }, { bytes: [...screenshot], ...at });
      const result = toSrgbFallback(gradientPointSampler(gradient, bounds)(at.x + 0.5, at.y + 0.5)).color;
      result.components.forEach((channel, index) => {
        const expected = (channel * result.alpha + 1 - result.alpha) * 255;
        assert(Math.abs(pixel[index]! - expected) <= 4, `${css}: ${pixel[index]} differs from ${expected}`);
      });
    }
  });
});
