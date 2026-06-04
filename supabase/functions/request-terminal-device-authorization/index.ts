import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type DeviceAction =
    | 'TAKEOVER'
    | 'ROTATE_TOKEN'
    | 'REVOKE_DEVICE'
    | 'SYNC_AUTHORIZED_DEVICE'
    | 'GENERATE_PAIRING_CODE'
    | 'CLEAR_TERMINAL_DEVICES';

interface DeviceActionRequest {
    tenant_id?: string;
    terminal_id?: string;
    registry_id?: string | null;
    terminal_name?: string | null;
    device_id?: string;
    action?: DeviceAction;
    reason?: string;
    pairing_code?: string | null;
    ttl_seconds?: number | null;
    confirm_action?: boolean;
}

interface TenantRecord {
    id: string;
    name: string;
    status: string;
    type?: string | null;
    contracted_product?: string | null;
    pos_runtime?: string | null;
}

interface RegistryRecord {
    id: string;
    tenant_id: string;
    device_id?: string | null;
    terminal_id?: string | null;
    terminal_name?: string | null;
    current_device_id?: string | null;
    authorized_device_id?: string | null;
    previous_device_id?: string | null;
    last_rejected_device_id?: string | null;
    is_revoked?: boolean | null;
    auth_status?: string | null;
    status?: string | null;
}

interface PublicTerminalRecord {
    id: string;
    tenant_id: string;
    code?: string | null;
    is_active?: boolean | null;
}

interface ErpTenantRecord {
    id: string;
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
    'pairingCode',
    'pairing_code',
    'code',
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

function hasToken(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some((item) => hasToken(item));
    return Object.entries(value as Record<string, unknown>).some(([key, item]) => (
        tokenKeys.has(key) || hasToken(item)
    ));
}

function getTokenPreview(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const candidates = [
        record.tokenPreview,
        record.token_preview,
        record.deviceTokenPreview,
        record.device_token_preview,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return null;
}

function getPairingCode(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const candidates = [
        record.pairingCode,
        record.pairing_code,
        record.code,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }

    const nestedCandidates = [
        record.pairing,
        (record.terminal as Record<string, unknown> | undefined)?.pairing,
        ((record.terminal as Record<string, unknown> | undefined)?.config as Record<string, unknown> | undefined)?.pairing,
    ];
    for (const nested of nestedCandidates) {
        if (!nested || typeof nested !== 'object') continue;
        const nestedRecord = nested as Record<string, unknown>;
        const nestedValues = [
            nestedRecord.pairingCode,
            nestedRecord.pairing_code,
            nestedRecord.code,
        ];
        for (const candidate of nestedValues) {
            if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        }
    }
    return null;
}

function getExpiresAt(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const candidates = [
        record.expiresAt,
        record.expires_at,
        record.expires,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }

    const nestedCandidates = [
        record.pairing,
        (record.terminal as Record<string, unknown> | undefined)?.pairing,
        ((record.terminal as Record<string, unknown> | undefined)?.config as Record<string, unknown> | undefined)?.pairing,
    ];
    for (const nested of nestedCandidates) {
        if (!nested || typeof nested !== 'object') continue;
        const nestedRecord = nested as Record<string, unknown>;
        const nestedValues = [
            nestedRecord.expiresAt,
            nestedRecord.expires_at,
            nestedRecord.expires,
        ];
        for (const candidate of nestedValues) {
            if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        }
    }
    return null;
}

function getTtlSeconds(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const candidates = [
        record.ttlSeconds,
        record.ttl_seconds,
        record.ttl,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
        if (typeof candidate === 'string' && candidate.trim() && Number.isFinite(Number(candidate))) {
            return Number(candidate);
        }
    }
    return null;
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

function getErrorMessage(status: number, payload: unknown) {
    const code = getErrorCode(payload);
    if (code === 'DEVICE_NOT_AUTHORIZED') {
        return 'Este POS intenta usar una terminal que esta autorizada para otro equipo. Puedes reautorizar este equipo si realmente reemplazaste el dispositivo.';
    }
    if (code === 'PAIRING_CODE_INVALID' || code === 'INVALID_PAIRING_CODE') {
        return 'El codigo de vinculacion no es valido.';
    }
    if (code === 'LICENSE_NOT_ALLOWED') {
        return 'La licencia actual no permite reautorizar esta terminal.';
    }
    if (status === 401 || status === 403) {
        return 'No tienes permiso para ejecutar esta accion de autorizacion.';
    }
    if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if (typeof record.message === 'string') return record.message;
        if (typeof record.error === 'string') return record.error;
    }
    return 'El ERP no pudo completar la accion de autorizacion.';
}

function getUnknownErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error.trim();
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        const candidates = [record.message, record.error, record.details, record.hint, record.code];
        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        }
    }
    return 'Error interno ejecutando autorizacion de terminal.';
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPosTenant(tenant: TenantRecord) {
    if (tenant.contracted_product) {
        return tenant.contracted_product === 'POS_ONLY' || tenant.contracted_product === 'POS_ERP';
    }
    return tenant.type === 'pos_only' || tenant.type === 'full';
}

