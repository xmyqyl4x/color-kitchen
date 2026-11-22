import { downsampleImage, extractImagePalette, ImageSampleError, sampleImagePoint } from '../image/pixels.js';
import { decodeLocalImage } from './decode.js';
import { renderDesign, renderMoodboard } from './render.js';
import { MediaJobError, type MediaReply, type MediaTask, type MediaUpdate } from './protocol.js';

async function run(task: MediaTask): Promise<MediaReply> {
  try {
    scope.postMessage({ progress: 'loading' });
    if (task.kind === 'design-preview' || task.kind === 'moodboard') scope.postMessage({ progress: 'processing' });
    if (task.kind === 'design-preview') return { ok: true, value: await renderDesign(task) };
    if (task.kind === 'moodboard') return { ok: true, value: await renderMoodboard(task) };
    const bitmap = await decodeLocalImage(task.source);
    scope.postMessage({ progress: 'processing' });
    let canvas: OffscreenCanvas | undefined;
    try {
      const source = { width: bitmap.width, height: bitmap.height };
      if (task.kind === 'sample') {
        const { x, y } = task.point;
        if (![x, y].every(Number.isSafeInteger) || x < 0 || y < 0 || x >= source.width || y >= source.height) {
          throw new ImageSampleError('invalid-region', 'Choose a point inside the source image.');
        }
        canvas = new OffscreenCanvas(1, 1);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new MediaJobError('unavailable', 'Pixel reading is unavailable.');
        context.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1);
        const pixel = context.getImageData(0, 0, 1, 1);
        return { ok: true, value: { source, color: sampleImagePoint(pixel, { x: 0, y: 0 }, task.backing) } };
      }
      canvas = new OffscreenCanvas(source.width, source.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new MediaJobError('unavailable', 'Pixel reading is unavailable.');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, source.width, source.height);
      if (task.kind === 'palette') return { ok: true, value: { source, colors: extractImagePalette(pixels, task.options) } };
      return { ok: true, value: { source, preview: downsampleImage(pixels, { maxSide: task.maxSide, region: task.region }) } };
    } finally {
      bitmap.close();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  } catch (error) {
    if (error instanceof ImageSampleError || error instanceof MediaJobError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: 'render', message: 'The local image operation could not complete.' };
  }
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<MediaTask>) => void) | null;
  postMessage: (reply: MediaUpdate) => void;
};
scope.onmessage = event => { void run(event.data).then(reply => scope.postMessage(reply)); };
