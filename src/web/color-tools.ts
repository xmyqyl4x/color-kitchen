import type { Locale } from '../model/locales.js';
import { html, pathFor } from './shell.js';
import { screenTitle } from './strings.js';
import { colorToolsText } from './color-tools-text.js';

export function colorToolsScreen(locale: Locale, mode: 'contrast' | 'color-inspector') {
  const t = (key: Parameters<typeof colorToolsText>[1]) => html(colorToolsText(locale, key));
  const field = (id: string, key: Parameters<typeof colorToolsText>[1], value = '') =>
    '<label>' + t(key) + '<input id="' + id + '" maxlength="160" value="' + value + '"></label>';
  const primary = mode === 'contrast' ? t('check') : t('inspect');
  const swatch = (id: string, key: 'foreground' | 'background') =>
    '<label>' + t('active') + ' · ' + t(key) + '<select id="' + id + '"><option value="">' + t('manual') + '</option></select></label>';
  return `<section class="studio color-tools" data-color-mode="${mode}">
    <h1>${html(screenTitle(locale, mode))}</h1>
    <div class="image-tools-layout"><div class="studio-panel">
      <form id="color-form">
      ${mode === 'contrast' ? `${field('contrast-foreground', 'foreground', '#6F8F7B')}${swatch('contrast-fg-swatch', 'foreground')}
      ${field('contrast-background', 'background', '#F8F5EF')}${swatch('contrast-bg-swatch', 'background')}
      ${field('contrast-backing', 'backing')}
      <div class="studio-actions"><button type="submit" class="button primary">${primary}</button>
      <button type="button" class="button" id="contrast-swap">${t('swap')}</button></div>` :
      `${field('inspector-value', 'color', '#6F8F7B')}
      <div class="studio-actions"><button type="submit" class="button primary">${primary}</button>
      <button type="button" class="button" id="inspector-screen">${t('screen')}</button>
      <a class="secondary-link" href="${pathFor(locale, 'image-to-palette')}">${t('image')}</a></div>`}
      </form>
      ${mode === 'contrast' ? '' : `<fieldset><legend>${t('channels')}</legend>
        <label>${t('space')}<select id="inspector-space"><option value="srgb">sRGB</option>
        <option value="display-p3">Display P3</option><option value="oklch">OKLCH</option><option value="hsl">HSL</option></select></label>
        <div class="numeric-grid">${[0, 1, 2, 3].map(i => '<label><span id="channel-label-' + i + '">' +
          (i === 3 ? t('alpha') : ['R', 'G', 'B'][i]) + '</span><input type="number" step="any" id="channel-' + i + '"></label>').join('')}</div>
      </fieldset>`}
      <p id="color-status" role="status"></p>
    </div><div class="studio-panel"><div id="color-result" aria-live="polite"></div>
      ${mode === 'contrast' ? `<div class="studio-actions">
        <button type="button" class="button" id="contrast-fix">${t('fix')}</button>
        <button type="button" class="button" id="contrast-apply" disabled>${t('apply')}</button>
        <button type="button" class="button" id="contrast-undo" disabled>${t('undo')}</button></div>` : ''}
      </div></div>
  </section>`;
}
