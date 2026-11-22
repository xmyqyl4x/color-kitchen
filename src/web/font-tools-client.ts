import { createBrowserMedia } from '../browser/media.js';
import { colorCss } from '../color/css.js';
import { parseColor } from '../color/parse.js';
import type { FontDefinition } from '../typography/fonts.js';
import type { TextStyle } from '../typography/styled-text.js';
import { collectionText } from './collection-text.js';
import { readActivePalette } from './draft.js';
import { fontToolsText } from './font-tools-text.js';
import { clientLocale, get, node, press } from './ui.js';

type Asset = Readonly<{ slug: string; metadata: FontDefinition; font: string; notice: string }>;
const locale = clientLocale();
const t = (key: Parameters<typeof fontToolsText>[1]) => fontToolsText(locale, key);
const c = (key: Parameters<typeof collectionText>[1]) => collectionText(locale, key);
const media = createBrowserMedia();
const loads = new Map<string, Promise<FontFace>>();
const localFamily = (asset: Asset) => 'Kitchen Preview ' + asset.slug;
function load(asset: Asset) {
  if (!/^\/assets\/fonts\/[A-Za-z0-9.-]+\.woff2$/.test(asset.font)) return Promise.reject(new Error('Invalid font URL.'));
  let face = loads.get(asset.slug);
  if (!face) {
    face = new FontFace(localFamily(asset), 'url("' + asset.font + '")', { weight: String(asset.metadata.weights[0]) }).load()
      .then(face => { document.fonts.add(face); return face; }, cause => { loads.delete(asset.slug); throw cause; });
    loads.set(asset.slug, face);
  }
  return face;
}
function coverage(asset: FontDefinition, sample: string, weight: number) {
  const result = media.type.preview(asset, sample, locale, { weight }).glyphs;
  return result.fallback.length ? t('coverage') + ' · ' + [...new Set(result.fallback)].slice(0, 20).join(' ') : '';
}

function library() {
  const sample = get<HTMLInputElement>('font-library-sample');
  for (const card of document.querySelectorAll<HTMLElement>('[data-font-face]')) {
    const asset = JSON.parse(card.dataset.fontFace!) as Asset | null;
    const preview = card.querySelector<HTMLElement>('[data-font-sample]')!;
    const status = card.querySelector<HTMLElement>('[data-font-status]')!;
    let loaded = false;
    function update() {
      preview.textContent = sample.value;
      status.textContent = !loaded || !asset ? t('fallback') :
        t('loaded') + ' ' + coverage(asset.metadata, sample.value, asset.metadata.weights[0]!);
    }
    if (asset) void load(asset).then(() => {
      preview.style.fontFamily = JSON.stringify(localFamily(asset)) + ', system-ui, sans-serif';
      loaded = true;
      update();
    }).catch(update);
    else update();
    sample.addEventListener('input', update);
  }
}

