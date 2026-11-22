import { colorTools } from '../browser/editing.js';
import { colorCss } from '../color/css.js';
import { convertColor } from '../color/convert.js';
import { parseColor } from '../color/parse.js';
import type { ColorValue } from '../model/color.js';
import { readActivePalette } from './draft.js';
import { colorToolsText } from './color-tools-text.js';
import { clientLocale, get, node } from './ui.js';

const locale = clientLocale();
const t = (key: Parameters<typeof colorToolsText>[1]) => colorToolsText(locale, key);
const contrast = document.querySelector<HTMLElement>('[data-color-mode]')?.dataset.colorMode === 'contrast';
const input = (id: string) => get<HTMLInputElement>(id);
const select = (id: string) => get<HTMLSelectElement>(id);
const action = (id: string) => get<HTMLButtonElement>(id);
const output = get('color-result');
const status = get('color-status');
const form = get<HTMLFormElement>('color-form');
const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });
const ratioFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function colorTile(color: ColorValue, name: string) {
  const tile = node('div', undefined, 'color-tile');
  const strip = node('span');
  strip.style.backgroundColor = colorCss(color);
  tile.append(strip, node('p', name), node('code', colorTools.inspect(color).hex.hex));
  return tile;
}
function value(field: HTMLInputElement) {
  try {
    const result = parseColor(field.value);
    field.removeAttribute('aria-invalid');
    return result;
  } catch (error) {
    field.setAttribute('aria-invalid', 'true');
    throw error;
  }
}
function run(work: () => void) {
  try { work(); } catch { status.textContent = t('invalid'); }
}

function mountContrast() {
  const foreground = input('contrast-foreground');
  const background = input('contrast-background');
  const base = input('contrast-backing');
  const fgChoice = select('contrast-fg-swatch');
  const bgChoice = select('contrast-bg-swatch');
  const draft = readActivePalette();
  let pending: ReturnType<typeof colorTools.suggestForeground> = null;
  const undo: string[] = [];
  if (draft) {
    for (const [selection, field, roles] of [[fgChoice, foreground, ['text', 'on-primary']], [bgChoice, background, ['background', 'surface']]] as const) {
      for (const [index, swatch] of draft.palette.swatches.entries()) {
        const assigned = Object.keys(draft.palette.roles).filter(role => draft.palette.roles[role] === swatch.id);
        selection.add(new Option(colorTools.inspect(swatch.color).hex.hex + (assigned.length ? ' · ' + assigned.join(', ') : ' · ' + (index + 1)),
          colorCss(swatch.color)));
        if (assigned.some(role => roles.some(value => value === role))) selection.value = colorCss(swatch.color);
      }
      if (selection.value) field.value = selection.value;
      selection.addEventListener('change', () => { if (selection.value) field.value = selection.value; run(render); });
      field.addEventListener('input', () => { selection.value = ''; });
    }
  }

  const pair = () => [value(foreground), value(background), base.value.trim() ? value(base) : undefined] as const;
  function render() {
    pending = null;
    action('contrast-apply').disabled = true;
    const result = colorTools.checkContrast(...pair());
    const heading = node('h2', ratioFormat.format(result.ratio) + ' : 1');
    heading.id = 'contrast-ratio';
    const tiles = node('div', undefined, 'color-results');
    tiles.append(colorTile(result.foreground, t('foreground')), colorTile(result.background, t('background')));
    if (result.backing) tiles.append(colorTile(result.backing, t('backing')));
    const assessments = node('ul', undefined, 'contrast-assessments');
    for (const [type, levels] of [['normal', result.normal], ['large', result.large]] as const) {
      for (const [level, value] of Object.entries(levels)) {
        const row = node('li', t(type) + ' · ' + level.toUpperCase() + ' (' + number.format(value.threshold) + ':1) · ' +
          t(value.passes ? 'pass' : 'fail'));
        row.dataset.assessment = type + '-' + level;
        row.dataset.passes = String(value.passes);
        assessments.append(row);
      }
    }
    output.replaceChildren(heading, node('p', t('testScope') + (result.gamutMapped ? ' ' + t('gamut') : '')), tiles, assessments);
    status.textContent = '';
  }
  form.addEventListener('submit', event => { event.preventDefault(); run(render); });
  for (const field of [foreground, background, base]) field.addEventListener('input', () => {
    pending = null;
    action('contrast-apply').disabled = true;
    output.querySelector('#suggested-color')?.remove();
  });
  action('contrast-swap').addEventListener('click', () => {
    [foreground.value, background.value] = [background.value, foreground.value];
    fgChoice.value = bgChoice.value = '';
    run(render);
  });
  action('contrast-fix').addEventListener('click', () => run(() => {
    render();
    const [fg, bg, backing] = pair();
    pending = colorTools.suggestForeground(fg, bg, { backing });
    if (!pending) { status.textContent = t('noFix'); return; }
    const tile = colorTile(pending.color, t('corrected') + ' · ' + ratioFormat.format(pending.ratio) + ' : 1');
    tile.id = 'suggested-color';
    output.append(tile);
    action('contrast-apply').disabled = false;
  }));
  action('contrast-apply').addEventListener('click', () => run(() => {
    if (!pending) return;
    undo.push(foreground.value);
    foreground.value = colorCss(pending.color);
    fgChoice.value = '';
    action('contrast-undo').disabled = false;
    render();
  }));
  action('contrast-undo').addEventListener('click', () => run(() => {
    const earlier = undo.pop();
    if (earlier !== undefined) foreground.value = earlier;
    action('contrast-undo').disabled = !undo.length;
    render();
  }));
  run(render);
}

