import { locales, type Locale } from '../model/locales.js';
import type { Screen } from './strings.js';

type Metadata = readonly [title: string, description: string];
type LocalizedMetadata = readonly [Metadata, Metadata, Metadata, Metadata, Metadata];

const pages = {
  '': [
    ['Color Palette Generator and Design Tools', 'Create color palettes, explore color combinations, extract colors from images, and check contrast with Color Kitchen’s free browser tools.'],
    ['Générateur de palettes et outils de création', 'Créez des palettes, explorez des associations de couleurs, extrayez les couleurs de vos images et vérifiez le contraste gratuitement.'],
    ['Generador de paletas y herramientas de diseño', 'Crea paletas, explora combinaciones de colores, extrae tonos de imágenes y comprueba el contraste con herramientas gratuitas.'],
    ['Gerador de paletas e ferramentas de design', 'Crie paletas, explore combinações, extraia cores de imagens e verifique o contraste com ferramentas gratuitas no navegador.'],
    ['Farbpaletten-Generator und Designwerkzeuge', 'Erstellen Sie Farbpaletten, entdecken Sie Farbkombinationen, extrahieren Sie Bildfarben und prüfen Sie Kontraste kostenlos im Browser.'],
  ],
  'palette-studio': [
    ['Color Palette Generator', 'Generate a color palette, lock your favorite swatches, assign design roles, and export your colors for your next project.'],
    ['Générateur de palettes de couleurs', 'Générez une palette, verrouillez vos couleurs préférées, attribuez des rôles et exportez les couleurs de votre projet.'],
    ['Generador de paletas de colores', 'Genera una paleta, bloquea tus colores favoritos, asigna roles de diseño y exporta los colores de tu proyecto.'],
    ['Gerador de paletas de cores', 'Gere uma paleta, fixe as suas cores preferidas, atribua funções de design e exporte as cores do seu projeto.'],
    ['Farbpaletten-Generator', 'Erzeugen Sie eine Farbpalette, fixieren Sie Lieblingsfarben, weisen Sie Farbrollen zu und exportieren Sie die Palette.'],
  ],
  palettes: [
    ['Color Palettes and Color Combinations', 'Browse curated color palettes by mood, hue, and color count. Open a palette to copy its color codes or edit it in Palette Studio.'],
    ['Palettes et associations de couleurs', 'Parcourez des palettes par ambiance, teinte ou nombre de couleurs. Ouvrez une palette pour copier ses codes ou la modifier.'],
    ['Paletas y combinaciones de colores', 'Explora paletas por ambiente, tono o número de colores. Abre una paleta para copiar sus códigos o editarla.'],
    ['Paletas e combinações de cores', 'Explore paletas por ambiente, tom ou número de cores. Abra uma paleta para copiar os códigos ou editá-la no estúdio.'],
    ['Farbpaletten und Farbkombinationen', 'Entdecken Sie Farbpaletten nach Stimmung, Farbton oder Anzahl der Farben. Öffnen Sie eine Palette zum Kopieren oder Bearbeiten.'],
  ],
  colors: [
    ['Named Colors and HEX Codes', 'Browse named colors by family, find the HEX code and CSS keyword for each shade, or enter a HEX code to find a close match.'],
    ['Noms de couleurs et codes HEX', 'Parcourez les couleurs par famille, retrouvez leurs codes HEX et noms CSS ou saisissez un code HEX pour trouver une teinte proche.'],
    ['Nombres de colores y códigos HEX', 'Explora colores por familia, consulta sus códigos HEX y nombres CSS o escribe un código HEX para encontrar un tono similar.'],
    ['Nomes de cores e códigos HEX', 'Explore cores por família, consulte os códigos HEX e nomes CSS ou introduza um código HEX para encontrar um tom semelhante.'],
    ['Farbnamen und HEX-Codes', 'Entdecken Sie benannte Farben nach Familie, finden Sie HEX-Codes und CSS-Namen oder suchen Sie per HEX-Code nach einem ähnlichen Farbton.'],
  ],
  gradients: [
    ['CSS Gradient Gallery', 'Explore linear, radial, and conic gradients. View the color stops, copy the CSS, or open a gradient in the editor.'],
    ['Galerie de dégradés CSS', 'Explorez des dégradés linéaires, radiaux et coniques. Consultez les étapes de couleur, copiez le CSS ou ouvrez un dégradé dans l’éditeur.'],
    ['Galería de degradados CSS', 'Explora degradados lineales, radiales y cónicos. Consulta sus paradas de color, copia el CSS o abre un degradado en el editor.'],
    ['Galeria de degradês CSS', 'Explore degradês lineares, radiais e cónicos. Consulte as paragens de cor, copie o CSS ou abra um degradê no editor.'],
    ['Galerie für CSS-Farbverläufe', 'Entdecken Sie lineare, radiale und konische Farbverläufe. Sehen Sie Farbstopps an, kopieren Sie CSS oder öffnen Sie einen Verlauf im Editor.'],
  ],
  fonts: [
    ['Free Fonts and Typeface Previews', 'Preview downloadable open-license fonts with your own text. Filter by style, weight, or script and find the license for each family.'],
    ['Polices libres avec aperçu', 'Essayez des polices libres avec votre propre texte. Filtrez par style, graisse ou système d’écriture et consultez chaque licence.'],
    ['Fuentes libres con vista previa', 'Prueba fuentes con licencia abierta y tu propio texto. Filtra por estilo, grosor o sistema de escritura y consulta cada licencia.'],
    ['Fontes livres com pré-visualização', 'Experimente fontes com licença aberta usando o seu texto. Filtre por estilo, peso ou sistema de escrita e consulte cada licença.'],
    ['Kostenlose Schriften mit Vorschau', 'Testen Sie frei lizenzierte Schriften mit eigenem Text. Filtern Sie nach Stil, Stärke oder Schriftsystem und lesen Sie die jeweilige Lizenz.'],
  ],
  contrast: [
    ['WCAG Color Contrast Checker', 'Check foreground and background colors against WCAG AA and AAA thresholds for normal and large text. Preview a suggested color adjustment.'],
    ['Vérificateur de contraste WCAG', 'Vérifiez le contraste du texte normal ou grand selon les seuils WCAG AA et AAA, puis prévisualisez une correction de couleur.'],
    ['Comprobador de contraste WCAG', 'Comprueba el contraste de texto normal o grande según los niveles WCAG AA y AAA y previsualiza una corrección de color.'],
    ['Verificador de contraste WCAG', 'Verifique o contraste de texto normal ou grande pelos critérios WCAG AA e AAA e pré-visualize uma correção de cor.'],
    ['WCAG-Farbkontrast prüfen', 'Prüfen Sie Vorder- und Hintergrundfarben nach WCAG AA und AAA für normalen und großen Text und testen Sie einen Korrekturvorschlag.'],
  ],
  'color-inspector': [
    ['Color Code Inspector and Converter', 'Preview a color and convert between HEX, RGB, HSL, OKLCH, and Display P3. Find the nearest named color and inspect its channels.'],
    ['Inspecteur et convertisseur de couleurs', 'Prévisualisez une couleur, convertissez-la entre HEX, RGB, HSL, OKLCH et Display P3 et trouvez la couleur nommée la plus proche.'],
    ['Inspector y conversor de colores', 'Previsualiza una muestra, convierte entre HEX, RGB, HSL, OKLCH y Display P3 y encuentra el color con nombre más cercano.'],
    ['Inspetor e conversor de cores', 'Pré-visualize uma cor, converta entre HEX, RGB, HSL, OKLCH e Display P3 e encontre a cor com nome mais próxima.'],
    ['Farbcode analysieren und umrechnen', 'Zeigen Sie Farben in der Vorschau, rechnen Sie HEX, RGB, HSL, OKLCH und Display P3 um und finden Sie ähnliche benannte Farben.'],
  ],
  'image-to-palette': [
    ['Color Palette from an Image', 'Extract a color palette from a photo. Crop the image, sample individual colors, and open the result in Palette Studio.'],
    ['Palette de couleurs depuis une image', 'Extrayez une palette depuis une photo. Recadrez l’image, prélevez des couleurs et ouvrez le résultat dans l’atelier.'],
    ['Paleta de colores a partir de una imagen', 'Extrae una paleta de una foto. Recorta la imagen, toma muestras y abre el resultado en el estudio de paletas.'],
    ['Paleta de cores a partir de uma imagem', 'Extraia uma paleta de uma fotografia. Recorte a imagem, recolha amostras e abra o resultado no estúdio.'],
    ['Farbpalette aus einem Bild erstellen', 'Extrahieren Sie eine Palette aus einem Foto. Schneiden Sie das Bild zu, wählen Sie einzelne Farben aus und bearbeiten Sie das Ergebnis.'],
  ],
  'design-preview': [
    ['Color Palette Design Preview', 'See your palette on landing pages, dashboards, editorial layouts, and shop cards. Preview light and dark themes and inspect text contrast.'],
    ['Aperçu de palettes en situation', 'Testez votre palette sur des pages d’accueil, tableaux de bord, articles et fiches produit, en mode clair ou sombre.'],
    ['Vista previa de paletas en diseños', 'Prueba tu paleta en páginas de inicio, paneles, diseños editoriales y fichas de producto con temas claros y oscuros.'],
    ['Pré-visualização de paletas em designs', 'Teste a sua paleta em páginas iniciais, painéis, modelos editoriais e cartões de produto com temas claros e escuros.'],
    ['Designvorschau für Farbpaletten', 'Testen Sie Ihre Palette auf Startseiten, in Dashboards, Artikeln und Produktkarten in heller und dunkler Darstellung.'],
  ],
  'gradient-studio': [
    ['CSS Gradient Generator', 'Create linear, radial, and conic gradients. Adjust color stops and interpolation, then copy CSS or export a preview.'],
    ['Générateur de dégradés CSS', 'Créez des dégradés linéaires, radiaux et coniques. Réglez les couleurs et leur interpolation, puis copiez le CSS ou exportez un aperçu.'],
    ['Generador de degradados CSS', 'Crea degradados lineales, radiales y cónicos. Ajusta las paradas y la interpolación, copia el CSS o exporta una vista previa.'],
    ['Gerador de degradês CSS', 'Crie degradês lineares, radiais e cónicos. Ajuste as cores e a interpolação, copie o CSS ou exporte uma pré-visualização.'],
    ['CSS-Farbverlauf-Generator', 'Erstellen Sie lineare, radiale und konische Verläufe. Bearbeiten Sie Farbstopps und Interpolation und kopieren Sie das CSS.'],
  ],
  'gradient-steps': [
    ['Gradient to Color Palette', 'Sample a gradient into discrete color steps. Adjust the number of samples and open the resulting palette for editing.'],
    ['Du dégradé à la palette de couleurs', 'Échantillonnez un dégradé en couleurs distinctes. Ajustez le nombre d’étapes et ouvrez la palette obtenue pour la modifier.'],
    ['Convierte un degradado en paleta', 'Toma muestras de un degradado en pasos separados. Ajusta su número y abre la paleta resultante para editarla.'],
    ['Converter um degradê em paleta', 'Retire amostras de um degradê em etapas distintas. Ajuste a quantidade e abra a paleta resultante para edição.'],
    ['Farbverlauf in eine Palette umwandeln', 'Wählen Sie einzelne Farbstufen aus einem Verlauf. Passen Sie die Anzahl an und öffnen Sie die Palette zur Bearbeitung.'],
  ],
  moodboard: [
    ['Moodboard Maker', 'Arrange images, swatches, and text on a moodboard. Try backgrounds and layouts, then export a visual reference for your project.'],
    ['Créateur de planches d’inspiration', 'Agencez des images, des couleurs et du texte. Essayez des fonds et des compositions avant d’exporter votre planche.'],
    ['Creador de tableros de inspiración', 'Combina imágenes, colores y texto. Prueba fondos y composiciones y exporta una referencia visual para tu proyecto.'],
    ['Criador de painéis de inspiração', 'Combine imagens, amostras de cores e texto. Experimente fundos e composições e exporte uma referência visual.'],
    ['Moodboard erstellen', 'Ordnen Sie Bilder, Farbmuster und Text an. Probieren Sie Hintergründe und Layouts aus und exportieren Sie Ihr Moodboard.'],
  ],
  tailwind: [
    ['Tailwind CSS Colors and Palette Generator', 'Browse Tailwind v3 and v4 color families, preview utility classes, and generate a custom 11-shade scale for your theme.'],
    ['Couleurs Tailwind CSS et générateur de palettes', 'Parcourez les couleurs de Tailwind v3 et v4, testez les classes utilitaires et générez une gamme de 11 nuances pour votre thème.'],
    ['Colores Tailwind CSS y generador de paletas', 'Explora las familias de Tailwind v3 y v4, prueba clases de utilidad y genera una escala de 11 tonos para tu tema.'],
    ['Cores Tailwind CSS e gerador de paletas', 'Explore as famílias de Tailwind v3 e v4, teste classes utilitárias e gere uma escala de 11 tons para o seu tema.'],
    ['Tailwind-CSS-Farben und Palettengenerator', 'Entdecken Sie die Farben von Tailwind v3 und v4, testen Sie Hilfsklassen und erstellen Sie eine eigene Skala mit 11 Abstufungen.'],
  ],
  'type-playground': [
    ['Typography Playground and Font Tester', 'Test fonts with your own text, adjust size, weight, spacing, and color, then export a sample or CSS.'],
    ['Atelier typographique et testeur de polices', 'Essayez des polices avec votre texte, réglez la taille, la graisse, l’espacement et la couleur, puis exportez un exemple ou le CSS.'],
    ['Laboratorio tipográfico y probador de fuentes', 'Prueba fuentes con tu texto, ajusta tamaño, grosor, espaciado y color y exporta una muestra o el CSS.'],
    ['Oficina tipográfica e testador de fontes', 'Teste fontes com o seu texto, ajuste tamanho, peso, espaçamento e cor e exporte uma amostra ou o CSS.'],
    ['Typografie-Werkstatt und Schrifttest', 'Testen Sie Schriften mit eigenem Text, passen Sie Größe, Stärke, Abstände und Farbe an und exportieren Sie ein Beispiel oder CSS.'],
  ],
  'color-guide': [
    ['Color Guide for Palettes and Contrast', 'Get guidance on building a palette, assigning color roles, and improving a text and background color pair.'],
    ['Guide des palettes et du contraste', 'Obtenez des conseils pour construire une palette, attribuer des rôles aux couleurs et améliorer le contraste entre le texte et son fond.'],
    ['Guía de paletas y contraste', 'Recibe orientación para crear una paleta, asignar roles a los colores y mejorar el contraste entre el texto y su fondo.'],
    ['Guia de paletas e contraste', 'Obtenha orientação para criar uma paleta, atribuir funções às cores e melhorar o contraste entre o texto e o fundo.'],
    ['Farbassistent für Paletten und Kontrast', 'Erhalten Sie Hilfe beim Erstellen einer Palette, beim Zuweisen von Farbrollen und beim Verbessern des Textkontrasts.'],
  ],
  contact: [
    ['Contact and Support', 'Contact Color Kitchen for product support, accessibility, privacy, or questions about licensing.'],
    ['Contact et assistance', 'Contactez Color Kitchen pour toute question sur l’assistance, l’accessibilité, la confidentialité ou les licences.'],
    ['Contacto y soporte', 'Contacta con Color Kitchen para consultas de soporte, accesibilidad, privacidad o licencias.'],
    ['Contacto e suporte', 'Contacte a Color Kitchen para questões de suporte, acessibilidade, privacidade ou licenciamento.'],
    ['Kontakt und Support', 'Kontaktieren Sie Color Kitchen bei Fragen zu Support, Barrierefreiheit, Datenschutz oder Lizenzen.'],
  ],
  advertise: [
    ['Advertising Inquiries', 'Read about advertising placements on Color Kitchen and send an advertising inquiry.'],
    ['Demandes publicitaires', 'Découvrez les emplacements publicitaires sur Color Kitchen et envoyez une demande.'],
    ['Consultas publicitarias', 'Consulta los espacios publicitarios de Color Kitchen y envía una consulta.'],
    ['Pedidos de publicidade', 'Consulte os espaços publicitários da Color Kitchen e envie um pedido de informação.'],
    ['Anfragen zu Werbeplätzen', 'Informieren Sie sich über Werbeplätze bei Color Kitchen und senden Sie eine Anfrage.'],
  ],
} as const satisfies Partial<Record<Screen, LocalizedMetadata>>;

