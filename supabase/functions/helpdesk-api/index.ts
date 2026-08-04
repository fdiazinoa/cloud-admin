import {
    assertHelpdeskTicketAccess,
    createHelpdeskAdminClient,
    isAuthorizationError,
    requireHelpdeskActor,
    type HelpdeskActor,
} from '../_shared/helpdesk-auth.ts';

declare const Deno: {
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type ReplyMode = 'reply' | 'reply_all' | 'forward';

interface HelpdeskPayload {
    action?: string;
    ticket_id?: string;
    ticket_ids?: string[];
    target_ticket_id?: string;
    query?: string;
    body?: string;
    mode?: ReplyMode;
    cc?: string[];
    bcc?: string[];
    forward_to?: string;
    attachments?: unknown[];
    fields?: Record<string, unknown>;
    files?: Array<{ name?: string; mime_type?: string; size_bytes?: number }>;
    subject?: string;
    tenant_id?: string;
    contact_id?: string;
    source?: string;
    priority?: string;
    category?: string;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowedUploadMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const maxUploadBytes = 5 * 1024 * 1024;
const ticketStatuses = new Set(['Abierto', 'En_Proceso', 'Resuelto', 'Cerrado']);
const ticketPriorities = new Set(['Baja', 'Media', 'Alta', 'Critica']);
const ticketCategories = new Set(['Ventas', 'Inventario', 'Fiscal', 'Hardware', 'Pagos', 'Red', 'Otros']);
const assignmentStatuses = new Set(['assigned', 'needs_assignment', 'needs_contact_review', 'spam']);
const resolutionStatuses = new Set(['open', 'pending_customer_confirmation', 'closed', 'reopened']);

const mutableTicketFields = new Set([
    'status',
    'priority',
    'category',
    'assignee_id',
    'team_id',
    'tags',
    'assignment_status',
    'resolution_status',
]);

const ticketSelect = `
    id,
    ticket_number,
    tenant_id,
    category,
    priority,
    status,
    resolution_status,
    customer_rating,
    subject,
    source,
    assignment_status,
    external_sender_email,
    technical_context,
    tags,
    assignee_id,
    team_id,
    merged_into_ticket_id,
    merged_at,
    first_response_at,
    last_response_at,
    last_delivery_status,
    last_delivery_error,
    created_at,
    updated_at,
    tenants (name),
    support_contacts (id, email, name, company_name, phone, metadata, tenant_id),
    ai_ticket_insights (
        sentiment,
        sentiment_score,
        summary,
        suggested_replies,
        confidence,
        next_best_action,
        urgency_reason,
        affected_module,
        detected_contact_name,
        detected_company,
        detected_phone,
        detected_identifiers,
        incident_fingerprint,
        duplicate_signal,
        ai_tags
    ),
    assignee:cloud_admin_users!support_tickets_assignee_id_fkey (id, full_name, email, status),
    support_team:support_teams!support_tickets_team_id_fkey (id, name, code)
`;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function describeError(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        return [record.message, record.details, record.hint, record.code]
            .filter((value): value is string => typeof value === 'string' && Boolean(value))
            .join(' | ') || 'Unknown error';
    }
    return String(error ?? 'Unknown error');
}

function cleanString(value: unknown, maxLength = 500) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
}

function cleanEmail(value: unknown) {
    const normalized = cleanString(value, 254).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

function cleanEmails(value: unknown) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map(cleanEmail).filter(Boolean))).slice(0, 20);
}

function cleanTags(value: unknown) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value
        .map((item) => cleanString(item, 40).toLowerCase().replace(/[^a-z0-9áéíóúüñ_-]+/gi, '-'))
        .filter(Boolean)))
        .slice(0, 20);
}

function cleanIds(value: unknown, max = 100) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value
        .map((item) => cleanString(item, 64))
        .filter((item) => /^[0-9a-f-]{36}$/i.test(item))))
        .slice(0, max);
}

function sanitizeFileName(value: unknown) {
    const fileName = cleanString(value, 140) || 'adjunto';
    return fileName.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '') || 'adjunto';
}

