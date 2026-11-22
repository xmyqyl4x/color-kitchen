import type { Locale } from '../model/locales.js';
import { colorToolsText } from './color-tools-text.js';
import { guideText } from './guide-text.js';
import { html, pathFor } from './shell.js';
import { screenTitle } from './strings.js';
import { studioText } from './studio-text.js';

export function guideScreen(locale: Locale) {
  const t = (key: Parameters<typeof guideText>[1]) => html(guideText(locale, key));
  const field = (id: string, label: Parameters<typeof colorToolsText>[1], value: string) =>
    '<label>' + html(colorToolsText(locale, label)) + '<input id="' + id + '" value="' + value + '" maxlength="160"></label>';
  return `<section class="studio guide-ui"><h1>${html(screenTitle(locale, 'color-guide'))}</h1>
    <div class="image-tools-layout"><div class="studio-panel">
      <label>${t('mode')}<select id="guide-mode"><option value="local">${t('local')}</option><option value="hosted">${t('hosted')}</option></select></label>
      <form id="guide-form">
        <div id="guide-local"><label>${t('task')}<select id="guide-task">
          <option value="palette">${t('palette')}</option><option value="contrast">${t('contrast')}</option></select></label>
          <div id="guide-pair" hidden>${field('guide-fg', 'foreground', '#6F8F7B')}${field('guide-bg', 'background', '#F8F5EF')}
          ${field('guide-backing', 'backing', '')}</div></div>
        <div id="guide-hosted" hidden><p>${t('privacy')}</p><p>${t('limits')}</p>
          <label>${t('prompt')}<textarea id="guide-prompt" maxlength="2000" rows="5"></textarea></label>
          <label><input type="checkbox" id="guide-share"> ${t('share')}</label>
          <div id="guide-swatches" class="guide-swatches" hidden></div></div>
        <div class="studio-actions"><button type="submit" class="button primary" id="guide-submit">${t('send')}</button>
        <button type="button" class="button" id="guide-cancel" disabled>${t('cancel')}</button>
        <button type="button" class="button" id="guide-undo" disabled>${html(studioText(locale, 'undo'))}</button>
        <a class="secondary-link" href="${pathFor(locale, 'palette-studio')}">${html(screenTitle(locale, 'palette-studio'))}</a>
        </div><p role="status" id="guide-status"></p>
      </form>
    </div><section class="studio-panel">
      <ol id="guide-history" class="guide-history" aria-live="polite"></ol>
      <div id="guide-result"></div>
    </section></div></section>`;
}
