import type { Locale } from '../model/locales.js';

const errors = {
  en: { auth: 'Sign in to continue.', staff: 'This action requires catalog staff access.', invalid: 'Check the submitted fields and try again.',
    condition: 'Reload the revision before making changes.', stale: 'This revision has changed. Load the current version and review your changes.',
    conflict: 'This action conflicts with the current catalog state.', missing: 'The requested catalog record is unavailable.',
    translations: 'Complete the required translations before publishing.', provenance: 'Complete the source and license details before publishing.',
    effective: 'Enter a policy date that has already taken effect.', expired: 'Start the action again. The operation key has expired.',
    unavailable: 'Catalog administration is temporarily unavailable.' },
  fr: { auth: 'Connectez-vous pour continuer.', staff: 'Cette action est réservée à l’équipe du catalogue.', invalid: 'Vérifiez les champs saisis et réessayez.',
    condition: 'Rechargez la révision avant de la modifier.', stale: 'Cette révision a changé. Chargez la version actuelle et vérifiez vos modifications.',
    conflict: 'Cette action est incompatible avec l’état actuel du catalogue.', missing: 'La fiche demandée est indisponible.',
    translations: 'Complétez les traductions requises avant de publier.', provenance: 'Renseignez la source et la licence avant de publier.',
    effective: 'Saisissez une date d’entrée en vigueur déjà passée.', expired: 'Relancez l’action. La clé d’opération a expiré.',
    unavailable: 'L’administration du catalogue est temporairement indisponible.' },
  es: { auth: 'Inicia sesión para continuar.', staff: 'Esta acción requiere acceso como personal del catálogo.', invalid: 'Revisa los campos e inténtalo de nuevo.',
    condition: 'Vuelve a cargar la revisión antes de cambiarla.', stale: 'Esta revisión ha cambiado. Carga la versión actual y revisa tus cambios.',
    conflict: 'Esta acción entra en conflicto con el estado actual del catálogo.', missing: 'El registro solicitado no está disponible.',
    translations: 'Completa las traducciones requeridas antes de publicar.', provenance: 'Completa los datos de la fuente y la licencia antes de publicar.',
    effective: 'Introduce una fecha de entrada en vigor ya alcanzada.', expired: 'Repite la acción. La clave de operación ha caducado.',
    unavailable: 'La administración del catálogo no está disponible temporalmente.' },
  pt: { auth: 'Inicie sessão para continuar.', staff: 'Esta ação requer acesso da equipa do catálogo.', invalid: 'Verifique os campos enviados e tente novamente.',
    condition: 'Recarregue a revisão antes de a alterar.', stale: 'Esta revisão foi alterada. Carregue a versão atual e reveja as suas alterações.',
    conflict: 'Esta ação é incompatível com o estado atual do catálogo.', missing: 'O registo solicitado não está disponível.',
    translations: 'Complete as traduções obrigatórias antes de publicar.', provenance: 'Preencha os dados da fonte e da licença antes de publicar.',
    effective: 'Introduza uma data de entrada em vigor já atingida.', expired: 'Repita a ação. A chave da operação expirou.',
    unavailable: 'A administração do catálogo está temporariamente indisponível.' },
  de: { auth: 'Melden Sie sich an, um fortzufahren.', staff: 'Diese Aktion erfordert Zugriff als Katalogmitarbeiter.', invalid: 'Prüfen Sie Ihre Eingaben und versuchen Sie es erneut.',
    condition: 'Laden Sie die Revision neu, bevor Sie sie bearbeiten.', stale: 'Diese Revision wurde geändert. Laden Sie die aktuelle Version und prüfen Sie Ihre Änderungen.',
    conflict: 'Diese Aktion steht im Konflikt mit dem aktuellen Katalogstand.', missing: 'Der angeforderte Katalogeintrag ist nicht verfügbar.',
    translations: 'Vervollständigen Sie die erforderlichen Übersetzungen vor der Veröffentlichung.', provenance: 'Ergänzen Sie die Angaben zur Quelle und zur Lizenz.',
    effective: 'Geben Sie ein bereits wirksames Datum für die Richtlinie ein.', expired: 'Starten Sie die Aktion erneut. Der Vorgangsschlüssel ist abgelaufen.',
    unavailable: 'Die Katalogverwaltung ist vorübergehend nicht verfügbar.' },
};

type ErrorKey = keyof typeof errors.en;
const details: Record<string, ErrorKey> = { authentication_required: 'auth', origin_denied: 'staff', staff_required: 'staff',
  precondition_required: 'condition', stale_revision: 'stale', conflict: 'conflict', not_found: 'missing', missing_translations: 'translations',
  invalid_provenance: 'provenance', invalid_effective_date: 'effective', operation_expired: 'expired', catalog_admin_unavailable: 'unavailable' };

export function adminErrorMessage(locale: Locale, code: string) {
  return errors[locale][Object.hasOwn(details, code) ? details[code]! : 'invalid'];
}
