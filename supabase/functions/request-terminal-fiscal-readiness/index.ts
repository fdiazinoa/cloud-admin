import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface FiscalReadinessRequest {
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
        return 'No tienes permiso para consultar la configuracion fiscal de esta terminal.';
    }
    if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if (typeof record.message === 'string') return record.message;
        if (typeof record.error === 'string') return record.error;
    }
    return 'No se pudo cargar la configuracion fiscal desde el ERP.';
}

function normalizeReadiness(payload: unknown): Record<string, unknown> {
    const now = new Date().toISOString();
    if (!payload || typeof payload !== 'object') {
        return {
            status: 'MISSING',
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
        status: (readiness.status || readiness.fiscalReadiness || readiness.fiscal_readiness || 'MISSING') as string,
        checked_at: typeof readiness.checked_at === 'string' ? readiness.checked_at : now,
    };
}

function isErpActiveTenant(tenant: TenantRecord) {
    return tenant.contracted_product === 'POS_ERP' || tenant.cloud_channel === 'ERP_ACTIVE';
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

        const body = await request.json().catch(() => ({})) as FiscalReadinessRequest;
        const tenantId = body.tenant_id?.trim();
        const terminalId = body.terminal_id?.trim();
        const registryId = body.registry_id?.trim() || null;

        if (!tenantId || !terminalId) {
            return json({
                error: 'VALIDATION_ERROR',
                message: 'Selecciona tenant y terminal para consultar configuracion fiscal.',
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
            return json({ error: 'TENANT_NOT_ACTIVE', message: 'El tenant debe estar activo para validar configuracion fiscal.' }, 400);
        }
        if (!isErpActiveTenant(tenant)) {
            return json({ error: 'ERP_ACTIVE_REQUIRED', message: 'La configuracion fiscal aplica a tenants POS + ERP con ERP_ACTIVE.' }, 400);
        }

        const response = await fetch(`${erpApiUrl.replace(/\/$/, '')}/api/sync/terminals/${encodeURIComponent(terminalId)}/fiscal-readiness`, {
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
            const missingPayload = getErrorCode(payload) === 'FISCAL_CONFIG_MISSING'
                ? normalizeReadiness({
                    status: 'MISSING',
                    collection: (payload as Record<string, unknown>).collection || 'fiscalSequences',
                    message: getErrorMessage(response.status, payload),
                })
                : null;

            if (!missingPayload) {
                return json({
                    error: getErrorCode(payload) || 'ERP_FISCAL_READINESS_FAILED',
                    message: getErrorMessage(response.status, payload),
                }, response.status);
            }

            if (registryId) {
                const { error: updateError } = await supabase
                    .from('tenant_server_registry')
                    .update({
                        fiscal_readiness: missingPayload,
                        last_fiscal_readiness_at: missingPayload.checked_at,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', registryId)
                    .eq('tenant_id', tenantId);
                if (updateError) console.error('Failed to persist fiscal missing readiness', updateError);
            }

            return json({
                status: 'success',
                readiness: missingPayload,
            });
        }

        const readiness = normalizeReadiness(payload);
        const updateBuilder = supabase
            .from('tenant_server_registry')
            .update({
                fiscal_readiness: readiness,
                last_fiscal_readiness_at: readiness.checked_at,
                updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId);

        const { error: updateError } = registryId
            ? await updateBuilder.eq('id', registryId)
            : await updateBuilder.eq('terminal_id', terminalId);

        if (updateError) {
            console.error('Failed to persist fiscal readiness', updateError);
        }

        return json({
            status: 'success',
            readiness,
        });
    } catch (error) {
        console.error('request-terminal-fiscal-readiness failed', error);
        return json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Error interno consultando configuracion fiscal.',
        }, 500);
    }
});
