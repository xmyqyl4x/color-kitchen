import { maxImagePixels } from '../image/pixels.js';
import { MediaJobError } from './protocol.js';

export const maxImageBytes = 20 * 1024 * 1024;
type ImageInfo = Readonly<{ mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number }>;

function dimensions(width: number, height: number) {
  if (!width || !height) throw new MediaJobError('decode', 'The image has invalid dimensions.');
  if (width * height > maxImagePixels) throw new MediaJobError('too-large', 'Image exceeds 40 megapixels.');
  return { width, height };
}

export function inspectImageHeader(bytes: Uint8Array): ImageInfo {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length >= 24 && data.getUint32(0) === 0x89504e47 && data.getUint32(4) === 0x0d0a1a0a) {
    if (tag(12) !== 'IHDR' || data.getUint32(8) !== 13) throw new MediaJobError('decode', 'Invalid PNG header.');
    return { mime: 'image/png', ...dimensions(data.getUint32(16), data.getUint32(20)) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length && bytes[offset++] === 0xff) {
      while (bytes[offset] === 0xff) offset++;
      const kind = bytes[offset++]!;
      if (kind === 0xda || kind === 0xd9 || offset + 2 > bytes.length) break;
      if (kind === 1 || (kind >= 0xd0 && kind <= 0xd7)) continue;
      const length = data.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (kind >= 0xc0 && kind <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(kind) && length >= 8) {
        return { mime: 'image/jpeg', ...dimensions(data.getUint16(offset + 5), data.getUint16(offset + 3)) };
      }
      offset += length;
    }
    throw new MediaJobError('decode', 'Invalid JPEG frame header.');
  }
  if (bytes.length >= 20 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    const end = data.getUint32(4, true) + 8;
    for (let offset = 12; end <= bytes.length && offset + 8 <= end;) {
      const chunk = tag(offset);
      const length = data.getUint32(offset + 4, true);
      const start = offset + 8;
      if (start + length > end) break;
      const uint24 = (at: number) => bytes[at]! + bytes[at + 1]! * 256 + bytes[at + 2]! * 65536;
      if (chunk === 'VP8X' && length >= 10) {
        return { mime: 'image/webp', ...dimensions(uint24(start + 4) + 1, uint24(start + 7) + 1) };
      }
      if (chunk === 'VP8L' && length >= 5 && bytes[start] === 0x2f) {
        const packed = data.getUint32(start + 1, true);
        return { mime: 'image/webp', ...dimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1) };
      }
      if (chunk === 'VP8 ' && length >= 10 && uint24(start + 3) === 0x2a019d) {
        return { mime: 'image/webp', ...dimensions(data.getUint16(start + 6, true) & 0x3fff,
          data.getUint16(start + 8, true) & 0x3fff) };
      }
      offset = start + length + (length % 2);
    }
    throw new MediaJobError('decode', 'Invalid WebP frame header.');
  }
  throw new MediaJobError('format', 'Choose a JPEG, PNG or WebP image.');
}

export async function inspectLocalImage(blob: Blob) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new MediaJobError('decode', 'The image file is empty.');
  if (blob.size > maxImageBytes) throw new MediaJobError('too-large', 'Image exceeds 20 MiB.');
  return inspectImageHeader(new Uint8Array(await blob.arrayBuffer()));
}

export async function decodeLocalImage(blob: Blob, header?: ImageInfo) {
  const info = header ?? await inspectLocalImage(blob);
  let bitmap: ImageBitmap | undefined;
  try {
    const typed = blob.type === info.mime ? blob : blob.slice(0, blob.size, info.mime);
    bitmap = await createImageBitmap(typed, { imageOrientation: 'from-image' });
    dimensions(bitmap.width, bitmap.height);
    return bitmap;
  } catch (cause) {
    bitmap?.close();
    if (cause instanceof MediaJobError) throw cause;
    throw new MediaJobError('decode', 'The browser could not decode this image.', { cause });
  }
}
