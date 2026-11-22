import { assertColor } from '../color/parse.js';
import type { ColorValue, Palette } from '../model/color.js';
import { checkPalette } from '../palette/document.js';
import { backupBase64, BackupError } from './backup.js';

const prefix = '#palette=';
export const maxPaletteFragmentBytes = 4096;
type ShareData = Readonly<{ v: 1; swatches: readonly ColorValue[]; roles: Readonly<Record<string, number>> }>;

function sharePalette(data: ShareData): Palette {
  if (!data || data.v !== 1 || !Array.isArray(data.swatches) || typeof data.roles !== 'object' ||
      data.roles === null || Array.isArray(data.roles) ||
      Object.keys(data).some(key => !['v', 'swatches', 'roles'].includes(key))) throw new RangeError('Invalid share data.');
  const swatches = data.swatches.map((color, index) => {
    assertColor(color);
    if (Object.keys(color).some(key => !['space', 'components', 'alpha'].includes(key))) {
      throw new RangeError('Unexpected share color fields.');
    }
    return { id: 's' + (index + 1), color, locked: false };
  });
  const roles = Object.fromEntries(Object.entries(data.roles).map(([role, index]) => {
    if (!Number.isInteger(index) || index < 0 || index >= swatches.length) throw new RangeError('Invalid shared role.');
    return [role, swatches[index]!.id];
  }));
  const palette = { swatches, roles };
  checkPalette(palette);
  return palette;
}

export function preparePaletteShare(palette: Palette) {
  checkPalette(palette);
  const data: ShareData = {
    v: 1,
    swatches: palette.swatches.map(({ color: { space, components, alpha } }) => ({ space, components: [...components], alpha })),
    roles: Object.fromEntries(Object.entries(palette.roles)
      .map(([role, id]) => [role, palette.swatches.findIndex(swatch => swatch.id === id)])),
  };
  const text = JSON.stringify(data);
  const base64 = backupBase64(new TextEncoder().encode(text)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const fragment = prefix + base64;
  return { data, text, fragment: fragment.length <= maxPaletteFragmentBytes ? fragment : null };
}

export function readPaletteShare(fragment: string) {
  if (fragment.length > maxPaletteFragmentBytes) throw new BackupError('too-large', 'The palette fragment exceeds 4 KiB.');
  if (!fragment.startsWith(prefix) || !/^[A-Za-z0-9_-]+$/.test(fragment.slice(prefix.length))) {
    throw new BackupError('invalid', 'Invalid palette fragment.');
  }
  try {
    const binary = atob(fragment.slice(prefix.length).replaceAll('-', '+').replaceAll('_', '/'));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    const data = JSON.parse(text);
    if (data?.v !== 1) throw new BackupError('unsupported-version', 'Unsupported palette share version.');
    return sharePalette(data);
  } catch (cause) {
    if (cause instanceof BackupError) throw cause;
    throw new BackupError('invalid', 'Invalid palette fragment.', { cause });
  }
}