export const publicScreens = Object.keys(pages) as (keyof typeof pages)[];

export function pageSeo(locale: Locale, screen: Screen): Metadata | undefined {
  return Object.hasOwn(pages, screen) ? pages[screen as keyof typeof pages][locales.indexOf(locale)] : undefined;
}

export function seoLabels(locale: Locale) {
  return [
    { breadcrumb: 'Breadcrumb', image: 'Color Kitchen wordmark above five color swatches', codes: 'Palette color codes',
      palette: 'Color Palette', gradient: 'CSS Gradient', font: 'Font Preview', collections: 'Browse collections' },
    { breadcrumb: 'Fil d’Ariane', image: 'Nom Color Kitchen au-dessus de cinq échantillons de couleur', codes: 'Codes des couleurs de la palette',
      palette: 'Palette de couleurs', gradient: 'Dégradé CSS', font: 'Aperçu de la police', collections: 'Explorer les collections' },
    { breadcrumb: 'Ruta de navegación', image: 'Nombre Color Kitchen sobre cinco muestras de color', codes: 'Códigos de color de la paleta',
      palette: 'Paleta de colores', gradient: 'Degradado CSS', font: 'Vista previa de la fuente', collections: 'Explorar colecciones' },
    { breadcrumb: 'Percurso de navegação', image: 'Nome Color Kitchen acima de cinco amostras de cor', codes: 'Códigos de cor da paleta',
      palette: 'Paleta de cores', gradient: 'Degradê CSS', font: 'Pré-visualização da fonte', collections: 'Explorar coleções' },
    { breadcrumb: 'Brotkrümelnavigation', image: 'Schriftzug Color Kitchen über fünf Farbmustern', codes: 'Farbcodes der Palette',
      palette: 'Farbpalette', gradient: 'CSS-Farbverlauf', font: 'Schriftvorschau', collections: 'Sammlungen entdecken' },
  ][locales.indexOf(locale)]!;
}

