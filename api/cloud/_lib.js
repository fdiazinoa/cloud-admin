const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cloud-supabase-url, x-cloud-apikey',
};

const normalizeOptional = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeUrl = (value) => normalizeOptional(value).replace(/\/$/, '');

const setCors = (res) => {
    for (const [header, value] of Object.entries(CORS_HEADERS)) {
        res.setHeader(header, value);
    }
};

export const handleOptions = (req, res) => {
    if (req.method !== 'OPTIONS') {
        return false;
    }

    setCors(res);
    res.statusCode = 204;
    res.end();
    return true;
};

export const sendJson = (res, statusCode, payload) => {
    setCors(res);
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
};

export const readJsonBody = async (req) => {
    if (req.body && typeof req.body === 'object') {
        return req.body;
    }

    if (typeof req.body === 'string' && req.body.trim()) {
        try {
            return JSON.parse(req.body);
        } catch {
            return {};
        }
    }

    const chunks = [];

    for await (const chunk of req) {
        chunks.push(chunk);
    }

    if (!chunks.length) {
        return {};
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        return {};
    }
};

const getForwardedConfig = (req) => {
    const headers = req.headers || {};
    const supabaseUrl = normalizeUrl(
        headers['x-cloud-supabase-url']
        || process.env.VITE_SUPABASE_URL
        || process.env.SUPABASE_URL
        || ''
    );
    const apiKey = normalizeOptional(
        headers['x-cloud-apikey']
        || process.env.VITE_SUPABASE_ANON_KEY
        || process.env.SUPABASE_ANON_KEY
        || ''
    );
    const authHeader = normalizeOptional(headers.authorization || headers.Authorization || '');

    return {
        supabaseUrl,
        apiKey,
        authHeader,
    };
};

const normalizeEndpoint = (row) => {
    if (!row) return null;

    const localIps = Array.isArray(row.local_ips)
        ? Array.from(new Set(row.local_ips.filter(Boolean)))
        : [];

    return {
        tenantId: normalizeOptional(row.tenant_id) || null,
        tenantSlug: normalizeOptional(row.tenant_slug) || null,
        tenantEmail: normalizeOptional(row.tenant_email).toLowerCase() || null,
        deviceId: normalizeOptional(row.device_id) || null,
        terminalId: normalizeOptional(row.terminal_id) || null,
        terminalName: normalizeOptional(row.terminal_name) || null,
        hostname: normalizeOptional(row.hostname) || null,
        protocol: normalizeOptional(row.protocol) || 'http',
        port: Number.isFinite(Number(row.port)) ? Number(row.port) : 3001,
        localIp: normalizeOptional(row.local_ip) || localIps[0] || null,
        localIps,
        endpointUrl: normalizeOptional(row.endpoint_url) || null,
        appVersion: normalizeOptional(row.app_version) || null,
        appVersionCode: Number.isFinite(Number(row.app_version_code)) ? Number(row.app_version_code) : null,
        isPrimary: Boolean(row.is_primary),
        lastSeenAt: row.last_seen_at || null,
        status: normalizeOptional(row.status) || null,
    };
};

export const runTenantRegistryRpc = async (req, rpcName, payload, includeRepresentation = false) => {
    const { supabaseUrl, apiKey, authHeader } = getForwardedConfig(req);

    if (!supabaseUrl || !apiKey) {
        const error = new Error('Cloud Supabase no esta configurado.');
        error.status = 500;
        throw error;
    }

    if (!authHeader) {
        const error = new Error('Sesion Cloud requerida para publicar terminales.');
        error.status = 401;
        throw error;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
        method: 'POST',
        headers: {
            apikey: apiKey,
            Authorization: authHeader,
            'Content-Type': 'application/json',
            'Accept-Profile': 'landlord',
            'Content-Profile': 'landlord',
            ...(includeRepresentation ? { Prefer: 'return=representation' } : {}),
        },
        body: JSON.stringify(payload),
    });

    const text = await response.text().catch(() => '');
    let parsed = null;

    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = text;
    }

    if (!response.ok) {
        const error = new Error(
            typeof parsed?.message === 'string'
                ? parsed.message
                : `Cloud registry RPC failed (${response.status})`
        );
        error.status = response.status;
        error.details = parsed;
        throw error;
    }

    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    return {
        raw: parsed,
        endpoint: normalizeEndpoint(row),
    };
};
