export type HelpdeskTicketSortKey =
    | 'activity_desc'
    | 'ticket_desc'
    | 'ticket_asc'
    | 'created_desc'
    | 'created_asc'
    | 'company_asc'
    | 'company_desc'
    | 'priority_desc';

export interface OrganizableHelpdeskTicket {
    id: string;
    ticket_number?: number | null;
    tenant_name?: string | null;
    contact?: { company_name?: string | null } | null;
    priority?: string | null;
    created_at: string;
    updated_at?: string | null;
}

export const UNKNOWN_HELPDESK_COMPANY = 'Empresa no identificada';

export function getHelpdeskCompanyName(ticket: OrganizableHelpdeskTicket) {
    const contactCompany = ticket.contact?.company_name?.trim();
    if (contactCompany) return contactCompany;

    const tenantName = ticket.tenant_name?.trim();
    if (tenantName && tenantName !== 'Sin tenant asignado') return tenantName;

    return UNKNOWN_HELPDESK_COMPANY;
}

export function getHelpdeskLastActivityAt(ticket: OrganizableHelpdeskTicket, previewCreatedAt?: string | null) {
    return previewCreatedAt || ticket.updated_at || ticket.created_at;
}

function toTimestamp(value?: string | null) {
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareNullableTicketNumbers(
    left?: number | null,
    right?: number | null,
    direction: 'asc' | 'desc' = 'asc',
) {
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return direction === 'asc' ? left - right : right - left;
}

const priorityRank: Record<string, number> = {
    Critica: 4,
    Alta: 3,
    Media: 2,
    Baja: 1,
};

function compareCompanies(left: OrganizableHelpdeskTicket, right: OrganizableHelpdeskTicket, direction: 'asc' | 'desc') {
    const leftCompany = getHelpdeskCompanyName(left);
    const rightCompany = getHelpdeskCompanyName(right);
    if (leftCompany === UNKNOWN_HELPDESK_COMPANY && rightCompany === UNKNOWN_HELPDESK_COMPANY) return 0;
    if (leftCompany === UNKNOWN_HELPDESK_COMPANY) return 1;
    if (rightCompany === UNKNOWN_HELPDESK_COMPANY) return -1;

    return direction === 'asc'
        ? leftCompany.localeCompare(rightCompany, 'es', { sensitivity: 'base', numeric: true })
        : rightCompany.localeCompare(leftCompany, 'es', { sensitivity: 'base', numeric: true });
}

export function sortHelpdeskTickets<T extends OrganizableHelpdeskTicket>(
    tickets: T[],
    sortKey: HelpdeskTicketSortKey,
    getPreviewCreatedAt: (ticketId: string) => string | null | undefined = () => null,
) {
    const activityTimestamp = (ticket: T) => toTimestamp(getHelpdeskLastActivityAt(ticket, getPreviewCreatedAt(ticket.id)));
    const createdTimestamp = (ticket: T) => toTimestamp(ticket.created_at);
    const activityFallback = (left: T, right: T) => activityTimestamp(right) - activityTimestamp(left);

    return [...tickets].sort((left, right) => {
        let result = 0;

        if (sortKey === 'ticket_desc') result = compareNullableTicketNumbers(left.ticket_number, right.ticket_number, 'desc');
        else if (sortKey === 'ticket_asc') result = compareNullableTicketNumbers(left.ticket_number, right.ticket_number, 'asc');
        else if (sortKey === 'created_desc') result = createdTimestamp(right) - createdTimestamp(left);
        else if (sortKey === 'created_asc') result = createdTimestamp(left) - createdTimestamp(right);
        else if (sortKey === 'company_asc') result = compareCompanies(left, right, 'asc');
        else if (sortKey === 'company_desc') result = compareCompanies(left, right, 'desc');
        else if (sortKey === 'priority_desc') result = (priorityRank[right.priority ?? ''] ?? 0) - (priorityRank[left.priority ?? ''] ?? 0);
        else result = activityFallback(left, right);

        return result || activityFallback(left, right) || left.id.localeCompare(right.id);
    });
}
