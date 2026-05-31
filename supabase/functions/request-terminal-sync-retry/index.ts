import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: { get(key: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface RequestBody {
    tenant_id?: string;
    terminal_id?: string;
    document_id?: string | null;
    document_ids?: string[];
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

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
        const documentId = body.document_id?.trim() || null;
        const documentIds = Array.isArray(body.document_ids) ? body.document_ids.filter(Boolean) : [];

        if (!tenantId || !terminalId) {
            return json({ error: 'VALIDATION_ERROR', message: 'Selecciona tenant y terminal para reintentar documentos.' }, 400);
        }

        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id,status')
            .eq('id', tenantId)
            .maybeSingle();

        if (tenantError) throw tenantError;
        if (!tenant) return json({ error: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado.' }, 404);

        const baseUrl = erpApiUrl.replace(/\/$/, '');
        const url = documentId
            ? `${baseUrl}/api/sync/documents/${encodeURIComponent(documentId)}/retry`
            : `${baseUrl}/api/sync/terminals/${encodeURIComponent(terminalId)}/retry-pending`;

        const erpResponse = await fetch(url, {
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
                documentId,
                documentIds,
            }),
        });

        const payload = await erpResponse.json().catch(async () => ({
            message: await erpResponse.text().catch(() => ''),
        }));
        const sanitizedPayload = sanitizePayload(payload);

        if (!erpResponse.ok) {
            const record = asRecord(sanitizedPayload);
            return json({
                error: record.error || 'ERP_SYNC_RETRY_FAILED',
                message: record.message || 'No se pudieron reintentar los documentos pendientes.',
            }, erpResponse.status);
        }

        return json({
            ...asRecord(sanitizedPayload),
            status: asRecord(sanitizedPayload).status || 'success',
            message: asRecord(sanitizedPayload).message || 'Reintento solicitado correctamente.',
        });
    } catch (error) {
        console.error('request-terminal-sync-retry failed', error);
        return json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Error interno reintentando documentos pendientes.',
        }, 500);
    }
});
