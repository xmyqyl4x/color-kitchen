import { messages } from '../i18n/messages.js';
import { locales, type Locale } from '../model/locales.js';

export const languageNames = { en: 'English', fr: 'Français', es: 'Español', pt: 'Português', de: 'Deutsch' } as const;
export const createRoutes = ['palette-studio', 'image-to-palette', 'contrast', 'design-preview', 'color-inspector',
  'gradient-studio', 'gradient-steps', 'moodboard', 'tailwind', 'type-playground', 'color-guide'] as const;
export const exploreRoutes = ['palettes', 'colors', 'gradients', 'fonts'] as const;
export const helpRoutes = ['licensing', 'terms', 'privacy', 'cookies', 'cookie-preferences', 'advertise', 'contact'] as const;
export const screenRoutes = ['', ...createRoutes, ...exploreRoutes, 'browser-companion', 'collection', ...helpRoutes] as const;
export type Screen = typeof screenRoutes[number];

const translations = {
  create: ['Create', 'Créer', 'Crear', 'Criar', 'Gestalten'],
  explore: ['Explore', 'Explorer', 'Explorar', 'Explorar', 'Entdecken'],
  browser: ['Browser tools', 'Outils de navigateur', 'Herramientas del navegador', 'Ferramentas do navegador', 'Browser-Werkzeuge'],
  help: ['About and Help', 'À propos et aide', 'Información y ayuda', 'Sobre e ajuda', 'Info und Hilfe'],
  language: ['Language', 'Langue', 'Idioma', 'Idioma', 'Sprache'],
  navigation: ['Main navigation', 'Navigation principale', 'Navegación principal', 'Navegação principal', 'Hauptnavigation'],
  skip: ['Skip to content', 'Aller au contenu', 'Saltar al contenido', 'Saltar para o conteúdo', 'Zum Inhalt springen'],
  heading: ['A good palette.\nA great beginning.', 'Une belle palette.\nUn beau départ.', 'Una buena paleta.\nUn gran comienzo.',
    'Uma boa paleta.\nUm ótimo começo.', 'Eine gute Palette.\nEin starker Anfang.'],
  intro: ['Find your colors, see them in action, and make something that feels like you.',
    'Trouvez vos couleurs, voyez-les en action et créez à votre image.',
    'Encuentra tus colores, pruébalos y crea algo a tu manera.',
    'Encontre as suas cores, veja-as em ação e crie algo com o seu estilo.',
    'Finden Sie Ihre Farben, sehen Sie sie im Einsatz und gestalten Sie etwas Eigenes.'],
  start: ['Create a palette', 'Créer une palette', 'Crear una paleta', 'Criar uma paleta', 'Palette erstellen'],
  browse: ['Explore palettes', 'Explorer les palettes', 'Explorar paletas', 'Explorar paletas', 'Paletten entdecken'],
  pair: ['Check a color pair', 'Vérifier deux couleurs', 'Comprobar dos colores', 'Verificar duas cores', 'Farbpaar prüfen'],
  artwork: ['Forest Study', 'Étude forestière', 'Estudio del bosque', 'Estudo da floresta', 'Waldstudie'],
  tryImage: ['Start with an image', 'Commencer par une image', 'Empezar con una imagen', 'Começar com uma imagem', 'Mit einem Bild beginnen'],
  more: ['Keep your colors. Change the view.', 'Gardez vos couleurs. Changez de perspective.', 'Conserva los colores. Cambia la vista.',
    'Mantenha as cores. Mude a perspetiva.', 'Gleiche Farben. Neue Perspektive.'],
  draft: ['Your active palette stays with you as you switch tools or languages.',
    'Votre palette active vous suit quand vous changez d’outil ou de langue.',
    'Tu paleta activa se conserva al cambiar de herramienta o idioma.',
    'A paleta ativa acompanha-o ao mudar de ferramenta ou idioma.',
    'Ihre aktive Palette bleibt beim Wechsel zwischen Werkzeugen und Sprachen erhalten.'],
  free: ['Color tools for everyone', 'Des outils de couleur pour tous', 'Herramientas de color para todos',
    'Ferramentas de cor para todos', 'Farbwerkzeuge für alle'],
  unavailable: ['This page is still in development.', 'Cette page est en cours de développement.', 'Esta página está en desarrollo.',
    'Esta página está em desenvolvimento.', 'Diese Seite ist noch in Entwicklung.'],
  unreleased: ['The browser extension is in development. It is not available to install yet.',
    'L’extension est en cours de développement. Son installation n’est pas encore disponible.',
    'La extensión está en desarrollo y aún no se puede instalar.',
    'A extensão está em desenvolvimento e ainda não pode ser instalada.',
    'Die Browser-Erweiterung ist in Entwicklung und kann noch nicht installiert werden.'],
  empty: ['There are no published entries yet.', 'Aucune entrée n’est encore publiée.', 'Aún no hay elementos publicados.',
    'Ainda não há itens publicados.', 'Es sind noch keine Einträge veröffentlicht.'],
  loadError: ['The catalog is temporarily unavailable.', 'Le catalogue est temporairement indisponible.',
    'El catálogo no está disponible temporalmente.', 'O catálogo está temporariamente indisponível.',
    'Der Katalog ist vorübergehend nicht verfügbar.'],
  missing: ['Page not found', 'Page introuvable', 'Página no encontrada', 'Página não encontrada', 'Seite nicht gefunden'],
  home: ['Home', 'Accueil', 'Inicio', 'Início', 'Startseite'],
  'image-to-palette': ['Image to Palette', 'Palette depuis une image', 'De imagen a paleta', 'De imagem a paleta', 'Bild in Palette'],
  'design-preview': ['Design Preview', 'Aperçu du design', 'Vista previa de diseño', 'Pré-visualização de design', 'Designvorschau'],
  'color-inspector': ['Color Inspector', 'Inspecteur de couleurs', 'Inspector de color', 'Inspetor de cor', 'Farbanalyse'],
  'gradient-studio': ['Gradient Studio', 'Atelier de dégradés', 'Estudio de degradados', 'Estúdio de degradês', 'Verlaufsstudio'],
  'gradient-steps': ['Gradient Steps', 'Étapes du dégradé', 'Pasos del degradado', 'Etapas do degradê', 'Verlaufsstufen'],
  moodboard: ['Moodboard Maker', 'Créateur de planches', 'Creador de moodboards', 'Criador de moodboards', 'Moodboard-Editor'],
  tailwind: ['Tailwind Studio', 'Atelier Tailwind', 'Estudio Tailwind', 'Estúdio Tailwind', 'Tailwind-Studio'],
  'type-playground': ['Type Playground', 'Atelier typographique', 'Laboratorio tipográfico', 'Oficina tipográfica', 'Schriftwerkstatt'],
  'color-guide': ['Color Guide', 'Guide des couleurs', 'Guía de color', 'Guia de cores', 'Farbassistent'],
  palettes: ['Palette Gallery', 'Galerie de palettes', 'Galería de paletas', 'Galeria de paletas', 'Palettengalerie'],
  colors: ['Color Atlas', 'Atlas des couleurs', 'Atlas de colores', 'Atlas de cores', 'Farbatlas'],
  gradients: ['Gradient Gallery', 'Galerie de dégradés', 'Galería de degradados', 'Galeria de degradês', 'Verlaufsgalerie'],
  fonts: ['Font Library', 'Bibliothèque de polices', 'Biblioteca de fuentes', 'Biblioteca de fontes', 'Schriftbibliothek'],
  'browser-companion': ['Browser Companion', 'Assistant de navigateur', 'Asistente del navegador', 'Assistente do navegador', 'Browser-Begleiter'],
  collection: ['My Collection', 'Ma collection', 'Mi colección', 'A minha coleção', 'Meine Sammlung'],
  licensing: ['Usage and Licensing', 'Utilisation et licences', 'Uso y licencias', 'Uso e licenciamento', 'Nutzung und Lizenzen'],
  terms: ['Terms of Use', 'Conditions d’utilisation', 'Condiciones de uso', 'Termos de utilização', 'Nutzungsbedingungen'],
  privacy: ['Privacy Notice', 'Avis de confidentialité', 'Aviso de privacidad', 'Aviso de privacidade', 'Datenschutzhinweis'],
  cookies: ['Cookie Notice', 'Avis relatif aux cookies', 'Aviso de cookies', 'Aviso de cookies', 'Cookie-Hinweis'],
  advertise: ['Advertise with Us', 'Annonceurs', 'Anúnciate con nosotros', 'Anuncie connosco', 'Werben mit uns'],
  contact: ['Get in Touch', 'Nous contacter', 'Contacto', 'Contacte-nos', 'Kontakt'],
} as const;

export function webText(locale: Locale, key: keyof typeof translations) {
  return translations[key][locales.indexOf(locale)]!;
}

export function screenTitle(locale: Locale, screen: Screen) {
  switch (screen) {
    case '': return 'Color Kitchen';
    case 'palette-studio': return messages[locale]['palette.title'];
    case 'contrast': return messages[locale]['contrast.title'];
    case 'cookie-preferences': return messages[locale]['consent.title'];
    default: return webText(locale, screen);
  }
}
