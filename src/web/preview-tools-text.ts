import type { Locale } from '../model/locales.js';
import { translate, type Translation } from './ui.js';

const text = {
  template: ['Template', 'Modèle', 'Plantilla', 'Modelo', 'Vorlage'],
  landing: ['Landing page', 'Page d’accueil', 'Página de inicio', 'Página inicial', 'Startseite'],
  dashboard: ['Dashboard', 'Tableau de bord', 'Panel', 'Painel', 'Übersicht'],
  editorial: ['Editorial', 'Éditorial', 'Editorial', 'Editorial', 'Redaktion'],
  'shop-card': ['Shop card', 'Fiche produit', 'Ficha de producto', 'Ficha de produto', 'Produktkarte'],
  light: ['Light', 'Clair', 'Claro', 'Claro', 'Hell'],
  dark: ['Dark', 'Sombre', 'Oscuro', 'Escuro', 'Dunkel'],
  desktop: ['Desktop', 'Bureau', 'Escritorio', 'Computador', 'Desktop'],
  mobile: ['Mobile', 'Mobile', 'Móvil', 'Móvel', 'Mobil'],
  theme: ['Theme', 'Thème', 'Tema', 'Tema', 'Darstellung'],
  size: ['Preview size', 'Taille de l’aperçu', 'Tamaño de vista previa', 'Tamanho da pré-visualização', 'Vorschaugröße'],
  reset: ['Reset role mapping', 'Réinitialiser les rôles', 'Restablecer roles', 'Repor funções', 'Rollen zurücksetzen'],
  default: ['Template default', 'Valeur du modèle', 'Valor de la plantilla', 'Valor do modelo', 'Vorlagenstandard'],
  pairs: ['Inspect text contrast', 'Inspecter le contraste du texte', 'Inspeccionar contraste del texto', 'Inspecionar contraste do texto', 'Textkontrast prüfen'],
  image: ['Download preview PNG', 'Télécharger l’aperçu PNG', 'Descargar vista previa PNG', 'Descarregar pré-visualização PNG', 'Vorschau-PNG laden'],
  tokens: ['Download role tokens', 'Télécharger les jetons de rôle', 'Descargar tokens de rol', 'Descarregar tokens de função', 'Rollentokens laden'],
  token: ['Token name', 'Nom du jeton', 'Nombre del token', 'Nome do token', 'Tokenname'],
  base: ['Base swatch', 'Couleur de base', 'Muestra base', 'Amostra base', 'Grundfarbe'],
  anchor: ['Pinned shade', 'Nuance fixe', 'Tono fijado', 'Tom fixo', 'Fixierte Abstufung'],
  override: ['Override shade', 'Remplacer la nuance', 'Modificar el tono', 'Substituir tom', 'Abstufung überschreiben'],
  overrideColor: ['Override color', 'Couleur de remplacement', 'Color de reemplazo', 'Cor de substituição', 'Ersatzfarbe'],
  clear: ['Clear override', 'Effacer le remplacement', 'Quitar el reemplazo', 'Limpar substituição', 'Überschreibung löschen'],
  unavailable: ['Use a valid token name, base, or color. The pinned shade stays unchanged.',
    'Vérifiez le nom, la base ou la couleur. La nuance fixe est conservée.',
    'Revisa el nombre, base o color. El tono fijado se conserva.',
    'Verifique o nome, a base ou a cor. O tom fixo mantém-se.',
    'Prüfen Sie Name, Grund- oder Ersatzfarbe. Die fixierte Abstufung bleibt unverändert.'],
} as const satisfies Record<string, Translation>;
export const previewToolsText = (locale: Locale, key: keyof typeof text) => translate(locale, text[key]);