function mountInspector() {
  const field = input('inspector-value');
  const mode = select('inspector-space');
  const channels = [0, 1, 2, 3].map(index => input('channel-' + index));
  type EyeDropperType = new () => { open(): Promise<{ sRGBHex: string }> };
  const EyeDropper = (window as Window & { EyeDropper?: EyeDropperType }).EyeDropper;
  const screen = action('inspector-screen');
  screen.disabled = !EyeDropper;
  if (!EyeDropper) status.textContent = t('screenUnavailable');
  let current = parseColor(field.value);
  const fragment = /^#color=(.*)$/.exec(location.hash)?.[1];
  if (fragment && fragment.length <= 500) {
    try { current = parseColor(decodeURIComponent(fragment)); field.value = colorCss(current); } catch { /* Keep visible default. */ }
  }
  const names = {
    black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', teal: '#008080',
    gold: '#FFD700', slategray: '#708090', rebeccapurple: '#663399',
  };
  function coordinates(color: ColorValue) {
    const [l, c, h] = colorTools.inspect(color).oklch.components;
    return [l, c * Math.cos(h * Math.PI / 180), c * Math.sin(h * Math.PI / 180)];
  }
  function syncChannels() {
    const space = mode.value as ColorValue['space'] | 'hsl';
    const inspected = colorTools.inspect(current);
    const { hue, saturation, lightness } = inspected.hsl;
    const currentChannels = space === 'hsl' ? [hue, saturation * 100, lightness * 100] :
      space === 'oklch' ? inspected.oklch.components : space === 'display-p3' ?
        convertColor(current, 'display-p3').color.components : inspected.srgb.color.components;
    const labels = space === 'hsl' ? ['H (°)', 'S (%)', 'L (%)'] : space === 'oklch' ? ['L', 'C', 'H (°)'] : ['R (0–1)', 'G (0–1)', 'B (0–1)'];
    labels.forEach((label, index) => { get('channel-label-' + index).textContent = label; });
    [...currentChannels, current.alpha].forEach((amount, index) => { channels[index]!.value = String(amount); });
  }
  function render() {
    const inspected = colorTools.inspect(current);
    const { hue, saturation, lightness } = inspected.hsl;
    const target = coordinates(current);
    const distance = (color: string) => coordinates(parseColor(color)).reduce((sum, value, index) => sum + (value - target[index]!) ** 2, 0);
    const nearest = Object.entries(names).sort((a, b) => distance(a[1]) - distance(b[1]))[0]!;
    const exact = current.alpha === 1 && distance(nearest[1]) < 1e-16;
    const descriptions = node('dl', undefined, 'color-values');
    const rgb = inspected.srgb.color.components.map(value => number.format(value * 255)).join(' / ');
    for (const [label, value] of [['HEX', inspected.hex.hex], ['RGB', rgb],
      ['HSL', [hue, saturation * 100, lightness * 100].map(number.format).join(' / ')],
      ['OKLCH', inspected.oklch.components.map(number.format).join(' / ')], [t('alpha'), number.format(current.alpha)],
      [t(exact ? 'exact' : 'nearest'), nearest[0]], [t('color'), inspected.css]] as const) {
      descriptions.append(node('dt', label), node('dd', value));
    }
    const alternate = node('div', undefined, 'color-results');
    alternate.append(colorTile(colorTools.tint(current, 0.4), t('tint')), colorTile(colorTools.shade(current, 0.4), t('shade')),
      colorTile(colorTools.tone(current, 0.4), t('tone')));
    const [l, c, h] = inspected.oklch.components;
    const complementary = colorTools.harmonyHues(h, 'complementary')[1]!;
    alternate.append(colorTile({ space: 'oklch', components: [l, c, complementary], alpha: current.alpha }, t('harmony')));
    output.replaceChildren(colorTile(current, t('color')), descriptions, node('h2', t('variants')), alternate);
    if (inspected.srgb.gamutMapped) output.append(node('p', t('gamut')));
    syncChannels();
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    run(() => { current = value(field); status.textContent = ''; render(); });
  });
  mode.addEventListener('change', syncChannels);
  for (const channel of channels) channel.addEventListener('change', () => run(() => {
    const [x, y, z, alpha] = channels.map(input => input.valueAsNumber);
    const source = mode.value === 'hsl' ? 'hsl(' + x + ' ' + y + '% ' + z + '% / ' + alpha + ')'
      : mode.value === 'oklch' ? 'oklch(' + [x, y, z].join(' ') + ' / ' + alpha + ')'
        : 'color(' + mode.value + ' ' + [x, y, z].join(' ') + ' / ' + alpha + ')';
    current = parseColor(source);
    field.value = colorCss(current);
    field.removeAttribute('aria-invalid');
    status.textContent = '';
    render();
  }));
  screen.addEventListener('click', async () => {
    if (!EyeDropper) return;
    const before = field.value;
    screen.disabled = true;
    try {
      const selected = parseColor((await new EyeDropper().open()).sRGBHex);
      if (field.value !== before) return;
      current = selected;
      field.value = colorTools.inspect(selected).hex.hex;
      status.textContent = '';
      render();
    } catch { status.textContent = t('cancelled'); }
    finally { screen.disabled = false; }
  });
  render();
}

if (contrast) mountContrast(); else mountInspector();