function filterMutableFields(fields: unknown) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};
    const output: Record<string, unknown> = {};
    Object.entries(fields as Record<string, unknown>).forEach(([key, value]) => {
        if (!mutableTicketFields.has(key)) return;
        if (key === 'tags') {
            output.tags = cleanTags(value);
            return;
        }
        if (key === 'assignee_id' || key === 'team_id') {
            const id = cleanString(value, 64);
            if (value === null || value === '') output[key] = null;
            else if (/^[0-9a-f-]{36}$/i.test(id)) output[key] = id;
            return;
        }
        const cleaned = cleanString(value, 80);
        if (key === 'status' && ticketStatuses.has(cleaned)) output.status = cleaned;
        else if (key === 'priority' && ticketPriorities.has(cleaned)) output.priority = cleaned;
        else if (key === 'category' && ticketCategories.has(cleaned)) output.category = cleaned;
        else if (key === 'assignment_status' && assignmentStatuses.has(cleaned)) output.assignment_status = cleaned;
        else if (key === 'resolution_status' && resolutionStatuses.has(cleaned)) output.resolution_status = cleaned;
    });
    return output;
}

async function fetchBootstrap(
    supabase: ReturnType<typeof createHelpdeskAdminClient>,
    query: string,
    actor: HelpdeskActor,
) {
    let ticketsQuery = supabase
        .from('support_tickets')
        .select(ticketSelect)
        .is('merged_into_ticket_id', null)
        .order('updated_at', { ascending: false })
        .limit(500);
    if (!actor.canViewAllDepartments) {
        ticketsQuery = ticketsQuery.in('team_id', actor.departmentIds.length
            ? actor.departmentIds
            : ['00000000-0000-0000-0000-000000000000']);
    }

    const [ticketsResult, agentsResult, teamsResult, templatesResult] = await Promise.all([
        ticketsQuery,
        supabase
            .from('cloud_admin_users')
            .select('id, full_name, email, status, profile_id, helpdesk_all_departments, support_team_members(team_id)')
            .eq('status', 'active')
            .order('full_name'),
        supabase
            .from('support_teams')
            .select('id, code, name, description, is_active')
            .eq('is_active', true)
            .order('name'),
        supabase
            .from('support_reply_templates')
            .select('id, name, body, category, shortcut')
            .eq('is_active', true)
            .order('name'),
    ]);

    if (ticketsResult.error) throw ticketsResult.error;
    if (agentsResult.error) throw agentsResult.error;
    if (teamsResult.error) throw teamsResult.error;
    if (templatesResult.error) throw templatesResult.error;

    let tickets = ticketsResult.data ?? [];
    const normalizedQuery = cleanString(query, 120).toLocaleLowerCase('es');

    if (normalizedQuery) {
        const messageNeedle = normalizedQuery.replace(/[%_]/g, '');
        const messageTicketIds = new Set<string>();
        if (messageNeedle) {
            const { data: messageMatches, error: messageSearchError } = await supabase
                .from('ticket_messages')
                .select('ticket_id')
                .ilike('message', `%${messageNeedle}%`)
                .limit(300);
            if (messageSearchError) throw messageSearchError;
            (messageMatches ?? []).forEach((row) => messageTicketIds.add(String(row.ticket_id)));
        }

        tickets = tickets.filter((ticket) => {
            const record = ticket as Record<string, unknown>;
            const tags = Array.isArray(record.tags) ? record.tags.join(' ') : '';
            const contactValue = record.support_contacts;
            const contact = Array.isArray(contactValue) ? contactValue[0] : contactValue;
            const contactRecord = contact && typeof contact === 'object' ? contact as Record<string, unknown> : {};
            const tenantValue = record.tenants;
            const tenant = Array.isArray(tenantValue) ? tenantValue[0] : tenantValue;
            const tenantRecord = tenant && typeof tenant === 'object' ? tenant as Record<string, unknown> : {};
            const haystack = [
                record.ticket_number,
                record.subject,
                record.external_sender_email,
                tags,
                contactRecord.name,
                contactRecord.email,
                contactRecord.company_name,
                tenantRecord.name,
            ].filter(Boolean).join(' ').toLocaleLowerCase('es');
            return haystack.includes(normalizedQuery) || messageTicketIds.has(String(record.id));
        });
    }

    const ticketIds = tickets.map((ticket) => String((ticket as Record<string, unknown>).id));
    let previews: unknown[] = [];
    let unreadStates: unknown[] = [];
    if (ticketIds.length) {
        const [previewResult, unreadResult] = await Promise.all([
            supabase.rpc('helpdesk_latest_message_previews', { p_ticket_ids: ticketIds }),
            supabase.rpc('helpdesk_ticket_unread_states', {
                p_ticket_ids: ticketIds,
                p_admin_user_id: actor.id,
            }),
        ]);
        if (previewResult.error) throw previewResult.error;
        if (unreadResult.error) throw unreadResult.error;
        previews = previewResult.data ?? [];
        unreadStates = unreadResult.data ?? [];
    }

    return {
        tickets,
        agents: agentsResult.data ?? [],
        teams: teamsResult.data ?? [],
        templates: templatesResult.data ?? [],
        previews,
        unread_states: unreadStates,
        actor_access: {
            all_departments: actor.canViewAllDepartments,
            department_ids: actor.departmentIds,
        },
    };
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const actor = await requireHelpdeskActor(request);
        const payload = await request.json() as HelpdeskPayload;
        const action = cleanString(payload.action, 60);
        const supabase = createHelpdeskAdminClient();

        const ticketScopedActions = new Set([
            'ticket_snapshot',
            'mark_read',
            'update_ticket',
            'add_note',
            'add_public_reply',
            'save_contact',
            'create_improvement',
            'save_draft',
            'load_workspace',
            'heartbeat',
            'create_upload_urls',
        ]);
        if (ticketScopedActions.has(action) && payload.ticket_id) {
            await assertHelpdeskTicketAccess(supabase, actor, [cleanString(payload.ticket_id, 64)]);
        }
        if (action === 'bulk_update') {
            await assertHelpdeskTicketAccess(supabase, actor, cleanIds(payload.ticket_ids));
        }
        if (action === 'merge_tickets') {
            await assertHelpdeskTicketAccess(supabase, actor, [
                cleanString(payload.target_ticket_id, 64),
                ...cleanIds(payload.ticket_ids),
            ]);
        }

        if (action === 'bootstrap') {
            return json(await fetchBootstrap(supabase, payload.query ?? '', actor));
        }

        if (action === 'ticket_snapshot') {
            const ticketId = cleanString(payload.ticket_id, 64);
            if (!ticketId) return json({ error: 'ticket_id is required' }, 400);
            const [ticketResult, previewResult, unreadResult] = await Promise.all([
                supabase
                    .from('support_tickets')
                    .select(ticketSelect)
                    .eq('id', ticketId)
                    .is('merged_into_ticket_id', null)
                    .maybeSingle(),
                supabase.rpc('helpdesk_latest_message_previews', { p_ticket_ids: [ticketId] }),
                supabase.rpc('helpdesk_ticket_unread_states', {
                    p_ticket_ids: [ticketId],
                    p_admin_user_id: actor.id,
                }),
            ]);
            if (ticketResult.error) throw ticketResult.error;
            if (previewResult.error) throw previewResult.error;
            if (unreadResult.error) throw unreadResult.error;
            return json({
                ticket: ticketResult.data,
                preview: previewResult.data?.[0] ?? null,
                unread_state: unreadResult.data?.[0] ?? null,
            });
        }

        if (action === 'mark_read') {
            const ticketId = cleanString(payload.ticket_id, 64);
            if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return json({ error: 'A valid ticket_id is required' }, 400);
            const lastReadAt = new Date().toISOString();
            const { error } = await supabase
                .from('support_ticket_read_receipts')
                .upsert({
                    ticket_id: ticketId,
                    admin_user_id: actor.id,
                    last_read_at: lastReadAt,
                }, { onConflict: 'ticket_id,admin_user_id' });
            if (error) throw error;
            return json({ ticket_id: ticketId, last_read_at: lastReadAt, is_unread: false });
        }

        if (action === 'update_ticket') {
            const ticketId = cleanString(payload.ticket_id, 64);
            const fields = filterMutableFields(payload.fields);
            if (!ticketId || !Object.keys(fields).length) return json({ error: 'ticket_id and fields are required' }, 400);

            const { data, error } = await supabase
                .from('support_tickets')
                .update(fields)
                .eq('id', ticketId)
                .is('merged_into_ticket_id', null)
                .select('*')
                .single();
            if (error) throw error;
            return json({ ticket: data });
        }

        if (action === 'bulk_update') {
            const ticketIds = cleanIds(payload.ticket_ids);
            const fields = filterMutableFields(payload.fields);
            if (!ticketIds.length || !Object.keys(fields).length) return json({ error: 'ticket_ids and fields are required' }, 400);
            const { data, error } = await supabase
                .from('support_tickets')
                .update(fields)
                .in('id', ticketIds)
                .is('merged_into_ticket_id', null)
                .select('id');
            if (error) throw error;
            return json({ updated_ids: (data ?? []).map((row) => row.id) });
        }

        if (action === 'add_note') {
            const ticketId = cleanString(payload.ticket_id, 64);
            const body = cleanString(payload.body, 12000);
            if (!ticketId || !body) return json({ error: 'ticket_id and body are required' }, 400);
            const { data, error } = await supabase
                .from('ticket_messages')
                .insert({
                    ticket_id: ticketId,
                    sender_type: 'Admin',
                    sender_id: actor.authUserId,
                    created_by: actor.id,
                    message: body,
                    visibility: 'private',
                    message_kind: 'note',
                    delivery_status: 'internal',
                    delivery_channel: 'internal',
                    attachments: { channel: 'internal_note', actor_name: actor.fullName },
                })
                .select('*')
                .single();
            if (error) throw error;
            return json({ message: data });
        }

        if (action === 'add_public_reply') {
            const ticketId = cleanString(payload.ticket_id, 64);
            const body = cleanString(payload.body, 12000);
            const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 4) : [];
            if (!ticketId || (!body && !attachments.length)) return json({ error: 'ticket_id and body or attachments are required' }, 400);
            const sentAt = new Date().toISOString();
            const { data, error } = await supabase
                .from('ticket_messages')
                .insert({
                    ticket_id: ticketId,
                    sender_type: 'Admin',
                    sender_id: actor.authUserId,
                    created_by: actor.id,
                    message: body || 'Imagen adjunta enviada por soporte.',
                    visibility: 'public',
                    message_kind: 'reply',
                    delivery_status: 'sent',
                    delivery_channel: 'in_app',
                    delivery_attempts: 1,
                    delivered_at: sentAt,
                    attachments: {
                        channel: 'realtime',
                        delivery_status: 'sent',
                        files: attachments,
                        notify_client: true,
                    },
                })
                .select('*')
                .single();
            if (error) throw error;
            const { error: ticketError } = await supabase.from('support_tickets').update({
                last_response_at: sentAt,
                last_delivery_status: 'sent',
                last_delivery_error: null,
            }).eq('id', ticketId);
            if (ticketError) throw ticketError;
            const { error: firstResponseError } = await supabase.from('support_tickets').update({
                first_response_at: sentAt,
            }).eq('id', ticketId).is('first_response_at', null);
            if (firstResponseError) throw firstResponseError;
            await supabase.from('support_ticket_drafts').delete()
                .eq('ticket_id', ticketId)
                .eq('admin_user_id', actor.id);
            return json({ message: data });
        }

        if (action === 'save_contact') {
            const ticketId = cleanString(payload.ticket_id, 64);
            const fields: Record<string, unknown> = payload.fields && typeof payload.fields === 'object' && !Array.isArray(payload.fields)
                ? payload.fields as Record<string, unknown>
                : {};
            const email = cleanEmail(fields.email);
            if (!ticketId || !email) return json({ error: 'ticket_id and a valid email are required' }, 400);

            const contactId = cleanString(fields.contact_id, 64);
            const existingContactRequest = supabase.from('support_contacts').select('metadata');
            const { data: existingContact, error: existingContactError } = contactId
                ? await existingContactRequest.eq('id', contactId).maybeSingle()
                : await existingContactRequest.eq('email', email).maybeSingle();
            if (existingContactError) throw existingContactError;
            const existingMetadata = existingContact?.metadata && typeof existingContact.metadata === 'object' && !Array.isArray(existingContact.metadata)
                ? existingContact.metadata as Record<string, unknown>
                : {};
            const contactPayload = {
                email,
                name: cleanString(fields.name, 160) || null,
                phone: cleanString(fields.phone, 80) || null,
                company_name: cleanString(fields.company_name, 180) || null,
                source: 'Email',
                metadata: {
                    ...existingMetadata,
                    sla: cleanString(fields.sla, 30) || 'standard',
                    converted_from: 'command_center',
                    converted_from_ticket_id: ticketId,
                    converted_at: new Date().toISOString(),
                },
            };
            const requestBuilder = contactId
                ? supabase.from('support_contacts').update(contactPayload).eq('id', contactId)
                : supabase.from('support_contacts').upsert(contactPayload, { onConflict: 'email' });
            const { data: contact, error: contactError } = await requestBuilder
                .select('id, email, name, company_name, phone, metadata, tenant_id')
                .single();
            if (contactError) throw contactError;

            const { data: ticket, error: ticketError } = await supabase
                .from('support_tickets')
                .select('tenant_id')
                .eq('id', ticketId)
                .single();
            if (ticketError) throw ticketError;
            const { error: linkError } = await supabase.from('support_tickets').update({
                contact_id: contact.id,
                assignment_status: ticket.tenant_id || contact.tenant_id ? 'assigned' : 'needs_assignment',
            }).eq('id', ticketId);
            if (linkError) throw linkError;
            return json({ contact, assignment_status: ticket.tenant_id || contact.tenant_id ? 'assigned' : 'needs_assignment' });
        }

        if (action === 'create_improvement') {
            const ticketId = cleanString(payload.ticket_id, 64);
            const fields: Record<string, unknown> = payload.fields && typeof payload.fields === 'object' && !Array.isArray(payload.fields)
                ? payload.fields as Record<string, unknown>
                : {};
            const title = cleanString(fields.title, 240);
            const requestedCapability = cleanString(fields.requested_capability, 5000);
            const duplicateGroupKey = cleanString(fields.duplicate_group_key, 180);
            if (!ticketId || !title || !requestedCapability || !duplicateGroupKey) {
                return json({ error: 'ticket_id, title, requested_capability and duplicate_group_key are required' }, 400);
            }

            const { data: ticket, error: ticketError } = await supabase
                .from('support_tickets')
                .select('tenant_id, contact_id, category')
                .eq('id', ticketId)
                .single();
            if (ticketError) throw ticketError;

            const { data: existing, error: existingError } = await supabase
                .from('customer_improvement_requests')
                .select('id')
                .eq('ticket_id', ticketId)
                .eq('duplicate_group_key', duplicateGroupKey)
                .maybeSingle();
            if (existingError) throw existingError;

            let improvementId = existing?.id as string | undefined;
            if (!improvementId) {
                const { data: inserted, error: insertError } = await supabase
                    .from('customer_improvement_requests')
                    .insert({
                        ticket_id: ticketId,
                        tenant_id: ticket.tenant_id,
                        contact_id: ticket.contact_id,
                        source: 'HelpDesk manual',
                        status: 'Nueva',
                        priority: cleanString(fields.priority, 40) || 'Media',
                        title,
                        request_text: requestedCapability,
                        ai_summary: null,
                        requested_capability: requestedCapability,
                        affected_module: cleanString(fields.affected_module, 160) || ticket.category,
                        customer_impact: cleanString(fields.customer_impact, 2000) || 'Registrada manualmente desde HelpDesk para evaluación de producto.',
                        duplicate_group_key: duplicateGroupKey,
                        ai_confidence: null,
                        detected_by_ai: false,
                    })
                    .select('id')
                    .single();
                if (insertError) throw insertError;
                improvementId = inserted.id;
            }

            const alreadyExisted = Boolean(existing?.id);
            const message = alreadyExisted
                ? `Confirmamos que tu solicitud "${title}" ya estaba registrada como mejora funcional para evaluación del equipo de producto.`
                : `Registramos tu solicitud "${title}" como mejora funcional para evaluación del equipo de producto.`;
            const { error: messageError } = await supabase.from('ticket_messages').insert({
                ticket_id: ticketId,
                sender_type: 'Admin',
                sender_id: actor.authUserId,
                created_by: actor.id,
                message,
                visibility: 'public',
                message_kind: 'customer_improvement',
                delivery_status: 'sent',
                delivery_channel: 'in_app',
                attachments: {
                    channel: 'customer_improvement',
                    event: alreadyExisted ? 'customer_improvement_already_registered' : 'customer_improvement_registered',
                    improvement_request_id: improvementId,
                    notify_client: true,
                },
            });
            if (messageError) throw messageError;
            return json({ improvement_id: improvementId, already_existed: alreadyExisted, message });
        }

        if (action === 'save_draft') {
            const ticketId = cleanString(payload.ticket_id, 64);
            if (!ticketId) return json({ error: 'ticket_id is required' }, 400);
            const body = typeof payload.body === 'string' ? payload.body.slice(0, 12000) : '';
            const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 4) : [];
            if (!body.trim() && !attachments.length) {
                const { error } = await supabase
                    .from('support_ticket_drafts')
                    .delete()
                    .eq('ticket_id', ticketId)
                    .eq('admin_user_id', actor.id);
                if (error) throw error;
                return json({ draft: null });
            }

            const draft = {
                ticket_id: ticketId,
                admin_user_id: actor.id,
                body,
                mode: payload.mode === 'reply_all' || payload.mode === 'forward' ? payload.mode : 'reply',
                cc: cleanEmails(payload.cc),
                bcc: cleanEmails(payload.bcc),
                forward_to: cleanEmail(payload.forward_to) || null,
                attachments,
                updated_at: new Date().toISOString(),
            };
            const { data, error } = await supabase
                .from('support_ticket_drafts')
                .upsert(draft, { onConflict: 'ticket_id,admin_user_id' })
                .select('*')
                .single();
            if (error) throw error;
            return json({ draft: data });
        }

        if (action === 'load_workspace') {
            const ticketId = cleanString(payload.ticket_id, 64);
            if (!ticketId) return json({ error: 'ticket_id is required' }, 400);
            const staleBefore = new Date(Date.now() - 75_000).toISOString();
            await supabase.from('support_ticket_presence').delete()
                .eq('ticket_id', ticketId)
                .lt('last_seen_at', staleBefore);
            await supabase.from('support_ticket_presence').upsert({
                ticket_id: ticketId,
                admin_user_id: actor.id,
                last_seen_at: new Date().toISOString(),
            }, { onConflict: 'ticket_id,admin_user_id' });

            const [draftResult, presenceResult] = await Promise.all([
                supabase
                    .from('support_ticket_drafts')
                    .select('*')
                    .eq('ticket_id', ticketId)
                    .eq('admin_user_id', actor.id)
                    .maybeSingle(),
                supabase
                    .from('support_ticket_presence')
                    .select('admin_user_id, last_seen_at, cloud_admin_users!support_ticket_presence_admin_user_id_fkey(id, full_name, email)')
                    .eq('ticket_id', ticketId)
                    .gte('last_seen_at', staleBefore),
            ]);
            if (draftResult.error) throw draftResult.error;
            if (presenceResult.error) throw presenceResult.error;
            return json({ draft: draftResult.data, presence: presenceResult.data ?? [], actor_id: actor.id });
        }

        if (action === 'heartbeat') {
            const ticketId = cleanString(payload.ticket_id, 64);
            if (!ticketId) return json({ error: 'ticket_id is required' }, 400);
            const staleBefore = new Date(Date.now() - 75_000).toISOString();
            const { error } = await supabase.from('support_ticket_presence').upsert({
                ticket_id: ticketId,
                admin_user_id: actor.id,
                last_seen_at: new Date().toISOString(),
            }, { onConflict: 'ticket_id,admin_user_id' });
            if (error) throw error;
            const { data: presence, error: presenceError } = await supabase
                .from('support_ticket_presence')
                .select('admin_user_id, last_seen_at, cloud_admin_users!support_ticket_presence_admin_user_id_fkey(id, full_name, email)')
                .eq('ticket_id', ticketId)
                .gte('last_seen_at', staleBefore);
            if (presenceError) throw presenceError;
            return json({ ok: true, presence: presence ?? [] });
        }

        if (action === 'create_upload_urls') {
            const ticketId = cleanString(payload.ticket_id, 64);
            const files = Array.isArray(payload.files) ? payload.files.slice(0, 4) : [];
            if (!ticketId || !files.length) return json({ error: 'ticket_id and files are required' }, 400);

            const uploads = [];
            for (const file of files) {
                const mimeType = cleanString(file.mime_type, 120).toLowerCase();
                const sizeBytes = Number(file.size_bytes ?? 0);
                if (!allowedUploadMimeTypes.has(mimeType) || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxUploadBytes) {
                    return json({ error: 'Only PNG, JPEG, WebP, or GIF files up to 5 MB are allowed' }, 400);
                }
                const name = sanitizeFileName(file.name);
                const path = `outbound/${ticketId}/${crypto.randomUUID()}-${name}`;
                const { data, error } = await supabase.storage.from('helpdesk-attachments').createSignedUploadUrl(path);
                if (error) throw error;
                uploads.push({ path, token: data.token, name, mime_type: mimeType });
            }
            return json({ uploads });
        }

        if (action === 'merge_tickets') {
            const targetId = cleanString(payload.target_ticket_id, 64);
            const sourceIds = cleanIds(payload.ticket_ids).filter((id) => id !== targetId);
            if (!targetId || !sourceIds.length) return json({ error: 'target_ticket_id and source ticket_ids are required' }, 400);

            const now = new Date().toISOString();
            const { error: moveError } = await supabase
                .from('ticket_messages')
                .update({ ticket_id: targetId })
                .in('ticket_id', sourceIds);
            if (moveError) throw moveError;

            const { error: mergeError } = await supabase
                .from('support_tickets')
                .update({
                    merged_into_ticket_id: targetId,
                    merged_at: now,
                    status: 'Cerrado',
                    resolution_status: 'closed',
                })
                .in('id', sourceIds)
                .is('merged_into_ticket_id', null);
            if (mergeError) throw mergeError;

            const { error: noteError } = await supabase.from('ticket_messages').insert({
                ticket_id: targetId,
                sender_type: 'System',
                sender_id: actor.authUserId,
                created_by: actor.id,
                message: `Se fusionaron ${sourceIds.length} ticket(s) duplicados en este caso.`,
                visibility: 'private',
                message_kind: 'merge',
                delivery_status: 'internal',
                delivery_channel: 'internal',
                attachments: { merged_ticket_ids: sourceIds, actor_name: actor.fullName },
            });
            if (noteError) throw noteError;
            return json({ target_ticket_id: targetId, merged_ticket_ids: sourceIds });
        }

        if (action === 'create_preventive_ticket') {
            const subject = cleanString(payload.subject, 240);
            if (!subject) return json({ error: 'subject is required' }, 400);
            const requestedCategory = cleanString(payload.category, 80);
            const requestedPriority = cleanString(payload.priority, 80);
            const { data: ticket, error } = await supabase
                .from('support_tickets')
                .insert({
                    tenant_id: cleanString(payload.tenant_id, 64) || null,
                    contact_id: cleanString(payload.contact_id, 64) || null,
                    category: ticketCategories.has(requestedCategory) ? requestedCategory : 'Otros',
                    priority: ticketPriorities.has(requestedPriority) ? requestedPriority : 'Media',
                    status: 'Abierto',
                    subject,
                    source: cleanString(payload.source, 40) || 'Preventivo',
                    assignment_status: 'needs_assignment',
                    technical_context: { created_by: actor.fullName, preventive: true },
                })
                .select('*')
                .single();
            if (error) throw error;
            return json({ ticket });
        }

        return json({ error: 'Unknown helpdesk action' }, 400);
    } catch (error) {
        const authorizationError = isAuthorizationError(error);
        console.error('helpdesk-api failed', describeError(error));
        return json({
            error: authorizationError ? 'unauthorized' : 'Helpdesk request failed',
            detail: describeError(error),
        }, authorizationError ? 401 : 500);
    }
});
