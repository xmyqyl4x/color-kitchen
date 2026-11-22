import { checkContrast, suggestForeground } from '../color/contrast.js';
import type { ColorValue } from '../model/color.js';
import { isLocale, type Locale } from '../model/locales.js';
import { generatePalette, type GenerationOptions } from '../palette/generate.js';
import type { GuideSuggestion } from './response.js';

const text = {
  en: ['Quick suggestions · on this device', 'Try this palette as a starting point.', 'Preview the suggested foreground before applying it.', 'Review the measured contrast for this pair.'],
  fr: ['Suggestions rapides · sur cet appareil', 'Essayez cette palette comme point de départ.', 'Prévisualisez le premier plan proposé avant de l’appliquer.', 'Consultez le contraste mesuré pour cette paire.'],
  es: ['Sugerencias rápidas · en este dispositivo', 'Prueba esta paleta como punto de partida.', 'Previsualiza el primer plano sugerido antes de aplicarlo.', 'Revisa el contraste medido para este par.'],
  pt: ['Sugestões rápidas · neste dispositivo', 'Experimente esta paleta como ponto de partida.', 'Pré-visualize a cor de primeiro plano sugerida antes de aplicá-la.', 'Confira o contraste medido para este par.'],
  de: ['Schnelle Vorschläge · auf diesem Gerät', 'Probieren Sie diese Palette als Ausgangspunkt aus.', 'Prüfen Sie die vorgeschlagene Vordergrundfarbe vor der Übernahme.', 'Prüfen Sie den gemessenen Kontrast dieses Farbpaares.'],
} as const;

export function localColorGuide(locale: Locale, task: { kind: 'palette'; options: GenerationOptions } |
    { kind: 'contrast'; foreground: ColorValue; background: ColorValue; backing?: ColorValue }) {
  if (!isLocale(locale)) throw new RangeError('Unsupported Guide locale.');
  const [label, paletteMessage, fixMessage, resultMessage] = text[locale];
  let suggestion: GuideSuggestion;
  if (task.kind === 'palette') {
    const palette = generatePalette(task.options);
    suggestion = { message: paletteMessage, colors: palette.swatches.map(swatch => swatch.color), roles: {}, assessments: [] };
  } else {
    const { foreground, background, backing } = task;
    const fix = suggestForeground(foreground, background, { backing });
    suggestion = { message: fix ? fixMessage : resultMessage, colors: fix ? [fix.color] : [], roles: {},
      assessments: [checkContrast(fix?.color ?? foreground, background, backing)] };
  }
  return { mode: 'local', label, suggestion } as const;
}
