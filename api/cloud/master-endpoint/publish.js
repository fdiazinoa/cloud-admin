import { handleOptions, readJsonBody, runTenantRegistryRpc, sendJson } from '../_lib.js';

export default async function handler(req, res) {
    if (handleOptions(req, res)) return;

    if (req.method !== 'POST') {
        return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
    }

    const body = await readJsonBody(req);
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : '';
    const tenantSlug = typeof body.tenantSlug === 'string' ? body.tenantSlug.trim() : '';
    const tenantEmail = typeof body.tenantEmail === 'string' ? body.tenantEmail.trim().toLowerCase() : '';
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';

    if (!deviceId || (!tenantId && !tenantSlug && !tenantEmail)) {
        return sendJson(res, 400, {
            status: 'error',
            message: 'deviceId y tenantId, tenantSlug o tenantEmail son obligatorios'
        });
    }

    try {
        const result = await runTenantRegistryRpc(req, 'register_tenant_server_endpoint', {
            p_tenant_id: tenantId || null,
            p_tenant_slug: tenantSlug || null,
            p_tenant_email: tenantEmail || null,
            p_device_id: deviceId,
            p_terminal_id: typeof body.terminalId === 'string' ? body.terminalId.trim() : null,
            p_terminal_name: typeof body.terminalName === 'string' ? body.terminalName.trim() : null,
            p_hostname: typeof body.hostname === 'string' ? body.hostname.trim() : null,
            p_protocol: typeof body.protocol === 'string' ? body.protocol.trim() : 'http',
            p_port: Number.isFinite(Number(body.port)) ? Number(body.port) : 3001,
            p_local_ip: typeof body.localIp === 'string' ? body.localIp.trim() : null,
            p_local_ips: Array.isArray(body.localIps) ? body.localIps.filter(Boolean) : [],
            p_endpoint_url: typeof body.endpointUrl === 'string' ? body.endpointUrl.trim() : null,
            p_is_primary: body.isPrimary !== false,
            p_last_seen_at: new Date().toISOString(),
            p_status: 'ONLINE',
            p_app_version: typeof body.appVersion === 'string' ? body.appVersion.trim() : null,
            p_app_version_code: Number.isFinite(Number(body.appVersionCode)) ? Number(body.appVersionCode) : null,
        }, true);

        return sendJson(res, 200, {
            status: 'success',
            endpoint: result.endpoint,
        });
    } catch (error) {
        return sendJson(res, error.status || 500, {
            status: 'error',
            message: error.message || 'No se pudo publicar la terminal en cloud',
            details: error.details || null,
        });
    }
}
