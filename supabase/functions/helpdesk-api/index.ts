import {
    assertHelpdeskTicketAccess,
    createHelpdeskAdminClient,
    hasHelpdeskPermission,
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
    agent_id?: string;
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
    reason?: string;
    date_from?: string;
    date_to?: string;
    apply?: boolean;
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
    assigned_at,
    assigned_by,
    assignment_source,
    assignment_confidence,
    assignment_reason,
    sla_level,
    first_response_due_at,
    resolution_due_at,
    resolved_at,
    resolved_by,
    reopened_at,
    merged_into_ticket_id,
    merged_at,
    first_response_at,
    last_response_at,
    last_delivery_status,
    last_delivery_error,
    created_at,
    updated_at,
    tenants (name),
    support_contacts (
        id, email, name, company_name, phone, metadata, tenant_id,
        has_retainership, administrative_notes, store_created_at,
        service_started_at, renewal_at, last_suspended_at,
        customer_services (id, service_name, quantity, status, renewal_at, next_charge_at, additional_charge, scheduled_action, scheduled_action_at)
    ),
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
        ai_tags,
        classification_confidence,
        response_confidence,
        autonomy_action,
        autonomy_reasons,
        knowledge_sources,
        auto_reply_sent_at
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

function collectAttachmentPaths(value: unknown, ticketId: string, paths: Set<string>) {
    if (Array.isArray(value)) {
        value.forEach((item) => collectAttachmentPaths(item, ticketId, paths));
        return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.bucket === 'helpdesk-attachments' && typeof record.path === 'string') {
        const path = record.path.trim();
        if (path.startsWith(`${ticketId}/`) || path.startsWith(`outbound/${ticketId}/`)) paths.add(path);
    }
    Object.values(record).forEach((item) => collectAttachmentPaths(item, ticketId, paths));
}

function canManageHelpdesk(actor: HelpdeskActor) {
    return hasHelpdeskPermission(actor.permissions, 'support_manage');
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
            can_delete_tickets: canManageHelpdesk(actor),
            can_manage_assignments: canManageHelpdesk(actor),
        },
    };
}