async function fetchFirstAvailableErpRoute(
    baseUrl: string,
    paths: string[],
    init: RequestInit,
) {
    let lastResponse: Response | null = null;
    for (const path of paths) {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, init);
        if (response.status !== 404) return response;
        lastResponse = response;
    }
    return lastResponse as Response;
}

async function resolveErpTenantId(
    supabase: ReturnType<typeof createClient>,
    cloudTenantId: string,
) {
    const { data: directMatch, error: directError } = await supabase
        .schema('public')
        .from('erp_tenants')
        .select('id')
        .eq('id', cloudTenantId)
        .maybeSingle();
    if (directError) console.error('Failed to resolve ERP tenant by id', directError);
    if (directMatch) return (directMatch as ErpTenantRecord).id;

    for (const key of ['cloudAdminTenantId', 'cloud_admin_tenant_id']) {
        const { data, error } = await supabase
            .schema('public')
            .from('erp_tenants')
            .select('id')
            .eq(`config->>${key}`, cloudTenantId)
            .maybeSingle();
        if (error) {
            console.error(`Failed to resolve ERP tenant by ${key}`, error);
            continue;
        }
        if (data) return (data as ErpTenantRecord).id;
    }

    return cloudTenantId;
}

async function insertDeviceAudit(
    supabase: ReturnType<typeof createClient>,
    payload: {
        tenant_id: string;
        terminal_id: string;
        terminal_name?: string | null;
        old_device_id?: string | null;
        new_device_id?: string | null;
        action: DeviceAction;
        performed_by?: string | null;
        reason?: string | null;
        result?: string | null;
        erp_response_status?: number | null;
        erp_error_code?: string | null;
        metadata?: Record<string, unknown>;
    },
) {
    const { error } = await supabase.from('terminal_device_audit').insert({
        tenant_id: payload.tenant_id,
        terminal_id: payload.terminal_id,
        terminal_name: payload.terminal_name || null,
        old_device_id: payload.old_device_id || null,
        new_device_id: payload.new_device_id || null,
        action: payload.action,
        performed_by: payload.performed_by || null,
        reason: payload.reason || null,
        result: payload.result || null,
        erp_response_status: payload.erp_response_status || null,
        erp_error_code: payload.erp_error_code || null,
        metadata: payload.metadata || {},
    });

    if (error) {
        console.error('Failed to write terminal device audit', error);
    }
}

