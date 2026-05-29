import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type ReadinessStatus = 'ready' | 'pending' | 'missing_catalog' | 'error' | string;

interface ReadinessRequest {
    tenant_id?: string;
    terminal_id?: string;
    registry_id?: string | null;
    device_id?: string | null;
    terminal_name?: string | null;
}

interface TenantRecord {
    id: string;
    name: string;
    slug?: string | null;
    email?: string | null;
    status: string;
    contracted_product?: string | null;
    pos_variant?: string | null;
    offline_mode?: boolean | null;
    explicit_offline?: boolean | null;
    cloud_disabled_reason?: string | null;
    pos_runtime?: string | null;
    cloud_channel?: string | null;
    data_master?: string | null;
    cloud_sync_enabled?: boolean | null;
    erp_core_enabled?: boolean | null;
    erp_ui_enabled?: boolean | null;
    customer_erp_access?: boolean | null;
    backup_enabled?: boolean | null;
    lifecycle_status?: string | null;
    provisioning_status?: string | null;
}

interface RegistryRecord {
    id: string;
    tenant_id: string;
    device_id?: string | null;
    terminal_id?: string | null;
    terminal_name?: string | null;
}

interface PublicTerminalRecord {
    id: string;
    tenant_id: string;
    device_token?: string | null;
    name?: string | null;
}

interface ReadinessPayload {
    status?: ReadinessStatus;
    erpTenantId?: string | null;
    companyId?: string | null;
    storeId?: string | null;
    terminalId?: string | null;
    profileStatus?: string | null;
    checks?: Record<string, unknown>;
    [key: string]: unknown;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-actor-user-id, x-actor-email, x-actor-source',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const tokenKeys = new Set([
    'syncAuthToken',
    'sync_auth_token',
    'token',
    'auth_token',
    'access_token',
    'refresh_token',
]);

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
        },
    });
}

function getEnv(...names: string[]) {
    for (const name of names) {
        const value = Deno.env.get(name);
        if (value) return value;
    }
    throw new Error(`Missing required environment variable: ${names.join(' or ')}`);
}

function sanitizePayload(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizePayload(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (tokenKeys.has(key)) continue;
        output[key] = sanitizePayload(item);
    }
    return output;
}

function getErrorCode(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const candidates = [record.code, record.error, record.error_code];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return null;
}

function getMessage(payload: unknown, fallback: string) {
    if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if (typeof record.message === 'string') return record.message;
        if (typeof record.error === 'string') return record.error;
    }
    return fallback;
}

function getReadinessStatus(payload: unknown, ok: boolean): ReadinessStatus {
    if (payload && typeof payload === 'object') {
        const status = (payload as Record<string, unknown>).status;
        if (typeof status === 'string' && status.trim()) return status.trim();
    }
    return ok ? 'ready' : 'error';
}

function getAuditEvent(status: ReadinessStatus) {
    const normalized = status.toLowerCase();
    if (normalized === 'ready') return 'ERP_CONTEXT_READY';
    if (normalized === 'missing_catalog') return 'CATALOG_MISSING';
    return 'ERP_CONTEXT_MISSING';
}

async function insertAudit(
    supabase: ReturnType<typeof createClient>,
    payload: {
        event: 'POS_REGISTERED' | 'ERP_CONTEXT_PROVISION_REQUESTED' | 'ERP_CONTEXT_READY' | 'ERP_CONTEXT_MISSING' | 'CATALOG_MISSING';
        tenant_id: string;
        terminal_id: string;
        device_id?: string | null;
        actor_user_id?: string | null;
        actor_email?: string | null;
        erp_response_status?: number | null;
        erp_error_code?: string | null;
        metadata?: Record<string, unknown>;
    },
) {
    const { error } = await supabase.from('terminal_takeover_audit').insert({
        event: payload.event,
        tenant_id: payload.tenant_id,
        terminal_id: payload.terminal_id,
        previous_device_id: payload.device_id || null,
        new_device_id: payload.device_id || null,
        actor_user_id: payload.actor_user_id || null,
        actor_email: payload.actor_email || null,
        reason: 'POS ERP readiness check',
        erp_response_status: payload.erp_response_status || null,
        erp_error_code: payload.erp_error_code || null,
        metadata: payload.metadata || {},
    });

    if (error) {
        console.error('Failed to write POS ERP readiness audit', error);
    }
}

