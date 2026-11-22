import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withBrowserPage } from './browser.js';

test('real PNG, JPEG and WebP jobs decode locally and keep source coordinates after resize', async () => {
  await withBrowserPage(async page => {
    const egress: string[] = [];
    page.on('request', request => { if (request.method() !== 'GET' || !request.url().startsWith(new URL(page.url()).origin + '/')) egress.push(request.url()); });
    const outcome = await page.evaluate(async () => {
      const jobsPath = '/src/media/jobs.js', colorPath = '/src/color/convert.js';
      const { startMediaJob } = await import(jobsPath) as typeof import('../src/media/jobs.js');
      const { toHex } = await import(colorPath) as typeof import('../src/color/convert.js');
      const canvas = new OffscreenCanvas(320, 160);
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ff0000'; context.fillRect(0, 0, 160, 160);
      context.fillStyle = '#0000ff'; context.fillRect(160, 0, 160, 160);
      const results = [];
      for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
        const source = await canvas.convertToBlob({ type, quality: 0.98 });
        if (source.type !== type) throw new Error('Missing test encoder.');
        const result = await startMediaJob({ kind: 'palette', source, options: { count: 2 } }).result;
        results.push({ source: result.source, colors: result.colors.length });
      }
      const source = await canvas.convertToBlob();
      const preview = await startMediaJob({ kind: 'image-preview', source, maxSide: 32 }).result;
      const picked = await startMediaJob({ kind: 'sample', source, point: { x: 290, y: 80 } }).result;
      return { results, width: preview.preview.width, sourceWidth: preview.source.width, picked: toHex(picked.color).hex };
    });
    assert.deepEqual(outcome, {
      results: Array.from({ length: 3 }, () => ({ source: { width: 320, height: 160 }, colors: 2 })),
      width: 32, sourceWidth: 320, picked: '#0000FF',
    });
    assert.deepEqual(egress, []);
  });
});

test('a superseded worker is cancelled and corrupt or oversized input leaves the next job usable', async () => {
  const result = await withBrowserPage(page => page.evaluate(async () => {
    const jobsPath = '/src/media/jobs.js';
    const { startMediaJob, latestMediaJob } = await import(jobsPath) as typeof import('../src/media/jobs.js');
    const canvas = new OffscreenCanvas(60, 40);
    canvas.getContext('2d')!.fillRect(0, 0, 60, 40);
    const source = await canvas.convertToBlob();
    const lane = latestMediaJob();
    const first = lane.start({ kind: 'palette', source, options: { count: 2 } });
    const firstFailure = first.result.catch(error => error.code);
    const next = await lane.start({ kind: 'sample', source, point: { x: 59, y: 39 } }).result;
    const header = new Uint8Array(24);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x89504e47); view.setUint32(4, 0x0d0a1a0a);
    view.setUint32(8, 13); view.setUint32(12, 0x49484452);
    view.setUint32(16, 50_000_000); view.setUint32(20, 2);
    const oversized = await startMediaJob({ kind: 'palette', source: new Blob([header]), options: { count: 2 } })
      .result.catch(error => error.code);
    const corrupt = await startMediaJob({ kind: 'palette', source: new Blob(['not an image']), options: { count: 2 } })
      .result.catch(error => error.code);
    return { cancelled: await firstFailure, next: next.source, oversized, corrupt };
  }));
  assert.deepEqual(result, { cancelled: 'cancelled', next: { width: 60, height: 40 }, oversized: 'too-large', corrupt: 'format' });
});

test('design and board renderers export only composition pixels in real PNG and JPEG files', async () => {
  const result = await withBrowserPage(page => page.evaluate(async () => {
    const jobsPath = '/src/media/jobs.js', palettePath = '/src/palette/generate.js', parsePath = '/src/color/parse.js';
    const { startMediaJob } = await import(jobsPath) as typeof import('../src/media/jobs.js');
    const { generatePalette } = await import(palettePath) as typeof import('../src/palette/generate.js');
    const { parseColor } = await import(parsePath) as typeof import('../src/color/parse.js');
    const palette = generatePalette({ seed: 71 });
    const preview = await startMediaJob({ kind: 'design-preview', template: 'shop-card',
      variant: { theme: 'dark', viewport: 'mobile' }, palette }).result;
    const canvas = new OffscreenCanvas(80, 160);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#121212';
    context.fillRect(0, 0, 80, 160);
    const source = await canvas.convertToBlob();
    const board = await startMediaJob({ kind: 'moodboard', format: 'jpeg', input: {
      layout: 'bottom-strip', width: 200, height: 160, padding: 10, spacing: 4, palette,
      background: parseColor('#fff'), images: [{ id: 'image', source, focus: [0, 1] }], caption: 'Local board', legend: true,
    } }).result;
    const output = await createImageBitmap(board.blob);
    const rendered = new OffscreenCanvas(output.width, output.height);
    const read = rendered.getContext('2d')!;
    read.drawImage(output, 0, 0);
    output.close();
    return { previewType: preview.blob.type, previewSize: [preview.width, preview.height], boardType: board.blob.type,
      boardSize: [board.width, board.height], background: read.getImageData(2, 2, 1, 1).data[0],
      crop: read.getImageData(30, 30, 1, 1).data[0] };
  }));
  assert.equal(result.previewType, 'image/png');
  assert.deepEqual(result.previewSize, [360, 600]);
  assert.equal(result.boardType, 'image/jpeg');
  assert.deepEqual(result.boardSize, [200, 160]);
  assert(result.background! > 245 && result.crop! < 30);
});