function parseDashboardDate(value: unknown, fallback: Date) {
    const cleaned = cleanString(value, 40);
    const parsed = cleaned ? new Date(cleaned) : fallback;
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

async function fetchAssignmentDashboard(
    supabase: ReturnType<typeof createHelpdeskAdminClient>,
    actor: HelpdeskActor,
    payload: HelpdeskPayload,
) {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateFrom = parseDashboardDate(payload.date_from, defaultFrom);
    const dateTo = parseDashboardDate(payload.date_to, now);
    dateTo.setHours(23, 59, 59, 999);

    let ticketsQuery = supabase
        .from('support_tickets')
        .select(ticketSelect)
        .is('merged_into_ticket_id', null)
        .neq('assignment_status', 'spam')
        .order('updated_at', { ascending: false })
        .limit(1000);
    if (!actor.canViewAllDepartments) {
        ticketsQuery = ticketsQuery.in('team_id', actor.departmentIds.length
            ? actor.departmentIds
            : ['00000000-0000-0000-0000-000000000000']);
    }

    const [ticketsResult, agentsResult, settingsResult] = await Promise.all([
        ticketsQuery,
        supabase
            .from('cloud_admin_users')
            .select(`
                id,
                full_name,
                email,
                status,
                helpdesk_all_departments,
                cloud_admin_profiles!inner(is_active, permissions),
                support_team_members(team_id),
                support_agent_routing_profiles(is_available, auto_assign_enabled, max_active_tickets, skills, last_auto_assigned_at)
            `)
            .eq('status', 'active')
            .order('full_name'),
        supabase
            .from('support_integration_settings')
            .select('assignment_copilot_mode, assignment_copilot_min_confidence')
            .eq('id', 'helpdesk')
            .maybeSingle(),
    ]);
    if (ticketsResult.error) throw ticketsResult.error;
    if (agentsResult.error) throw agentsResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const tickets = (ticketsResult.data ?? []) as Array<Record<string, unknown>>;
    const agents = ((agentsResult.data ?? []) as Array<Record<string, unknown>>).filter((agent) => {
        const profileValue = agent.cloud_admin_profiles;
        const profile = (Array.isArray(profileValue) ? profileValue[0] : profileValue) as Record<string, unknown> | undefined;
        const permissions = profile?.permissions as Record<string, unknown> | undefined;
        return profile?.is_active === true && permissions?.support === true;
    });
    const fromTime = dateFrom.getTime();
    const toTime = dateTo.getTime();
    const nowTime = now.getTime();
    const isActive = (ticket: Record<string, unknown>) => !['Resuelto', 'Cerrado'].includes(String(ticket.status ?? ''));
    const timestamp = (value: unknown) => {
        const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
        return Number.isNaN(parsed) ? null : parsed;
    };
    const isOverdue = (ticket: Record<string, unknown>) => {
        if (!isActive(ticket)) return false;
        const firstResponseDue = timestamp(ticket.first_response_due_at);
        const resolutionDue = timestamp(ticket.resolution_due_at);
        return (!ticket.first_response_at && firstResponseDue !== null && firstResponseDue < nowTime)
            || (!ticket.resolved_at && resolutionDue !== null && resolutionDue < nowTime);
    };

    const assignedTickets = tickets.filter((ticket) => ticket.assignee_id && isActive(ticket));
    const overdueTickets = tickets.filter(isOverdue);
    const resolvedTickets = tickets.filter((ticket) => {
        const resolvedAt = timestamp(ticket.resolved_at);
        return resolvedAt !== null && resolvedAt >= fromTime && resolvedAt <= toTime;
    });

    const metrics = agents.map((agent) => {
        const profileValue = agent.support_agent_routing_profiles;
        const profile = (Array.isArray(profileValue) ? profileValue[0] : profileValue) as Record<string, unknown> | undefined;
        const agentId = String(agent.id);
        const activeForAgent = assignedTickets.filter((ticket) => ticket.assignee_id === agentId);
        const resolvedForAgent = resolvedTickets.filter((ticket) => (ticket.resolved_by ?? ticket.assignee_id) === agentId);
        const overdueForAgent = overdueTickets.filter((ticket) => ticket.assignee_id === agentId);
        const responseDurations = resolvedForAgent.flatMap((ticket) => {
            const createdAt = timestamp(ticket.created_at);
            const firstResponseAt = timestamp(ticket.first_response_at);
            return createdAt !== null && firstResponseAt !== null ? [(firstResponseAt - createdAt) / 60000] : [];
        });
        const resolutionDurations = resolvedForAgent.flatMap((ticket) => {
            const createdAt = timestamp(ticket.created_at);
            const resolvedAt = timestamp(ticket.resolved_at);
            return createdAt !== null && resolvedAt !== null ? [(resolvedAt - createdAt) / 60000] : [];
        });
        const ratings = resolvedForAgent
            .map((ticket) => Number(ticket.customer_rating))
            .filter((rating) => Number.isFinite(rating) && rating > 0);
        const average = (values: number[]) => values.length
            ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
            : null;
        const capacity = Number(profile?.max_active_tickets ?? 20);

        return {
            agent_id: agentId,
            full_name: agent.full_name,
            email: agent.email,
            is_available: profile?.is_available !== false,
            auto_assign_enabled: profile?.auto_assign_enabled !== false,
            max_active_tickets: capacity,
            skills: Array.isArray(profile?.skills) ? profile.skills : [],
            active_tickets: activeForAgent.length,
            critical_tickets: activeForAgent.filter((ticket) => ticket.priority === 'Critica').length,
            resolved_tickets: resolvedForAgent.length,
            overdue_tickets: overdueForAgent.length,
            reopened_tickets: resolvedForAgent.filter((ticket) => ticket.resolution_status === 'reopened' || ticket.reopened_at).length,
            average_first_response_minutes: average(responseDurations),
            average_resolution_minutes: average(resolutionDurations),
            average_rating: average(ratings),
            load_ratio: capacity > 0 ? Math.round((activeForAgent.length / capacity) * 1000) / 10 : 100,
        };
    });

    return {
        generated_at: now.toISOString(),
        date_from: dateFrom.toISOString(),
        date_to: dateTo.toISOString(),
        settings: settingsResult.data ?? {
            assignment_copilot_mode: 'suggest',
            assignment_copilot_min_confidence: 0.68,
        },
        metrics,
        assigned_tickets: assignedTickets.slice(0, 300),
        resolved_tickets: resolvedTickets.slice(0, 300),
        overdue_tickets: overdueTickets.slice(0, 300),
        unassigned_count: tickets.filter((ticket) => !ticket.assignee_id && isActive(ticket)).length,
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
            'copilot_assign',
        ]);
        if (ticketScopedActions.has(action) && payload.ticket_id) {
            await assertHelpdeskTicketAccess(supabase, actor, [cleanString(payload.ticket_id, 64)]);
        }
        if (action === 'bulk_update') {
            await assertHelpdeskTicketAccess(supabase, actor, cleanIds(payload.ticket_ids));
        }
        if (action === 'mark_spam' || action === 'restore_spam' || action === 'delete_tickets') {
            const ticketIds = cleanIds(payload.ticket_ids);
            await assertHelpdeskTicketAccess(supabase, actor, ticketIds);
            if (!canManageHelpdesk(actor)) throw new Error('Forbidden helpdesk request');
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

        if (action === 'assignment_dashboard') {
            return json(await fetchAssignmentDashboard(supabase, actor, payload));
        }

        if (action === 'update_assignment_settings') {
            if (!canManageHelpdesk(actor)) throw new Error('Forbidden helpdesk request');
            const mode = cleanString(payload.fields?.assignment_copilot_mode, 20);
            const confidence = Number(payload.fields?.assignment_copilot_min_confidence);
            if (!['off', 'suggest', 'auto'].includes(mode) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
                return json({ error: 'Valid assignment mode and confidence are required' }, 400);
            }
            const { data, error } = await supabase
                .from('support_integration_settings')
                .update({
                    assignment_copilot_mode: mode,
                    assignment_copilot_min_confidence: Math.round(confidence * 10000) / 10000,
                })
                .eq('id', 'helpdesk')
                .select('assignment_copilot_mode, assignment_copilot_min_confidence')
                .single();
            if (error) throw error;
            return json({ settings: data });
        }

        if (action === 'update_agent_routing_profile') {
            if (!canManageHelpdesk(actor)) throw new Error('Forbidden helpdesk request');
            const agentId = cleanString(payload.agent_id, 64);
            if (!/^[0-9a-f-]{36}$/i.test(agentId)) return json({ error: 'A valid agent_id is required' }, 400);
            const fields = payload.fields ?? {};
            const maxActiveTickets = Math.min(500, Math.max(1, Math.round(Number(fields.max_active_tickets) || 20)));
            const skills = cleanTags(fields.skills);
            const { data, error } = await supabase
                .from('support_agent_routing_profiles')
                .upsert({
                    admin_user_id: agentId,
                    is_available: fields.is_available !== false,
                    auto_assign_enabled: fields.auto_assign_enabled !== false,
                    max_active_tickets: maxActiveTickets,
                    skills,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'admin_user_id' })
                .select('*')
                .single();
            if (error) throw error;
            return json({ profile: data });
        }

        if (action === 'copilot_assign') {
            const ticketId = cleanString(payload.ticket_id, 64);
            const { data, error } = await supabase.rpc('helpdesk_copilot_route_ticket', {
                p_ticket_id: ticketId,
                p_apply: payload.apply !== false,
                p_actor_id: actor.id,
                p_source: 'copilot_manual',
            });
            if (error) throw error;
            return json({ decision: data });
        }

        if (action === 'copilot_assign_pending') {
            if (!canManageHelpdesk(actor)) throw new Error('Forbidden helpdesk request');
            let pendingQuery = supabase
                .from('support_tickets')
                .select('id')
                .is('assignee_id', null)
                .is('merged_into_ticket_id', null)
                .neq('assignment_status', 'spam')
                .not('status', 'in', '("Resuelto","Cerrado")')
                .order('created_at', { ascending: true })
                .limit(50);
            if (!actor.canViewAllDepartments) {
                pendingQuery = pendingQuery.in('team_id', actor.departmentIds.length
                    ? actor.departmentIds
                    : ['00000000-0000-0000-0000-000000000000']);
            }
            const { data: pendingTickets, error: pendingError } = await pendingQuery;
            if (pendingError) throw pendingError;

            const decisions: unknown[] = [];
            const ids = (pendingTickets ?? []).map((ticket) => String(ticket.id));
            for (let index = 0; index < ids.length; index += 5) {
                const batch = await Promise.all(ids.slice(index, index + 5).map(async (ticketId) => {
                    const { data, error } = await supabase.rpc('helpdesk_copilot_route_ticket', {
                        p_ticket_id: ticketId,
                        p_apply: true,
                        p_actor_id: actor.id,
                        p_source: 'copilot_manual',
                    });
                    if (error) throw error;
                    return data;
                }));
                decisions.push(...batch);
            }
            return json({ decisions });
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

            if (Object.prototype.hasOwnProperty.call(fields, 'assignee_id')) {
                fields.assigned_by = actor.id;
                fields.assignment_source = 'manual';
                fields.assignment_confidence = null;
                fields.assignment_reason = fields.assignee_id
                    ? `Asignación manual realizada por ${actor.fullName}.`
                    : `Ticket liberado manualmente por ${actor.fullName}.`;
            }

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
            if (Object.prototype.hasOwnProperty.call(fields, 'assignee_id')) {
                fields.assigned_by = actor.id;
                fields.assignment_source = 'manual';
                fields.assignment_confidence = null;
                fields.assignment_reason = `Asignación masiva realizada por ${actor.fullName}.`;
            }
            const { data, error } = await supabase
                .from('support_tickets')
                .update(fields)
                .in('id', ticketIds)
                .is('merged_into_ticket_id', null)
                .select('id');
            if (error) throw error;
            return json({ updated_ids: (data ?? []).map((row) => row.id) });
        }

        if (action === 'mark_spam') {
            const ticketIds = cleanIds(payload.ticket_ids);
            if (!ticketIds.length) return json({ error: 'ticket_ids are required' }, 400);
            const { data, error } = await supabase
                .from('support_tickets')
                .update({
                    assignment_status: 'spam',
                    status: 'Cerrado',
                    resolution_status: 'closed',
                })
                .in('id', ticketIds)
                .is('merged_into_ticket_id', null)
                .select('id');
            if (error) throw error;
            return json({ updated_ids: (data ?? []).map((row) => row.id) });
        }

        if (action === 'restore_spam') {
            const ticketIds = cleanIds(payload.ticket_ids);
            if (!ticketIds.length) return json({ error: 'ticket_ids are required' }, 400);
            const { data: spamTickets, error: fetchError } = await supabase
                .from('support_tickets')
                .select('id, tenant_id, contact_id, team_id, assignee_id')
                .in('id', ticketIds)
                .eq('assignment_status', 'spam')
                .is('merged_into_ticket_id', null);
            if (fetchError) throw fetchError;

            const assignedIds = (spamTickets ?? [])
                .filter((ticket) => ticket.tenant_id || ticket.contact_id || ticket.team_id || ticket.assignee_id)
                .map((ticket) => ticket.id);
            const unassignedIds = (spamTickets ?? [])
                .filter((ticket) => !ticket.tenant_id && !ticket.contact_id && !ticket.team_id && !ticket.assignee_id)
                .map((ticket) => ticket.id);
            for (const [ids, assignmentStatus] of [[assignedIds, 'assigned'], [unassignedIds, 'needs_assignment']] as const) {
                if (!ids.length) continue;
                const { error } = await supabase.from('support_tickets').update({
                    assignment_status: assignmentStatus,
                    status: 'Abierto',
                    resolution_status: 'open',
                }).in('id', ids);
                if (error) throw error;
            }
            return json({ restored_ids: [...assignedIds, ...unassignedIds] });
        }

        if (action === 'delete_tickets') {
            const ticketIds = cleanIds(payload.ticket_ids);
            const reason = cleanString(payload.reason, 500);
            if (!ticketIds.length || reason.length < 3) {
                return json({ error: 'ticket_ids and a deletion reason are required' }, 400);
            }
            if (ticketIds.length > 50) return json({ error: 'A maximum of 50 tickets can be deleted at once' }, 400);

            const { data: ticketRows, error: ticketError } = await supabase
                .from('support_tickets')
                .select('id, ticket_number, subject, external_sender_email')
                .in('id', ticketIds)
                .is('merged_into_ticket_id', null);
            if (ticketError) throw ticketError;
            if ((ticketRows ?? []).length !== ticketIds.length) return json({ error: 'One or more tickets no longer exist' }, 409);

            const { data: messageRows, error: messageError } = await supabase
                .from('ticket_messages')
                .select('ticket_id, attachments')
                .in('ticket_id', ticketIds);
            if (messageError) throw messageError;
            const attachmentPaths = new Set<string>();
            (messageRows ?? []).forEach((message) => collectAttachmentPaths(message.attachments, String(message.ticket_id), attachmentPaths));

            const { data: auditRows, error: auditError } = await supabase
                .from('support_ticket_deletion_audit')
                .insert((ticketRows ?? []).map((ticket) => ({
                    ticket_id: ticket.id,
                    ticket_number: ticket.ticket_number == null ? null : String(ticket.ticket_number),
                    subject: ticket.subject || 'Ticket sin asunto',
                    external_sender_email: ticket.external_sender_email,
                    deletion_reason: reason,
                    deleted_by: actor.id,
                    metadata: {
                        attachment_count: attachmentPaths.size,
                        requested_by_email: actor.email,
                    },
                })))
                .select('id');
            if (auditError) throw auditError;
            const auditIds = (auditRows ?? []).map((row) => row.id);

            const { data: deletedRows, error: deleteError } = await supabase
                .from('support_tickets')
                .delete()
                .in('id', ticketIds)
                .is('merged_into_ticket_id', null)
                .select('id');
            if (deleteError) {
                if (auditIds.length) await supabase.from('support_ticket_deletion_audit').update({
                    outcome: 'failed',
                    error_message: describeError(deleteError).slice(0, 1000),
                    completed_at: new Date().toISOString(),
                }).in('id', auditIds);
                throw deleteError;
            }

            const cleanupWarnings: string[] = [];
            const paths = Array.from(attachmentPaths);
            for (let index = 0; index < paths.length; index += 100) {
                const { error } = await supabase.storage.from('helpdesk-attachments').remove(paths.slice(index, index + 100));
                if (error) cleanupWarnings.push(describeError(error));
            }
            if (auditIds.length) {
                const { error: completionError } = await supabase.from('support_ticket_deletion_audit').update({
                    outcome: 'deleted',
                    error_message: cleanupWarnings.length ? cleanupWarnings.join(' | ').slice(0, 1000) : null,
                    completed_at: new Date().toISOString(),
                }).in('id', auditIds);
                if (completionError) console.error('Ticket deletion audit could not be completed', describeError(completionError));
            }
            return json({
                deleted_ids: (deletedRows ?? []).map((row) => row.id),
                attachment_cleanup_warnings: cleanupWarnings,
            });
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
