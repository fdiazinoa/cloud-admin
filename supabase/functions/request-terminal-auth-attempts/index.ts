import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface AuthAttemptsRequest {
    tenant_id?: string;
    terminal_id?: string;
}

interface TenantRecord {
    id: string;
    status: string;
}

interface AuthAttempt {
    id?: string | null;
    requested_device_id?: string | null;
    authorized_device_id?: string | null;
    device_id?: string | null;
    deviceId?: string | null;
    reason?: string | null;
    message?: string | null;
    status?: string | null;
    resolution_status?: string | null;
    attempted_at?: string | null;
    created_at?: string | null;
    pairing_required?: boolean | null;
    endpoint_url?: string | null;
    ip_address?: string | null;
    apk_version?: string | null;
    app_version?: string | null;
    metadata?: Record<string, unknown> | null;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-actor-user-id, x-actor-email, x-actor-source',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const tokenKeys = new Set([
    'syncAuthToken',
    'sync_auth_token',
    'deviceToken',
    'device_token',
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
    if (Array.isArray(value)) return value.map((item) => sanitizePayload(item));
    if (!value || typeof value !== 'object') return value;

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (tokenKeys.has(key)) continue;
        output[key] = sanitizePayload(item);
    }
    return output;
}

function normalizeAttempt(value: unknown, tenantId: string, terminalId: string): AuthAttempt {
    const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const sanitized = sanitizePayload(record) as Record<string, unknown>;
    return {
        ...sanitized,
        tenant_id: tenantId,
        terminal_id: terminalId,
        requested_device_id: typeof sanitized.requested_device_id === 'string'
            ? sanitized.requested_device_id
            : typeof sanitized.device_id === 'string'
                ? sanitized.device_id
                : typeof sanitized.deviceId === 'string'
                    ? sanitized.deviceId
                    : null,
        authorized_device_id: typeof sanitized.authorized_device_id === 'string'
            ? sanitized.authorized_device_id
            : null,
        reason: typeof sanitized.reason === 'string' ? sanitized.reason : null,
        resolution_status: typeof sanitized.resolution_status === 'string'
            ? sanitized.resolution_status
            : typeof sanitized.status === 'string'
                ? sanitized.status
                : null,
        attempted_at: typeof sanitized.attempted_at === 'string'
            ? sanitized.attempted_at
            : typeof sanitized.created_at === 'string'
                ? sanitized.created_at
                : null,
    } as AuthAttempt;
}

function getAttemptsFromPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.attempts)) return record.attempts;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.items)) return record.items;
    return [];
}

function getErrorMessage(status: number, payload: unknown) {
    if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if (typeof record.message === 'string') return record.message;
        if (typeof record.error === 'string') return record.error;
    }
    if (status === 404) return 'El ERP no encontro intentos para esta terminal.';
    if (status === 401 || status === 403) return 'No tienes permiso para consultar intentos de autorizacion.';
    return 'No se pudieron cargar los intentos rechazados desde el ERP.';
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

        const body = await request.json().catch(() => ({})) as AuthAttemptsRequest;
        const tenantId = body.tenant_id?.trim();
        const terminalId = body.terminal_id?.trim();

        if (!tenantId || !terminalId) {
            return json({
                error: 'VALIDATION_ERROR',
                message: 'Selecciona tenant y terminal para consultar intentos rechazados.',
            }, 400);
        }

        const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select('id,status')
            .eq('id', tenantId)
            .maybeSingle();

        if (tenantError) throw tenantError;
        const tenant = tenantData as TenantRecord | null;
        if (!tenant) return json({ error: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado.' }, 404);

        const response = await fetch(`${erpApiUrl.replace(/\/$/, '')}/api/sync/terminals/${encodeURIComponent(terminalId)}/auth-attempts`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${erpServiceToken}`,
                'Content-Type': 'application/json',
                'X-Tenant-Id': tenantId,
                'X-Cloud-Admin-Tenant-Id': tenantId,
            },
        });

        const payload = await response.json().catch(async () => ({
            message: await response.text().catch(() => ''),
        }));

        if (!response.ok) {
            return json({
                error: 'ERP_AUTH_ATTEMPTS_FAILED',
                message: getErrorMessage(response.status, payload),
            }, response.status);
        }

        const attempts = getAttemptsFromPayload(payload)
            .map((attempt) => normalizeAttempt(attempt, tenantId, terminalId))
            .filter((attempt) => attempt.requested_device_id || attempt.reason || attempt.message);

        const latestRejected = attempts.find((attempt) => {
            const reason = (attempt.reason || '').toUpperCase();
            const status = (attempt.resolution_status || attempt.status || '').toUpperCase();
            return reason === 'DEVICE_NOT_AUTHORIZED' && status !== 'RESOLVED';
        }) || attempts[0] || null;

        if (latestRejected?.requested_device_id) {
            const { error: updateError } = await supabase
                .from('tenant_server_registry')
                .update({
                    last_rejected_device_id: latestRejected.requested_device_id,
                    authorized_device_id: latestRejected.authorized_device_id || null,
                    auth_status: 'DEVICE_MISMATCH',
                    last_auth_error: latestRejected.reason || latestRejected.message || 'DEVICE_NOT_AUTHORIZED',
                    last_auth_attempt_at: latestRejected.attempted_at || latestRejected.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('tenant_id', tenantId)
                .eq('terminal_id', terminalId);

            if (updateError) {
                console.error('Failed to persist latest auth attempt metadata', updateError);
            }
        }

        return json({
            status: 'success',
            attempts,
        });
    } catch (error) {
        console.error('request-terminal-auth-attempts failed', error);
        return json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Error interno consultando intentos rechazados.',
        }, 500);
    }
});
