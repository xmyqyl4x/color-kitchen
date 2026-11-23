import type { CreativeDocument, StoredAsset } from '../browser/document.js';
import { boardTask } from '../browser/board.js';
import { createBrowserMedia } from '../browser/media.js';
import { parseColor } from '../color/parse.js';
import type { PaletteTextFormat } from '../export/text.js';
import type { Locale } from '../model/locales.js';
import { generateColorScale } from '../tailwind/scale.js';
import { collectionText } from './collection-text.js';
import { colorSelect, colorToken } from './color-controls.js';
import { node, press } from './ui.js';

type AssetReader = (id: string) => Promise<StoredAsset | null>;
const media = createBrowserMedia();
const paletteFormats = ['css', 'hex', 'rgb', 'hsl', 'oklch', 'json', 'png', 'jpeg', 'svg', 'pdf', 'ase', 'tailwind3', 'tailwind4', 'share'];
const gradientFormats = ['css', 'json', 'png', 'svg'];
const boardFormats = ['json', 'png', 'jpeg', 'pdf'];
const names: Record<string, string> = {
  css: 'CSS', hex: 'HEX', rgb: 'RGB', hsl: 'HSL', oklch: 'OKLCH', json: 'JSON', png: 'PNG', jpeg: 'JPEG',
  svg: 'SVG', pdf: 'PDF', ase: 'Adobe Swatch Exchange', tailwind3: 'Tailwind v3', tailwind4: 'Tailwind v4',
};
const bounds = { width: 960, height: 220 };

export async function boardSources(board: Extract<CreativeDocument, { kind: 'board' }>, read?: AssetReader) {
  const assets = await Promise.all(board.assetIds.map(id => read?.(id) ?? Promise.resolve(null)));
  return assets.filter((entry): entry is StoredAsset => entry !== null);
}

