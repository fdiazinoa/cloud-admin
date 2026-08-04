import { createHelpdeskAdminClient, isAuthorizationError, requireHelpdeskActor } from '../_shared/helpdesk-auth.ts';

declare const Deno: {
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface KnowledgePayload {
    action?: string;
    resource_id?: string;
    product?: string;
    resource_type?: string;
    title?: string;
    summary?: string;
    external_url?: string;
    file_name?: string;
    mime_type?: string;
    size_bytes?: number;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const products = new Set(['msmall', 'clicpos', 'erp', 'cloud-admin']);
const resourceTypes = new Set(['manual', 'video', 'link']);
const allowedMimeTypes = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4',
    'video/webm',
    'video/quicktime',
]);
const maxFileBytes = 250 * 1024 * 1024;
const bucket = 'knowledge-center';

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function cleanString(value: unknown, maxLength = 500) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sanitizeFileName(value: unknown) {
    return (cleanString(value, 180) || 'recurso')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^\.+/, '') || 'recurso';
}

function describeError(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        return [record.message, record.details, record.hint, record.code].filter(Boolean).join(' | ') || 'Unknown error';
    }
    return String(error ?? 'Unknown error');
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const actor = await requireHelpdeskActor(request, 'support');
        const payload = await request.json() as KnowledgePayload;
        const action = cleanString(payload.action, 40);
        const supabase = createHelpdeskAdminClient();

        if (action === 'list') {
            const { data, error } = await supabase
                .from('knowledge_resources')
                .select('*')
                .eq('is_active', true)
                .order('updated_at', { ascending: false });
            if (error) throw error;

            const resources = await Promise.all((data ?? []).map(async (resource) => {
                if (resource.external_url) return { ...resource, access_url: resource.external_url };
                if (!resource.storage_bucket || !resource.storage_path) return { ...resource, access_url: null };
                const signed = await supabase.storage
                    .from(resource.storage_bucket)
                    .createSignedUrl(resource.storage_path, 60 * 60);
                return { ...resource, access_url: signed.data?.signedUrl ?? null };
            }));
            return json({ resources });
        }

        if (action === 'create_link') {
            const product = cleanString(payload.product, 40);
            const title = cleanString(payload.title, 200);
            const summary = cleanString(payload.summary, 2000);
            const externalUrl = cleanString(payload.external_url, 2000);
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(externalUrl);
            } catch {
                return json({ error: 'A valid external_url is required' }, 400);
            }
            if (!products.has(product) || !title || !['http:', 'https:'].includes(parsedUrl.protocol)) {
                return json({ error: 'product, title and a valid HTTPS/HTTP URL are required' }, 400);
            }
            const { data, error } = await supabase.from('knowledge_resources').insert({
                product,
                resource_type: 'link',
                title,
                summary: summary || null,
                external_url: parsedUrl.toString(),
                is_active: true,
                created_by: actor.id,
            }).select('*').single();
            if (error) throw error;
            return json({ resource: data });
        }

        if (action === 'create_upload_url') {
            const product = cleanString(payload.product, 40);
            const resourceType = cleanString(payload.resource_type, 40);
            const title = cleanString(payload.title, 200);
            const summary = cleanString(payload.summary, 2000);
            const fileName = sanitizeFileName(payload.file_name);
            const mimeType = cleanString(payload.mime_type, 160).toLowerCase();
            const sizeBytes = Number(payload.size_bytes ?? 0);
            if (!products.has(product) || !resourceTypes.has(resourceType) || resourceType === 'link' || !title) {
                return json({ error: 'Valid product, resource_type and title are required' }, 400);
            }
            if (!allowedMimeTypes.has(mimeType) || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxFileBytes) {
                return json({ error: 'Only PDF, DOCX, MP4, WebM or MOV files up to 250 MB are allowed' }, 400);
            }
            const path = `${product}/${crypto.randomUUID()}-${fileName}`;
            const { data: resource, error: resourceError } = await supabase.from('knowledge_resources').insert({
                product,
                resource_type: resourceType,
                title,
                summary: summary || null,
                storage_bucket: bucket,
                storage_path: path,
                file_name: fileName,
                mime_type: mimeType,
                size_bytes: sizeBytes,
                is_active: false,
                created_by: actor.id,
            }).select('*').single();
            if (resourceError) throw resourceError;

            const { data: upload, error: uploadError } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
            if (uploadError) {
                await supabase.from('knowledge_resources').delete().eq('id', resource.id);
                throw uploadError;
            }
            return json({ resource, upload: { bucket, path, token: upload.token } });
        }

        if (action === 'publish_upload') {
            const resourceId = cleanString(payload.resource_id, 64);
            if (!resourceId) return json({ error: 'resource_id is required' }, 400);
            const { data, error } = await supabase.from('knowledge_resources')
                .update({ is_active: true })
                .eq('id', resourceId)
                .eq('created_by', actor.id)
                .eq('is_active', false)
                .select('*')
                .single();
            if (error) throw error;
            return json({ resource: data });
        }

        if (action === 'archive') {
            const resourceId = cleanString(payload.resource_id, 64);
            if (!resourceId) return json({ error: 'resource_id is required' }, 400);
            const { error } = await supabase.from('knowledge_resources')
                .update({ is_active: false })
                .eq('id', resourceId);
            if (error) throw error;
            return json({ ok: true });
        }

        return json({ error: 'Unknown knowledge action' }, 400);
    } catch (error) {
        const authorizationError = isAuthorizationError(error);
        console.error('knowledge-api failed', describeError(error));
        return json({
            error: authorizationError ? 'unauthorized' : 'Knowledge request failed',
            detail: describeError(error),
        }, authorizationError ? 401 : 500);
    }
});
