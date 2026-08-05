import { supabase } from './supabase';

export type HelpdeskReplyMode = 'reply' | 'reply_all' | 'forward';

export interface HelpdeskAgentOption {
    id: string;
    full_name: string;
    email: string;
    status: string;
    helpdesk_all_departments?: boolean;
    support_team_members?: Array<{ team_id: string }>;
}

export interface HelpdeskTeamOption {
    id: string;
    code: string;
    name: string;
    description?: string | null;
}

export interface HelpdeskReplyTemplate {
    id: string;
    name: string;
    body: string;
    category?: string | null;
    shortcut?: string | null;
}

export interface HelpdeskDraft {
    ticket_id: string;
    admin_user_id: string;
    body: string;
    mode: HelpdeskReplyMode;
    cc: string[];
    bcc: string[];
    forward_to?: string | null;
    attachments?: unknown[];
    updated_at: string;
}

export interface HelpdeskPresence {
    admin_user_id: string;
    last_seen_at: string;
    cloud_admin_users?: { id: string; full_name: string; email: string } | Array<{ id: string; full_name: string; email: string }> | null;
}

export interface HelpdeskTicketUnreadState {
    ticket_id: string;
    last_customer_message_at?: string | null;
    last_read_at?: string | null;
    is_unread: boolean;
}

interface HelpdeskBootstrapResponse {
    tickets: unknown[];
    agents: HelpdeskAgentOption[];
    teams: HelpdeskTeamOption[];
    templates: HelpdeskReplyTemplate[];
    previews: unknown[];
    unread_states: HelpdeskTicketUnreadState[];
    actor_access: {
        all_departments: boolean;
        department_ids: string[];
    };
}

interface FunctionErrorPayload {
    error?: string;
    detail?: string;
}

async function invokeFunction<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error) {
        let detail = error.message;
        const context = error.context as Response | undefined;
        if (context?.clone) {
            const payload = await context.clone().json().catch(() => null) as FunctionErrorPayload | null;
            detail = payload?.detail || payload?.error || detail;
        }
        throw new Error(detail);
    }
    return data as T;
}

export async function invokeHelpdesk<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    return invokeFunction<T>('helpdesk-api', { action, ...payload });
}

export async function fetchHelpdeskBootstrap(query = '') {
    const response = await invokeHelpdesk<Partial<HelpdeskBootstrapResponse> | null>('bootstrap', { query });
    const actorAccess = response?.actor_access;

    if (!actorAccess || typeof actorAccess.all_departments !== 'boolean' || !Array.isArray(actorAccess.department_ids)) {
        throw new Error('El servicio del HelpDesk está desactualizado. Recarga la página e intenta nuevamente.');
    }

    return {
        tickets: Array.isArray(response.tickets) ? response.tickets : [],
        agents: Array.isArray(response.agents) ? response.agents : [],
        teams: Array.isArray(response.teams) ? response.teams : [],
        templates: Array.isArray(response.templates) ? response.templates : [],
        previews: Array.isArray(response.previews) ? response.previews : [],
        unread_states: Array.isArray(response.unread_states) ? response.unread_states : [],
        actor_access: actorAccess,
    } satisfies HelpdeskBootstrapResponse;
}

export async function fetchHelpdeskTicketSnapshot(ticketId: string) {
    return invokeHelpdesk<{
        ticket: unknown | null;
        preview: unknown | null;
        unread_state: HelpdeskTicketUnreadState | null;
    }>('ticket_snapshot', { ticket_id: ticketId });
}

export async function markHelpdeskTicketRead(ticketId: string) {
    return invokeHelpdesk<HelpdeskTicketUnreadState>('mark_read', { ticket_id: ticketId });
}

export async function fetchSupportMessages(ticketId: string) {
    return invokeFunction<{ messages?: unknown[] }>('get-support-messages', { ticket_id: ticketId });
}

export async function updateHelpdeskTicket(ticketId: string, fields: Record<string, unknown>) {
    return invokeHelpdesk<{ ticket: Record<string, unknown> }>('update_ticket', { ticket_id: ticketId, fields });
}

export async function bulkUpdateHelpdeskTickets(ticketIds: string[], fields: Record<string, unknown>) {
    return invokeHelpdesk<{ updated_ids: string[] }>('bulk_update', { ticket_ids: ticketIds, fields });
}

export async function addPrivateHelpdeskNote(ticketId: string, body: string) {
    return invokeHelpdesk<{ message: Record<string, unknown> }>('add_note', { ticket_id: ticketId, body });
}

export async function addPublicHelpdeskReply(ticketId: string, body: string, attachments: UploadedHelpdeskAttachment[]) {
    return invokeHelpdesk<{ message: Record<string, unknown> }>('add_public_reply', {
        ticket_id: ticketId,
        body,
        attachments,
    });
}

