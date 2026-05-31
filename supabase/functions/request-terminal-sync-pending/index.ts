import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: { get(key: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface RequestBody {
    tenant_id?: string;
    terminal_id?: string;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-actor-user-id, x-actor-email, x-actor-source',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

function asArray(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[] : [];
}

function getString(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number') return String(value);
    }
    return '';
}

function getReadiness(record: Record<string, unknown>) {
    return asRecord(record.readiness || record.erp_readiness || record.context || {});
}

function isProfileDraft(record: Record<string, unknown>) {
    const readiness = getReadiness(record);
    const checks = asRecord(readiness.checks);
    const status = getString(readiness, ['profileStatus', 'profile_status']).toUpperCase();
    return status === 'DRAFT' || checks.profile === false;
}

function isErpContextMissing(record: Record<string, unknown>) {
    return getString(record, ['error_code', 'errorCode', 'code']).toUpperCase() === 'ERP_CONTEXT_MISSING';
}

function normalizeDocuments(payload: unknown) {
    const record = asRecord(payload);
    const documents = asArray(record.documents || record.items || record.pending || record.data);
    return documents.sort((left, right) => {
        const leftDate = Date.parse(getString(left, ['created_at', 'createdAt', 'date', 'timestamp'])) || 0;
        const rightDate = Date.parse(getString(right, ['created_at', 'createdAt', 'date', 'timestamp'])) || 0;
        if (leftDate !== rightDate) return leftDate - rightDate;
        return getString(left, ['sequence', 'folio', 'document_no', 'documentNo'])
            .localeCompare(getString(right, ['sequence', 'folio', 'document_no', 'documentNo']), undefined, { numeric: true });
    });
}

function summarize(documents: Record<string, unknown>[]) {
    let repairable = 0;
    let functionalErrors = 0;

    for (const document of documents) {
        if (isErpContextMissing(document) && isProfileDraft(document)) {
            repairable += 1;
        } else if (getString(document, ['error_code', 'errorCode', 'code'])) {
            functionalErrors += 1;
        }
    }

    return {
        pending: documents.length,
        repairable,
        functionalErrors,
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

        if (!tenantId || !terminalId) {
            return json({ error: 'VALIDATION_ERROR', message: 'Selecciona tenant y terminal para consultar pendientes.' }, 400);
        }

        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id,status')
            .eq('id', tenantId)
            .maybeSingle();

        if (tenantError) throw tenantError;
        if (!tenant) return json({ error: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado.' }, 404);

        const erpResponse = await fetch(`${erpApiUrl.replace(/\/$/, '')}/api/sync/terminals/${encodeURIComponent(terminalId)}/pending-documents`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${erpServiceToken}`,
                'Content-Type': 'application/json',
                'X-Tenant-Id': tenantId,
                'X-Cloud-Admin-Tenant-Id': tenantId,
            },
        });

        const payload = await erpResponse.json().catch(async () => ({
            message: await erpResponse.text().catch(() => ''),
        }));

        if (!erpResponse.ok) {
            const record = asRecord(payload);
            return json({
                error: record.error || 'ERP_PENDING_DOCUMENTS_FAILED',
                message: record.message || 'No se pudieron cargar los documentos pendientes desde ERP.',
                documents: [],
                summary: { pending: 0, repairable: 0, functionalErrors: 0 },
            }, erpResponse.status);
        }

        const documents = normalizeDocuments(payload);
        return json({
            status: 'success',
            documents,
            summary: summarize(documents),
        });
    } catch (error) {
        console.error('request-terminal-sync-pending failed', error);
        return json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Error interno consultando documentos pendientes.',
            documents: [],
            summary: { pending: 0, repairable: 0, functionalErrors: 0 },
        }, 500);
    }
});
