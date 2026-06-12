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
    | 'CLEAR_TERMINAL_DEVICES'
    | 'TAKEOVER_AUTHORIZED'
    | 'DEVICE_REVOKED'
    | 'DUPLICATE_PREVENTED';

interface DeviceActionRequest {
    tenant_id?: string;
    terminal_id?: string;
    registry_id?: string | null;
    terminal_name?: string | null;
    device_id?: string;
    action?: DeviceAction;
    reason?: string;
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

interface ErpTerminalRecord {
    id: string;
    name?: string | null;
    device_id?: string | null;
    config?: Record<string, unknown> | null;
    last_seen?: string | null;
    created_at?: string | null;
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
        return 'El ERP rechazo la autorizacion del device.';
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

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getRecordChild(record: Record<string, unknown>, key: string): Record<string, unknown> {
    return asRecord(record[key]);
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
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data as RegistryRecord | null;
}

async function archiveDuplicateRegistriesForTerminal(
    supabase: ReturnType<typeof createClient>,
    tenantId: string,
    terminalId: string,
    terminalCode: string | null,
    keepRegistryId: string | null | undefined,
    previousDeviceId: string | null | undefined,
) {
    const { data, error } = await supabase
        .from('tenant_server_registry')
        .select('id,terminal_id,terminal_name,device_id,current_device_id,authorized_device_id')
        .eq('tenant_id', tenantId);
    if (error) throw error;

    const rows = (Array.isArray(data) ? data as RegistryRecord[] : []).filter((row) => {
        if (!row.id || row.id === keepRegistryId) return false;
        const rowTerminalId = row.terminal_id?.trim() || '';
        const rowTerminalName = row.terminal_name?.trim() || '';
        return rowTerminalId === terminalId
            || Boolean(terminalCode && rowTerminalId.toUpperCase() === terminalCode.toUpperCase())
            || Boolean(terminalCode && rowTerminalName.toUpperCase() === terminalCode.toUpperCase());
    });

    const ids = rows.map((row) => row.id).filter(Boolean);
    if (ids.length === 0) return [];

    const archivedAt = new Date().toISOString();
    const { error: updateError } = await supabase
        .from('tenant_server_registry')
        .update({
            status: 'OFFLINE',
            auth_status: 'OLD_DEVICE_REVOKED',
            is_revoked: true,
            revocation_reason: 'POS_ERP_TERMINAL_TAKEOVER_SUPERSEDED',
            requires_pos_reauth: true,
            previous_device_id: previousDeviceId || null,
            updated_at: archivedAt,
        })
        .in('id', ids);
    if (updateError) throw updateError;

    return ids;
}

async function erpTerminalHasDependencies(
    supabase: ReturnType<typeof createClient>,
    terminalId: string,
) {
    const dependencyTables = [
        'erp_terminal_profiles',
        'erp_terminal_fiscal_allocations',
        'erp_sync_inbox',
        'erp_sync_outbox',
        'sync_inbox',
        'sync_dead_letter',
        'terminal_auth_attempts',
    ];

    for (const table of dependencyTables) {
        const { count, error } = await supabase
            .schema('public')
            .from(table)
            .select('id', { count: 'exact', head: true })
            .eq('terminal_id', terminalId);
        if (error) {
            console.error(`Failed to check terminal dependency table ${table}`, error);
            return true;
        }
        if ((count || 0) > 0) return true;
    }

    return false;
}

async function archiveOrDeleteErpTerminal(
    supabase: ReturnType<typeof createClient>,
    duplicate: ErpTerminalRecord,
    canonicalTerminalId: string,
) {
    const hasDependencies = await erpTerminalHasDependencies(supabase, duplicate.id);
    if (!hasDependencies) {
        const { error: deleteError } = await supabase
            .schema('public')
            .from('erp_terminals')
            .delete()
            .eq('id', duplicate.id);
        if (deleteError) throw deleteError;
        return { mode: 'deleted', id: duplicate.id };
    }

    const archivedDeviceId = `ARCHIVED-${duplicate.id.slice(0, 8)}`;
    const archivedConfig = {
        ...asRecord(duplicate.config),
        active: false,
        is_active: false,
        metadata: {
            ...getRecordChild(asRecord(duplicate.config), 'metadata'),
            archived: true,
            archived_at: new Date().toISOString(),
            archived_reason: 'DUPLICATE_TERMINAL_MERGED_TO_CANONICAL',
            canonical_erp_terminal_id: canonicalTerminalId,
        },
    };
    const { error: updateError } = await supabase
        .schema('public')
        .from('erp_terminals')
        .update({
            device_id: archivedDeviceId,
            name: `ARCHIVED-${duplicate.name || 'terminal'}-${duplicate.id.slice(0, 8)}`,
            config: archivedConfig,
        })
        .eq('id', duplicate.id);
    if (updateError) throw updateError;

    return { mode: 'archived', id: duplicate.id };
}

async function consolidateErpTerminalDeviceDuplicates(
    supabase: ReturnType<typeof createClient>,
    input: {
        tenantId: string;
        erpTenantId: string;
        terminalId: string;
        terminalName: string | null;
        deviceId: string;
        copyAuthToCanonical: boolean;
    },
) {
    const { data: canonicalData, error: canonicalError } = await supabase
        .schema('public')
        .from('erp_terminals')
        .select('id,name,device_id,config,last_seen,created_at')
        .eq('id', input.terminalId)
        .maybeSingle();
    if (canonicalError) throw canonicalError;
    const canonical = canonicalData as ErpTerminalRecord | null;
    if (!canonical) return { archived: [], deleted: [], copied_auth: false };

    const { data: deviceMatches, error: deviceError } = await supabase
        .schema('public')
        .from('erp_terminals')
        .select('id,name,device_id,config,last_seen,created_at')
        .eq('device_id', input.deviceId);
    if (deviceError) throw deviceError;

    const expectedTerminalName = input.terminalName || canonical.name || '';
    const { data: nameMatches, error: nameError } = expectedTerminalName
        ? await supabase
            .schema('public')
            .from('erp_terminals')
            .select('id,name,device_id,config,last_seen,created_at')
            .eq('name', expectedTerminalName)
        : { data: [], error: null };
    if (nameError) throw nameError;

    const candidates = new Map<string, ErpTerminalRecord>();
    for (const row of [...(deviceMatches || []), ...(nameMatches || [])] as ErpTerminalRecord[]) {
        if (!row.id || row.id === input.terminalId) continue;
        const config = asRecord(row.config);
        const metadata = getRecordChild(config, 'metadata');
        const rowCanonicalId = String(metadata.erp_terminal_id || metadata.canonical_erp_terminal_id || '');
        const rowCloudTenantId = String(metadata.cloud_admin_tenant_id || metadata.cloudAdminTenantId || '');
        const rowName = (row.name || '').trim().toUpperCase();
        const expectedName = (input.terminalName || canonical.name || '').trim().toUpperCase();
        const isSameDevice = row.device_id === input.deviceId;
        const pointsToCanonical = rowCanonicalId === input.terminalId;
        const sameTenantAndName = Boolean(expectedName && rowName === expectedName && (rowCloudTenantId === input.tenantId || rowCloudTenantId === input.erpTenantId));
        const isArchived = rowName.startsWith('ARCHIVED-') || metadata.archived === true || config.active === false || config.is_active === false;
        if (isSameDevice || pointsToCanonical || sameTenantAndName || isArchived) candidates.set(row.id, row);
    }

    const duplicateRows = Array.from(candidates.values());
    const authSource = duplicateRows.find((row) => row.device_id === input.deviceId);
    const archived: string[] = [];
    const deleted: string[] = [];

    for (const duplicate of duplicateRows) {
        const result = await archiveOrDeleteErpTerminal(supabase, duplicate, input.terminalId);
        if (result.mode === 'deleted') deleted.push(result.id);
        else archived.push(result.id);
    }

    let copiedAuth = false;
    if (input.copyAuthToCanonical) {
        const sourceConfig = asRecord(authSource?.config);
        const sourceRuntime = getRecordChild(sourceConfig, 'runtime');
        const sourceSecurity = getRecordChild(sourceConfig, 'security');
        const canonicalConfig = asRecord(canonical.config);
        const canonicalMetadata = getRecordChild(canonicalConfig, 'metadata');
        const updatedConfig = {
            ...canonicalConfig,
            pairing: {
                ...getRecordChild(canonicalConfig, 'pairing'),
                status: 'NOT_REQUIRED',
            },
            metadata: {
                ...canonicalMetadata,
                erp_terminal_id: input.terminalId,
                canonical_erp_terminal_id: input.terminalId,
                cloud_admin_tenant_id: input.tenantId,
                authorizedDeviceId: input.deviceId,
                authorized_device_id: input.deviceId,
                currentDeviceId: input.deviceId,
                current_device_id: input.deviceId,
                canonicalDeviceId: input.deviceId,
                canonical_device_id: input.deviceId,
                binding_status: 'BOUND',
                ...(sourceSecurity.deviceTokenFingerprint ? { deviceTokenFingerprint: sourceSecurity.deviceTokenFingerprint } : {}),
            },
            runtime: {
                ...getRecordChild(canonicalConfig, 'runtime'),
                ...(sourceRuntime.syncAuthToken ? { syncAuthToken: sourceRuntime.syncAuthToken } : {}),
                ...(sourceRuntime.tokenExpiresAt ? { tokenExpiresAt: sourceRuntime.tokenExpiresAt } : {}),
                syncStatus: 'online',
            },
            security: {
                ...getRecordChild(canonicalConfig, 'security'),
                ...(sourceSecurity.deviceTokenFingerprint ? { deviceTokenFingerprint: sourceSecurity.deviceTokenFingerprint } : {}),
                ...(sourceSecurity.deviceTokenIssuedAt ? { deviceTokenIssuedAt: sourceSecurity.deviceTokenIssuedAt } : {}),
                ...(sourceSecurity.deviceBindingToken ? { deviceBindingToken: sourceSecurity.deviceBindingToken } : {}),
            },
        };

        const { error: canonicalUpdateError } = await supabase
            .schema('public')
            .from('erp_terminals')
            .update({
                device_id: input.deviceId,
                last_seen: new Date().toISOString(),
                config: updatedConfig,
            })
            .eq('id', input.terminalId);
        if (canonicalUpdateError) throw canonicalUpdateError;
        copiedAuth = true;
    }

    return { archived, deleted, copied_auth: copiedAuth };
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
        let terminalId = body.terminal_id?.trim();
        const registryId = body.registry_id?.trim() || null;
        const terminalName = body.terminal_name?.trim() || null;
        const deviceId = body.device_id?.trim();
        const requestedAction = body.action;
        const action = requestedAction === 'GENERATE_PAIRING_CODE' ? 'TAKEOVER' : requestedAction;
        const reason = body.reason?.trim() || 'DEVICE_REINSTALL_OR_REPLACEMENT';
        const performedBy = request.headers.get('x-actor-email')
            || request.headers.get('x-actor-user-id')
            || request.headers.get('x-actor-source')
            || 'cloud-admin';

        if (!tenantId || !terminalId || !requestedAction || (!deviceId && requestedAction !== 'CLEAR_TERMINAL_DEVICES')) {
            return json({
                error: 'VALIDATION_ERROR',
                message: 'Selecciona tenant, terminal, accion y device_id cuando aplique.',
            }, 400);
        }

        if (!['TAKEOVER', 'ROTATE_TOKEN', 'REVOKE_DEVICE', 'SYNC_AUTHORIZED_DEVICE', 'GENERATE_PAIRING_CODE', 'CLEAR_TERMINAL_DEVICES'].includes(requestedAction)) {
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
            return json({
                error: 'TENANT_NOT_ACTIVE',
                message: 'No se permite reautorizar si el tenant no esta activo.',
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
            : terminalQuery.eq('code', terminalName || registry?.terminal_name || terminalId);
        const { data: terminalData, error: terminalError } = await terminalQuery
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (terminalError) throw terminalError;
        const publicTerminal = terminalData as PublicTerminalRecord | null;
        if (publicTerminal?.id) terminalId = publicTerminal.id;
        const terminalDisplayCode = publicTerminal?.code || terminalName || registry?.terminal_name || null;

        if (!registry && !publicTerminal) {
            return json({ error: 'TERMINAL_NOT_FOUND', message: 'Terminal no encontrada para este tenant.' }, 404);
        }

        if (action === 'CLEAR_TERMINAL_DEVICES') {
            const { data: registryRows, error: registryRowsError } = await supabase
                .from('tenant_server_registry')
                .select('id,terminal_id,device_id,current_device_id,authorized_device_id,previous_device_id,last_rejected_device_id,terminal_name,status,auth_status')
                .eq('tenant_id', tenantId)
                .order('last_seen_at', { ascending: false });
            if (registryRowsError) throw registryRowsError;

            const rows = (Array.isArray(registryRows) ? registryRows as RegistryRecord[] : []).filter((row) => {
                const rowTerminalId = row.terminal_id?.trim() || '';
                const rowTerminalName = row.terminal_name?.trim() || '';
                return rowTerminalId === terminalId
                    || Boolean(terminalDisplayCode && rowTerminalId.toUpperCase() === terminalDisplayCode.toUpperCase())
                    || Boolean(terminalDisplayCode && rowTerminalName.toUpperCase() === terminalDisplayCode.toUpperCase());
            });
            const registryIds = rows.map((row) => row.id).filter(Boolean);
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

            let count = 0;
            if (registryIds.length > 0) {
                const { error: deleteError, count: deletedCount } = await supabase
                    .from('tenant_server_registry')
                    .delete({ count: 'exact' })
                    .eq('tenant_id', tenantId)
                    .in('id', registryIds);
                if (deleteError) throw deleteError;
                count = deletedCount || 0;
            }

            await insertDeviceAudit(supabase, {
                tenant_id: tenantId,
                terminal_id: terminalId,
                terminal_name: terminalDisplayCode,
                old_device_id: clearedDeviceIds.join(', ') || null,
                new_device_id: null,
                action: 'CLEAR_TERMINAL_DEVICES',
                performed_by: performedBy,
                reason,
                result: 'SUCCESS',
                metadata: {
                    registry_ids: registryIds,
                    cleared_registry_count: count || 0,
                    cleared_device_ids: clearedDeviceIds,
                    public_terminal_preserved: Boolean(publicTerminal?.id),
                    action_result: 'duplicate_ignored',
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

        const erpTenantId = action === 'TAKEOVER' || action === 'ROTATE_TOKEN'
            ? await resolveErpTenantId(supabase, tenantId)
            : null;
        const preErpConsolidation = action === 'TAKEOVER' && deviceId
            ? await consolidateErpTerminalDeviceDuplicates(supabase, {
                tenantId,
                erpTenantId: erpTenantId || tenantId,
                terminalId,
                terminalName: terminalDisplayCode,
                deviceId,
                copyAuthToCanonical: false,
            })
            : { archived: [], deleted: [], copied_auth: false };

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
                codeless_authorization: true,
                requested_action: requestedAction,
                pre_erp_consolidation: preErpConsolidation,
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

        const erpApiUrl = getEnv('ERP_API_URL', 'CLOUD_ADMIN_ERP_API_URL');
        const erpServiceToken = getEnv('ERP_TAKEOVER_SERVICE_TOKEN', 'ERP_SERVICE_TOKEN', 'CLOUD_ADMIN_ERP_SERVICE_TOKEN');
        const terminalPathId = encodeURIComponent(terminalId);
        const erpPaths = [
            `/api/sync/terminals/${terminalPathId}/takeover`,
            `/api/settings/terminals/${terminalPathId}/takeover`,
        ];
        const erpRequestInit = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${erpServiceToken}`,
                'Content-Type': 'application/json',
                'X-Tenant-Id': erpTenantId || tenantId,
                'X-Cloud-Admin-Tenant-Id': tenantId,
            },
            body: JSON.stringify({
                ...erpPayloadBody,
                cloudAdminTenantId: tenantId,
                erpTenantId,
            }),
        };
        let erpResponse = await fetchFirstAvailableErpRoute(erpApiUrl, erpPaths, erpRequestInit);

        let erpPayload = await erpResponse.json().catch(async () => ({
            message: await erpResponse.text().catch(() => ''),
        }));
        let erpErrorCode = getErrorCode(erpPayload);
        const erpErrorMessage = getUnknownErrorMessage(erpPayload);

        if (!erpResponse.ok && action === 'TAKEOVER' && deviceId && (
            erpErrorCode === '23505'
            || erpErrorMessage.includes('erp_terminals_device_id_key')
            || erpErrorMessage.includes('duplicate key value')
        )) {
            const retryConsolidation = await consolidateErpTerminalDeviceDuplicates(supabase, {
                tenantId,
                erpTenantId: erpTenantId || tenantId,
                terminalId,
                terminalName: terminalDisplayCode,
                deviceId,
                copyAuthToCanonical: false,
            });
            await insertDeviceAudit(supabase, {
                tenant_id: tenantId,
                terminal_id: terminalId,
                terminal_name: terminalDisplayCode,
                old_device_id: previousDeviceId,
                new_device_id: deviceId,
                action: 'DUPLICATE_PREVENTED',
                performed_by: performedBy,
                reason: 'Retry takeover after freeing device_id from duplicate ERP terminal.',
                result: 'SUCCESS',
                erp_response_status: erpResponse.status,
                erp_error_code: erpErrorCode || '23505',
                metadata: {
                    retry_consolidation: retryConsolidation,
                    erp_payload: sanitizePayload(erpPayload),
                },
            });

            erpResponse = await fetchFirstAvailableErpRoute(erpApiUrl, erpPaths, erpRequestInit);
            erpPayload = await erpResponse.json().catch(async () => ({
                message: await erpResponse.text().catch(() => ''),
            }));
            erpErrorCode = getErrorCode(erpPayload);
        }

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
        const postErpConsolidation = action === 'TAKEOVER' && newAuthorizedDeviceId
            ? await consolidateErpTerminalDeviceDuplicates(supabase, {
                tenantId,
                erpTenantId: erpTenantId || tenantId,
                terminalId,
                terminalName: terminalDisplayCode,
                deviceId: newAuthorizedDeviceId,
                copyAuthToCanonical: true,
            })
            : { archived: [], deleted: [], copied_auth: false };

        if (registry?.id) {
            const registryUpdate: Record<string, unknown> = {
                terminal_id: terminalId,
                terminal_name: terminalDisplayCode,
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

        const archivedDuplicateRegistryIds = action === 'TAKEOVER'
            ? await archiveDuplicateRegistriesForTerminal(
                supabase,
                tenantId,
                terminalId,
                terminalDisplayCode,
                registry?.id,
                previousDeviceId,
            )
            : [];

        await insertDeviceAudit(supabase, {
            tenant_id: tenantId,
            terminal_id: terminalId,
            terminal_name: terminalDisplayCode,
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
                action_result: registry?.id ? 'updated_existing' : 'updated_existing_no_local_registry',
                codeless_authorization: true,
                pre_erp_consolidation: preErpConsolidation,
                post_erp_consolidation: postErpConsolidation,
                archived_duplicate_registry_ids: archivedDuplicateRegistryIds,
            },
        });

        if (archivedDuplicateRegistryIds.length > 0) {
            await insertDeviceAudit(supabase, {
                tenant_id: tenantId,
                terminal_id: terminalId,
                terminal_name: terminalDisplayCode,
                old_device_id: previousDeviceId,
                new_device_id: newAuthorizedDeviceId,
                action: 'DUPLICATE_PREVENTED',
                performed_by: performedBy,
                reason: 'Archive duplicate registry rows after POS+ERP terminal takeover.',
                result: 'SUCCESS',
                erp_response_status: erpResponse.status,
                metadata: {
                    archived_duplicate_registry_ids: archivedDuplicateRegistryIds,
                    post_erp_consolidation: postErpConsolidation,
                    canonical_erp_terminal_id: terminalId,
                    authorized_device_id: newAuthorizedDeviceId,
                },
            });
        }

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
