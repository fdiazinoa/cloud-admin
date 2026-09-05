import { supabase } from './supabase';

export type InternalRequestType = 'problem' | 'improvement';
export type InternalRequestProduct = 'msmall' | 'clicpos' | 'erp' | 'cloud-admin' | 'general';
export type InternalRequestPriority = 'Baja' | 'Media' | 'Alta' | 'Critica';
export type InternalRequestStatus = 'new' | 'under_review' | 'approved' | 'in_progress' | 'completed' | 'rejected';
export type InternalRequestOrigin = 'internal' | 'email' | 'erp' | 'helpdesk_manual' | 'helpdesk_automatic';

export interface InternalRequestTenant { id: string; name: string; }
export interface InternalRequestTicket { id: string; ticket_number?: number | null; subject?: string | null; status?: string | null; }
export interface InternalRequestContact { id: string; name?: string | null; email?: string | null; company_name?: string | null; }

export interface InternalRequestUser {
    id: string;
    full_name: string;
    email: string;
}

export interface InternalWorkRequest {
    id: string;
    request_number: number;
    request_type: InternalRequestType;
    product: InternalRequestProduct;
    priority: InternalRequestPriority;
    status: InternalRequestStatus;
    title: string;
    description: string;
    source_page?: string | null;
    origin: InternalRequestOrigin;
    ticket_id?: string | null;
    tenant_id?: string | null;
    contact_id?: string | null;
    affected_module?: string | null;
    ai_summary?: string | null;
    requested_capability?: string | null;
    customer_impact?: string | null;
    duplicate_group_key?: string | null;
    ai_confidence?: number | null;
    detected_by_ai: boolean;
    decision_notes?: string | null;
    created_at: string;
    updated_at: string;
    reporter?: InternalRequestUser | InternalRequestUser[] | null;
    assignee?: InternalRequestUser | InternalRequestUser[] | null;
    tenant?: InternalRequestTenant | InternalRequestTenant[] | null;
    ticket?: InternalRequestTicket | InternalRequestTicket[] | null;
    contact?: InternalRequestContact | InternalRequestContact[] | null;
}

async function invokeInternalRequests<T>(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('internal-requests-api', { body: { action, ...payload } });
    if (error) {
        let detail = error.message;
        const context = error.context as Response | undefined;
        if (context?.clone) {
            const response = await context.clone().json().catch(() => null) as { error?: string; detail?: string } | null;
            detail = response?.detail || response?.error || detail;
        }
        throw new Error(detail);
    }
    return data as T;
}

export function listInternalRequests() {
    return invokeInternalRequests<{ requests: InternalWorkRequest[]; users: InternalRequestUser[] }>('list');
}

export function createInternalRequest(input: {
    requestType: InternalRequestType;
    product: InternalRequestProduct;
    priority: InternalRequestPriority;
    title: string;
    description: string;
    sourcePage?: string;
}) {
    return invokeInternalRequests<{ request: InternalWorkRequest }>('create', {
        request_type: input.requestType,
        product: input.product,
        priority: input.priority,
        title: input.title,
        description: input.description,
        source_page: input.sourcePage,
    });
}

export function updateInternalRequest(requestId: string, fields: {
    status?: InternalRequestStatus;
    priority?: InternalRequestPriority;
    assignedTo?: string | null;
    decisionNotes?: string;
}) {
    return invokeInternalRequests<{ request: InternalWorkRequest }>('update', {
        request_id: requestId,
        status: fields.status,
        priority: fields.priority,
        assigned_to: fields.assignedTo,
        decision_notes: fields.decisionNotes,
    });
}
