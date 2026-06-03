declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-actor-source',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const sensitiveKeys = new Set([
    'token',
    'access_token',
    'refresh_token',
    'syncAuthToken',
    'sync_auth_token',
    'password',
    'secret',
    'api_key',
    'apikey',
]);

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
        },
    });
}

function getOptionalEnv(...names: string[]) {
    for (const name of names) {
        const value = Deno.env.get(name);
        if (value) return value;
    }
    return null;
}

function sanitize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => sanitize(item));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (sensitiveKeys.has(key.toLowerCase())) continue;
        output[key] = sanitize(item);
    }
    return output;
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
        return json({ error: 'METHOD_NOT_ALLOWED', message: 'Metodo no permitido.' }, 405);
    }

    const erpBaseUrl = getOptionalEnv('ERP_BASE_URL', 'ERP_API_URL', 'CLOUD_ADMIN_ERP_API_URL');
    const telemetryToken = getOptionalEnv('ERP_TELEMETRY_TOKEN', 'CLOUD_ADMIN_ERP_TELEMETRY_TOKEN');

    if (!erpBaseUrl || !telemetryToken) {
        return json({
            configured: false,
            message: 'Telemetria ERP opcional no configurada.',
            tenants: [],
            endpoints: [],
        });
    }

    try {
        const response = await fetch(`${erpBaseUrl.replace(/\/$/, '')}/api/dev/telemetry/summary`, {
            method: 'GET',
            headers: {
                'X-Telemetry-Token': telemetryToken,
                'Accept': 'application/json',
            },
        });
        const payload = await response.json().catch(async () => ({
            message: await response.text().catch(() => ''),
        }));

        return json({
            configured: true,
            http_status: response.status,
            ...(sanitize(payload) as Record<string, unknown>),
        }, response.ok ? 200 : response.status);
    } catch (error) {
        console.error('ERP telemetry summary failed', error);
        return json({
            configured: true,
            error: 'ERP_TELEMETRY_UNAVAILABLE',
            message: 'No se pudo obtener telemetria del ERP.',
            tenants: [],
            endpoints: [],
        }, 502);
    }
});