function playground(root: HTMLElement) {
  const assets = JSON.parse(root.dataset.typeAssets ?? '[]') as Asset[];
  const family = get<HTMLSelectElement>('type-family');
  const weight = get<HTMLSelectElement>('type-weight');
  const source = get<HTMLTextAreaElement>('type-text');
  const preview = get('type-preview');
  const glyphs = get('type-coverage');
  const status = get('type-status');
  const fallback = get<HTMLInputElement>('type-fallback');
  const copyField = get<HTMLTextAreaElement>('type-copy');
  const system: FontDefinition = { family: 'system-ui', weights: [400, 700], scripts: ['Latn'] };
  let faceLoaded = false;
  let generation = 0;
  for (const item of assets) family.add(new Option(item.metadata.family, item.slug));
  const requested = /^#font=([a-z0-9-]{1,100})$/.exec(location.hash)?.[1];
  if (assets.some(asset => asset.slug === requested)) family.value = requested!;
  const active = () => assets.find(asset => asset.slug === family.value);
  const number = (id: string) => get<HTMLInputElement>(id).valueAsNumber;
  const settings = () => ({
    size: number('type-size'), weight: Number(weight.value), lineHeight: number('type-height'),
    spacing: number('type-spacing'), color: parseColor(get<HTMLInputElement>('type-color').value),
  });
  const palette = readActivePalette();
  if (palette) get<HTMLInputElement>('type-color').value = colorCss(palette.palette.swatches[0]!.color);

  async function copy(value: string) {
    const result = await media.files.copyText(value);
    status.textContent = c(result.copied ? 'copied' : 'select');
    copyField.hidden = result.copied;
    if (!result.copied) { copyField.value = result.text; copyField.focus(); copyField.select(); }
  }
  function renderType() {
    try {
      const asset = active();
      const spec = settings();
      media.type.css(asset?.metadata ?? system, spec);
      preview.textContent = source.value;
      preview.style.fontFamily = faceLoaded && asset ? JSON.stringify(localFamily(asset)) + ', system-ui, sans-serif' : 'system-ui, sans-serif';
      preview.style.fontSize = spec.size + 'px';
      preview.style.fontWeight = String(spec.weight);
      preview.style.lineHeight = String(spec.lineHeight);
      preview.style.letterSpacing = spec.spacing + 'em';
      preview.style.color = colorCss(spec.color);
      glyphs.textContent = (asset ? t(faceLoaded ? 'loaded' : 'fallback') : t('system')) + ' ' +
        coverage(asset?.metadata ?? system, source.value, spec.weight);
    } catch { status.textContent = t('unavailable'); }
  }
  async function choose() {
    const selection = ++generation;
    const asset = active();
    const remembered = Number(weight.value);
    weight.replaceChildren(...(asset?.metadata.weights ?? system.weights).map(value => new Option(String(value), String(value))));
    if ([...weight.options].some(option => Number(option.value) === remembered)) weight.value = String(remembered);
    faceLoaded = false;
    if (asset) {
      try {
        await load(asset);
        if (selection !== generation) return;
        faceLoaded = true;
      } catch { if (selection !== generation) return; }
    }
    renderType();
  }
  function renderStyles() {
    const modes: readonly TextStyle[] = ['bold', 'italic', 'monospace'];
    get('type-variants').replaceChildren(...modes.map(mode => {
      const variant = media.type.style(source.value, mode, locale);
      const panel = node('section');
      panel.append(node('h2', t(mode)), node('p', variant.styled, 'type-decoration'),
        node('p', t('unsupported') + ' · ' + variant.unsupported),
        press(t('styled'), () => copy(variant.styled)));
      return panel;
    }));
  }
  family.addEventListener('change', choose);
  source.addEventListener('input', () => { renderType(); renderStyles(); });
  for (const id of ['type-weight', 'type-size', 'type-height', 'type-spacing', 'type-color']) {
    get(id).addEventListener('change', renderType);
  }
  get('type-plain').addEventListener('click', () => { void copy(source.value); });
  get('type-css').addEventListener('click', () => {
    try {
      const css = media.type.css(active()?.metadata ?? system, settings());
      media.files.download(new Blob(['.color-kitchen-type {\n' + css + '\n}\n'], { type: 'text/css' }), 'color-kitchen-type.css');
    } catch { status.textContent = t('unavailable'); }
  });
  get('type-image').addEventListener('click', async () => {
    try {
      const asset = active();
      const spec = settings();
      const definition = asset ? { ...asset.metadata, family: localFamily(asset) } : system;
      const result = await media.type.image(source.value, definition, spec, { format: 'png',
        allowFallback: !asset || fallback.checked, width: 1440, height: Math.max(160, Math.ceil(spec.size * spec.lineHeight *
          (source.value.split('\n').length + 1) + 24)) });
      if (result.format === 'css-required') status.textContent = t('fallback');
      else media.files.download(result.blob, 'color-kitchen-type.png');
    } catch { status.textContent = t('unavailable'); }
  });
  renderStyles();
  void choose();
}

const root = document.querySelector<HTMLElement>('[data-type-assets]');
if (root) playground(root); else library();
