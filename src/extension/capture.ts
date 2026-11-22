import { preparePaletteShare } from '../browser/share.js';
import { toSrgbFallback } from '../color/convert.js';
import { assertColor, parseColor } from '../color/parse.js';
import type { ColorSpace, ColorValue } from '../model/color.js';
import { isLocale } from '../model/locales.js';
import { minSwatches } from '../palette/generate.js';
import { extensionState, extensionSwatchLimit } from './state.js';

type CaptureContext = {
  tabId: number; invocationTabId: number; active: boolean; userGesture: boolean;
  permission: 'granted' | 'denied'; url?: string;
};

export function captureEligibility(context: CaptureContext) {
  if (context.userGesture !== true || context.active !== true || !Number.isInteger(context.tabId) || context.tabId < 0 ||
      context.tabId !== context.invocationTabId) return 'gesture-required';
  if (context.permission !== 'granted') return 'permission-denied';
  try {
    const page = new URL(context.url ?? '');
    const hostname = page.hostname.replace(/\.$/, '');
    if ((page.protocol !== 'https:' && page.protocol !== 'http:') || page.username || page.password ||
        hostname === 'chromewebstore.google.com' ||
        (hostname === 'chrome.google.com' && /^\/webstore(?:\/|$)/i.test(page.pathname))) return 'restricted-page';
    return 'allowed';
  } catch { return 'restricted-page'; }
}

type CapturedSwatch = { color: ColorValue; sourceSpace: ColorSpace; gamutMapped: boolean };
export function collectChromeSwatches(samples: readonly unknown[]) {
  if (samples.length > 256) return { status: 'too-large' } as const;
  const swatches: CapturedSwatch[] = [];
  const seen = new Set<string>();
  for (const value of samples) {
    try {
      const source = typeof value === 'string' ? parseColor(value) : value;
      assertColor(source);
      const { color, gamutMapped } = toSrgbFallback(source);
      const [r, g, b] = color.components;
      const key = JSON.stringify([r, g, b, color.alpha]);
      if (seen.has(key)) continue;
      seen.add(key);
      swatches.push({ color: { space: 'srgb', components: [r, g, b], alpha: color.alpha }, sourceSpace: source.space, gamutMapped });
    } catch { /* Styles can contain values that are not colors. */ }
  }
  return swatches.length ? { status: 'ready', swatches } as const : { status: 'empty' } as const;
}

function paletteStudioDestination(destination: string, approvedOrigin: string) {
  try {
    const approved = new URL(approvedOrigin);
    const target = new URL(destination);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(approved.hostname);
    if (!(approved.protocol === 'https:' || (approved.protocol === 'http:' && loopback)) ||
        approved.href !== approved.origin + '/' || target.origin !== approved.origin ||
        target.username || target.password || target.search || target.hash) return null;
    const route = /^\/([^/]+)\/palette-studio$/.exec(target.pathname);
    return route && isLocale(route[1]) ? target : null;
  } catch { return null; }
}

export function prepareChromeHandoff(input: { approvedOrigin: string; destination: string; confirmed: boolean;
  swatches: readonly ColorValue[] }) {
  if (input.confirmed !== true) return { status: 'confirmation-required' } as const;
  const target = paletteStudioDestination(input.destination, input.approvedOrigin);
  if (!target) return { status: 'invalid-destination' } as const;
  if (!Array.isArray(input.swatches) || input.swatches.length < minSwatches || input.swatches.length > extensionSwatchLimit) {
    return { status: 'invalid-selection' } as const;
  }
  try {
    const { swatches } = extensionState({ version: 2, swatches: input.swatches });
    const palette = { swatches: swatches.map((color, index) => ({ id: 's' + (index + 1), color, locked: false })), roles: {} };
    const { fragment } = preparePaletteShare(palette);
    if (!fragment) return { status: 'too-large' } as const;
    target.hash = fragment;
    return { status: 'ready', url: target.href } as const;
  } catch { return { status: 'invalid-selection' } as const; }
}