async function loadRegistry(
    supabase: ReturnType<typeof createClient>,
    tenantId: string,
    terminalId: string,
    registryId: string | null,
) {
    if (registryId) {
        const { data, error } = await supabase
            .from('tenant_server_registry')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', registryId)
            .maybeSingle();
        if (error) throw error;
        if (data) return data as RegistryRecord;
    }

    const { data, error } = await supabase
        .from('tenant_server_registry')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('terminal_id', terminalId)
        .maybeSingle();
    if (error) throw error;
    return data as RegistryRecord | null;
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
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
            db: { schema: 'landlord' },
        });

        const body = await request.json().catch(() => ({})) as DeviceActionRequest;
        const tenantId = body.tenant_id?.trim();
        const terminalId = body.terminal_id?.trim();
        const registryId = body.registry_id?.trim() || null;
        const terminalName = body.terminal_name?.trim() || null;
        const deviceId = body.device_id?.trim();
        const action = body.action;
        const reason = body.reason?.trim() || 'DEVICE_REINSTALL_OR_REPLACEMENT';
        const pairingCode = body.pairing_code?.trim() || null;
        const ttlSeconds = typeof body.ttl_seconds === 'number' && Number.isFinite(body.ttl_seconds)
            ? Math.max(60, Math.min(Math.trunc(body.ttl_seconds), 1800))
            : 600;
        const performedBy = request.headers.get('x-actor-email')
            || request.headers.get('x-actor-user-id')
            || request.headers.get('x-actor-source')
            || 'cloud-admin';

        if (!tenantId || !terminalId || !action || (!deviceId && action !== 'CLEAR_TERMINAL_DEVICES')) {
            return json({
                error: 'VALIDATION_ERROR',
                message: 'Selecciona tenant, terminal, accion y device_id cuando aplique.',
            }, 400);
        }

        if (!['TAKEOVER', 'ROTATE_TOKEN', 'REVOKE_DEVICE', 'SYNC_AUTHORIZED_DEVICE', 'GENERATE_PAIRING_CODE', 'CLEAR_TERMINAL_DEVICES'].includes(action)) {
            return json({ error: 'INVALID_ACTION', message: 'Accion de autorizacion no soportada.' }, 400);
        }

        if (!body.confirm_action) {
            return json({ error: 'CONFIRMATION_REQUIRED', message: 'Confirma explicitamente la accion antes de continuar.' }, 400);
        }

        const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select('id,name,status,type,contracted_product,pos_runtime')
            .eq('id', tenantId)
            .maybeSingle();

        if (tenantError) throw tenantError;
        const tenant = tenantData as TenantRecord | null;
        if (!tenant) return json({ error: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado.' }, 404);
        const allowedTenantStatuses = action === 'GENERATE_PAIRING_CODE'
            ? ['ACTIVE', 'TRIAL']
            : ['ACTIVE'];
        if (!allowedTenantStatuses.includes(tenant.status)) {
            return json({
                error: 'TENANT_NOT_ACTIVE',
                message: action === 'GENERATE_PAIRING_CODE'
                    ? 'Solo tenants activos o en prueba pueden generar codigo de vinculacion.'
                    : 'No se permite reautorizar si el tenant no esta activo.',
            }, 400);
        }
        if (!isPosTenant(tenant)) {
            return json({ error: 'LICENSE_NOT_ALLOWED', message: 'La licencia actual no permite reautorizar esta terminal.' }, 403);
        }

        const registry = await loadRegistry(supabase, tenantId, terminalId, registryId);
        let terminalQuery = supabase
            .schema('public')
            .from('terminals')
            .select('id,tenant_id,code,is_active')
            .eq('tenant_id', tenantId);
        terminalQuery = isUuid(terminalId)
            ? terminalQuery.eq('id', terminalId)
            : terminalQuery.eq('code', terminalId);
        const { data: terminalData, error: terminalError } = await terminalQuery.maybeSingle();
        if (terminalError) throw terminalError;
        const publicTerminal = terminalData as PublicTerminalRecord | null;

        if (!registry && !publicTerminal) {
            return json({ error: 'TERMINAL_NOT_FOUND', message: 'Terminal no encontrada para este tenant.' }, 404);
        }

        if (action === 'CLEAR_TERMINAL_DEVICES') {
            const { data: registryRows, error: registryRowsError } = await supabase
                .from('tenant_server_registry')
                .select('id,device_id,current_device_id,authorized_device_id,previous_device_id,last_rejected_device_id,terminal_name,status,auth_status')
                .eq('tenant_id', tenantId)
                .eq('terminal_id', terminalId);
            if (registryRowsError) throw registryRowsError;

            const rows = Array.isArray(registryRows) ? registryRows as RegistryRecord[] : [];
            const clearedDeviceIds = Array.from(new Set(
                rows
                    .flatMap((row) => [
                        row.device_id,
                        row.current_device_id,
                        row.authorized_device_id,
                        row.previous_device_id,
                        row.last_rejected_device_id,
                    ])
                    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
            ));

            const { error: deleteError, count } = await supabase
                .from('tenant_server_registry')
                .delete({ count: 'exact' })
                .eq('tenant_id', tenantId)
                .eq('terminal_id', terminalId);
            if (deleteError) throw deleteError;

            await insertDeviceAudit(supabase, {
                tenant_id: tenantId,
                terminal_id: terminalId,
                terminal_name: terminalName || registry?.terminal_name || publicTerminal?.code || null,
                old_device_id: clearedDeviceIds.join(', ') || null,
                new_device_id: null,
                action: 'CLEAR_TERMINAL_DEVICES',
                performed_by: performedBy,
                reason,
                result: 'SUCCESS',
                metadata: {
                    registry_ids: rows.map((row) => row.id).filter(Boolean),
                    cleared_registry_count: count || 0,
                    cleared_device_ids: clearedDeviceIds,
                    public_terminal_preserved: Boolean(publicTerminal?.id),
                    preserved: [
                        'public.terminals row',
                        'sales',
                        'items',
                        'customers',
                        'taxes',
                        'fiscal config',
                        'document sequences',
                    ],
                },
            });

            return json({
                status: 'success',
                success: true,
                action: 'terminal_devices_cleared',
                cleared_registry_count: count || 0,
                cleared_device_ids: clearedDeviceIds,
                message: 'Devices de la terminal limpiados. La terminal conserva su configuracion y puede vincularse nuevamente.',
            });
        }

        if (publicTerminal && publicTerminal.is_active === false) {
            return json({ error: 'TERMINAL_DISABLED', message: 'No se permite takeover si la terminal esta desactivada.' }, 400);
        }

        const persistedAuthorizedDeviceId = registry?.authorized_device_id?.trim() || null;
        const effectiveAuthorizedDeviceId = persistedAuthorizedDeviceId
            || registry?.current_device_id?.trim()
            || registry?.device_id?.trim()
            || null;
        const previousDeviceId = action === 'TAKEOVER'
            ? effectiveAuthorizedDeviceId
            : registry?.previous_device_id || effectiveAuthorizedDeviceId;

        if (action === 'SYNC_AUTHORIZED_DEVICE') {
            if (tenant.contracted_product !== 'POS_ONLY') {
                return json({
                    error: 'INVALID_ACTION',
                    message: 'Sincronizar device autorizado solo aplica a tenants POS_ONLY.',
                }, 400);
            }
            if (!registry?.id) {
                return json({ error: 'REGISTRY_NOT_FOUND', message: 'No hay registro de servidor para sincronizar.' }, 404);
            }
            const registryDeviceId = registry.device_id?.trim() || registry.current_device_id?.trim() || null;
            if (!registryDeviceId || registryDeviceId !== deviceId) {
                return json({
                    error: 'DEVICE_MISMATCH',
                    message: 'El device solicitado no coincide con el registro online de la terminal.',
                }, 409);
            }
            if (persistedAuthorizedDeviceId === deviceId) {
                return json({
                    status: 'success',
                    success: true,
                    action: 'authorized_device_already_synced',
                    authorized_device_id: deviceId,
                    message: 'El device autorizado ya estaba persistido en Cloud-Admin.',
                });
            }

            const completedAt = new Date().toISOString();
            const { error: syncError } = await supabase
                .from('tenant_server_registry')
                .update({
                    authorized_device_id: deviceId,
                    current_device_id: deviceId,
                    auth_status: 'AUTHORIZED',
                    last_auth_error: null,
                    last_auth_attempt_at: completedAt,
                    requires_pos_reauth: false,
                    updated_at: completedAt,
                })
                .eq('id', registry.id);
            if (syncError) throw syncError;

            await insertDeviceAudit(supabase, {
                tenant_id: tenantId,
                terminal_id: terminalId,
                terminal_name: terminalName || registry.terminal_name || publicTerminal?.code || null,
                old_device_id: persistedAuthorizedDeviceId,
                new_device_id: deviceId,
                action: 'SYNC_AUTHORIZED_DEVICE',
                performed_by: performedBy,
                reason,
                result: 'SUCCESS',
                metadata: {
                    registry_id: registry.id,
                    local_registry_only: true,
                },
            });

            return json({
                status: 'success',
                success: true,
                action: 'authorized_device_synced',
                authorized_device_id: deviceId,
                message: 'Device autorizado persistido en Cloud-Admin. El POS puede reintentar conexion.',
            });
        }

        if (action === 'TAKEOVER' && persistedAuthorizedDeviceId === deviceId) {
            return json({
                error: 'SAME_DEVICE_ID',
                message: 'Este equipo ya es el device autorizado para la terminal.',
            }, 400);
        }

        if (action === 'ROTATE_TOKEN' && effectiveAuthorizedDeviceId && effectiveAuthorizedDeviceId !== deviceId) {
            return json({
                error: 'DEVICE_NOT_AUTHORIZED',
                message: 'Solo puedes rotar credenciales del device autorizado actual.',
            }, 409);
        }

        await insertDeviceAudit(supabase, {
            tenant_id: tenantId,
            terminal_id: terminalId,
            terminal_name: terminalName || registry?.terminal_name || publicTerminal?.code || null,
            old_device_id: previousDeviceId,
            new_device_id: action === 'REVOKE_DEVICE' ? effectiveAuthorizedDeviceId : deviceId,
            action,
            performed_by: performedBy,
            reason,
            result: 'REQUESTED',
            metadata: {
                registry_id: registry?.id || null,
                source: 'cloud-admin',
                pairing_code_provided: Boolean(pairingCode),
            },
        });

        if (action === 'GENERATE_PAIRING_CODE') {
            if (tenant.contracted_product === 'POS_ONLY') {
                if (!registry?.id) {
                    return json({
                        error: 'REGISTRY_NOT_FOUND',
                        message: 'Esta terminal POS_ONLY aun no tiene un registro de device para autorizar. Reintenta conexion desde el POS para que Cloud-Admin reciba el device_id.',
                    }, 404);
                }

                const requestedAt = new Date().toISOString();
                const posOnlyUpdate: Record<string, unknown> = {
                    device_id: deviceId,
                    current_device_id: deviceId,
                    authorized_device_id: deviceId,
                    last_rejected_device_id: null,
                    auth_status: 'AUTHORIZED',
                    status: 'ONLINE',
                    is_revoked: false,
                    revocation_reason: null,
                    requires_pos_reauth: false,
                    last_auth_error: null,
                    last_auth_attempt_at: requestedAt,
                    last_seen_at: requestedAt,
                    updated_at: requestedAt,
                };

                const { error: localAuthorizeError } = await supabase
                    .from('tenant_server_registry')
                    .update(posOnlyUpdate)
                    .eq('id', registry.id);
                if (localAuthorizeError) throw localAuthorizeError;

                await insertDeviceAudit(supabase, {
                    tenant_id: tenantId,
                    terminal_id: terminalId,
                    terminal_name: terminalName || registry.terminal_name || publicTerminal?.code || null,
                    old_device_id: effectiveAuthorizedDeviceId,
                    new_device_id: deviceId,
                    action,
                    performed_by: performedBy,
                    reason,
                    result: 'SUCCESS',
                    metadata: {
                        registry_id: registry.id,
                        local_pos_only: true,
                        pairing_code_issued: false,
                    },
                });

                return json({
                    status: 'success',
                    success: true,
                    action: 'pos_only_device_authorized',
                    authorized_device_id: deviceId,
                    pairingCode: null,
                    message: 'POS_ONLY no requiere codigo ERP. El device fue autorizado en Cloud-Admin; reintenta conexion desde el POS.',
                });
            }

            const erpApiUrl = getEnv('ERP_API_URL', 'CLOUD_ADMIN_ERP_API_URL');
            const erpServiceToken = getEnv('ERP_TAKEOVER_SERVICE_TOKEN', 'ERP_SERVICE_TOKEN', 'CLOUD_ADMIN_ERP_SERVICE_TOKEN');
            const erpTenantId = await resolveErpTenantId(supabase, tenantId);
            const terminalPathId = encodeURIComponent(terminalId);
            const erpResponse = await fetchFirstAvailableErpRoute(erpApiUrl, [
                `/api/sync/terminals/${terminalPathId}/pairing-code`,
                `/api/settings/terminals/${terminalPathId}/pairing-code`,
            ], {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${erpServiceToken}`,
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': erpTenantId,
                    'X-Cloud-Admin-Tenant-Id': tenantId,
                },
                body: JSON.stringify({
                    cloudAdminTenantId: tenantId,
                    erpTenantId,
                    deviceId,
                    reason,
                    performedBy,
                    ttlSeconds,
                }),
            });

            const erpPayload = await erpResponse.json().catch(async () => ({
                message: await erpResponse.text().catch(() => ''),
            }));
            const erpErrorCode = getErrorCode(erpPayload);

            if (!erpResponse.ok) {
                await insertDeviceAudit(supabase, {
                    tenant_id: tenantId,
                    terminal_id: terminalId,
                    terminal_name: terminalName || registry?.terminal_name || publicTerminal?.code || null,
                    old_device_id: effectiveAuthorizedDeviceId,
                    new_device_id: deviceId,
                    action,
                    performed_by: performedBy,
                    reason,
                    result: 'FAILED',
                    erp_response_status: erpResponse.status,
                    erp_error_code: erpErrorCode,
                    metadata: {
                        erp_payload: sanitizePayload(erpPayload),
                    },
                });

                return json({
                    error: erpErrorCode || 'PAIRING_CODE_REQUEST_FAILED',
                    message: getErrorMessage(erpResponse.status, erpPayload),
                }, erpResponse.status);
            }

            const pairingCodeFromErp = getPairingCode(erpPayload);
            if (!pairingCodeFromErp) {
                await insertDeviceAudit(supabase, {
                    tenant_id: tenantId,
                    terminal_id: terminalId,
                    terminal_name: terminalName || registry?.terminal_name || publicTerminal?.code || null,
                    old_device_id: effectiveAuthorizedDeviceId,
                    new_device_id: deviceId,
                    action,
                    performed_by: performedBy,
                    reason,
                    result: 'FAILED',
                    erp_response_status: erpResponse.status,
                    erp_error_code: 'PAIRING_CODE_MISSING',
                    metadata: {
                        erp_payload: sanitizePayload(erpPayload),
                    },
                });

                return json({
                    error: 'PAIRING_CODE_MISSING',
                    message: 'El ERP no devolvio un codigo de vinculacion.',
                }, 502);
            }

            const expiresAt = getExpiresAt(erpPayload);
            const responseTtlSeconds = getTtlSeconds(erpPayload) || ttlSeconds;
            const requestedAt = new Date().toISOString();

            if (registry?.id) {
                const { error: updateError } = await supabase
                    .from('tenant_server_registry')
                    .update({
                        last_rejected_device_id: deviceId,
                        auth_status: 'TAKEOVER_PENDING',
                        last_auth_error: null,
                        last_auth_attempt_at: requestedAt,
                        updated_at: requestedAt,
                    })
                    .eq('id', registry.id);
                if (updateError) {
                    console.error('Failed to persist pairing code request metadata', updateError);
                }
            }

            await insertDeviceAudit(supabase, {
                tenant_id: tenantId,
                terminal_id: terminalId,
                terminal_name: terminalName || registry?.terminal_name || publicTerminal?.code || null,
                old_device_id: effectiveAuthorizedDeviceId,
                new_device_id: deviceId,
                action,
                performed_by: performedBy,
                reason,
                result: 'SUCCESS',
                erp_response_status: erpResponse.status,
                metadata: {
                    pairing_code_issued: true,
                    expires_at: expiresAt,
                    ttl_seconds: responseTtlSeconds,
                    erp_payload: sanitizePayload(erpPayload),
                },
            });

            return json({
                status: 'success',
                success: true,
                action: 'pairing_code_generated',
                pairingCode: pairingCodeFromErp,
                expiresAt,
                ttlSeconds: responseTtlSeconds,
                message: 'Codigo de vinculacion generado. Escribelo en el POS para confirmar el traspaso.',
            });
        }

        if (action === 'REVOKE_DEVICE') {
            const revokedAt = new Date().toISOString();
            if (registry?.id && registry.device_id === deviceId) {
                const { error: revokeError } = await supabase
                    .from('tenant_server_registry')
                    .update({
                        auth_status: 'OLD_DEVICE_REVOKED',
                        is_revoked: true,
                        revocation_reason: 'MANUAL_REVOKE_DEVICE',
                        requires_pos_reauth: true,
                        updated_at: revokedAt,
                    })
                    .eq('id', registry.id);
                if (revokeError) throw revokeError;
            }

            await insertDeviceAudit(supabase, {
                tenant_id: tenantId,
                terminal_id: terminalId,
                terminal_name: terminalName || registry?.terminal_name || publicTerminal?.code || null,
                old_device_id: deviceId,
                new_device_id: effectiveAuthorizedDeviceId,
                action,
                performed_by: performedBy,
                reason,
                result: 'SUCCESS',
                metadata: {
                    registry_id: registry?.id || null,
                    local_registry_only: true,
                },
            });

            return json({
                status: 'success',
                success: true,
                action: 'device_revoked',
                revoked_device_id: deviceId,
                authorized_device_id: effectiveAuthorizedDeviceId,
                message: 'Equipo anterior marcado como revocado en Cloud-Admin.',
            });
        }

        const erpPayloadBody: Record<string, unknown> = {
            deviceId,
            rotateDeviceToken: true,
            reason: action === 'ROTATE_TOKEN' ? 'TOKEN_ROTATION_REQUIRED' : reason,
            performedBy,
        };
        if (pairingCode) erpPayloadBody.pairingCode = pairingCode;

        const erpApiUrl = getEnv('ERP_API_URL', 'CLOUD_ADMIN_ERP_API_URL');
        const erpServiceToken = getEnv('ERP_TAKEOVER_SERVICE_TOKEN', 'ERP_SERVICE_TOKEN', 'CLOUD_ADMIN_ERP_SERVICE_TOKEN');
        const erpTenantId = await resolveErpTenantId(supabase, tenantId);
        const terminalPathId = encodeURIComponent(terminalId);
        const erpResponse = await fetchFirstAvailableErpRoute(erpApiUrl, [
            `/api/sync/terminals/${terminalPathId}/takeover`,
            `/api/settings/terminals/${terminalPathId}/takeover`,
        ], {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${erpServiceToken}`,
                'Content-Type': 'application/json',
                'X-Tenant-Id': erpTenantId,
                'X-Cloud-Admin-Tenant-Id': tenantId,
            },
            body: JSON.stringify({
                ...erpPayloadBody,
                cloudAdminTenantId: tenantId,
                erpTenantId,
            }),
        });

        const erpPayload = await erpResponse.json().catch(async () => ({
            message: await erpResponse.text().catch(() => ''),
        }));
        const erpErrorCode = getErrorCode(erpPayload);

        if (!erpResponse.ok) {
            await insertDeviceAudit(supabase, {
                tenant_id: tenantId,
                terminal_id: terminalId,
                terminal_name: terminalName || registry?.terminal_name || publicTerminal?.code || null,
                old_device_id: previousDeviceId,
                new_device_id: deviceId,
                action,
                performed_by: performedBy,
                reason,
                result: 'FAILED',
                erp_response_status: erpResponse.status,
                erp_error_code: erpErrorCode,
                metadata: {
                    erp_payload: sanitizePayload(erpPayload),
                },
            });

            return json({
                error: erpErrorCode || 'ERP_DEVICE_ACTION_FAILED',
                message: getErrorMessage(erpResponse.status, erpPayload),
            }, erpResponse.status);
        }

        const sanitizedPayload = sanitizePayload(erpPayload) as Record<string, unknown>;
        const deviceTokenIssued = hasToken(erpPayload);
        const deviceTokenStatus = typeof sanitizedPayload.deviceTokenStatus === 'string'
            ? sanitizedPayload.deviceTokenStatus
            : typeof sanitizedPayload.device_token_status === 'string'
                ? sanitizedPayload.device_token_status
                : action === 'ROTATE_TOKEN' || action === 'TAKEOVER'
                    ? 'ROTATED'
                    : null;
        const tokenPreview = getTokenPreview(sanitizedPayload);
        const completedAt = new Date().toISOString();
        const newAuthorizedDeviceId = action === 'ROTATE_TOKEN' ? effectiveAuthorizedDeviceId || deviceId : deviceId;

        if (registry?.id) {
            const registryUpdate: Record<string, unknown> = {
                device_id: newAuthorizedDeviceId,
                current_device_id: newAuthorizedDeviceId,
                authorized_device_id: newAuthorizedDeviceId,
                previous_device_id: action === 'TAKEOVER' ? previousDeviceId : registry.previous_device_id || null,
                last_rejected_device_id: null,
                auth_status: action === 'TAKEOVER' ? 'TAKEOVER_COMPLETED' : 'AUTHORIZED',
                last_auth_error: null,
                last_auth_attempt_at: completedAt,
                device_token_status: deviceTokenStatus,
                token_preview: tokenPreview,
                revocation_reason: action === 'TAKEOVER' ? 'DEVICE_REINSTALL_OR_REPLACEMENT' : null,
                requires_pos_reauth: true,
                updated_at: completedAt,
            };
            if (action === 'TAKEOVER') registryUpdate.last_takeover_at = completedAt;

            const { error: updateError } = await supabase
                .from('tenant_server_registry')
                .update(registryUpdate)
                .eq('id', registry.id);
            if (updateError) throw updateError;
        }

        await insertDeviceAudit(supabase, {
            tenant_id: tenantId,
            terminal_id: terminalId,
            terminal_name: terminalName || registry?.terminal_name || publicTerminal?.code || null,
            old_device_id: previousDeviceId,
            new_device_id: newAuthorizedDeviceId,
            action,
            performed_by: performedBy,
            reason,
            result: 'SUCCESS',
            erp_response_status: erpResponse.status,
            metadata: {
                erp_payload: sanitizedPayload,
                deviceTokenIssued,
                deviceTokenStatus,
                tokenPreview,
            },
        });

        return json({
            status: 'success',
            success: true,
            action: action === 'TAKEOVER' ? 'terminal_takeover_completed' : 'terminal_token_rotated',
            old_device_id: previousDeviceId,
            new_device_id: newAuthorizedDeviceId,
            authorized_device_id: newAuthorizedDeviceId,
            deviceTokenIssued,
            deviceTokenStatus,
            tokenPreview,
            message: action === 'TAKEOVER'
                ? 'Terminal reautorizada correctamente. El POS debe reintentar autenticacion para recibir un nuevo syncToken.'
                : 'Credenciales rotadas correctamente. El POS debe reintentar autenticacion para recibir un nuevo syncToken.',
        });
    } catch (error) {
        const message = getUnknownErrorMessage(error);
        console.error('request-terminal-device-authorization failed', {
            message,
            error: sanitizePayload(error),
        });
        return json({
            error: 'INTERNAL_ERROR',
            message,
        }, 500);
    }
});