async function insertPosRegisteredAuditOnce(
    supabase: ReturnType<typeof createClient>,
    payload: {
        tenant_id: string;
        terminal_id: string;
        device_id: string;
        registry_id?: string | null;
        actor_user_id?: string | null;
        actor_email?: string | null;
    },
) {
    const { data, error } = await supabase
        .from('terminal_takeover_audit')
        .select('id')
        .eq('tenant_id', payload.tenant_id)
        .eq('terminal_id', payload.terminal_id)
        .eq('new_device_id', payload.device_id)
        .eq('event', 'POS_REGISTERED')
        .limit(1);

    if (error) {
        console.error('Failed to inspect POS_REGISTERED audit', error);
        return;
    }
    if (Array.isArray(data) && data.length > 0) return;

    await insertAudit(supabase, {
        event: 'POS_REGISTERED',
        tenant_id: payload.tenant_id,
        terminal_id: payload.terminal_id,
        device_id: payload.device_id,
        actor_user_id: payload.actor_user_id,
        actor_email: payload.actor_email,
        metadata: {
            registry_id: payload.registry_id || null,
            source: 'cloud-admin-readiness',
        },
    });
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return json({ error: 'METHOD_NOT_ALLOWED', message: 'Metodo no permitido.' }, 405);
    }

    try {
        const supabaseUrl = getEnv('SUPABASE_URL');
        const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
        const erpApiUrl = getEnv('ERP_API_URL', 'CLOUD_ADMIN_ERP_API_URL');
        const erpServiceToken = getEnv('ERP_TAKEOVER_SERVICE_TOKEN', 'ERP_SERVICE_TOKEN', 'CLOUD_ADMIN_ERP_SERVICE_TOKEN');
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
            db: { schema: 'landlord' },
        });

        const body = await request.json().catch(() => ({})) as ReadinessRequest;
        const tenantId = body.tenant_id?.trim();
        const requestedTerminalId = body.terminal_id?.trim();
        const registryId = body.registry_id?.trim() || null;
        const requestedDeviceId = body.device_id?.trim() || null;
        const requestedTerminalName = body.terminal_name?.trim() || null;
        const actorUserId = request.headers.get('x-actor-user-id') || null;
        const actorEmail = request.headers.get('x-actor-email') || request.headers.get('x-actor-source') || 'cloud-admin';

        if (!tenantId || (!requestedTerminalId && !registryId) || !requestedDeviceId) {
            return json({
                error: 'VALIDATION_ERROR',
                message: 'Selecciona tenant, terminal y device_id para preparar el contexto ERP.',
            }, 400);
        }

        const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select([
                'id',
                'name',
                'slug',
                'email',
                'status',
                'contracted_product',
                'pos_variant',
                'offline_mode',
                'explicit_offline',
                'cloud_disabled_reason',
                'pos_runtime',
                'cloud_channel',
                'data_master',
                'cloud_sync_enabled',
                'erp_core_enabled',
                'erp_ui_enabled',
                'customer_erp_access',
                'backup_enabled',
                'lifecycle_status',
            ].join(','))
            .eq('id', tenantId)
            .maybeSingle();

        if (tenantError) throw tenantError;
        const tenant = tenantData as TenantRecord | null;
        if (!tenant) {
            return json({ error: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado.' }, 404);
        }
        if (tenant.status === 'SUSPENDED') {
            return json({
                error: 'TENANT_NOT_ACTIVE',
                message: 'No se puede preparar contexto ERP si el tenant esta suspendido.',
            }, 400);
        }

        let registry: RegistryRecord | null = null;
        if (registryId) {
            const { data, error } = await supabase
                .from('tenant_server_registry')
                .select('id,tenant_id,device_id,terminal_id,terminal_name')
                .eq('tenant_id', tenantId)
                .eq('id', registryId)
                .maybeSingle();
            if (error) throw error;
            registry = (data as RegistryRecord | null) || null;
        }

        if (!registry && requestedTerminalId) {
            const { data, error } = await supabase
                .from('tenant_server_registry')
                .select('id,tenant_id,device_id,terminal_id,terminal_name')
                .eq('tenant_id', tenantId)
                .eq('terminal_id', requestedTerminalId)
                .order('last_seen_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            registry = (data as RegistryRecord | null) || null;
        }

        const terminalId = requestedTerminalId || registry?.terminal_id || '';
        const { data: publicTerminalData, error: terminalError } = !registry && terminalId
            ? await supabase
                .schema('public')
                .from('terminals')
                .select('id,tenant_id,device_token,name')
                .eq('tenant_id', tenantId)
                .eq('id', terminalId)
                .maybeSingle()
            : { data: null, error: null };

        if (terminalError) throw terminalError;
        const publicTerminal = publicTerminalData as PublicTerminalRecord | null;

        if (!registry && !publicTerminal) {
            return json({ error: 'TERMINAL_NOT_FOUND', message: 'Terminal no encontrada para este tenant.' }, 404);
        }

        const effectiveTerminalId = terminalId || publicTerminal?.id || registry?.id || '';
        const effectiveDeviceId = requestedDeviceId || registry?.device_id || publicTerminal?.device_token || null;
        const effectiveTerminalName = requestedTerminalName || registry?.terminal_name || publicTerminal?.name || effectiveTerminalId;

        if (!effectiveTerminalId || !effectiveDeviceId) {
            return json({
                error: 'DEVICE_ID_NOT_FOUND',
                message: 'La terminal no tiene device_id suficiente para preparar el contexto ERP.',
            }, 400);
        }

        await insertPosRegisteredAuditOnce(supabase, {
            tenant_id: tenantId,
            terminal_id: effectiveTerminalId,
            device_id: effectiveDeviceId,
            registry_id: registry?.id || null,
            actor_user_id: actorUserId,
            actor_email: actorEmail,
        });

        await insertAudit(supabase, {
            event: 'ERP_CONTEXT_PROVISION_REQUESTED',
            tenant_id: tenantId,
            terminal_id: effectiveTerminalId,
            device_id: effectiveDeviceId,
            actor_user_id: actorUserId,
            actor_email: actorEmail,
            metadata: {
                registry_id: registry?.id || null,
                source: 'cloud-admin',
            },
        });

        const erpResponse = await fetch(`${erpApiUrl.replace(/\/$/, '')}/api/pos/provisioning/readiness`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${erpServiceToken}`,
                'Content-Type': 'application/json',
                'X-Tenant-Id': tenantId,
                'X-Cloud-Admin-Tenant-Id': tenantId,
            },
            body: JSON.stringify({
                cloudAdminTenantId: tenantId,
                cloud_admin_tenant_id: tenantId,
                name: tenant.name,
                slug: tenant.slug || null,
                email: tenant.email || null,
                contracted_product: tenant.contracted_product || null,
                pos_variant: tenant.pos_variant || null,
                offline_mode: tenant.offline_mode ?? null,
                explicit_offline: tenant.explicit_offline ?? null,
                cloud_disabled_reason: tenant.cloud_disabled_reason || null,
                pos_runtime: tenant.pos_runtime || null,
                cloud_channel: tenant.cloud_channel || null,
                data_master: tenant.data_master || null,
                cloud_sync_enabled: tenant.cloud_sync_enabled ?? null,
                erp_core_enabled: tenant.erp_core_enabled ?? null,
                erp_ui_enabled: tenant.erp_ui_enabled ?? null,
                customer_erp_access: tenant.customer_erp_access ?? null,
                backup_enabled: tenant.backup_enabled ?? null,
                lifecycle_status: tenant.lifecycle_status || null,
                provisioning_status: tenant.provisioning_status || null,
                deviceId: effectiveDeviceId,
                terminalId: effectiveTerminalId,
                terminalName: effectiveTerminalName,
            }),
        });

        const erpPayload = await erpResponse.json().catch(async () => ({
            message: await erpResponse.text().catch(() => ''),
        }));
        const sanitizedPayload = sanitizePayload(erpPayload) as ReadinessPayload;
        const status = getReadinessStatus(sanitizedPayload, erpResponse.ok);
        const erpErrorCode = getErrorCode(sanitizedPayload);
        const checkedAt = new Date().toISOString();
        const contractedProduct = tenant.contracted_product || 'POS_ERP';
        const storedReadiness = {
            ...sanitizedPayload,
            status,
            checked_at: checkedAt,
            source: 'erp',
            http_status: erpResponse.status,
            error_code: erpErrorCode,
        };

        if (registry?.id) {
            const { error: updateError } = await supabase
                .from('tenant_server_registry')
                .update({
                    erp_readiness: storedReadiness,
                    last_erp_readiness_at: checkedAt,
                    updated_at: checkedAt,
                })
                .eq('id', registry.id);

            if (updateError) {
                console.error('Failed to update tenant_server_registry ERP readiness', updateError);
            }
        }

        const tenantStatusPatch: Record<string, unknown> = {};
        if (status.toLowerCase() === 'ready') {
            tenantStatusPatch.provisioning_status = contractedProduct === 'POS_ERP'
                ? 'ERP_ACTIVE_READY'
                : 'CLOUD_STAGING_READY';
            tenantStatusPatch.lifecycle_status = contractedProduct === 'POS_ERP'
                ? 'ERP_ACTIVE'
                : 'CLOUD_READY';
            tenantStatusPatch.ready_for_erp_activation = contractedProduct === 'POS_ONLY';
        } else if (status.toLowerCase() === 'missing_catalog') {
            tenantStatusPatch.provisioning_status = contractedProduct === 'POS_ERP'
                ? 'ERP_ACTIVE_REQUIRED'
                : 'CLOUD_STAGING_REQUIRED';
        } else if (status.toLowerCase() === 'error') {
            if (contractedProduct === 'POS_ERP') {
                tenantStatusPatch.provisioning_status = 'BLOCKED';
                tenantStatusPatch.lifecycle_status = 'BLOCKED';
            } else {
                // POS_ONLY: fallo de readiness ERP no debe bloquear cajas ya operando offline/staging.
                tenantStatusPatch.provisioning_status = 'CLOUD_STAGING_REQUIRED';
                tenantStatusPatch.lifecycle_status = 'CLOUD_READY';
            }
        }

        if (Object.keys(tenantStatusPatch).length > 0) {
            const { error: tenantUpdateError } = await supabase
                .from('tenants')
                .update(tenantStatusPatch)
                .eq('id', tenantId);

            if (tenantUpdateError) {
                console.error('Failed to update tenant provisioning status', tenantUpdateError);
            }
        }

        await insertAudit(supabase, {
            event: getAuditEvent(status),
            tenant_id: tenantId,
            terminal_id: effectiveTerminalId,
            device_id: effectiveDeviceId,
            actor_user_id: actorUserId,
            actor_email: actorEmail,
            erp_response_status: erpResponse.status,
            erp_error_code: erpErrorCode,
            metadata: {
                registry_id: registry?.id || null,
                success: erpResponse.ok,
                erp_payload: sanitizedPayload,
            },
        });

        if (!erpResponse.ok) {
            return json({
                error: erpErrorCode || 'ERP_READINESS_FAILED',
                message: getMessage(sanitizedPayload, 'El ERP no pudo preparar el contexto operativo del POS.'),
                readiness: storedReadiness,
            }, erpResponse.status);
        }

        return json({
            ...sanitizedPayload,
            status,
            erp_readiness: storedReadiness,
            message: status === 'ready'
                ? 'Contexto ERP listo para operar.'
                : 'POS vinculado, pero el contexto ERP aun no esta listo.',
        });
    } catch (error) {
        console.error('request-pos-erp-readiness failed', error);
        return json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Error interno preparando contexto ERP del POS.',
        }, 500);
    }
});
