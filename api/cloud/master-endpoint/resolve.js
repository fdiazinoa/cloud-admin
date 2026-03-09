import { handleOptions, runTenantRegistryRpc, sendJson } from '../_lib.js';

export default async function handler(req, res) {
    if (handleOptions(req, res)) return;

    if (req.method !== 'GET') {
        return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
    }

    const tenantId = typeof req.query?.tenantId === 'string' ? req.query.tenantId.trim() : '';
    const tenantSlug = typeof req.query?.tenantSlug === 'string' ? req.query.tenantSlug.trim() : '';
    const tenantEmail = typeof req.query?.tenantEmail === 'string' ? req.query.tenantEmail.trim().toLowerCase() : '';

    if (!tenantId && !tenantSlug && !tenantEmail) {
        return sendJson(res, 400, {
            status: 'error',
            message: 'tenantId, tenantSlug o tenantEmail es obligatorio'
        });
    }

    try {
        const result = await runTenantRegistryRpc(req, 'resolve_tenant_server_endpoint', {
            p_tenant_id: tenantId || null,
            p_tenant_slug: tenantSlug || null,
            p_tenant_email: tenantEmail || null,
        });

        return sendJson(res, 200, {
            status: 'success',
            endpoint: result.endpoint,
        });
    } catch (error) {
        return sendJson(res, error.status || 500, {
            status: 'error',
            message: error.message || 'No se pudo resolver el endpoint de la terminal',
            details: error.details || null,
        });
    }
}
