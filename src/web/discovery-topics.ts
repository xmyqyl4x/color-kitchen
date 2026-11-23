import type { ClientBase } from 'pg';
import { paletteMoods, type PaletteMood } from '../catalog/palette-moods.js';
import { gradientTypes, type GradientType } from '../gradient/gradient.js';
import { locales, type Locale } from '../model/locales.js';
import { discoveryText } from './discovery-text.js';

type TopicCopy = readonly [title: string, description: string];
type LocalizedTopic = readonly [TopicCopy, TopicCopy, TopicCopy, TopicCopy, TopicCopy];
export type DiscoveryTopic =
  | Readonly<{ screen: 'palettes'; section: 'moods'; filter: 'mood'; slug: PaletteMood }>
  | Readonly<{ screen: 'gradients'; section: 'types'; filter: 'type'; slug: GradientType }>;

const moods = {
  pastel: [
    ['Pastel Color Palettes', 'Explore soft pinks, blues, and greens for gentle backgrounds, illustrations, and stationery. Pair pale colors with darker text for clarity.'],
    ['Palettes de couleurs pastel', 'Explorez des roses, bleus et verts doux pour vos fonds, illustrations et papiers. Associez les teintes pâles à un texte plus foncé.'],
    ['Paletas de colores pastel', 'Explora rosas, azules y verdes suaves para fondos, ilustraciones y papelería. Combina los tonos claros con texto oscuro para facilitar la lectura.'],
    ['Paletas de cores pastel', 'Explore rosas, azuis e verdes suaves para fundos, ilustrações e papelaria. Use texto escuro sobre tons claros para facilitar a leitura.'],
    ['Pastellfarbpaletten', 'Entdecken Sie sanfte Rosa-, Blau- und Grüntöne für Hintergründe, Illustrationen und Papeterie. Dunkler Text bleibt auf hellen Tönen lesbar.'],
  ],
  earthy: [
    ['Earthy Color Palettes', 'Explore clay, sand, moss, and other natural colors. Use muted earth tones for warm backgrounds or add a deeper shade to bring out details.'],
    ['Palettes de tons terreux', 'Explorez des tons d’argile, de sable et de mousse. Créez un fond chaleureux ou ajoutez une nuance profonde pour faire ressortir les détails.'],
    ['Paletas de tonos tierra', 'Explora tonos de arcilla, arena y musgo. Úsalos en fondos cálidos o añade un tono más oscuro para resaltar los detalles.'],
    ['Paletas de tons terrosos', 'Explore tons de argila, areia e musgo. Use-os em fundos quentes ou acrescente um tom escuro para realçar os pormenores.'],
    ['Erdige Farbpaletten', 'Entdecken Sie natürliche Lehm-, Sand- und Moostöne für warme Hintergründe. Eine dunklere Farbe hebt Details hervor.'],
  ],
  bold: [
    ['Bold Color Palettes', 'Find saturated color combinations for posters, branding, and accents. Let one strong hue lead and use the others to create contrast.'],
    ['Palettes de couleurs audacieuses', 'Trouvez des associations saturées pour vos affiches, identités visuelles et accents. Faites dominer une teinte forte et utilisez les autres pour créer du contraste.'],
    ['Paletas de colores atrevidos', 'Encuentra combinaciones saturadas para carteles, marcas y acentos. Da protagonismo a un tono fuerte y contrástalo con los demás.'],
    ['Paletas de cores ousadas', 'Encontre combinações saturadas para cartazes, marcas e realces. Escolha uma cor dominante e crie contraste com as restantes.'],
    ['Kräftige Farbpaletten', 'Entdecken Sie satte Kombinationen für Plakate, Marken und Akzente. Lassen Sie einen starken Farbton führen und setzen Sie Kontraste.'],
  ],
  moody: [
    ['Moody Color Palettes', 'Discover deep greens, blues, and purples for atmospheric layouts. Try a light accent against a dark base to draw attention.'],
    ['Palettes de couleurs sombres', 'Découvrez des verts, bleus et violets profonds pour des compositions intimistes. Un accent clair sur un fond sombre attire le regard.'],
    ['Paletas de colores sombríos', 'Descubre verdes, azules y violetas profundos para diseños evocadores. Prueba un acento claro sobre una base oscura para atraer la mirada.'],
    ['Paletas de cores sombrias', 'Descubra verdes, azuis e violetas profundos para composições intimistas. Experimente um realce claro sobre uma base escura.'],
    ['Düstere Farbpaletten', 'Entdecken Sie tiefe Grün-, Blau- und Violetttöne für stimmungsvolle Layouts. Ein heller Akzent auf dunkler Basis zieht den Blick an.'],
  ],
  minimal: [
    ['Minimal Color Palettes', 'Browse restrained combinations of neutrals and subtle accents. Use shifts in lightness to distinguish surfaces, text, and controls.'],
    ['Palettes de couleurs minimalistes', 'Parcourez des associations de tons neutres et d’accents discrets. Variez la luminosité pour distinguer les surfaces, le texte et les commandes.'],
    ['Paletas de colores minimalistas', 'Explora combinaciones de tonos neutros y acentos sutiles. Varía la luminosidad para distinguir superficies, textos y controles.'],
    ['Paletas de cores minimalistas', 'Explore combinações de tons neutros e realces discretos. Varie a luminosidade para distinguir superfícies, texto e controlos.'],
    ['Minimalistische Farbpaletten', 'Entdecken Sie Kombinationen aus neutralen Tönen und dezenten Akzenten. Helligkeitsunterschiede trennen Flächen, Texte und Bedienelemente.'],
  ],
  retro: [
    ['Retro Color Palettes', 'Explore vintage-inspired combinations of muted primaries, mustard, and cream for packaging, prints, and illustrations.'],
    ['Palettes de couleurs rétro', 'Explorez des associations vintage de couleurs primaires atténuées, de moutarde et de crème pour vos emballages, imprimés et illustrations.'],
    ['Paletas de colores retro', 'Explora combinaciones de inspiración vintage con primarios apagados, mostaza y crema para envases, impresos e ilustraciones.'],
    ['Paletas de cores retro', 'Explore combinações de inspiração vintage com cores primárias suaves, mostarda e creme para embalagens, impressos e ilustrações.'],
    ['Retro-Farbpaletten', 'Entdecken Sie gedämpfte Primärfarben, Senfgelb und Creme im Vintage-Stil für Verpackungen, Drucksachen und Illustrationen.'],
  ],
  fresh: [
    ['Fresh Color Palettes', 'Find bright greens, clean blues, and light accents for an airy look. Try stronger shades on buttons and lighter ones on larger surfaces.'],
    ['Palettes de couleurs fraîches', 'Trouvez des verts lumineux, des bleus nets et des accents clairs. Essayez des nuances fortes sur les boutons et plus douces sur les grandes surfaces.'],
    ['Paletas de colores frescos', 'Encuentra verdes vivos, azules claros y acentos luminosos. Prueba tonos intensos en botones y suaves en superficies grandes.'],
    ['Paletas de cores frescas', 'Encontre verdes vivos, azuis nítidos e realces claros. Experimente tons intensos em botões e suaves em superfícies grandes.'],
    ['Frische Farbpaletten', 'Entdecken Sie lebendige Grün- und klare Blautöne mit hellen Akzenten. Kräftige Töne passen zu Schaltflächen, helle zu großen Flächen.'],
  ],
  warm: [
    ['Warm Color Palettes', 'Browse combinations of reds, oranges, golds, and warm neutrals. Use one of the deeper shades to balance a bright accent.'],
    ['Palettes de couleurs chaudes', 'Parcourez des associations de rouges, d’oranges, de dorés et de neutres chauds. Équilibrez un accent vif avec une teinte plus profonde.'],
    ['Paletas de colores cálidos', 'Explora combinaciones de rojos, naranjas, dorados y neutros cálidos. Equilibra un acento brillante con un tono más profundo.'],
    ['Paletas de cores quentes', 'Explore combinações de vermelhos, laranjas, dourados e neutros quentes. Equilibre um realce vivo com um tom mais profundo.'],
    ['Warme Farbpaletten', 'Entdecken Sie Rot, Orange, Gold und warme Neutraltöne. Gleichen Sie einen leuchtenden Akzent mit einem tieferen Ton aus.'],
  ],
} as const satisfies Record<PaletteMood, LocalizedTopic>;

