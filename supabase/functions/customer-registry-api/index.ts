import { createHelpdeskAdminClient, isAuthorizationError, requireHelpdeskActor } from '../_shared/helpdesk-auth.ts';

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void };

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function text(value: unknown, max = 500) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function optionalDate(value: unknown) {
    const normalized = text(value, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function optionalTimestamp(value: unknown) {
    const normalized = text(value, 40);
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function uuid(value: unknown) {
    const normalized = text(value, 64);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : '';
}

function normalizedEmail(value: unknown) {
    const normalized = text(value, 254).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const payload = await request.json().catch(() => ({})) as JsonRecord;
        const action = text(payload.action, 60);
        const actor = await requireHelpdeskActor(request, 'tenants');
        const canManage = actor.permissions.tenants_manage === true
            || (typeof actor.permissions.tenants_manage !== 'boolean' && actor.permissions.tenants === true);
        if (action !== 'overview' && !canManage) throw new Error('Forbidden customer registry request');

        const client = createHelpdeskAdminClient();

        if (action === 'overview') {
            const [contactsResult, servicesResult, tenantsResult] = await Promise.all([
                client.from('support_contacts').select('id,email,name,company_name,phone,tenant_id,has_retainership,administrative_notes,store_created_at,service_started_at,renewal_at,last_suspended_at,created_at,updated_at').order('company_name').limit(1000),
                client.from('customer_services').select('*').order('updated_at', { ascending: false }).limit(3000),
                client.from('tenants').select('id,name,status,contracted_product,max_pos_terminals,max_erp_users').order('name').limit(1000),
            ]);
            for (const result of [contactsResult, servicesResult, tenantsResult]) if (result.error) throw result.error;
            const tenants = tenantsResult.data ?? [];
            const services = servicesResult.data ?? [];
            const customers = (contactsResult.data ?? []).map((contact) => ({
                ...contact,
                tenant: tenants.find((tenant) => tenant.id === contact.tenant_id) ?? null,
                services: services.filter((service) => service.contact_id === contact.id),
            }));
            return json({ customers, tenants });
        }

        if (action === 'save_customer') {
            const fields = (payload.fields ?? {}) as JsonRecord;
            const customerId = uuid(payload.customer_id);
            const email = normalizedEmail(fields.email);
            const record = {
                email,
                name: text(fields.name, 120) || null,
                company_name: text(fields.company_name, 160) || null,
                phone: text(fields.phone, 50) || null,
                tenant_id: uuid(fields.tenant_id) || null,
                has_retainership: fields.has_retainership === true,
                administrative_notes: text(fields.administrative_notes, 4000) || null,
                store_created_at: optionalDate(fields.store_created_at),
                service_started_at: optionalDate(fields.service_started_at),
                renewal_at: optionalDate(fields.renewal_at),
                last_suspended_at: optionalTimestamp(fields.last_suspended_at),
                source: customerId ? undefined : 'Reception',
            };
            if (!email || !record.company_name) throw new Error('Empresa y correo son requeridos.');
            const query = customerId
                ? client.from('support_contacts').update(record).eq('id', customerId)
                : client.from('support_contacts').insert(record);
            const { data, error } = await query.select('*').single();
            if (error) throw error;
            return json({ customer: data });
        }

        if (action === 'save_service') {
            const fields = (payload.fields ?? {}) as JsonRecord;
            const serviceId = uuid(payload.service_id);
            const contactId = uuid(fields.contact_id);
            const serviceCode = text(fields.service_code, 80).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
            const status = ['planned', 'active', 'suspended', 'cancelled'].includes(text(fields.status, 20)) ? text(fields.status, 20) : 'active';
            const scheduledAction = ['charge', 'suspend', 'reactivate'].includes(text(fields.scheduled_action, 20)) ? text(fields.scheduled_action, 20) : null;
            if (!contactId || !serviceCode || !text(fields.service_name, 140)) throw new Error('Cliente, código y servicio son requeridos.');
            const contact = await client.from('support_contacts').select('id').eq('id', contactId).maybeSingle();
            if (contact.error || !contact.data) throw contact.error ?? new Error('Cliente no encontrado.');
            const record = {
                contact_id: contactId,
                tenant_id: uuid(fields.tenant_id) || null,
                service_code: serviceCode,
                service_name: text(fields.service_name, 140),
                quantity: Math.max(1, Math.min(10000, Number(fields.quantity ?? 1))),
                status,
                started_at: optionalDate(fields.started_at),
                renewal_at: optionalDate(fields.renewal_at),
                next_charge_at: optionalDate(fields.next_charge_at),
                additional_charge: Math.max(0, Number(fields.additional_charge ?? 0)),
                scheduled_action: scheduledAction,
                scheduled_action_at: scheduledAction ? optionalTimestamp(fields.scheduled_action_at) : null,
                administrative_notes: text(fields.administrative_notes, 4000) || null,
            };
            const query = serviceId
                ? client.from('customer_services').update(record).eq('id', serviceId).eq('contact_id', contactId)
                : client.from('customer_services').insert(record);
            const { data, error } = await query.select('*').single();
            if (error) throw error;
            return json({ service: data });
        }

        if (action === 'cancel_service') {
            const serviceId = uuid(payload.service_id);
            if (!serviceId) throw new Error('Servicio inválido.');
            const { data, error } = await client.from('customer_services').update({ status: 'cancelled', scheduled_action: null, scheduled_action_at: null }).eq('id', serviceId).select('*').single();
            if (error) throw error;
            return json({ service: data });
        }

        return json({ error: 'Unknown action' }, 400);
    } catch (error) {
        console.error('customer-registry-api', error);
        const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
        return json({ error: message }, isAuthorizationError(error) ? (/forbidden/i.test(message) ? 403 : 401) : 400);
    }
});
