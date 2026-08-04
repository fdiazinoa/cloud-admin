import { supabase } from './supabase';

export type KnowledgeProduct = 'msmall' | 'clicpos' | 'erp' | 'cloud-admin';
export type KnowledgeResourceType = 'manual' | 'video' | 'link';

export interface KnowledgeResource {
    id: string;
    product: KnowledgeProduct;
    resource_type: KnowledgeResourceType;
    title: string;
    summary?: string | null;
    external_url?: string | null;
    file_name?: string | null;
    mime_type?: string | null;
    size_bytes?: number | null;
    access_url?: string | null;
    created_at: string;
    updated_at: string;
}

interface FunctionErrorPayload {
    error?: string;
    detail?: string;
}

async function invokeKnowledge<T>(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('knowledge-api', { body: { action, ...payload } });
    if (error) {
        let detail = error.message;
        const context = error.context as Response | undefined;
        if (context?.clone) {
            const response = await context.clone().json().catch(() => null) as FunctionErrorPayload | null;
            detail = response?.detail || response?.error || detail;
        }
        throw new Error(detail);
    }
    return data as T;
}

export async function listKnowledgeResources() {
    return invokeKnowledge<{ resources: KnowledgeResource[] }>('list');
}

export async function createKnowledgeLink(input: {
    product: KnowledgeProduct;
    title: string;
    summary: string;
    externalUrl: string;
}) {
    return invokeKnowledge<{ resource: KnowledgeResource }>('create_link', {
        product: input.product,
        title: input.title,
        summary: input.summary,
        external_url: input.externalUrl,
    });
}

export async function uploadKnowledgeResource(input: {
    product: KnowledgeProduct;
    resourceType: Exclude<KnowledgeResourceType, 'link'>;
    title: string;
    summary: string;
    file: File;
}) {
    const prepared = await invokeKnowledge<{
        resource: KnowledgeResource;
        upload: { bucket: string; path: string; token: string };
    }>('create_upload_url', {
        product: input.product,
        resource_type: input.resourceType,
        title: input.title,
        summary: input.summary,
        file_name: input.file.name,
        mime_type: input.file.type,
        size_bytes: input.file.size,
    });

    const { error } = await supabase.storage
        .from(prepared.upload.bucket)
        .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, input.file, {
            contentType: input.file.type,
        });
    if (error) throw error;

    return invokeKnowledge<{ resource: KnowledgeResource }>('publish_upload', {
        resource_id: prepared.resource.id,
    });
}

export async function archiveKnowledgeResource(resourceId: string) {
    return invokeKnowledge<{ ok: true }>('archive', { resource_id: resourceId });
}
