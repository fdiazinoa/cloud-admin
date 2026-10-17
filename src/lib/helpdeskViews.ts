import type { HelpdeskTicketSortKey } from './helpdeskTicketOrganization';

/**
 * Vistas/colas del Helpdesk (modelo Zoho Desk).
 *
 * Las vistas son conjuntos de filtros con nombre: predefinidas (sistema) y
 * guardadas por el usuario. La persistencia usa `localStorage`; el key no va
 * por usuario porque el Helpdesk no expone el id del administrador en el
 * componente (PENDIENTE: key por usuario cuando esté disponible).
 */

export type HelpdeskQuickFilter = 'none' | 'critical' | 'unassigned';

export interface TicketViewFilters {
    mailboxFilter: 'active' | 'spam';
    filterStatus: string;
    filterSource: string;
    filterTeam: string;
    filterAssignee: string;
    filterCompany: string;
    filterContact: string;
    filterDateFrom: string;
    filterDateTo: string;
    quickFilter: HelpdeskQuickFilter;
    ticketSort: HelpdeskTicketSortKey;
}

export interface SavedTicketView {
    id: string;
    name: string;
    favorite: boolean;
    filters: TicketViewFilters;
}

export interface PredefinedTicketView {
    id: string;
    name: string;
    /** Al aplicar la vista solo se reescriben estos campos; el resto se resetea. */
    filters: Partial<TicketViewFilters>;
}

const STORAGE_KEY = 'cloud-admin:helpdesk:saved-views';

export const predefinedViews: PredefinedTicketView[] = [
    {
        id: 'open',
        name: 'Tickets abiertos',
        filters: { mailboxFilter: 'active', filterStatus: 'Abierto', filterSource: 'Todos', quickFilter: 'none' },
    },
    {
        id: 'all',
        name: 'Todos los tickets',
        filters: { mailboxFilter: 'active', filterStatus: 'Todos', filterSource: 'Todos', quickFilter: 'none' },
    },
    {
        id: 'critical',
        name: 'Críticos',
        filters: { mailboxFilter: 'active', filterStatus: 'Todos', filterSource: 'Todos', quickFilter: 'critical' },
    },
    {
        id: 'unassigned',
        name: 'Sin asignar',
        filters: { mailboxFilter: 'active', filterStatus: 'Todos', filterSource: 'Todos', quickFilter: 'unassigned' },
    },
    {
        id: 'spam',
        name: 'Spam',
        filters: { mailboxFilter: 'spam', filterStatus: 'Todos', filterSource: 'Todos', quickFilter: 'none' },
    },
];

export function loadSavedViews(): SavedTicketView[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (view): view is SavedTicketView =>
                Boolean(view && typeof (view as SavedTicketView).name === 'string' && (view as SavedTicketView).filters),
        );
    } catch {
        return [];
    }
}

export function saveSavedViews(views: SavedTicketView[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    } catch {
        // Almacenamiento no disponible (modo privado, cuota…). No bloquear la UI.
    }
}
