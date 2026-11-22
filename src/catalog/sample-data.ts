import type { CatalogSeed } from './seed.js';

export const sampleCatalog = [
  {
    itemId: '4797455b-47a7-43cb-9ad2-f9fbf5d8af01', kind: 'palette', slug: 'forest-study', revision: 1, featuredRank: 0,
    colors: ['#213C35', '#6F8F7B', '#E4B363', '#E9DED0', '#F8F5EF'],
    translations: {
      en: { title: 'Forest Study', summary: 'Evergreen, sage and gold on a warm paper background.' },
      fr: { title: 'Étude forestière', summary: 'Vert profond, sauge et or sur un fond de papier chaud.' },
      es: { title: 'Estudio del bosque', summary: 'Verde oscuro, salvia y oro sobre papel de tono cálido.' },
      pt: { title: 'Estudo da floresta', summary: 'Verde escuro, sálvia e ouro sobre papel de tom quente.' },
      de: { title: 'Waldstudie', summary: 'Dunkelgrün, Salbei und Gold auf warmem Papier.' },
    },
  },
  {
    itemId: '4797455b-47a7-43cb-9ad2-f9fbf5d8af02', kind: 'palette', slug: 'morning-stone', revision: 1, featuredRank: 1,
    colors: ['#324B3F', '#788F96', '#D49B70', '#E2D2C2', '#F5F1E9'],
    translations: {
      en: { title: 'Morning Stone', summary: 'Cool stone grays meet warm terracotta and linen.' },
      fr: { title: 'Pierre du matin', summary: 'Des gris froids rencontrent la terre cuite et le lin.' },
      es: { title: 'Piedra matinal', summary: 'Grises fríos con terracota cálida y lino.' },
      pt: { title: 'Pedra matinal', summary: 'Tons frios de cinza com terracota e linho.' },
      de: { title: 'Morgenstein', summary: 'Kühles Steingrau trifft auf Terrakotta und Leinen.' },
    },
  },
  {
    itemId: '4797455b-47a7-43cb-9ad2-f9fbf5d8af03', kind: 'gradient', slug: 'forest-to-gold', revision: 1, featuredRank: 0,
    angle: 135, stops: [{ position: 0, hex: '#213C35' }, { position: 0.55, hex: '#6F8F7B' }, { position: 1, hex: '#E4B363' }],
    translations: {
      en: { title: 'Forest to Gold', summary: 'A diagonal gradient from evergreen through sage to gold.' },
      fr: { title: 'De la forêt à l’or', summary: 'Un dégradé diagonal du vert profond à l’or en passant par la sauge.' },
      es: { title: 'Del bosque al oro', summary: 'Un degradado diagonal de verde oscuro a oro pasando por salvia.' },
      pt: { title: 'Da floresta ao ouro', summary: 'Um degradê diagonal de verde escuro a ouro, passando por sálvia.' },
      de: { title: 'Von Waldgrün zu Gold', summary: 'Ein diagonaler Verlauf von Dunkelgrün über Salbei zu Gold.' },
    },
  },
  {
    itemId: '4797455b-47a7-43cb-9ad2-f9fbf5d8af04', kind: 'color', slug: 'black', revision: 1, featuredRank: 0,
    keyword: 'black', hex: '#000000', sourceUri: 'https://www.w3.org/TR/css-color-4/#named-colors',
    translations: {
      en: { title: 'Black', summary: 'The CSS keyword black resolves to #000000.' },
      fr: { title: 'Noir', summary: 'Le mot-clé CSS black correspond à #000000.' },
      es: { title: 'Negro', summary: 'La palabra clave de CSS black corresponde a #000000.' },
      pt: { title: 'Preto', summary: 'A palavra-chave CSS black corresponde a #000000.' },
      de: { title: 'Schwarz', summary: 'Das CSS-Schlüsselwort black steht für #000000.' },
    },
  },
  {
    itemId: '4797455b-47a7-43cb-9ad2-f9fbf5d8af05', kind: 'font', slug: 'source-sans-3', revision: 1, featuredRank: 0,
    family: 'Source Sans 3', sourceVersion: '3.052R',
    sourceUri: 'https://github.com/adobe-fonts/source-sans/releases/tag/3.052R',
    sourceDigest: '53492fb3a0def77354f166a55d09b63a10855e91c206c7620a81cf56e97f8ec3',
    licenseUri: 'https://github.com/adobe-fonts/source-sans/blob/3.052R/LICENSE.md', licenseId: 'OFL-1.1',
    attribution: 'Adobe, Source Sans 3 by Paul D. Hunt', filename: 'SourceSans3-Regular.woff2',
    notice: 'SourceSans3-OFL.txt', scripts: ['Latn'], weight: 400,
    translations: {
      en: { title: 'Source Sans 3', summary: 'Regular weight of a sans serif designed for interfaces.' },
      fr: { title: 'Source Sans 3', summary: 'La graisse normale d’une sans sérif conçue pour les interfaces.' },
      es: { title: 'Source Sans 3', summary: 'El peso regular de una sans serif diseñada para interfaces.' },
      pt: { title: 'Source Sans 3', summary: 'O peso regular de uma fonte sem serifa para interfaces.' },
      de: { title: 'Source Sans 3', summary: 'Der Normalschnitt einer serifenlosen Schrift für Oberflächen.' },
    },
  },
] as const satisfies readonly CatalogSeed[];
