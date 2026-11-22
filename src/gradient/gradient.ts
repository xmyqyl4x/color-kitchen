import type { ColorChannels, ColorValue } from '../model/color.js';
import { clampUnit, convertColor } from '../color/convert.js';
import { assertColor, inRange, wrapHue } from '../color/parse.js';
import { colorCss } from '../color/css.js';

export type HuePath = 'shorter' | 'longer' | 'increasing' | 'decreasing';
export type GradientStop = Readonly<{ id: string; position: number; color: ColorValue }>;
export type Gradient = Readonly<{
  type: 'linear' | 'radial' | 'conic';
  angle?: number;
  center?: readonly [number, number];
  interpolation: 'srgb' | 'oklch';
  huePath?: HuePath;
  stops: readonly GradientStop[];
}>;
export type GradientBounds = Readonly<{ width: number; height: number }>;

function validate(gradient: Gradient) {
  const { type, center, angle, interpolation, huePath, stops } = gradient;
  if (!['linear', 'radial', 'conic'].includes(type) ||
      (interpolation !== 'srgb' && interpolation !== 'oklch') ||
      (huePath !== undefined && !['shorter', 'longer', 'increasing', 'decreasing'].includes(huePath)) ||
      (angle !== undefined && !Number.isFinite(angle)) ||
      (center !== undefined && (center.length !== 2 || !center.every(value => inRange(value)))) ||
      stops.length < 2 || stops.length > 12) throw new RangeError('Invalid gradient settings.');
  const ids = new Set<string>();
  let previous = 0;
  for (const { id, position, color } of stops) {
    if (!id || ids.has(id) || !inRange(position, previous, 1)) throw new RangeError('Stops need unique IDs and ordered positions.');
    assertColor(color);
    ids.add(id);
    previous = position;
  }
}

function converted(gradient: Gradient) {
  return gradient.stops.map(stop => ({ ...stop, color: convertColor(stop.color, gradient.interpolation).color }));
}

function interpolateHue(a: number, b: number, t: number, path: HuePath) {
  const delta = b - a;
  if (path === 'shorter') {
    if (delta > 180) a += 360;
    if (delta < -180) b += 360;
  } else if (path === 'longer') {
    if (delta >= 0 && delta < 180) a += 360;
    if (delta < 0 && delta > -180) b += 360;
  } else if (path === 'increasing' && b < a) b += 360;
  else if (path === 'decreasing' && a < b) a += 360;
  return wrapHue(a + (b - a) * t);
}

function mix(left: ColorValue, right: ColorValue, t: number, huePath: HuePath): ColorValue {
  const a = left.alpha * (1 - t);
  const b = right.alpha * t;
  const alpha = clampUnit(a + b);
  const channels = (index: 0 | 1 | 2) =>
    alpha === 0 ? 0 : (left.components[index] * a + right.components[index] * b) / (a + b);
  let components: ColorChannels;
  if (left.space === 'oklch') {
    const hueA = left.components[1] <= 1e-7 ? right.components[2] : left.components[2];
    const hueB = right.components[1] <= 1e-7 ? hueA : right.components[2];
    components = [clampUnit(channels(0)), channels(1), interpolateHue(hueA, hueB, t, huePath)];
  } else {
    components = [clampUnit(channels(0)), clampUnit(channels(1)), clampUnit(channels(2))];
  }
  return { space: left.space, components, alpha };
}

export function prepareGradient(gradient: Gradient) {
  validate(gradient);
  const stops = converted(gradient);
  const huePath = gradient.huePath ?? 'shorter';
  return (position: number): ColorValue => {
    if (!inRange(position)) throw new RangeError('Gradient positions are in [0, 1].');
    const next = stops.findIndex(stop => stop.position > position);
    if (next === 0) return stops[0]!.color;
    if (next < 0) return stops.at(-1)!.color;
    const left = stops[next - 1]!;
    const right = stops[next]!;
    if (left.position === position) return left.color;
    return mix(left.color, right.color, (position - left.position) / (right.position - left.position), huePath);
  };
}

export function sampleGradient(gradient: Gradient, count: number) {
  if (!Number.isInteger(count) || count < 2 || count > 12) throw new RangeError('Choose two to twelve gradient steps.');
  const sample = prepareGradient(gradient);
  return Array.from({ length: count }, (_, index) => {
    const position = index / (count - 1);
    return { position, color: sample(position) };
  });
}

