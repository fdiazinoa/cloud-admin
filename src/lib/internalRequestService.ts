import { supabase } from './supabase';

export type InternalRequestType = 'problem' | 'improvement';
export type InternalRequestProduct = 'msmall' | 'clicpos' | 'erp' | 'cloud-admin' | 'general';
export type InternalRequestPriority = 'Baja' | 'Media' | 'Alta' | 'Critica';
export type InternalRequestStatus = 'new' | 'under_review' | 'in_progress' | 'completed' | 'rejected';

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
    created_at: string;
    updated_at: string;
    reporter?: InternalRequestUser | InternalRequestUser[] | null;
    assignee?: InternalRequestUser | InternalRequestUser[] | null;
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
}) {
    return invokeInternalRequests<{ request: InternalWorkRequest }>('update', {
        request_id: requestId,
        status: fields.status,
        priority: fields.priority,
        assigned_to: fields.assignedTo,
    });
}
