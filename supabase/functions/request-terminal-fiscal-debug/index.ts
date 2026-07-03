import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface FiscalDebugRequest {
    tenant_id?: string;
    terminal_id?: string;
    registry_id?: string | null;
}

interface TenantRecord {
    id: string;
    status: string;
    contracted_product?: string | null;
    cloud_channel?: string | null;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-actor-user-id, x-actor-email, x-actor-source',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    if (code === 'FISCAL_CONFIG_MISSING') {
        return 'Falta configuracion fiscal para esta terminal.';
    }
    if (status === 401 || status === 403) {
        return 'No tienes permiso para consultar el mapping fiscal de esta terminal.';
    }
    if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if (typeof record.message === 'string') return record.message;
        if (typeof record.error === 'string') return record.error;
    }
    return 'No se pudo cargar fiscal-debug desde el ERP.';
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function asStringList(value: unknown): string[] {
    if (!value) return [];
    if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
}

function normalizeFiscalDebug(payload: unknown, source: 'fiscal-debug' | 'fiscal-readiness'): Record<string, unknown> {
    const now = new Date().toISOString();
    if (!payload || typeof payload !== 'object') {
        return {
            status: 'MISSING',
            fiscalReadiness: 'MISSING',
            checked_at: now,
            source,
        };
    }

    const record = payload as Record<string, unknown>;
    const readiness = asRecord(
        record.readiness
        || record.fiscal_readiness
        || record.fiscalReadiness
        || record.debug
        || record,
    );

    const status = (
        readiness.status
        || readiness.fiscalReadiness
        || readiness.fiscal_readiness
        || record.status
        || 'MISSING'
    ) as string;

    const errorCode = getErrorCode(record) || getErrorCode(readiness);
    const missing = [
        ...asStringList(readiness.missing),
        ...asStringList(readiness.missingItems),
        ...asStringList(readiness.missing_items),
        ...asStringList(readiness.missingConfig),
        ...asStringList(readiness.missing_config),
    ];

    return {
        ...readiness,
        status,
        fiscalReadiness: readiness.fiscalReadiness || readiness.fiscal_readiness || status,
        matchedStrategy: readiness.matchedStrategy || readiness.matched_strategy || readiness.strategy || null,
        documentSeriesFound: readiness.documentSeriesFound ?? readiness.document_series_found ?? null,
        fiscalRangesFound: readiness.fiscalRangesFound ?? readiness.fiscal_ranges_found ?? null,
        fiscalSequencesFound: readiness.fiscalSequencesFound ?? readiness.fiscal_sequences_found ?? null,
        terminalFiscalConfigFound: readiness.terminalFiscalConfigFound ?? readiness.terminal_fiscal_config_found ?? null,
        missing: missing.length ? missing : (errorCode === 'FISCAL_CONFIG_MISSING' ? ['terminalFiscalConfig'] : []),
        searchedIn: asStringList(readiness.searchedIn || readiness.searched_in || readiness.searchPath || readiness.search_path || readiness.lookedIn || readiness.looked_in),
        found: asStringList(readiness.found || readiness.foundItems || readiness.found_items),
        scopeHints: asStringList(
            readiness.scopeHints
            || readiness.scope_hints
            || readiness.scopes
            || readiness.branchConfig
            || readiness.companyConfig
            || readiness.tenantConfig,
        ),
        error: errorCode,
        error_code: errorCode,
        message: typeof readiness.message === 'string'
            ? readiness.message
            : typeof record.message === 'string'
                ? record.message
                : errorCode === 'FISCAL_CONFIG_MISSING'
                    ? getErrorMessage(404, record)
                    : null,
        checked_at: typeof readiness.checked_at === 'string' ? readiness.checked_at : now,
        source,
    };
}

function isErpActiveTenant(tenant: TenantRecord) {
    return tenant.contracted_product === 'POS_ERP' || tenant.cloud_channel === 'ERP_ACTIVE';
}

