import { createHelpdeskAdminClient, isAuthorizationError, requireHelpdeskActor } from '../_shared/helpdesk-auth.ts';

declare const Deno: {
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface InternalRequestPayload {
    action?: string;
    request_id?: string;
    request_type?: string;
    product?: string;
    priority?: string;
    status?: string;
    title?: string;
    description?: string;
    source_page?: string;
    assigned_to?: string | null;
    decision_notes?: string;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const requestTypes = new Set(['problem', 'improvement']);
const products = new Set(['msmall', 'clicpos', 'erp', 'cloud-admin', 'general']);
const priorities = new Set(['Baja', 'Media', 'Alta', 'Critica']);
const statuses = new Set(['new', 'under_review', 'approved', 'in_progress', 'completed', 'rejected']);

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function cleanString(value: unknown, maxLength = 500) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function describeError(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        return [record.message, record.details, record.hint, record.code].filter(Boolean).join(' | ') || 'Unknown error';
    }
    return String(error ?? 'Unknown error');
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const payload = await request.json() as InternalRequestPayload;
        const action = cleanString(payload.action, 40);
        const actor = await requireHelpdeskActor(
            request,
            action === 'list' ? 'internal_requests_view' : 'internal_requests_manage',
        );
        const supabase = createHelpdeskAdminClient();

        if (action === 'list') {
            const [requestsResult, usersResult] = await Promise.all([
                supabase.from('internal_work_requests').select(`
                    *,
                    reporter:cloud_admin_users!internal_work_requests_reported_by_fkey(id, full_name, email),
                    assignee:cloud_admin_users!internal_work_requests_assigned_to_fkey(id, full_name, email),
                    tenant:tenants!internal_work_requests_tenant_id_fkey(id, name),
                    ticket:support_tickets!internal_work_requests_ticket_id_fkey(id, ticket_number, subject, status),
                    contact:support_contacts!internal_work_requests_contact_id_fkey(id, name, email, company_name)
                `).order('updated_at', { ascending: false }).limit(500),
                supabase.from('cloud_admin_users').select('id, full_name, email').eq('status', 'active').order('full_name'),
            ]);
            if (requestsResult.error) throw requestsResult.error;
            if (usersResult.error) throw usersResult.error;
            return json({ requests: requestsResult.data ?? [], users: usersResult.data ?? [] });
        }

        if (action === 'create') {
            const requestType = cleanString(payload.request_type, 30);
            const product = cleanString(payload.product, 40);
            const priority = cleanString(payload.priority, 20);
            const title = cleanString(payload.title, 220);
            const description = cleanString(payload.description, 10000);
            if (!requestTypes.has(requestType) || !products.has(product) || !priorities.has(priority) || !title || !description) {
                return json({ error: 'request_type, product, priority, title and description are required' }, 400);
            }
            const { data, error } = await supabase.from('internal_work_requests').insert({
                request_type: requestType,
                product,
                priority,
                title,
                description,
                source_page: cleanString(payload.source_page, 300) || null,
                origin: 'internal',
                reported_by: actor.id,
            }).select('*').single();
            if (error) throw error;
            return json({ request: data });
        }

        if (action === 'update') {
            const requestId = cleanString(payload.request_id, 64);
            if (!requestId) return json({ error: 'request_id is required' }, 400);
            const fields: Record<string, unknown> = {};
            const status = cleanString(payload.status, 30);
            const priority = cleanString(payload.priority, 20);
            const decisionNotes = cleanString(payload.decision_notes, 5000);
            const assignedTo = cleanString(payload.assigned_to, 64);
            if (status && statuses.has(status)) {
                fields.status = status;
                fields.completed_at = status === 'completed' ? new Date().toISOString() : null;
            }
            if (priority && priorities.has(priority)) fields.priority = priority;
            if (typeof payload.decision_notes === 'string') fields.decision_notes = decisionNotes || null;
            if (payload.assigned_to === null || payload.assigned_to === '') fields.assigned_to = null;
            else if (/^[0-9a-f-]{36}$/i.test(assignedTo)) fields.assigned_to = assignedTo;
            if (!Object.keys(fields).length) return json({ error: 'No valid fields to update' }, 400);

            const { data, error } = await supabase.from('internal_work_requests')
                .update(fields)
                .eq('id', requestId)
                .select('*')
                .single();
            if (error) throw error;
            return json({ request: data });
        }

        return json({ error: 'Unknown internal request action' }, 400);
    } catch (error) {
        const authorizationError = isAuthorizationError(error);
        console.error('internal-requests-api failed', describeError(error));
        return json({
            error: authorizationError ? 'unauthorized' : 'Internal request failed',
            detail: describeError(error),
        }, authorizationError ? 401 : 500);
    }
});
