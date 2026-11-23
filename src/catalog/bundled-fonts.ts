import type { FontCategory, FontDefinition, FontWeightRange } from '../typography/fonts.js';
import { sampleCatalog } from './sample-data.js';
import type { CatalogSeed } from './seed.js';

type BundledFont = Extract<CatalogSeed, { kind: 'font' }>;
type Summary = readonly [en: string, fr: string, es: string, pt: string, de: string];
const googleFontsRevision = '06bfe0d62a98375cb09c942fa18e68bd32cff057';

function font(id: number, slug: string, family: string, category: FontCategory, attribution: string,
  [folder, filename, sourceDigest]: readonly [string, string, string], [en, fr, es, pt, de]: Summary,
  weightRange?: FontWeightRange, scripts: FontDefinition['scripts'] = ['Latn']): BundledFont {
  const directory = `ofl/${folder}`;
  return {
    itemId: '2fc5c104-72e7-49a6-81c1-' + String(id).padStart(12, '0'), kind: 'font', revision: 1,
    slug, family, category, featuredRank: id, attribution, licenseId: 'OFL-1.1', sourceVersion: googleFontsRevision,
    sourceUri: `https://github.com/google/fonts/tree/${googleFontsRevision}/${directory}`,
    licenseUri: `https://github.com/google/fonts/blob/${googleFontsRevision}/${directory}/OFL.txt`,
    sourceDigest, filename, notice: filename.replace(/-(?:Regular|Variable)\.ttf$/, '-OFL.txt'), weight: 400, weightRange, scripts,
    translations: { en: { title: family, summary: en }, fr: { title: family, summary: fr }, es: { title: family, summary: es },
      pt: { title: family, summary: pt }, de: { title: family, summary: de } },
  };
}

