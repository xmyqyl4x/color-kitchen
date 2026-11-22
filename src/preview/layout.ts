import type { ColorValue, Palette } from '../model/color.js';
import { checkContrast } from '../color/contrast.js';
import { parseColor } from '../color/parse.js';

export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type PreviewRole = 'background' | 'surface' | 'text' | 'primary' | 'accent' | 'on-primary';
export type Template = 'landing' | 'dashboard' | 'editorial' | 'shop-card';
export type PreviewVariant = Readonly<{ theme: 'light' | 'dark'; viewport: 'desktop' | 'mobile' }>;
type Slot = Readonly<{ id: string; area: readonly [number, number, number, number]; fill: PreviewRole;
  label?: string; ink?: PreviewRole }>;

const templates: Record<Template, readonly Slot[]> = {
  landing: [
    { id: 'hero', area: [0.06, 0.08, 0.88, 0.48], fill: 'surface', label: 'Design with color', ink: 'text' },
    { id: 'action', area: [0.1, 0.43, 0.42, 0.09], fill: 'primary', label: 'Explore palettes', ink: 'on-primary' },
    { id: 'feature', area: [0.06, 0.63, 0.88, 0.26], fill: 'accent' },
  ],
  dashboard: [
    { id: 'header', area: [0, 0, 1, 0.17], fill: 'primary', label: 'Project overview', ink: 'on-primary' },
    { id: 'activity', area: [0.05, 0.22, 0.9, 0.37], fill: 'surface', label: 'Weekly activity', ink: 'text' },
    { id: 'metric', area: [0.05, 0.64, 0.36, 0.25], fill: 'accent' },
    { id: 'report', area: [0.45, 0.64, 0.5, 0.25], fill: 'surface', label: 'Report', ink: 'text' },
  ],
  editorial: [
    { id: 'masthead', area: [0.1, 0.07, 0.8, 0.14], fill: 'background', label: 'Field notes', ink: 'text' },
    { id: 'illustration', area: [0.1, 0.25, 0.8, 0.32], fill: 'accent' },
    { id: 'article', area: [0.1, 0.62, 0.8, 0.29], fill: 'surface', label: 'Colors of early morning', ink: 'text' },
  ],
  'shop-card': [
    { id: 'card', area: [0.16, 0.05, 0.68, 0.9], fill: 'surface' },
    { id: 'image', area: [0.21, 0.11, 0.58, 0.44], fill: 'accent' },
    { id: 'product', area: [0.21, 0.59, 0.58, 0.13], fill: 'surface', label: 'Stoneware mug', ink: 'text' },
    { id: 'action', area: [0.21, 0.76, 0.58, 0.12], fill: 'primary', label: 'Add to cart', ink: 'on-primary' },
  ],
};

const roleDefaults = {
  light: { background: '#F7F8F4', surface: '#FFFFFF', text: '#202722', primary: '#215845', accent: '#E4B363', 'on-primary': '#FFFFFF' },
  dark: { background: '#14211B', surface: '#23382D', text: '#F6F3EA', primary: '#9DBCA9', accent: '#DDB16B', 'on-primary': '#14211B' },
} as const;

export function composePreview(template: Template, variant: PreviewVariant, palette: Palette) {
  if (!Object.hasOwn(templates, template) || !Object.hasOwn(roleDefaults, variant.theme) ||
      (variant.viewport !== 'desktop' && variant.viewport !== 'mobile')) throw new RangeError('Unsupported preview template or variant.');
  const [width, height] = variant.viewport === 'desktop' ? [720, 450] : [360, 600];
  const defaults = roleDefaults[variant.theme];
  const swatches = new Map(palette.swatches.map(swatch => [swatch.id, swatch.color]));
  if (swatches.size !== palette.swatches.length) throw new RangeError('Preview roles need unique swatch IDs.');
  const resolve = (role: PreviewRole): ColorValue => {
    const id = palette.roles[role];
    if (id === undefined) return parseColor(defaults[role]);
    const color = swatches.get(id);
    if (!color) throw new RangeError(`Preview role ${role} refers to an unavailable swatch.`);
    return color;
  };
  const roles = Object.fromEntries(Object.keys(defaults).map(role => [role, resolve(role as PreviewRole)])) as Record<PreviewRole, ColorValue>;
  const defaultBacking = parseColor(defaults.background);
  const background = checkContrast(defaultBacking, roles.background, defaultBacking).background;
  const surface = checkContrast(defaultBacking, roles.surface, background).background;
  const blocks = templates[template].map(slot => {
    const [x, y, w, h] = slot.area;
    const rect = { x: x * width, y: y * height, width: w * width, height: h * height };
    const backing = (template === 'shop-card' && slot.id !== 'card') || (template === 'landing' && slot.id === 'action')
      ? surface : background;
    const fill = slot.fill === 'background' ? background
      : slot.fill === 'surface' ? surface : checkContrast(defaultBacking, roles[slot.fill], backing).background;
    const pair = slot.ink ? checkContrast(roles[slot.ink], fill, backing) : null;
    return { id: slot.id, rect, fill, label: slot.label ?? null, ink: pair?.foreground ?? null, pair };
  });
  return { width, height, background, roles, blocks };
}
