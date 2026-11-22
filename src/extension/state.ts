import { assertColor, parseColor } from '../color/parse.js';
import type { ColorValue } from '../model/color.js';

export const extensionSwatchLimit = 12;
export type ExtensionState = Readonly<{
  version: 2;
  swatches: readonly ColorValue[];
  captureMode: 'pick' | 'styles';
}>;

export function extensionState(input: unknown): ExtensionState {
  if (input === undefined) return { version: 2, swatches: [], captureMode: 'pick' };
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new RangeError('Invalid extension state.');
  const { version, selectedHex, swatches, captureMode = 'pick' } = input as Record<string, unknown>;
  if ((version !== 1 && version !== 2) || (captureMode !== 'pick' && captureMode !== 'styles')) {
    throw new RangeError('Unsupported extension state.');
  }
  const values = version === 1 ? selectedHex : swatches;
  if (!Array.isArray(values) || values.length > extensionSwatchLimit) throw new RangeError('Invalid extension swatches.');
  return { version: 2, captureMode, swatches: values.map((value: unknown) => {
    let color = value;
    if (version === 1) {
      if (typeof value !== 'string' || !value.startsWith('#')) throw new RangeError('Invalid legacy swatch.');
      color = parseColor(value);
    }
    assertColor(color);
    if (color.space !== 'srgb') throw new RangeError('Extension swatches use sRGB.');
    const [red, green, blue] = color.components;
    return { space: 'srgb', components: [red, green, blue], alpha: color.alpha };
  }) };
}
