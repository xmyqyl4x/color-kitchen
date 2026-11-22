import type { Locale } from '../model/locales.js';

export type MessageBundles = Readonly<Record<Locale, Readonly<Record<string, string>>>>;

export const messages = {
  en: {
    'app.title': 'Color Kitchen',
    'palette.title': 'Palette Studio',
    'palette.swatches': '{count, plural, one {# swatch} other {# swatches}}',
    'contrast.title': 'Contrast Lab',
    'contrast.invalid': 'Enter a valid color for {field}.',
    'export.css': 'Download CSS',
    'consent.title': 'Cookie preferences',
    'consent.reject': 'Reject optional',
    'consent.analytics': 'Analytics',
    'inquiry.reference': 'Your request reference is {reference}.',
  },
  fr: {
    'app.title': 'Color Kitchen',
    'palette.title': 'Atelier de palettes',
    'palette.swatches': '{count, plural, one {# échantillon} other {# échantillons}}',
    'contrast.title': 'Laboratoire de contraste',
    'contrast.invalid': 'Saisissez une couleur valide pour {field}.',
    'export.css': 'Télécharger le CSS',
    'consent.title': 'Préférences de cookies',
    'consent.reject': 'Refuser les cookies facultatifs',
    'consent.analytics': 'Mesure d’audience',
    'inquiry.reference': 'La référence de votre demande est {reference}.',
  },
  es: {
    'app.title': 'Color Kitchen',
    'palette.title': 'Estudio de paletas',
    'palette.swatches': '{count, plural, one {# muestra} other {# muestras}}',
    'contrast.title': 'Laboratorio de contraste',
    'contrast.invalid': 'Introduce un color válido para {field}.',
    'export.css': 'Descargar CSS',
    'consent.title': 'Preferencias de cookies',
    'consent.reject': 'Rechazar las opcionales',
    'consent.analytics': 'Análisis',
    'inquiry.reference': 'La referencia de tu solicitud es {reference}.',
  },
  pt: {
    'app.title': 'Color Kitchen',
    'palette.title': 'Estúdio de paletas',
    'palette.swatches': '{count, plural, one {# amostra} other {# amostras}}',
    'contrast.title': 'Laboratório de contraste',
    'contrast.invalid': 'Introduza uma cor válida para {field}.',
    'export.css': 'Baixar CSS',
    'consent.title': 'Preferências de cookies',
    'consent.reject': 'Rejeitar os opcionais',
    'consent.analytics': 'Análise',
    'inquiry.reference': 'A referência do seu pedido é {reference}.',
  },
  de: {
    'app.title': 'Color Kitchen',
    'palette.title': 'Palettenstudio',
    'palette.swatches': '{count, plural, one {# Farbfeld} other {# Farbfelder}}',
    'contrast.title': 'Kontrastlabor',
    'contrast.invalid': 'Geben Sie für {field} eine gültige Farbe ein.',
    'export.css': 'CSS herunterladen',
    'consent.title': 'Cookie-Einstellungen',
    'consent.reject': 'Optionale Cookies ablehnen',
    'consent.analytics': 'Analyse',
    'inquiry.reference': 'Ihre Vorgangsnummer lautet {reference}.',
  },
} as const satisfies MessageBundles;

export type MessageKey = keyof typeof messages.en;
