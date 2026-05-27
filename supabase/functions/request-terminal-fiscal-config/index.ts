import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type FiscalConfigMode = 'QA_DEMO' | 'PRODUCTION';

interface FiscalConfigRequest {
    tenant_id?: string;
    terminal_id?: string;
    registry_id?: string | null;
    terminal_name?: string | null;
    mode?: FiscalConfigMode;
    config?: {
        documentType?: string;
        series?: string;
        prefix?: string;
        rangeFrom?: string;
        rangeTo?: string;
        nextConsecutive?: string;
        expiresAt?: string;
        companyId?: string;
        storeId?: string;
        terminalName?: string;
    } | null;
}

interface TenantRecord {
    id: string;
    status: string;
    contracted_product?: string | null;
    cloud_channel?: string | null;
}

interface RegistryRecord {
    id: string;
    terminal_name?: string | null;
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
    if (code === 'INVALID_FISCAL_RANGE') {
        return 'El rango fiscal no es valido.';
    }
    if (code === 'LICENSE_NOT_ALLOWED') {
        return 'La licencia actual no permite configurar fiscalmente esta terminal.';
    }
    if (status === 401 || status === 403) {
        return 'No tienes permiso para configurar fiscalmente esta terminal.';
    }
    if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if (typeof record.message === 'string') return record.message;
        if (typeof record.error === 'string') return record.error;
    }
    return 'El ERP no pudo completar la configuracion fiscal.';
}

function normalizeReadiness(payload: unknown, mode: FiscalConfigMode): Record<string, unknown> {
    const now = new Date().toISOString();
    if (!payload || typeof payload !== 'object') {
        return {
            status: mode === 'QA_DEMO' ? 'DEMO_READY' : 'READY',
            checked_at: now,
        };
    }

    const record = payload as Record<string, unknown>;
    const readiness = (
        record.readiness
        || record.fiscal_readiness
        || record.fiscalReadiness
        || record
    ) as Record<string, unknown>;

    return {
        ...readiness,
        status: (readiness.status || readiness.fiscalReadiness || readiness.fiscal_readiness || (mode === 'QA_DEMO' ? 'DEMO_READY' : 'READY')) as string,
        checked_at: typeof readiness.checked_at === 'string' ? readiness.checked_at : now,
    };
}

function isErpActiveTenant(tenant: TenantRecord) {
    return tenant.contracted_product === 'POS_ERP' || tenant.cloud_channel === 'ERP_ACTIVE';
}