const globalKeywords: Record<Locale, string> = {
  en: 'color palette, color palettes, color scheme, color schemes, color combinations, color theme, color themes, color palette generator, color scheme generator, random color palette generator, ui color palette generator, color wheel generator, color palette from image, extract color palette from image, image color picker, color wheel, hex color wheel, color picker, hex color codes, color names, web color schemes, website color palette, ui color palette, brand color palette, complementary colors, analogous colors, triadic color scheme, monochromatic color palette, pastel color palette, vintage color palette, aesthetic color palette, neutral color palette, pretty colors',
  fr: 'palette de couleurs, palettes de couleurs, schéma de couleurs, schémas de couleurs, associations de couleurs, thème de couleurs, thèmes de couleurs, générateur de palettes de couleurs, générateur de schémas de couleurs, générateur aléatoire de palettes de couleurs, générateur de palette UI, générateur de roue chromatique, palette de couleurs depuis une image, extraire une palette de couleurs d’une image, pipette couleur sur image, roue chromatique, cercle chromatique hex, sélecteur de couleur, codes couleur hex, noms de couleurs, palettes web, palette de couleurs site web, palette de couleurs UI, palette de couleurs de marque, couleurs complémentaires, couleurs analogues, harmonie triadique, palette de couleurs monochromatique, palette de couleurs pastel, palette de couleurs vintage, palette de couleurs esthétique, palette de couleurs neutres, jolies couleurs',
  es: 'paleta de colores, paletas de colores, esquema de colores, esquemas de colores, combinaciones de colores, tema de colores, temas de colores, generador de paletas de colores, generador de esquemas de colores, generador aleatorio de paletas de colores, generador de paletas UI, generador de círculo cromático, paleta de colores a partir de una imagen, extraer paleta de colores de una imagen, selector de color de imagen, círculo cromático, rueda de colores hex, selector de color, códigos de color hex, nombres de colores, esquemas de colores web, paleta de colores para sitio web, paleta de colores UI, paleta de colores de marca, colores complementarios, colores análogos, esquema de colores triádico, paleta de colores monocromática, paleta de colores pastel, paleta de colores vintage, paleta de colores estética, paleta de colores neutros, colores bonitos',
  pt: 'paleta de cores, paletas de cores, esquema de cores, esquemas de cores, combinações de cores, tema de cores, temas de cores, gerador de paletas de cores, gerador de esquemas de cores, gerador aleatório de paletas de cores, gerador de paleta UI, gerador de círculo cromático, paleta de cores a partir de uma imagem, extrair paleta de cores de uma imagem, seletor de cores de imagem, círculo cromático, roda de cores hex, seletor de cores, códigos de cores hex, nomes de cores, esquemas de cores web, paleta de cores para site, paleta de cores UI, paleta de cores de marca, cores complementares, cores análogas, esquema de cores triádico, paleta de cores monocromática, paleta de cores pastel, paleta de cores vintage, paleta de cores estética, paleta de cores neutras, cores bonitas',
  de: 'Farbpalette, Farbpaletten, Farbschema, Farbschemata, Farbkombinationen, Farbthema, Farbthemen, Farbpaletten-Generator, Farbschema-Generator, Zufalls-Farbpaletten-Generator, UI-Farbpaletten-Generator, Farbkreis-Generator, Farbpalette aus Bild, Farbpalette aus Bild extrahieren, Bild-Farbwähler, Farbkreis, HEX-Farbkreis, Farbwähler, HEX-Farbcodes, Farbnamen, Web-Farbschemata, Website-Farbpalette, UI-Farbpalette, Marken-Farbpalette, Komplementärfarben, analoge Farben, triadisches Farbschema, monochromatische Farbpalette, Pastell-Farbpalette, Vintage-Farbpalette, ästhetische Farbpalette, neutrale Farbpalette, schöne Farben',
};

export function seoKeywords(locale: Locale) {
  return globalKeywords[locale];
}
