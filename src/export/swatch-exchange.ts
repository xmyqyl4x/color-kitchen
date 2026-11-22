import { checkContrast } from '../color/contrast.js';
import { convertColor, toHex } from '../color/convert.js';
import type { ColorValue, Palette } from '../model/color.js';
import { checkPalette } from '../palette/document.js';
import { opaqueExportBacking } from './rendered.js';
import { paletteText } from './text.js';

export function paletteAse(palette: Palette, backing?: ColorValue) {
  checkPalette(palette);
  opaqueExportBacking('ASE', palette.swatches.some(swatch => swatch.color.alpha < 1), backing);
  const gamutMapped: string[] = [];
  const flattened: string[] = [];
  const entries = palette.swatches.map(({ id, color }) => {
    const mapped = convertColor(color, 'srgb');
    if (mapped.gamutMapped) gamutMapped.push(id);
    const paint = color.alpha === 1 ? mapped.color : checkContrast(backing!, mapped.color, backing!).background;
    if (color.alpha < 1) flattened.push(id);
    return { color: paint, name: toHex(paint).hex };
  });
  // ASE 1.0 header and big-endian RGB color-entry blocks.
  const blockLength = (name: string) => 2 + 2 * (name.length + 1) + 4 + 12 + 2;
  const bytes = new Uint8Array(12 + entries.reduce((length, entry) => length + 6 + blockLength(entry.name), 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x41534546);
  view.setUint16(4, 1);
  view.setUint32(8, entries.length);
  let offset = 12;
  for (const { color, name } of entries) {
    view.setUint16(offset, 1);
    view.setUint32(offset + 2, blockLength(name));
    view.setUint16(offset + 6, name.length + 1);
    offset += 8;
    for (let i = 0; i < name.length; i++, offset += 2) view.setUint16(offset, name.charCodeAt(i));
    offset += 2;
    view.setUint32(offset, 0x52474220);
    offset += 4;
    for (const component of color.components) {
      view.setFloat32(offset, component);
      offset += 4;
    }
    view.setUint16(offset, 2);
    offset += 2;
  }
  return { blob: new Blob([bytes], { type: 'application/octet-stream' }), gamutMapped, flattened,
    companion: paletteText(palette, 'css').text };
}
