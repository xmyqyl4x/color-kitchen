import type { ColorChannels, ColorSpace, ColorValue } from '../model/color.js';
import { assertColor, wrapHue } from './parse.js';

type Matrix = readonly [ColorChannels, ColorChannels, ColorChannels];
// D65 RGB transforms and transfer functions follow CSS Color Module Level 4.
const srgbToXyz: Matrix = [
  [0.4123907992659595, 0.357584339383878, 0.1804807884018343],
  [0.2126390058715104, 0.715168678767756, 0.0721923153607337],
  [0.0193308187155919, 0.1191947797946259, 0.9505321522496607],
];
const xyzToSrgb: Matrix = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.0415550574071756],
  [0.0556300796969937, -0.2039769588889765, 1.0569715142428786],
];
const p3ToXyz: Matrix = [
  [0.4865709486482162, 0.265667693169093, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.0451133818589026, 1.043944368900976],
];
const xyzToP3: Matrix = [
  [2.493496911941425, -0.931383617919124, -0.402710784450717],
  [-0.829488969561575, 1.762664060318346, 0.023624685841944],
  [0.035845830243784, -0.076172389268041, 0.956884524007687],
];

export function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function linearize(value: number) {
  const magnitude = Math.abs(value);
  return Math.sign(value) * (magnitude <= 0.04045 ? magnitude / 12.92 : ((magnitude + 0.055) / 1.055) ** 2.4);
}

function encode(value: number) {
  const magnitude = Math.abs(value);
  return Math.sign(value) * (magnitude <= 0.0031308 ? 12.92 * magnitude : 1.055 * magnitude ** (1 / 2.4) - 0.055);
}

function mapChannels([x, y, z]: ColorChannels, operation: (value: number) => number): ColorChannels {
  return [operation(x), operation(y), operation(z)];
}

function multiply(matrix: Matrix, [x, y, z]: ColorChannels): ColorChannels {
  const dot = ([a, b, c]: ColorChannels) => a * x + b * y + c * z;
  return [dot(matrix[0]), dot(matrix[1]), dot(matrix[2])];
}

function oklchToLinearSrgb([lightness, chroma, hue]: ColorChannels): ColorChannels {
  const radians = hue * Math.PI / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return multiply([
    [4.0767416621, -3.3077115913, 0.2309699292],
    [-1.2684380046, 2.6097574011, -0.3413193965],
    [-0.0041960863, -0.7034186147, 1.707614701],
  ], [l, m, s]);
}

function linearSrgbToOklch(channels: ColorChannels): ColorChannels {
  const lms = mapChannels(multiply([
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
  ], channels), Math.cbrt);
  const [lightness, a, b] = multiply([
    [0.2104542553, 0.793617785, -0.0040720468],
    [1.9779984951, -2.428592205, 0.4505937099],
    [0.0259040371, 0.7827717662, -0.808675766],
  ], lms);
  const chroma = Math.hypot(a, b);
  return [clampUnit(lightness), chroma < 1e-7 ? 0 : chroma,
    chroma < 1e-7 ? 0 : wrapHue(Math.atan2(b, a) * 180 / Math.PI)];
}

export function convertColor(input: ColorValue, target: ColorSpace): { color: ColorValue; gamutMapped: boolean } {
  assertColor(input);
  if (target !== 'srgb' && target !== 'display-p3' && target !== 'oklch') throw new RangeError('Unsupported color space.');
  if (input.space === target) return { color: input, gamutMapped: false };
  const linearSrgb = input.space === 'oklch' ? oklchToLinearSrgb(input.components)
    : input.space === 'srgb' ? mapChannels(input.components, linearize)
    : multiply(xyzToSrgb, multiply(p3ToXyz, mapChannels(input.components, linearize)));
  if (!linearSrgb.every(Number.isFinite)) throw new RangeError('Color conversion exceeded numeric bounds.');
  if (target === 'oklch') {
    return { color: { space: target, components: linearSrgbToOklch(linearSrgb), alpha: input.alpha }, gamutMapped: false };
  }
  const rgb = target === 'display-p3' ? multiply(xyzToP3, multiply(srgbToXyz, linearSrgb)) : linearSrgb;
  const encoded = mapChannels(rgb, encode);
  if (!encoded.every(Number.isFinite)) throw new RangeError('RGB conversion exceeded numeric bounds.');
  return {
    color: { space: target, components: mapChannels(encoded, clampUnit), alpha: input.alpha },
    gamutMapped: encoded.some(channel => channel < -1e-7 || channel > 1 + 1e-7),
  };
}

export function toSrgbFallback(color: ColorValue) {
  return convertColor(color, 'srgb');
}

export function toHex(input: ColorValue) {
  const { color, gamutMapped } = toSrgbFallback(input);
  const rgba = color.alpha === 1 ? color.components : [...color.components, color.alpha];
  const hex = '#' + rgba.map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { hex, gamutMapped };
}

export function toHsl(input: ColorValue) {
  const { color, gamutMapped } = toSrgbFallback(input);
  const [r, g, b] = color.components;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { hue: 0, saturation: 0, lightness, alpha: color.alpha, gamutMapped };
  const segment = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  const saturation = clampUnit(delta / (lightness < 0.5 ? max + min : 2 - max - min));
  return { hue: wrapHue(segment * 60), saturation,
    lightness, alpha: color.alpha, gamutMapped };
}
