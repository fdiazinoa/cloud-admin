import { assertHelpdeskTicketAccess, createHelpdeskAdminClient, isAuthorizationError, requireHelpdeskActor } from '../_shared/helpdesk-auth.ts';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface MessagesPayload {
    ticket_id?: string;
}

interface AttachmentMetadata {
    id?: string;
    name?: string;
    mime_type?: string;
    size_bytes?: number;
    bucket?: string;
    path?: string;
    uploaded_at?: string;
    signed_url?: string | null;
    status?: string;
    error?: string;
}

type AttachmentEnvelope = Record<string, unknown>;

interface MessageRow {
    id: string;
    sender_type: 'Admin' | 'Client' | 'System';
    message: string;
    attachments?: unknown;
    visibility?: 'public' | 'private';
    message_kind?: string;
    delivery_status?: string | null;
    delivery_channel?: string | null;
    provider_message_id?: string | null;
    delivery_attempts?: number;
    delivery_error?: string | null;
    delivered_at?: string | null;
    failed_at?: string | null;
    cc?: string[];
    bcc?: string[];
    created_by?: string | null;
    created_at: string;
}

const SIGNED_URL_TTL_SECONDS = 60 * 15;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function describeError(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        const parts = [
            typeof record.message === 'string' ? record.message : null,
            typeof record.details === 'string' ? record.details : null,
            typeof record.hint === 'string' ? record.hint : null,
            typeof record.code === 'string' ? `code: ${record.code}` : null,
        ].filter(Boolean);

        if (parts.length) return parts.join(' | ');
    }

    return 'Unknown error';
}

async function assertAuthorized(request: Request) {
    return requireHelpdeskActor(request);
}

function normalizeAttachments(value: unknown): AttachmentMetadata[] {
    if (!Array.isArray(value)) return [];

    return value
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        .map((item) => ({
            id: typeof item.id === 'string' ? item.id : undefined,
            name: typeof item.name === 'string' ? item.name : undefined,
            mime_type: typeof item.mime_type === 'string' ? item.mime_type : undefined,
            size_bytes: typeof item.size_bytes === 'number' ? item.size_bytes : undefined,
            bucket: typeof item.bucket === 'string' ? item.bucket : undefined,
            path: typeof item.path === 'string' ? item.path : undefined,
            uploaded_at: typeof item.uploaded_at === 'string' ? item.uploaded_at : undefined,
            signed_url: null,
            status: typeof item.status === 'string' ? item.status : undefined,
            error: typeof item.error === 'string' ? item.error : undefined,
        }))
        .filter((attachment) => Boolean(attachment.name || attachment.path));
}

async function signAttachments(supabase: ReturnType<typeof createHelpdeskAdminClient>, attachments: AttachmentMetadata[]) {
    return Promise.all(attachments.map(async (attachment) => {
        const mimeTypeAllowed = attachment.mime_type ? ALLOWED_ATTACHMENT_MIME_TYPES.has(attachment.mime_type) : false;
        if (!attachment.bucket || !attachment.path || !mimeTypeAllowed) {
            return { ...attachment, signed_url: null };
        }

        const { data, error } = await supabase.storage
            .from(attachment.bucket)
            .createSignedUrl(attachment.path, SIGNED_URL_TTL_SECONDS);

        if (error || !data?.signedUrl) {
            console.error('Support messages: unable to sign attachment', {
                bucket: attachment.bucket,
                name: attachment.name,
                error: error?.message,
            });
            return { ...attachment, signed_url: null };
        }

        return { ...attachment, signed_url: data.signedUrl };
    }));
}

async function hydrateMessageAttachments(supabase: ReturnType<typeof createHelpdeskAdminClient>, value: unknown) {
    if (Array.isArray(value)) {
        return signAttachments(supabase, normalizeAttachments(value));
    }

    if (!value || typeof value !== 'object') {
        return [];
    }

    const envelope = value as AttachmentEnvelope;
    const embeddedFiles = Array.isArray(envelope.files)
        ? envelope.files
        : Array.isArray(envelope.attachments)
            ? envelope.attachments
            : [];
    const signedFiles = await signAttachments(supabase, normalizeAttachments(embeddedFiles));

    return {
        ...envelope,
        files: signedFiles,
    };
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return json({ ok: true });
    }

    if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    try {
        const actor = await assertAuthorized(request);

        const payload = await request.json() as MessagesPayload;
        const ticketId = payload.ticket_id?.trim();
        if (!ticketId) {
            return json({ error: 'ticket_id is required' }, 400);
        }

        const supabase = createHelpdeskAdminClient();
        await assertHelpdeskTicketAccess(supabase, actor, [ticketId]);

        const { data, error } = await supabase
            .from('ticket_messages')
            .select(`
                id,
                sender_type,
                message,
                attachments,
                visibility,
                message_kind,
                delivery_status,
                delivery_channel,
                provider_message_id,
                delivery_attempts,
                delivery_error,
                delivered_at,
                failed_at,
                cc,
                bcc,
                created_by,
                created_at
            `)
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const messages = await Promise.all(((data ?? []) as MessageRow[]).map(async (message) => ({
            ...message,
            attachments: await hydrateMessageAttachments(supabase, message.attachments),
        })));

        return json({ messages });
    } catch (error) {
        const detail = describeError(error);
        const isUnauthorized = isAuthorizationError(error);
        console.error('Support messages: request failed', detail);
        return json(
            { error: isUnauthorized ? 'unauthorized' : 'Unable to load support messages', detail },
            isUnauthorized ? 401 : 500,
        );
    }
});