const gradients = {
  linear: [
    ['Linear CSS Gradients', 'Explore gradients that blend along a line. Check the direction and color stops before using one on a background or banner.'],
    ['Dégradés CSS linéaires', 'Explorez des dégradés qui suivent une ligne. Consultez leur direction et leurs étapes de couleur pour choisir un fond ou une bannière.'],
    ['Degradados CSS lineales', 'Explora degradados que se mezclan a lo largo de una línea. Revisa la dirección y las paradas antes de usarlos en fondos o banners.'],
    ['Degradês CSS lineares', 'Explore degradês que se misturam ao longo de uma linha. Consulte a direção e as paragens de cor antes de os usar em fundos ou faixas.'],
    ['Lineare CSS-Farbverläufe', 'Entdecken Sie Farbverläufe entlang einer Linie. Prüfen Sie Richtung und Farbstopps für Hintergründe oder Banner.'],
  ],
  radial: [
    ['Radial CSS Gradients', 'Explore gradients that spread outward from a center. Use the bright point as a spotlight or shift the center to add depth to a background.'],
    ['Dégradés CSS radiaux', 'Explorez des dégradés qui rayonnent depuis un centre. Créez un halo lumineux ou déplacez le centre pour donner de la profondeur à un fond.'],
    ['Degradados CSS radiales', 'Explora degradados que se expanden desde un centro. Usa el punto luminoso como foco o desplaza el centro para dar profundidad al fondo.'],
    ['Degradês CSS radiais', 'Explore degradês que se expandem a partir de um centro. Use o ponto luminoso como foco ou desloque o centro para dar profundidade ao fundo.'],
    ['Radiale CSS-Farbverläufe', 'Entdecken Sie Verläufe, die sich von einem Mittelpunkt ausbreiten. Setzen Sie einen Lichtpunkt oder verschieben Sie den Mittelpunkt für mehr Tiefe.'],
  ],
  conic: [
    ['Conic CSS Gradients', 'Explore gradients that sweep around a center. Inspect the color stops for circular accents, soft color wheels, or animated backgrounds.'],
    ['Dégradés CSS coniques', 'Explorez des dégradés qui tournent autour d’un centre. Consultez leurs étapes pour créer des accents circulaires, des roues de couleurs ou des fonds animés.'],
    ['Degradados CSS cónicos', 'Explora degradados que giran alrededor de un centro. Revisa las paradas para crear acentos circulares, ruedas de color o fondos animados.'],
    ['Degradês CSS cónicos', 'Explore degradês que giram em torno de um centro. Consulte as paragens para criar realces circulares, rodas de cor ou fundos animados.'],
    ['Konische CSS-Farbverläufe', 'Entdecken Sie Farbverläufe rund um einen Mittelpunkt. Prüfen Sie die Farbstopps für kreisförmige Akzente, Farbräder oder animierte Hintergründe.'],
  ],
} as const satisfies Record<GradientType, LocalizedTopic>;