export function openExportDrawer(locale: Locale, creative: CreativeDocument, readAsset?: AssetReader, format?: string) {
  const t = (key: Parameters<typeof collectionText>[1]) => collectionText(locale, key);
  const dialog = node('dialog', undefined, 'studio export-drawer');
  const heading = node('h2', t('export') + ' · ' + creative.name);
  heading.id = 'export-title';
  dialog.setAttribute('aria-labelledby', heading.id);
  const close = press(t('close'), () => dialog.close());
  const header = node('div', undefined, 'drawer-heading');
  header.append(heading, close);
  const choices = creative.kind === 'palette' ? paletteFormats : creative.kind === 'gradient' ? gradientFormats : boardFormats;
  const select = node('select');
  select.id = 'export-format';
  select.append(...choices.map(value => new Option(value === 'share' ? t('share') : names[value], value)));
  if (format && choices.includes(format)) select.value = format;
  const selectLabel = node('label', t('format'));
  selectLabel.append(select);
  const backing = node('label', t('backing'));
  const backingChoice = node('select');
  backingChoice.id = 'export-backing';
  backingChoice.append(new Option(t('choose'), ''), new Option('#FFFFFF', '#FFFFFF'), new Option('#000000', '#000000'));
  backing.append(backingChoice);
  const assets = node('label', t('assets'));
  const include = node('input');
  include.type = 'checkbox';
  assets.prepend(include);
  const detail = node('p', undefined, 'export-detail');
  const output = node('textarea');
  output.id = 'export-text';
  output.rows = 5;
  output.readOnly = true;
  output.setAttribute('aria-label', t('content'));
  const inspected = node('p');
  inspected.id = 'export-status';
  inspected.setAttribute('role', 'status');
  const actions = node('div', undefined, 'studio-actions');
  const save = press(t('download'), () => run(true), true);
  save.id = 'export-download';
  const copy = press(t('copy'), () => run(false));
  copy.id = 'export-copy';
  actions.append(save, copy);
  const colors = creative.kind === 'gradient' ? creative.stops : creative.palette.swatches;
  const strip = node('div', undefined, 'export-swatches');
  strip.append(...colors.map(({ color }) => colorToken(color)));
  const share = creative.kind === 'palette' ? media.export.paletteShare(creative.palette) : null;
  const shareUrl = share?.fragment ? new URL('/' + locale + '/palette-studio' + share.fragment, location.origin).href : '';
  const transparent = colors.some(swatch => swatch.color.alpha < 1);
  function configure() {
    const value = select.value;
    const limitedGamut = ['png', 'jpeg', 'svg', 'pdf', 'ase', 'hex', 'rgb', 'hsl', 'tailwind3'].includes(value);
    const needsBacking = value === 'ase' || value === 'jpeg';
    backingPicker.host.hidden = !needsBacking;
    assets.hidden = creative.kind !== 'board' || value !== 'json';
    detail.textContent = value === 'share' ? t('privacy') + (shareUrl ? '' : ' ' + t('large'))
      : needsBacking ? t('alpha') + ' ' + t('gamut') : limitedGamut ? t('gamut') : '';
    save.hidden = value === 'share';
    copy.disabled = value === 'share' && !shareUrl;
    output.hidden = value !== 'share';
    output.value = value === 'share' ? (share?.text ?? '') + (shareUrl ? '\n\n' + shareUrl : '') : '';
    inspected.textContent = '';
  }

  async function run(download: boolean) {
    const value = select.value;
    const opaque = backingChoice.value ? parseColor(backingChoice.value) : undefined;
    if ((value === 'ase' || value === 'jpeg') && transparent && creative.kind === 'palette' && !opaque) {
      inspected.textContent = t('backingRequired');
      backingPicker.focus();
      return;
    }
    save.disabled = copy.disabled = select.disabled = true;
    try {
      let blob: Blob | undefined;
      let text: string | undefined;
      let extension = value;
      if (value === 'share') text = shareUrl;
      else if (value === 'json') {
        const images = creative.kind === 'board' && include.checked ? await boardSources(creative, readAsset) : [];
        const backup = await media.backup.write({ documents: [creative], includeAssets: include.checked, assets: images });
        text = backup.text;
        if (backup.omittedAssetIds.length) inspected.textContent = t('omitted') + ' · ' + backup.omittedAssetIds.join(', ');
      } else if (creative.kind === 'palette') {
        const palette = creative.palette;
        if (value === 'png' || value === 'jpeg') ({ blob, companion: text } = await media.export.paletteRaster(palette, { ...bounds, format: value, backing: opaque }));
        else if (value === 'svg') ({ blob, companion: text } = media.export.paletteSvg(palette, bounds));
        else if (value === 'pdf') ({ blob, companion: text } = await media.export.palettePdf(palette));
        else if (value === 'ase') ({ blob, companion: text } = media.export.paletteAse(palette, opaque));
        else if (value.startsWith('tailwind')) {
          const version = value === 'tailwind3' ? 3 : 4;
          const scale = generateColorScale({ name: 'kitchen', base: palette.swatches[0]!.color });
          ({ text } = media.export.tailwindText(scale, { version, space: version === 3 ? 'srgb' : 'oklch' }));
          extension = version === 3 ? 'cjs' : 'css';
        } else {
          ({ text } = media.export.paletteText(palette, value as PaletteTextFormat));
          extension = value === 'css' ? 'css' : 'txt';
        }
      } else if (creative.kind === 'gradient') {
        if (value === 'svg') {
          const exported = media.export.gradientVector(creative, bounds);
          if (exported.format !== 'svg') { inspected.textContent = t('fallback'); return; }
          ({ blob, companion: text } = exported);
        } else if (value === 'png') ({ blob, companion: text } = await media.export.gradientRaster(creative, bounds));
        else text = media.export.gradientText(creative);
      } else {
        const task = await boardTask(creative, readAsset ?? (async () => null), opaque);
        if (value === 'jpeg' && task.input.background.alpha < 1 && !opaque) {
          inspected.textContent = t('backingRequired');
          backingPicker.focus();
          return;
        }
        if (value === 'pdf') ({ blob, companion: text } = await media.export.boardPdf(task));
        else ({ blob } = await media.jobs.start({ ...task, format: value === 'jpeg' ? 'jpeg' : 'png' }).result);
        text ??= media.export.paletteText(creative.palette, 'css').text;
      }
      if (download) {
        const mime = value === 'json' ? 'application/json' : extension === 'css' ? 'text/css' : 'text/plain';
        media.files.download(blob ?? new Blob([text ?? ''], { type: mime }), 'color-kitchen.' + extension);
        if (blob && text) { output.value = text; output.hidden = false; }
      } else if (text) {
        const result = await media.files.copyText(text);
        if (result.copied) inspected.textContent = t('copied');
        else { output.hidden = false; output.value = result.text; output.focus(); output.select(); inspected.textContent = t('select'); }
      }
    } catch { inspected.textContent = t('invalid'); }
    finally { save.disabled = select.disabled = false; copy.disabled = select.value === 'share' && !shareUrl; }
  }

  select.addEventListener('change', configure);
  dialog.append(header, strip, selectLabel, detail, backing, assets, output, actions, inspected);
  const backingPicker = colorSelect(backingChoice, value => value ? parseColor(value) : undefined);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  configure();
  dialog.showModal();
}
