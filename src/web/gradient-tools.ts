import type { Locale } from '../model/locales.js';
import { collectionText } from './collection-text.js';
import { gradientText } from './gradient-tools-text.js';
import { html, pathFor } from './shell.js';
import { screenTitle } from './strings.js';

export function gradientToolsScreen(locale: Locale, mode: 'gradient-studio' | 'gradient-steps') {
  const t = (key: Parameters<typeof gradientText>[1]) => html(gradientText(locale, key));
  const field = (id: string, label: string, options: string) => '<label>' + label + '<select id="' + id + '">' + options + '</select></label>';
  const menu = (options: readonly Parameters<typeof t>[0][]) => options.map(value =>
    '<option value="' + value + '">' + t(value) + '</option>').join('');
  const studio = mode === 'gradient-studio';
  const other = studio ? 'gradient-steps' : 'gradient-studio';
  return `<section class="studio gradient-tools" data-gradient-mode="${mode}">
    <h1>${html(screenTitle(locale, mode))}</h1>
    <div class="image-tools-layout"><div class="studio-panel">
      <div class="numeric-grid">
      ${studio ? field('gr-type', t('type'), menu(['linear', 'radial', 'conic'])) : ''}
      ${field('gr-space', t('interpolation'), '<option value="srgb">sRGB</option><option value="oklch">OKLCH</option>')}
      ${field('gr-hue', t('hue'), menu(['shorter', 'longer', 'increasing', 'decreasing']))}
      ${studio ? `<label>${t('angle')}<input id="gr-angle" type="number" step="any"></label>
        <label>${t('center')} X (%)<input id="gr-center-x" type="number" min="0" max="100" step="any"></label>
        <label>${t('center')} Y (%)<input id="gr-center-y" type="number" min="0" max="100" step="any"></label>` :
        `<label>${t('steps')}<input id="gr-count" type="number" min="2" max="12" value="5"></label>`}
      </div>
      ${studio ? '<div id="gr-stops"></div>' : ''}
      <div class="studio-actions">
        ${studio ? `<button class="button" id="gr-add">${t('add')}</button><button class="button" id="gr-save">${t('save')}</button>` :
          `<button class="button primary" id="gr-use">${t('open')}</button>`}
        <button class="button" id="gr-reverse">${t('reverse')}</button>
        <button class="button" id="gr-export">${html(collectionText(locale, 'export'))}</button>
      </div>
      <a class="secondary-link" href="${pathFor(locale, other)}" id="gr-other">${html(screenTitle(locale, other))}</a>
      <p id="gr-status" role="status"></p>
    </div><div class="studio-panel">
      <div id="gr-preview" role="img" aria-label="${t('preview')}"></div>
      ${studio ? '' : '<ol id="gr-samples" class="gradient-samples" aria-live="polite"></ol>'}
      <label>CSS<textarea id="gr-css" rows="5" readonly></textarea></label>
    </div></div>
  </section>`;
}
