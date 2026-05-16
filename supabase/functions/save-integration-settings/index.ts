import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

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

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-config-admin-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function getEnv(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function isAuthorizedConfigurationRequest(request: Request) {
    const expectedToken = Deno.env.get('CONFIG_ADMIN_TOKEN');
    const receivedToken = request.headers.get('x-config-admin-token');

    if (expectedToken && receivedToken === expectedToken) {
        return true;
    }

    const authorization = request.headers.get('authorization') ?? '';
    const bearerToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!bearerToken) return false;

    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    return bearerToken === serviceRoleKey;
}

function bytesToBase64(bytes: Uint8Array) {
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

async function getAesKey() {
    const secret = getEnv('INTEGRATION_SECRET_KEY');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt']);
}

async function encryptSecret(value: string) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await getAesKey();
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(value),
    );

    return {
        secret_ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
        secret_iv: bytesToBase64(iv),
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

    const encrypted = await encryptSecret(trimmed);
    const { error } = await supabase.from('support_integration_secrets').upsert({
        provider,
        ...encrypted,
    });

    if (error) throw error;
    return true;
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    try {
        if (!isAuthorizedConfigurationRequest(request)) {
            return json({ error: 'Unauthorized configuration request' }, 401);
        }

        const payload = await request.json() as SavePayload;
        const supabase = createClient(
            getEnv('SUPABASE_URL'),
            getEnv('SUPABASE_SERVICE_ROLE_KEY'),
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

        return json({ ok: true, secrets_changed: secretsChanged });
    } catch (error) {
        console.error('save-integration-settings failed', error);
        return json({
            error: 'Could not save integration settings',
            detail: error instanceof Error ? error.message : String(error),
        }, 500);
    }
});