const topics: readonly DiscoveryTopic[] = [
  ...(Object.keys(moods) as PaletteMood[]).map(slug => ({ screen: 'palettes', section: 'moods', filter: 'mood', slug } as const)),
  ...gradientTypes.map(slug => ({ screen: 'gradients', section: 'types', filter: 'type', slug } as const)),
];

export const topicPath = (locale: Locale, topic: DiscoveryTopic) => `/${locale}/${topic.screen}/${topic.section}/${topic.slug}`;
export const topicLabel = (locale: Locale, topic: DiscoveryTopic) =>
  topic.screen === 'palettes' ? paletteMoods[topic.slug][locale] : discoveryText(locale, topic.slug);
export const topicSeo = (locale: Locale, topic: DiscoveryTopic): TopicCopy =>
  (topic.screen === 'palettes' ? moods[topic.slug] : gradients[topic.slug])[locales.indexOf(locale)]!;

export function discoveryTopic(screen: string, section?: string, slug?: string) {
  return topics.find(topic => topic.screen === screen && topic.section === section && topic.slug === slug);
}

export async function publishedDiscoveryTopics(client: ClientBase) {
  const { rows } = await client.query<{ screen: string; slug: string }>(`
    SELECT DISTINCT 'palettes' AS screen, t.slug FROM ck.published_catalog AS c
    JOIN ck.catalog_revision_tag AS r ON r.item_id=c.item_id AND r.rev=c.rev
    JOIN ck.tag AS t ON t.tag_id=r.tag_id
    WHERE c.kind='palette' AND c.locale='en' AND t.facet='mood'
    UNION
    SELECT DISTINCT 'gradients', c.payload->>'type'
    FROM ck.published_catalog AS c WHERE c.kind='gradient' AND c.locale='en'
  `);
  return topics.filter(topic => rows.some(row => row.screen === topic.screen && row.slug === topic.slug));
}
