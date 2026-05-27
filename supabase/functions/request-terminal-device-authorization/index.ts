import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type DeviceAction = 'TAKEOVER' | 'ROTATE_TOKEN' | 'REVOKE_DEVICE';

interface DeviceActionRequest {
    tenant_id?: string;
    terminal_id?: string;
    registry_id?: string | null;
    terminal_name?: string | null;
    device_id?: string;
    action?: DeviceAction;
    reason?: string;
    pairing_code?: string | null;
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
}

interface PublicTerminalRecord {
    id: string;
    tenant_id: string;
    device_token?: string | null;
    name?: string | null;
    is_active?: boolean | null;
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

function isPosTenant(tenant: TenantRecord) {
    if (tenant.contracted_product) {
        return tenant.contracted_product === 'POS_ONLY' || tenant.contracted_product === 'POS_ERP';
    }
    return tenant.type === 'pos_only' || tenant.type === 'full';
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
        const performedBy = request.headers.get('x-actor-email')
            || request.headers.get('x-actor-user-id')
            || request.headers.get('x-actor-source')
            || 'cloud-admin';

        if (!tenantId || !terminalId || !deviceId || !action) {
            return json({
                error: 'VALIDATION_ERROR',
                message: 'Selecciona tenant, terminal, device_id y accion.',
            }, 400);
        }

        if (!['TAKEOVER', 'ROTATE_TOKEN', 'REVOKE_DEVICE'].includes(action)) {
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
        if (tenant.status !== 'ACTIVE') {
            return json({ error: 'TENANT_NOT_ACTIVE', message: 'No se permite reautorizar si el tenant no esta activo.' }, 400);
        }
        if (!isPosTenant(tenant)) {
            return json({ error: 'LICENSE_NOT_ALLOWED', message: 'La licencia actual no permite reautorizar esta terminal.' }, 403);
        }

        const registry = await loadRegistry(supabase, tenantId, terminalId, registryId);
        const { data: terminalData, error: terminalError } = await supabase
            .schema('public')
            .from('terminals')
            .select('id,tenant_id,device_token,name,is_active')
            .eq('tenant_id', tenantId)
            .eq('id', terminalId)
            .maybeSingle();
        if (terminalError) throw terminalError;
        const publicTerminal = terminalData as PublicTerminalRecord | null;

        if (!registry && !publicTerminal) {
            return json({ error: 'TERMINAL_NOT_FOUND', message: 'Terminal no encontrada para este tenant.' }, 404);
        }

        if (publicTerminal && publicTerminal.is_active === false) {
            return json({ error: 'TERMINAL_DISABLED', message: 'No se permite takeover si la terminal esta desactivada.' }, 400);
        }

        const authorizedDeviceId = registry?.authorized_device_id
            || registry?.current_device_id
            || registry?.device_id
            || publicTerminal?.device_token
            || null;
        const previousDeviceId = action === 'TAKEOVER'
            ? authorizedDeviceId
            : registry?.previous_device_id || authorizedDeviceId;

        if (action === 'TAKEOVER' && authorizedDeviceId === deviceId) {
            return json({
                error: 'SAME_DEVICE_ID',
                message: 'Este equipo ya es el device autorizado para la terminal.',
            }, 400);
        }

        if (action === 'ROTATE_TOKEN' && authorizedDeviceId && authorizedDeviceId !== deviceId) {
            return json({
                error: 'DEVICE_NOT_AUTHORIZED',
                message: 'Solo puedes rotar credenciales del device autorizado actual.',
            }, 409);
        }

        await insertDeviceAudit(supabase, {
            tenant_id: tenantId,
            terminal_id: terminalId,
            terminal_name: terminalName || registry?.terminal_name || publicTerminal?.name || null,
            old_device_id: previousDeviceId,
            new_device_id: action === 'REVOKE_DEVICE' ? authorizedDeviceId : deviceId,
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
                terminal_name: terminalName || registry?.terminal_name || publicTerminal?.name || null,
                old_device_id: deviceId,
                new_device_id: authorizedDeviceId,
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
                authorized_device_id: authorizedDeviceId,
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
        const erpResponse = await fetch(`${erpApiUrl.replace(/\/$/, '')}/api/sync/terminals/${encodeURIComponent(terminalId)}/takeover`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${erpServiceToken}`,
                'Content-Type': 'application/json',
                'X-Tenant-Id': tenantId,
                'X-Cloud-Admin-Tenant-Id': tenantId,
            },
            body: JSON.stringify(erpPayloadBody),
        });

        const erpPayload = await erpResponse.json().catch(async () => ({
            message: await erpResponse.text().catch(() => ''),
        }));
        const erpErrorCode = getErrorCode(erpPayload);

        if (!erpResponse.ok) {
            await insertDeviceAudit(supabase, {
                tenant_id: tenantId,
                terminal_id: terminalId,
                terminal_name: terminalName || registry?.terminal_name || publicTerminal?.name || null,
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
        const newAuthorizedDeviceId = action === 'ROTATE_TOKEN' ? authorizedDeviceId || deviceId : deviceId;

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
            terminal_name: terminalName || registry?.terminal_name || publicTerminal?.name || null,
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
        console.error('request-terminal-device-authorization failed', error);
        return json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Error interno ejecutando autorizacion de terminal.',
        }, 500);
    }
});