export const additionalFonts: readonly BundledFont[] = [
  font(1, 'inter', 'Inter', 'sans', 'Rasmus Andersson',
    ['inter', 'Inter-Variable.ttf', '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031'], [
      'A clean interface sans with a tall lowercase and a wide weight range.',
      'Une sans sérif d’interface aux minuscules hautes et à la large gamme de graisses.',
      'Una sans serif para interfaces, con minúsculas altas y una amplia gama de pesos.',
      'Uma sem serifa para interfaces, com minúsculas altas e uma ampla gama de pesos.',
      'Eine serifenlose UI-Schrift mit hoher x-Höhe und vielen Strichstärken.',
    ], { min: 100, max: 900 }, ['Latn', 'Grek', 'Cyrl']),
  font(2, 'lora', 'Lora', 'serif', 'Cyreal',
    ['lora', 'Lora-Variable.ttf', '822a6621ccbe8d97d20ac88c1c41f5615c9c2c202eaa75f272cd452aac6475a7'], [
      'A calligraphic serif with soft curves for longer passages.',
      'Une sérif calligraphique aux courbes souples pour les textes longs.',
      'Una serif caligráfica de curvas suaves para textos largos.',
      'Uma fonte com serifa caligráfica e curvas suaves para textos longos.',
      'Eine kalligrafische Serifenschrift mit weichen Kurven für längere Texte.',
    ], { min: 400, max: 700 }, ['Latn', 'Cyrl']),
  font(3, 'jetbrains-mono', 'JetBrains Mono', 'mono', 'JetBrains, Philipp Nurullin, Konstantin Bulenkov',
    ['jetbrainsmono', 'JetBrainsMono-Variable.ttf', '48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda'], [
      'A coding face with distinct characters and even spacing.',
      'Une police de code aux caractères distincts et à l’espacement régulier.',
      'Una fuente para código con caracteres diferenciados y espaciado uniforme.',
      'Uma fonte para código com caracteres distintos e espaçamento uniforme.',
      'Eine Programmierschrift mit gut unterscheidbaren Zeichen und einheitlicher Breite.',
    ], { min: 100, max: 800 }, ['Latn', 'Grek', 'Cyrl']),
  font(4, 'fraunces', 'Fraunces', 'display', 'Undercase Type, Phaedra Charles, Flavia Zimbardi',
    ['fraunces', 'Fraunces-Variable.ttf', '177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb'], [
      'A soft, expressive display serif for prominent headlines.',
      'Une sérif de titrage douce et expressive pour les grands titres.',
      'Una serif de exhibición suave y expresiva para titulares destacados.',
      'Uma fonte de destaque com serifas suaves e expressivas para títulos.',
      'Eine weiche, ausdrucksstarke Serifenschrift für große Überschriften.',
    ], { min: 100, max: 900 }),
  font(5, 'atkinson-hyperlegible', 'Atkinson Hyperlegible', 'sans',
    'Braille Institute, Applied Design Works, Elliott Scott, Megan Eiswerth, Linus Boman, Theodore Petrosky',
    ['atkinsonhyperlegible', 'AtkinsonHyperlegible-Regular.ttf', '7fb917c89019896d0b52ee84b7cbb3304c18cb90b19a62f5e32712bd23e97669'], [
      'Open shapes and distinctive letters make similar characters easier to tell apart.',
      'Ses formes ouvertes et ses lettres distinctes aident à différencier les caractères proches.',
      'Las formas abiertas y las letras diferenciadas facilitan distinguir caracteres parecidos.',
      'Formas abertas e letras distintas facilitam distinguir caracteres parecidos.',
      'Offene Formen und markante Buchstaben helfen, ähnliche Zeichen zu unterscheiden.',
    ]),
  font(6, 'bitter', 'Bitter', 'serif', 'Sol Matas',
    ['bitter', 'Bitter-Variable.ttf', 'ef2b9a711fb02f1e5823b34da1b7450e0fc76793b7d733a8b41006e24916d4a7'], [
      'A sturdy slab serif with even texture for reading on screen.',
      'Une sérif à empattements épais et au rythme régulier pour la lecture à l’écran.',
      'Una serif de remates gruesos y textura uniforme para leer en pantalla.',
      'Uma fonte de serifas grossas e textura regular para leitura em ecrã.',
      'Eine robuste Schrift mit kräftigen Serifen für Bildschirmtexte.',
    ], { min: 100, max: 900 }, ['Latn', 'Cyrl']),
  font(7, 'ibm-plex-mono', 'IBM Plex Mono', 'mono', 'Mike Abbink and Bold Monday',
    ['ibmplexmono', 'IBMPlexMono-Regular.ttf', '6a3412f058c7d8dfd9170c41e85ade48e5156ecb89356110ca57a0a27734af46'], [
      'A regular-width code face with a crisp, technical character.',
      'Une police de code à chasse fixe au dessin net et technique.',
      'Una fuente monoespaciada para código, de aspecto nítido y técnico.',
      'Uma fonte monoespaçada para código, de traço nítido e técnico.',
      'Eine präzise, technische Festbreitenschrift für Code.',
    ], undefined, ['Latn', 'Cyrl']),
  font(8, 'dm-serif-display', 'DM Serif Display', 'display', 'Colophon Foundry',
    ['dmserifdisplay', 'DMSerifDisplay-Regular.ttf', '8cc3643535edf039aa5d95440a8542735e9197e4f4b8d9303e980fefbf5ab616'], [
      'A high-contrast serif for short, generously sized titles.',
      'Une sérif à fort contraste pour les titres courts en grand corps.',
      'Una serif de alto contraste para titulares cortos de gran tamaño.',
      'Uma fonte com serifas de alto contraste para títulos curtos e grandes.',
      'Eine kontrastreiche Serifenschrift für kurze, groß gesetzte Titel.',
    ]),
  font(9, 'dm-sans', 'DM Sans', 'sans', 'Colophon Foundry',
    ['dmsans', 'DMSans-Variable.ttf', '8cd08d97e89c24d0aa92edd2f0f4c8ee6195eee9b7c9f154865a58b02f0c1c0d'], [
      'A geometric sans with round forms and enough weights for an entire layout.',
      'Une sans sérif géométrique aux formes rondes et aux nombreuses graisses.',
      'Una sans serif geométrica de formas redondas y muchos pesos.',
      'Uma sem serifa geométrica de formas redondas e muitos pesos.',
      'Eine geometrische Sans mit runden Formen und vielen Strichstärken.',
    ], { min: 100, max: 1000 }),
  font(10, 'libre-baskerville', 'Libre Baskerville', 'serif', 'Impallari Type',
    ['librebaskerville', 'LibreBaskerville-Variable.ttf', '05a95421961341c5b2556285e8415df9db27dab4f4abe22b446b3c6a8b916c5d'], [
      'A classic text serif with open shapes and comfortable spacing.',
      'Une sérif classique aux formes ouvertes et à l’espacement confortable.',
      'Una serif clásica para texto con formas abiertas y espaciado cómodo.',
      'Uma fonte clássica com serifas, formas abertas e espaçamento confortável.',
      'Eine klassische Textserife mit offenen Formen und angenehmen Abständen.',
    ], { min: 400, max: 700 }),
  font(11, 'space-mono', 'Space Mono', 'mono', 'Colophon Foundry',
    ['spacemono', 'SpaceMono-Regular.ttf', '95837e182baeeada83368f7748db28357f0a1b75c6b84ff7065b5edf933c8e18'], [
      'A retro monospaced face for labels, numbers, and short specimens.',
      'Une chasse fixe rétro pour les libellés, les chiffres et les courts spécimens.',
      'Una fuente monoespaciada retro para etiquetas, cifras y muestras breves.',
      'Uma monoespaçada retro para rótulos, números e amostras curtas.',
      'Eine Retro-Festbreitenschrift für Beschriftungen, Zahlen und kurze Texte.',
    ]),
  font(12, 'manrope', 'Manrope', 'sans', 'Mikhail Sharanda',
    ['manrope', 'Manrope-Variable.ttf', '3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6'], [
      'A modern sans with round shapes and a compact feel.',
      'Une sans sérif moderne aux formes rondes et au dessin compact.',
      'Una sans serif moderna de formas redondas y aspecto compacto.',
      'Uma sem serifa moderna de formas redondas e desenho compacto.',
      'Eine moderne Sans mit runden Formen und kompaktem Eindruck.',
    ], { min: 200, max: 800 }, ['Latn', 'Grek', 'Cyrl']),
  font(13, 'playfair-display', 'Playfair Display', 'serif', 'Claus Eggers Sørensen',
    ['playfairdisplay', 'PlayfairDisplay-Variable.ttf', 'c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6'], [
      'An editorial serif with fine hairlines and pronounced thick strokes.',
      'Une sérif éditoriale aux déliés fins et aux pleins marqués.',
      'Una serif editorial con trazos finos y gruesos bien marcados.',
      'Uma fonte editorial com serifas e contraste marcado entre traços finos e grossos.',
      'Eine redaktionelle Serifenschrift mit feinen Haarlinien und kräftigen Strichen.',
    ], { min: 400, max: 900 }, ['Latn', 'Cyrl']),
  font(14, 'work-sans', 'Work Sans', 'sans', 'Wei Huang',
    ['worksans', 'WorkSans-Variable.ttf', 'f50f61f2ba738e239442d40bf1069adb195c224b6a5a73a581fc2f3ed62a9f63'], [
      'An adaptable sans for text, labels, and interface headings.',
      'Une sans sérif polyvalente pour le texte, les libellés et les titres d’interface.',
      'Una sans serif versátil para texto, etiquetas y titulares de interfaz.',
      'Uma sem serifa versátil para texto, rótulos e títulos de interface.',
      'Eine vielseitige Sans für Texte, Beschriftungen und UI-Überschriften.',
    ], { min: 100, max: 900 }),
];

const bundledFonts: readonly BundledFont[] = [sampleCatalog[4], ...additionalFonts];
export const bundledFontsBySlug = new Map(bundledFonts.map(font => [font.slug, font]));
export const bundledFontFiles = new Map(bundledFonts.flatMap(({ filename, notice }) => [
  [filename, filename.endsWith('.ttf') ? 'font/ttf' : 'font/woff2'], [notice, 'text/plain; charset=utf-8'],
] as const));
