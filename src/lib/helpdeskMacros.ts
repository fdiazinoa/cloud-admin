/**
 * Macros del Helpdesk (modelo Zoho Desk "Aplicar macro").
 *
 * Una macro es un conjunto de campos a aplicar en un clic (estado, prioridad,
 * categoría, departamento, asignado, etiquetas) más un texto de respuesta
 * opcional. Solo se reutilizan los campos editables que ya expone el backend
 * (`mutableTicketFields` de helpdesk-api). Persistencia en `localStorage`.
 */

export interface HelpdeskMacroFields {
    status?: string;
    priority?: string;
    category?: string;
    team_id?: string | null;
    assignee_id?: string | null;
    tags?: string[];
}

export interface HelpdeskMacro {
    id: string;
    name: string;
    fields: HelpdeskMacroFields;
    /** Texto de respuesta que se precarga en el editor al aplicar la macro. */
    replyText?: string;
}

const STORAGE_KEY = 'cloud-admin:helpdesk:macros';

export function loadMacros(): HelpdeskMacro[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (macro): macro is HelpdeskMacro =>
                Boolean(macro && typeof (macro as HelpdeskMacro).name === 'string' && (macro as HelpdeskMacro).fields),
        );
    } catch {
        return [];
    }
}

export function saveMacros(macros: HelpdeskMacro[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(macros));
    } catch {
        // Almacenamiento no disponible. No bloquear la UI.
    }
}