export function reverseGradient(gradient: Gradient): Gradient {
  validate(gradient);
  const huePath = gradient.huePath === 'increasing' ? 'decreasing' : gradient.huePath === 'decreasing' ? 'increasing' : gradient.huePath;
  return { ...gradient, huePath, stops: [...gradient.stops].reverse().map(stop => ({ ...stop, position: 1 - stop.position })) };
}

function geometry(gradient: Gradient, { width, height }: GradientBounds) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError('Expected a positive gradient viewport.');
  }
  const [cx, cy] = gradient.center ?? [0.5, 0.5];
  const x = width * cx;
  const y = height * cy;
  const radians = wrapHue(gradient.angle ?? (gradient.type === 'linear' ? 180 : 0)) * Math.PI / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const half = (Math.abs(dx) * width + Math.abs(dy) * height) / 2;
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  return { x, y, dx, dy, half, radius };
}

export function gradientPointSampler(gradient: Gradient, bounds: GradientBounds) {
  const sample = prepareGradient(gradient);
  const { x, y, dx, dy, half, radius } = geometry(gradient, bounds);
  return (px: number, py: number) => {
    if (!Number.isFinite(px) || !Number.isFinite(py)) throw new RangeError('A gradient sample point must be finite.');
    if (gradient.type === 'radial') return sample(clampUnit(Math.hypot(px - x, py - y) / radius));
    if (gradient.type === 'conic') {
      const degrees = Math.atan2(px - x, y - py) * 180 / Math.PI;
      return sample(wrapHue(degrees - wrapHue(gradient.angle ?? 0)) / 360);
    }
    return sample(clampUnit(0.5 + ((px - bounds.width / 2) * dx + (py - bounds.height / 2) * dy) / (2 * half)));
  };
}

export function gradientCss(gradient: Gradient) {
  validate(gradient);
  const [x, y] = gradient.center ?? [0.5, 0.5];
  const center = `at ${x * 100}% ${y * 100}%`;
  const angle = wrapHue(gradient.angle ?? (gradient.type === 'linear' ? 180 : 0));
  const shape = gradient.type === 'linear' ? `${angle}deg`
    : gradient.type === 'radial' ? `circle farthest-corner ${center}` : `from ${angle}deg ${center}`;
  const path = gradient.interpolation === 'oklch' ? ` ${gradient.huePath ?? 'shorter'} hue` : '';
  const stops = converted(gradient).map(stop => `${colorCss(stop.color)} ${stop.position * 100}%`);
  return `${gradient.type}-gradient(${shape} in ${gradient.interpolation}${path}, ${stops.join(', ')})`;
}

export function gradientSvg(gradient: Gradient, bounds: GradientBounds) {
  validate(gradient);
  const { x, y, dx, dy, half, radius } = geometry(gradient, bounds);
  const stops = converted(gradient);
  const unequalAlpha = stops.some((stop, index) => {
    if (index === 0) return false;
    const previous = stops[index - 1]!;
    return previous.position !== stop.position && previous.color.alpha !== stop.color.alpha &&
      stop.color.components.some((value, channel) => value !== previous.color.components[channel]);
  });
  if (gradient.type === 'conic' || gradient.interpolation !== 'srgb' || unequalAlpha) {
    return { format: 'raster-required', reason: gradient.type === 'conic' ? 'conic' : 'interpolation' } as const;
  }
  const tag = gradient.type === 'radial' ? 'radialGradient' : 'linearGradient';
  const { width, height } = bounds;
  const parameters = gradient.type === 'radial' ? `cx="${x}" cy="${y}" r="${radius}"`
    : `x1="${width / 2 - dx * half}" y1="${height / 2 - dy * half}" x2="${width / 2 + dx * half}" y2="${height / 2 + dy * half}"`;
  const elements = stops.map(({ position, color }) => {
    const percent = color.components.map(value => `${value * 100}%`).join(', ');
    return `<stop offset="${position}" stop-color="rgb(${percent})" stop-opacity="${color.alpha}"/>`;
  });
  return { format: 'svg', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><defs><${tag} id="gradient" gradientUnits="userSpaceOnUse" color-interpolation="sRGB" ${parameters}>${elements.join('')}</${tag}></defs><rect width="${width}" height="${height}" fill="url(#gradient)"/></svg>` } as const;
}