async function fetchErpFiscalPayload(
    erpApiUrl: string,
    erpServiceToken: string,
    tenantId: string,
    terminalId: string,
) {
    const headers = {
        Authorization: `Bearer ${erpServiceToken}`,
        'Content-Type': 'application/json',
        'X-Tenant-Id': tenantId,
        'X-Cloud-Admin-Tenant-Id': tenantId,
    };
    const base = `${erpApiUrl.replace(/\/$/, '')}/api/sync/terminals/${encodeURIComponent(terminalId)}`;

    const debugResponse = await fetch(`${base}/fiscal-debug`, { method: 'GET', headers });
    const debugPayload = await debugResponse.json().catch(async () => ({
        message: await debugResponse.text().catch(() => ''),
    }));

    if (debugResponse.ok) {
        return {
            payload: debugPayload,
            source: 'fiscal-debug' as const,
            httpStatus: debugResponse.status,
        };
    }

    if (debugResponse.status !== 404 && getErrorCode(debugPayload) !== 'FISCAL_CONFIG_MISSING') {
        return {
            payload: debugPayload,
            source: 'fiscal-debug' as const,
            httpStatus: debugResponse.status,
            failed: true,
        };
    }

    const readinessResponse = await fetch(`${base}/fiscal-readiness`, { method: 'GET', headers });
    const readinessPayload = await readinessResponse.json().catch(async () => ({
        message: await readinessResponse.text().catch(() => ''),
    }));

    return {
        payload: readinessPayload,
        source: 'fiscal-readiness' as const,
        httpStatus: readinessResponse.status,
        failed: !readinessResponse.ok,
    };
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

        const body = await request.json().catch(() => ({})) as FiscalDebugRequest;
        const tenantId = body.tenant_id?.trim();
        const terminalId = body.terminal_id?.trim();
        const registryId = body.registry_id?.trim() || null;

        if (!tenantId || !terminalId) {
            return json({
                error: 'VALIDATION_ERROR',
                message: 'Selecciona tenant y terminal para verificar mapping fiscal.',
            }, 400);
        }

        const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select('id,status,contracted_product,cloud_channel')
            .eq('id', tenantId)
            .maybeSingle();

        if (tenantError) throw tenantError;
        const tenant = tenantData as TenantRecord | null;
        if (!tenant) return json({ error: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado.' }, 404);
        if (tenant.status !== 'ACTIVE') {
            return json({ error: 'TENANT_NOT_ACTIVE', message: 'El tenant debe estar activo para validar mapping fiscal.' }, 400);
        }
        if (!isErpActiveTenant(tenant)) {
            return json({ error: 'ERP_ACTIVE_REQUIRED', message: 'El mapping fiscal aplica a tenants POS + ERP con ERP_ACTIVE.' }, 400);
        }

        const erpResult = await fetchErpFiscalPayload(erpApiUrl, erpServiceToken, tenantId, terminalId);
        const errorCode = getErrorCode(erpResult.payload);

        if (erpResult.failed && errorCode !== 'FISCAL_CONFIG_MISSING') {
            return json({
                error: errorCode || 'ERP_FISCAL_DEBUG_FAILED',
                message: getErrorMessage(erpResult.httpStatus, erpResult.payload),
            }, erpResult.httpStatus >= 400 ? erpResult.httpStatus : 502);
        }

        const readiness = normalizeFiscalDebug(erpResult.payload, erpResult.source);

        if (registryId) {
            const { error: updateError } = await supabase
                .from('tenant_server_registry')
                .update({
                    fiscal_readiness: readiness,
                    last_fiscal_readiness_at: readiness.checked_at,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', registryId)
                .eq('tenant_id', tenantId);
            if (updateError) console.error('Failed to persist fiscal debug readiness', updateError);
        } else {
            const { error: updateError } = await supabase
                .from('tenant_server_registry')
                .update({
                    fiscal_readiness: readiness,
                    last_fiscal_readiness_at: readiness.checked_at,
                    updated_at: new Date().toISOString(),
                })
                .eq('tenant_id', tenantId)
                .eq('terminal_id', terminalId);
            if (updateError) console.error('Failed to persist fiscal debug readiness', updateError);
        }

        return json({
            status: 'success',
            readiness,
            source: erpResult.source,
        });
    } catch (error) {
        console.error('request-terminal-fiscal-debug failed', error);
        return json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Error interno consultando fiscal-debug.',
        }, 500);
    }
});
