import type { ColorValue, Palette } from '../model/color.js';
import type { ExtractionOptions, ImagePoint, ImageRegion, ImageSampleError, PixelBuffer } from '../image/pixels.js';
import type { PreviewVariant, Template } from '../preview/layout.js';
import type { BoardImage, MoodboardInput } from '../preview/moodboard.js';

export type MediaFormat = 'png' | 'jpeg';
export type MediaErrorCode = ImageSampleError['code'] | 'format' | 'decode' | 'cancelled' | 'unavailable' | 'render';
export class MediaJobError extends Error {
  constructor(public readonly code: MediaErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MediaJobError';
  }
}

type BoardSource = Omit<BoardImage, 'width' | 'height'> & { source: Blob };
export type MediaTask =
  | { kind: 'palette'; source: Blob; options: ExtractionOptions }
  | { kind: 'sample'; source: Blob; point: ImagePoint; backing?: ColorValue }
  | { kind: 'image-preview'; source: Blob; region?: ImageRegion; maxSide?: number }
  | { kind: 'design-preview'; template: Template; variant: PreviewVariant; palette: Palette; format?: MediaFormat }
  | { kind: 'moodboard'; input: Omit<MoodboardInput, 'images'> & { images: readonly BoardSource[] }; format?: MediaFormat;
      backing?: ColorValue };

type Dimensions = Readonly<{ width: number; height: number }>;
export type MediaResults = {
  palette: { source: Dimensions; colors: readonly { color: ColorValue; pixels: number }[] };
  sample: { source: Dimensions; color: ColorValue };
  'image-preview': { source: Dimensions; preview: PixelBuffer & { source: ImageRegion } };
  'design-preview': { width: number; height: number; blob: Blob };
  moodboard: { width: number; height: number; blob: Blob };
};
export type MediaReply =
  | { ok: true; value: MediaResults[MediaTask['kind']] }
  | { ok: false; code: MediaErrorCode; message: string };
