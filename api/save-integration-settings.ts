import { createHash, createCipheriv, randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

interface IntegrationSettingsPayload {
    resend_inbound_email?: string;
    resend_from_name?: string;
    resend_from_email?: string;
    ai_provider?: 'openai' | 'anthropic' | 'disabled';
    ai_model?: string;
    ai_triage_enabled?: boolean;
    ai_sentiment_enabled?: boolean;
    ai_auto_drafts_enabled?: boolean;
}

interface SavePayload {
    settings?: IntegrationSettingsPayload;
    secrets?: {
        resend_api_key?: string;
        openai_api_key?: string;
        anthropic_api_key?: string;
    };
}

type ApiRequest = IncomingMessage & {
    body?: unknown;
    headers: IncomingHttpHeaders;
    method?: string;
};

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
}

function getEnv(...names: string[]) {
    for (const name of names) {
        const value = process.env[name];
        if (value) return value;
    }

    throw new Error(`Missing required environment variable: ${names.join(' or ')}`);
}

function getHeader(headers: IncomingHttpHeaders, name: string) {
    const value = headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
}

async function readBody(request: ApiRequest) {
    if (request.body) {
        return typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const rawBody = Buffer.concat(chunks).toString('utf8');
    return rawBody ? JSON.parse(rawBody) : {};
}

function isAuthorizedConfigurationRequest(request: ApiRequest) {
    const expectedToken = process.env.CONFIG_ADMIN_TOKEN;
    const receivedToken = getHeader(request.headers, 'x-config-admin-token');

    if (expectedToken && receivedToken === expectedToken) {
        return true;
    }

    const authorization = getHeader(request.headers, 'authorization') ?? '';
    const bearerToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!bearerToken) return false;

    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY');
    return bearerToken === serviceRoleKey;
}

function encryptSecret(value: string) {
    const key = createHash('sha256').update(getEnv('INTEGRATION_SECRET_KEY')).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
        cipher.getAuthTag(),
    ]);

    return {
        secret_ciphertext: ciphertext.toString('base64'),
        secret_iv: iv.toString('base64'),
        secret_last4: value.slice(-4),
    };
}

function normalizeEmail(value?: string) {
    return value?.trim().toLowerCase();
}

function cleanSettings(settings: IntegrationSettingsPayload = {}) {
    return {
        id: 'helpdesk',
        ...(settings.resend_inbound_email ? { resend_inbound_email: normalizeEmail(settings.resend_inbound_email) } : {}),
        ...(settings.resend_from_name ? { resend_from_name: settings.resend_from_name.trim() } : {}),
        ...(settings.resend_from_email ? { resend_from_email: normalizeEmail(settings.resend_from_email) } : {}),
        ...(settings.ai_provider ? { ai_provider: settings.ai_provider } : {}),
        ...(settings.ai_model ? { ai_model: settings.ai_model.trim() } : {}),
        ...(typeof settings.ai_triage_enabled === 'boolean' ? { ai_triage_enabled: settings.ai_triage_enabled } : {}),
        ...(typeof settings.ai_sentiment_enabled === 'boolean' ? { ai_sentiment_enabled: settings.ai_sentiment_enabled } : {}),
        ...(typeof settings.ai_auto_drafts_enabled === 'boolean' ? { ai_auto_drafts_enabled: settings.ai_auto_drafts_enabled } : {}),
    };
}

async function upsertSecret(
    supabase: ReturnType<typeof createClient>,
    provider: 'resend' | 'openai' | 'anthropic',
    value?: string,
) {
    const trimmed = value?.trim();
    if (!trimmed) return false;

    const encrypted = encryptSecret(trimmed);
    const { error } = await supabase.from('support_integration_secrets').upsert({
        provider,
        ...encrypted,
    });

    if (error) throw error;
    return true;
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
    if (request.method === 'OPTIONS') {
        sendJson(response, 200, { ok: true });
        return;
    }

    if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
    }

    try {
        if (!isAuthorizedConfigurationRequest(request)) {
            sendJson(response, 401, { error: 'Unauthorized configuration request' });
            return;
        }

        const payload = await readBody(request) as SavePayload;
        const supabase = createClient(
            getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL'),
            getEnv('SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY'),
            {
                auth: { autoRefreshToken: false, persistSession: false },
                db: { schema: 'landlord' },
            },
        );

        const { error: settingsError } = await supabase
            .from('support_integration_settings')
            .upsert(cleanSettings(payload.settings), { onConflict: 'id' });

        if (settingsError) throw settingsError;

        const secretsChanged = {
            resend: await upsertSecret(supabase, 'resend', payload.secrets?.resend_api_key),
            openai: await upsertSecret(supabase, 'openai', payload.secrets?.openai_api_key),
            anthropic: await upsertSecret(supabase, 'anthropic', payload.secrets?.anthropic_api_key),
        };

        sendJson(response, 200, { ok: true, secrets_changed: secretsChanged });
    } catch (error) {
        console.error('save-integration-settings failed', error);
        sendJson(response, 500, {
            error: 'Could not save integration settings',
            detail: error instanceof Error ? error.message : String(error),
        });
    }
}