export async function saveHelpdeskContact(ticketId: string, fields: Record<string, unknown>) {
    return invokeHelpdesk<{
        contact: Record<string, unknown>;
        assignment_status: string;
    }>('save_contact', { ticket_id: ticketId, fields });
}

export async function createHelpdeskImprovement(ticketId: string, fields: Record<string, unknown>) {
    return invokeHelpdesk<{
        improvement_id: string;
        already_existed: boolean;
        message: string;
    }>('create_improvement', { ticket_id: ticketId, fields });
}

export async function saveHelpdeskDraft(ticketId: string, draft: {
    body: string;
    mode: HelpdeskReplyMode;
    cc: string[];
    bcc: string[];
    forwardTo: string;
    attachments?: unknown[];
}) {
    return invokeHelpdesk<{ draft: HelpdeskDraft | null }>('save_draft', {
        ticket_id: ticketId,
        body: draft.body,
        mode: draft.mode,
        cc: draft.cc,
        bcc: draft.bcc,
        forward_to: draft.forwardTo,
        attachments: draft.attachments ?? [],
    });
}

export async function loadHelpdeskWorkspace(ticketId: string) {
    return invokeHelpdesk<{ draft: HelpdeskDraft | null; presence: HelpdeskPresence[]; actor_id: string }>('load_workspace', {
        ticket_id: ticketId,
    });
}

export async function heartbeatHelpdeskTicket(ticketId: string) {
    return invokeHelpdesk<{ ok: true; presence: HelpdeskPresence[] }>('heartbeat', { ticket_id: ticketId });
}

export async function mergeHelpdeskTickets(targetTicketId: string, ticketIds: string[]) {
    return invokeHelpdesk<{ target_ticket_id: string; merged_ticket_ids: string[] }>('merge_tickets', {
        target_ticket_id: targetTicketId,
        ticket_ids: ticketIds,
    });
}

export async function createPreventiveHelpdeskTicket(input: {
    subject: string;
    tenantId?: string | null;
    contactId?: string | null;
    priority?: string;
    category?: string;
}) {
    return invokeHelpdesk<{ ticket: Record<string, unknown> }>('create_preventive_ticket', {
        subject: input.subject,
        tenant_id: input.tenantId,
        contact_id: input.contactId,
        priority: input.priority,
        category: input.category,
        source: 'Preventivo',
    });
}

export interface UploadedHelpdeskAttachment {
    id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
    bucket: string;
    path: string;
    uploaded_at: string;
}

export async function uploadHelpdeskAttachments(ticketId: string, files: File[]): Promise<UploadedHelpdeskAttachment[]> {
    if (!files.length) return [];
    const response = await invokeHelpdesk<{
        uploads: Array<{ path: string; token: string; name: string; mime_type: string }>;
    }>('create_upload_urls', {
        ticket_id: ticketId,
        files: files.map((file) => ({ name: file.name, mime_type: file.type, size_bytes: file.size })),
    });

    const uploaded: UploadedHelpdeskAttachment[] = [];
    for (const [index, upload] of response.uploads.entries()) {
        const file = files[index];
        if (!file) throw new Error('La respuesta de carga no coincide con los archivos seleccionados.');
        const { error } = await supabase.storage
            .from('helpdesk-attachments')
            .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
        if (error) throw error;
        uploaded.push({
            id: crypto.randomUUID(),
            name: upload.name,
            mime_type: file.type,
            size_bytes: file.size,
            bucket: 'helpdesk-attachments',
            path: upload.path,
            uploaded_at: new Date().toISOString(),
        });
    }
    return uploaded;
}

export async function sendHelpdeskReply(input: {
    ticketId: string;
    message: string;
    attachments: UploadedHelpdeskAttachment[];
    mode: HelpdeskReplyMode;
    cc: string[];
    bcc: string[];
    forwardTo: string;
    messageId?: string;
}) {
    return invokeFunction<{ ok: true; message_id: string; resend_email_id?: string }>('send-support-reply', {
        ticket_id: input.ticketId,
        message: input.message,
        attachments: input.attachments,
        mode: input.mode,
        cc: input.cc,
        bcc: input.bcc,
        forward_to: input.forwardTo,
        message_id: input.messageId,
    });
}

export async function generateHelpdeskDraft(ticketId: string) {
    return invokeFunction<{ draft?: string; error?: string; detail?: string }>('generate-support-draft', { ticket_id: ticketId });
}

export async function resolveHelpdeskTicket(ticketId: string, notifyEmail = true) {
    return invokeFunction<{ ok: true; status: string; resolution_status: string }>('resolve-support-ticket', {
        ticket_id: ticketId,
        notify_email: notifyEmail,
    });
}
