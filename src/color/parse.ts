import type { ColorChannels, ColorValue } from '../model/color.js';

const numberPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i;
const hexPattern = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

export function inRange(value: number, min = 0, max = 1) {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function wrapHue(value: number) {
  if (!Number.isFinite(value)) throw new RangeError('Hue must be finite.');
  const remainder = value % 360;
  const wrapped = remainder < 0 ? remainder + 360 : remainder;
  return wrapped === 360 ? 0 : wrapped || 0;
}

function scalar(input: string) {
  const value = Number(input);
  if (!numberPattern.test(input) || !Number.isFinite(value)) throw new RangeError('Invalid CSS color component.');
  return value;
}

function channel(input: string, scale: number, requirePercent = false) {
  if (input.endsWith('%')) return scalar(input.slice(0, -1)) * (scale / 100);
  if (requirePercent) throw new RangeError('Expected a percentage.');
  return scalar(input);
}

function hue(input: string) {
  const match = /^(.*?)(deg|grad|rad|turn)?$/i.exec(input);
  const value = scalar(match?.[1] ?? '');
  switch (match?.[2]) {
    case 'grad': return wrapHue(value * 0.9);
    case 'rad': return wrapHue(value * (180 / Math.PI));
    case 'turn': return wrapHue(value * 360);
    default: return wrapHue(value);
  }
}

function argumentsOf(input: string, legacy: boolean): { values: [string, string, string]; alpha: number } {
  if (input.includes(',')) {
    const parts = input.split(',').map(part => part.trim());
    if (!legacy || (parts.length !== 3 && parts.length !== 4)) throw new RangeError('Invalid comma-separated color.');
    return { values: [parts[0]!, parts[1]!, parts[2]!], alpha: parts[3] === undefined ? 1 : channel(parts[3], 1) };
  }
  const [values, alpha, ...rest] = input.split('/');
  const parts = values?.trim().split(/\s+/) ?? [];
  if (parts.length !== 3 || rest.length) throw new RangeError('A color requires three components.');
  return { values: [parts[0]!, parts[1]!, parts[2]!], alpha: alpha === undefined ? 1 : channel(alpha.trim(), 1) };
}

export function assertColor(value: unknown): asserts value is ColorValue {
  if (typeof value !== 'object' || value === null) throw new RangeError('Invalid color value.');
  const { space, components, alpha } = value as ColorValue;
  if (!Array.isArray(components) || components.length !== 3 ||
      ![components[0], components[1], components[2], alpha].every(component => Number.isFinite(component)) ||
      !inRange(alpha)) {
    throw new RangeError('A color requires finite coordinates and alpha in [0, 1].');
  }
  const [x, y, z] = components;
  if (space === 'oklch' && inRange(x) && y >= 0 && z >= 0 && z < 360) return;
  if ((space === 'srgb' || space === 'display-p3') && components.every(component => inRange(component))) return;
  throw new RangeError('Color components are outside their supported range.');
}

function hslToSrgb(h: number, s: number, l: number): ColorChannels {
  if (!inRange(s) || !inRange(l)) throw new RangeError('HSL saturation and lightness must be in range.');
  const sector = h / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(sector % 2 - 1));
  const m = l - c / 2;
  const sectors: readonly ColorChannels[] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const [r, g, b] = sectors[Math.floor(sector)]!;
  return [r + m, g + m, b + m];
}

export function parseColor(input: string): ColorValue {
  const normalized = input.trim().toLowerCase();
  const hex = hexPattern.exec(normalized)?.[1];
  if (hex) {
    const expanded = hex.length <= 4 ? [...hex].map(character => character.repeat(2)).join('') : hex;
    const component = (offset: number) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return { space: 'srgb', components: [component(0), component(2), component(4)], alpha: hex.length % 4 === 0 ? component(6) : 1 };
  }

  const functional = /^(rgb|rgba|hsl|hsla|oklch|color)\(([^()]*)\)$/.exec(normalized);
  if (!functional) throw new RangeError('Enter HEX, RGB, HSL, OKLCH or a supported color() value.');
  const name = functional[1]!;
  const body = functional[2]!;
  const space = name === 'color' ? /^(srgb|display-p3)\s+/.exec(body.trim()) : null;
  if (name === 'color' && !space) throw new RangeError('Only sRGB and Display P3 color() values are supported.');
  const rgb = name.startsWith('rgb');
  const hsl = name.startsWith('hsl');
  const argumentsText = space ? body.trim().slice(space[0].length) : body;
  const { values, alpha } = argumentsOf(argumentsText, rgb || hsl);
  const [x, y, z] = values;
  let color: ColorValue;
  if (rgb) {
    color = { space: 'srgb', components: [channel(x, 255) / 255, channel(y, 255) / 255, channel(z, 255) / 255], alpha };
  } else if (hsl) {
    color = { space: 'srgb', components: hslToSrgb(hue(x), channel(y, 1, true), channel(z, 1, true)), alpha };
  } else if (name === 'oklch') {
    color = { space: 'oklch', components: [channel(x, 1), channel(y, 0.4), hue(z)], alpha };
  } else {
    color = { space: space![1] === 'display-p3' ? 'display-p3' : 'srgb', components: [channel(x, 1), channel(y, 1), channel(z, 1)], alpha };
  }
  assertColor(color);
  return color;
}
