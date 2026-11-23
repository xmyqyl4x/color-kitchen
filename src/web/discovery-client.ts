import { openWorkspaceDatabase } from '../browser/database.js';
import type { CreativeDocument, GradientDocument, PaletteDocument } from '../browser/document.js';
import { createBrowserMedia } from '../browser/media.js';
import { explicitCatalogOpen, firstPartyConsentAdapter } from '../browser/optional-requests.js';
import { workspaceRepository } from '../browser/repository.js';
import { colorCss } from '../color/css.js';
import { toHex } from '../color/convert.js';
import { assertColor, parseColor } from '../color/parse.js';
import { gradientCss, validateGradient, type Gradient } from '../gradient/gradient.js';
import type { ColorValue, Palette } from '../model/color.js';
import { createConsentSession } from '../operations/consent.js';
import { checkPalette } from '../palette/document.js';
import { collectionText } from './collection-text.js';
import { colorInput, colorToken } from './color-controls.js';
import { readActiveDraft, readGradientDraft, storeActivePalette, storeGradientDraft } from './draft.js';
import { discoveryText } from './discovery-text.js';
import { clientLocale, node } from './ui.js';

const locale = clientLocale();
const t = (key: Parameters<typeof discoveryText>[1]) => discoveryText(locale, key);
const c = (key: Parameters<typeof collectionText>[1]) => collectionText(locale, key);
const media = createBrowserMedia();
const consent = createConsentSession(firstPartyConsentAdapter(async () => {}));
const search = document.querySelector<HTMLInputElement>('.discovery-form input[name=q]');
if (search) colorInput(search, value => {
  const query = value.trim();
  if (query.startsWith('#')) return parseColor(query);
  if (/\/(?:colors|gradients)$/.test(location.pathname) && /^(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(query)) {
    return parseColor('#' + query);
  }
  return undefined;
}, false);

function localDocument(name: string, content: { kind: 'palette'; palette: Palette } |
    ({ kind: 'gradient' } & Gradient)): PaletteDocument | GradientDocument {
  return { ...content, name: name.slice(0, 120), schemaVersion: 1, revision: 1, id: crypto.randomUUID(), updatedAt: Date.now() };
}

for (const element of document.querySelectorAll<HTMLElement>('[data-catalog-item]')) {
  const strip = element.querySelector<HTMLElement>('.collection-strip')!;
  const status = element.querySelector<HTMLElement>('[data-catalog-status]')!;
  try {
    const { title, kind, itemId, payload } = JSON.parse(element.dataset.catalogItem!);
    let item: CreativeDocument;
    let color: ColorValue | undefined;
    let background: string | undefined;
    if (kind === 'gradient') {
      const gradient: Gradient = { ...payload, stops: payload.stops.map((stop: Gradient['stops'][number], index: number) =>
        ({ ...stop, id: stop.id ?? 'stop-' + index })) };
      validateGradient(gradient);
      item = localDocument(title, { ...gradient, kind: 'gradient' });
      background = gradientCss(gradient);
      strip.style.backgroundImage = background;
      for (const [index, code] of [...element.querySelectorAll('.gallery-stops code')].entries()) {
        const stop = gradient.stops[index];
        if (stop) code.replaceWith(colorToken(stop.color));
      }
    } else {
      let palette: Palette = payload;
      if (kind === 'color') {
        const value = payload.color as unknown;
        assertColor(value);
        color = value;
        const neutral = parseColor(toHex(value).hex.slice(1, 7) === 'FFFFFF' ? '#000' : '#FFF');
        palette = { swatches: [{ id: 'catalog-color', locked: false, color: value }, { id: 'neutral', locked: false, color: neutral }], roles: {} };
      }
      checkPalette(palette);
      if (!color) {
        for (const [index, code] of [...element.querySelectorAll('[data-palette-code]')].entries()) {
          const swatch = palette.swatches[index];
          if (swatch) code.replaceWith(colorToken(swatch.color));
        }
      }
      item = localDocument(title, { kind: 'palette', palette });
      for (const sampled of color ? [color] : palette.swatches.map(swatch => swatch.color)) {
        const tile = node('span');
        tile.style.backgroundColor = colorCss(sampled);
        strip.append(tile);
      }
    }
    const source = item;
    const copy = background ? 'background-image: ' + background + ';' :
      color ? toHex(color).hex : source.kind === 'palette' ? media.export.paletteText(source.palette, 'hex').text : '';
    for (const button of element.querySelectorAll<HTMLButtonElement>('[data-catalog-action]')) {
      button.disabled = false;
      button.addEventListener('click', async () => {
        try {
          if (button.dataset.catalogAction === 'copy') {
            const result = await media.files.copyText(copy);
            status.textContent = c(result.copied ? 'copied' : 'select');
            if (!result.copied) {
              const field = node('textarea');
              field.value = result.text;
              field.readOnly = true;
              field.setAttribute('aria-label', c('content'));
              element.querySelector('textarea')?.remove();
              status.after(field);
              field.focus();
              field.select();
            }
            return;
          }
          if (button.dataset.catalogAction === 'save') {
            button.disabled = true;
            const db = await openWorkspaceDatabase();
            try {
              await workspaceRepository(db).saveDocument({ ...source, id: crypto.randomUUID() }, { expectedRevision: null, updatedAt: Date.now() });
              status.textContent = t('saved');
            } finally { db.close(); }
            return;
          }
          if (color) {
            location.href = '/' + locale + '/color-inspector#color=' + encodeURIComponent(colorCss(color));
          } else if (source.kind === 'gradient') {
            if (readGradientDraft() && !confirm(c('confirmOpen'))) return;
            if (!storeGradientDraft(source)) throw new Error('Draft storage is unavailable.');
            location.href = '/' + locale + '/gradient-studio';
          } else if (source.kind === 'palette') {
            const active = readActiveDraft();
            if (active && active.saved?.editRevision !== active.document.revision && !confirm(c('confirmOpen'))) return;
            if (!storeActivePalette(source)) throw new Error('Draft storage is unavailable.');
            if (element.closest('[data-measurement=true]')) {
              const count = async () => {
                await consent.refresh();
                const event = await explicitCatalogOpen(itemId, consent.snapshot);
                await event?.record();
              };
              await Promise.race([count(), new Promise(resolve => setTimeout(resolve, 450))]);
            }
            location.href = '/' + locale + '/palette-studio';
          }
        } catch { status.textContent = c('storage'); }
        finally { button.disabled = false; }
      });
    }
  } catch {
    status.textContent = c('invalid');
    for (const button of element.querySelectorAll('button')) button.disabled = true;
  }
}