function trimValue(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function validateProductionConfig(config: FiscalConfigRequest['config']) {
    const required = [
        ['documentType', 'tipo de comprobante'],
        ['series', 'serie'],
        ['prefix', 'prefijo'],
        ['rangeFrom', 'rango desde'],
        ['rangeTo', 'rango hasta'],
        ['nextConsecutive', 'proximo consecutivo'],
        ['expiresAt', 'fecha de vencimiento'],
        ['companyId', 'compania'],
        ['storeId', 'sucursal'],
        ['terminalName', 'terminal/caja'],
    ] as const;

    for (const [key, label] of required) {
        if (!trimValue(config?.[key])) {
            return `Completa ${label} para configurar fiscal productivo.`;
        }
    }
    return null;
}

async function insertAudit(
    supabase: ReturnType<typeof createClient>,
    payload: {
        tenant_id: string;
        terminal_id: string;
        terminal_name?: string | null;
        action: 'FISCAL_CONFIG_CREATED' | 'FISCAL_CONFIG_UPDATED';
        performed_by?: string | null;
        mode: FiscalConfigMode;
        result?: string | null;
        erp_response_status?: number | null;
        erp_error_code?: string | null;
        metadata?: Record<string, unknown>;
    },
) {
    const { error } = await supabase.from('terminal_fiscal_config_audit').insert({
        tenant_id: payload.tenant_id,
        terminal_id: payload.terminal_id,
        terminal_name: payload.terminal_name || null,
        action: payload.action,
        performed_by: payload.performed_by || null,
        mode: payload.mode,
        result: payload.result || null,
        erp_response_status: payload.erp_response_status || null,
        erp_error_code: payload.erp_error_code || null,
        metadata: payload.metadata || {},
    });

    if (error) {
        console.error('Failed to write terminal fiscal audit', error);
    }
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

        const body = await request.json().catch(() => ({})) as FiscalConfigRequest;
        const tenantId = body.tenant_id?.trim();
        const terminalId = body.terminal_id?.trim();
        const registryId = body.registry_id?.trim() || null;
        const terminalName = body.terminal_name?.trim() || body.config?.terminalName?.trim() || null;
        const mode = body.mode;
        const performedBy = request.headers.get('x-actor-email')
            || request.headers.get('x-actor-user-id')
            || request.headers.get('x-actor-source')
            || 'cloud-admin';

        if (!tenantId || !terminalId || !mode) {
            return json({
                error: 'VALIDATION_ERROR',
                message: 'Selecciona tenant, terminal y modo fiscal.',
            }, 400);
        }

        if (!['QA_DEMO', 'PRODUCTION'].includes(mode)) {
            return json({ error: 'INVALID_MODE', message: 'Modo fiscal no soportado.' }, 400);
        }

        if (mode === 'PRODUCTION') {
            const validationError = validateProductionConfig(body.config || null);
            if (validationError) {
                return json({ error: 'VALIDATION_ERROR', message: validationError }, 400);
            }
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
            return json({ error: 'TENANT_NOT_ACTIVE', message: 'El tenant debe estar activo para configurar fiscalmente.' }, 400);
        }
        if (!isErpActiveTenant(tenant)) {
            return json({ error: 'ERP_ACTIVE_REQUIRED', message: 'La configuracion fiscal aplica a tenants POS + ERP con ERP_ACTIVE.' }, 400);
        }

        let registry: RegistryRecord | null = null;
        if (registryId) {
            const { data, error } = await supabase
                .from('tenant_server_registry')
                .select('id,terminal_name')
                .eq('tenant_id', tenantId)
                .eq('id', registryId)
                .maybeSingle();
            if (error) throw error;
            registry = data as RegistryRecord | null;
        }

        await insertAudit(supabase, {
            tenant_id: tenantId,
            terminal_id: terminalId,
            terminal_name: terminalName || registry?.terminal_name || null,
            action: 'FISCAL_CONFIG_CREATED',
            performed_by: performedBy,
            mode,
            result: 'REQUESTED',
            metadata: {
                registry_id: registryId,
                source: 'cloud-admin',
                config: mode === 'PRODUCTION' ? body.config : { mode },
            },
        });

        const erpBody = mode === 'QA_DEMO'
            ? { mode: 'QA_DEMO' }
            : {
                mode: 'PRODUCTION',
                fiscalConfig: {
                    documentType: trimValue(body.config?.documentType),
                    series: trimValue(body.config?.series),
                    prefix: trimValue(body.config?.prefix),
                    rangeFrom: trimValue(body.config?.rangeFrom),
                    rangeTo: trimValue(body.config?.rangeTo),
                    nextConsecutive: trimValue(body.config?.nextConsecutive),
                    expiresAt: trimValue(body.config?.expiresAt),
                    companyId: trimValue(body.config?.companyId),
                    storeId: trimValue(body.config?.storeId),
                    terminalName: trimValue(body.config?.terminalName),
                },
            };

        const response = await fetch(`${erpApiUrl.replace(/\/$/, '')}/api/sync/terminals/${encodeURIComponent(terminalId)}/ensure-fiscal-config`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${erpServiceToken}`,
                'Content-Type': 'application/json',
                'X-Tenant-Id': tenantId,
                'X-Cloud-Admin-Tenant-Id': tenantId,
            },
            body: JSON.stringify(erpBody),
        });

        const payload = await response.json().catch(async () => ({
            message: await response.text().catch(() => ''),
        }));
        const errorCode = getErrorCode(payload);

        if (!response.ok) {
            await insertAudit(supabase, {
                tenant_id: tenantId,
                terminal_id: terminalId,
                terminal_name: terminalName || registry?.terminal_name || null,
                action: 'FISCAL_CONFIG_UPDATED',
                performed_by: performedBy,
                mode,
                result: 'FAILED',
                erp_response_status: response.status,
                erp_error_code: errorCode,
                metadata: {
                    erp_payload: payload,
                },
            });

            return json({
                error: errorCode || 'ERP_FISCAL_CONFIG_FAILED',
                message: getErrorMessage(response.status, payload),
            }, response.status);
        }

        const readiness = normalizeReadiness(payload, mode);
        const updatePayload = {
            fiscal_readiness: readiness,
            last_fiscal_readiness_at: readiness.checked_at,
            updated_at: new Date().toISOString(),
        };

        if (registryId) {
            const { error: updateError } = await supabase
                .from('tenant_server_registry')
                .update(updatePayload)
                .eq('id', registryId)
                .eq('tenant_id', tenantId);
            if (updateError) console.error('Failed to persist fiscal config readiness', updateError);
        } else {
            const { error: updateError } = await supabase
                .from('tenant_server_registry')
                .update(updatePayload)
                .eq('tenant_id', tenantId)
                .eq('terminal_id', terminalId);
            if (updateError) console.error('Failed to persist fiscal config readiness', updateError);
        }

        await insertAudit(supabase, {
            tenant_id: tenantId,
            terminal_id: terminalId,
            terminal_name: terminalName || registry?.terminal_name || null,
            action: 'FISCAL_CONFIG_UPDATED',
            performed_by: performedBy,
            mode,
            result: 'SUCCESS',
            erp_response_status: response.status,
            metadata: {
                erp_payload: payload,
                readiness,
            },
        });

        return json({
            status: 'success',
            mode,
            readiness,
            message: mode === 'QA_DEMO'
                ? 'Configuracion fiscal demo creada. Refresca el POS para validar DEMO_READY.'
                : 'Configuracion fiscal productiva guardada. Refresca el POS para validar READY.',
        });
    } catch (error) {
        console.error('request-terminal-fiscal-config failed', error);
        return json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Error interno configurando fiscalmente la terminal.',
        }, 500);
    }
});
