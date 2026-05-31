import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: { get(key: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface RequestBody {
    tenant_id?: string;
    terminal_id?: string;
    registry_id?: string | null;
    device_id?: string | null;
    terminal_name?: string | null;
}

interface RegistryRecord {
    id: string;
    tenant_id: string;
    terminal_id?: string | null;
    terminal_name?: string | null;
    device_id?: string | null;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-actor-user-id, x-actor-email, x-actor-source',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const tokenKeys = new Set(['syncAuthToken', 'sync_auth_token', 'token', 'auth_token', 'access_token', 'refresh_token']);

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    if (Array.isArray(value)) return value.map((item) => sanitizePayload(item));
    if (!value || typeof value !== 'object') return value;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (tokenKeys.has(key)) continue;
        output[key] = sanitizePayload(item);
    }
    return output;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getMessage(payload: unknown, fallback: string) {
    const record = asRecord(payload);
    return typeof record.message === 'string'
        ? record.message
        : typeof record.error === 'string'
            ? record.error
            : fallback;
}

function normalizeReadiness(payload: unknown, fallbackStatus: string) {
    const record = asRecord(payload);
    const readiness = asRecord(record.readiness || record.erp_readiness || record.data || record);
    const profileStatus = readiness.profileStatus || readiness.profile_status || record.profileStatus || record.profile_status || null;
    const checks = asRecord(readiness.checks || record.checks);
    const profileReady = checks.profile === true || String(profileStatus || '').toUpperCase() === 'READY';
    const status = typeof readiness.status === 'string' && readiness.status.trim()
        ? readiness.status.trim()
        : profileReady
            ? 'ready'
            : fallbackStatus;

    return {
        ...readiness,
        status,
        profileStatus,
        profile_status: profileStatus,
        checks: {
            ...checks,
            profile: profileReady,
        },
        checked_at: new Date().toISOString(),
        source: 'erp-profile-prepare',
    };
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', message: 'Metodo no permitido.' }, 405);

    try {
        const supabaseUrl = getEnv('SUPABASE_URL');
        const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
        const erpApiUrl = getEnv('ERP_API_URL', 'CLOUD_ADMIN_ERP_API_URL');
        const erpServiceToken = getEnv('ERP_TAKEOVER_SERVICE_TOKEN', 'ERP_SERVICE_TOKEN', 'CLOUD_ADMIN_ERP_SERVICE_TOKEN');
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
            db: { schema: 'landlord' },
        });

        const body = await request.json().catch(() => ({})) as RequestBody;
        const tenantId = body.tenant_id?.trim();
        const terminalId = body.terminal_id?.trim();
        const registryId = body.registry_id?.trim() || null;

        if (!tenantId || !terminalId) {
            return json({ error: 'VALIDATION_ERROR', message: 'Selecciona tenant y terminal para preparar el perfil ERP.' }, 400);
        }

        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id,status')
            .eq('id', tenantId)
            .maybeSingle();

        if (tenantError) throw tenantError;
        if (!tenant) return json({ error: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado.' }, 404);

        let registry: RegistryRecord | null = null;
        if (registryId) {
            const { data, error } = await supabase
                .from('tenant_server_registry')
                .select('id,tenant_id,terminal_id,terminal_name,device_id')
                .eq('tenant_id', tenantId)
                .eq('id', registryId)
                .maybeSingle();
            if (error) throw error;
            registry = (data as RegistryRecord | null) || null;
        }

        if (!registry) {
            const { data, error } = await supabase
                .from('tenant_server_registry')
                .select('id,tenant_id,terminal_id,terminal_name,device_id')
                .eq('tenant_id', tenantId)
                .eq('terminal_id', terminalId)
                .order('last_seen_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            registry = (data as RegistryRecord | null) || null;
        }

        const erpResponse = await fetch(`${erpApiUrl.replace(/\/$/, '')}/api/sync/terminals/${encodeURIComponent(terminalId)}/prepare-profile`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${erpServiceToken}`,
                'Content-Type': 'application/json',
                'X-Tenant-Id': tenantId,
                'X-Cloud-Admin-Tenant-Id': tenantId,
            },
            body: JSON.stringify({
                cloudAdminTenantId: tenantId,
                terminalId,
                deviceId: body.device_id || registry?.device_id || null,
                terminalName: body.terminal_name || registry?.terminal_name || null,
            }),
        });

        const erpPayload = await erpResponse.json().catch(async () => ({
            message: await erpResponse.text().catch(() => ''),
        }));
        const sanitizedPayload = sanitizePayload(erpPayload);
        const readiness = normalizeReadiness(sanitizedPayload, erpResponse.ok ? 'pending' : 'error');

        if (registry?.id) {
            const { error: updateError } = await supabase
                .from('tenant_server_registry')
                .update({
                    erp_readiness: readiness,
                    last_erp_readiness_at: readiness.checked_at,
                    updated_at: readiness.checked_at,
                })
                .eq('id', registry.id);
            if (updateError) console.error('Failed to persist prepared ERP profile readiness', updateError);
        }

        if (!erpResponse.ok) {
            return json({
                error: 'ERP_PROFILE_PREPARE_FAILED',
                message: getMessage(sanitizedPayload, 'No se pudo preparar el perfil ERP de la terminal.'),
                readiness,
            }, erpResponse.status);
        }

        return json({
            ...asRecord(sanitizedPayload),
            status: readiness.status,
            readiness,
            erp_readiness: readiness,
            message: readiness.status === 'ready'
                ? 'Perfil ERP preparado correctamente.'
                : 'Perfil ERP solicitado, pero aun no esta listo.',
        });
    } catch (error) {
        console.error('request-terminal-erp-profile failed', error);
        return json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Error interno preparando perfil ERP de terminal.',
        }, 500);
    }
});
