import type { IncomingMessage, ServerResponse } from 'node:http';
import { CloudAdminAuthError, requireCloudAdminSession } from './lib/cloud-admin-session.js';
import { hasCloudAdminPermission } from '../src/lib/cloudAdminPermissions.js';
import { provisionTenant, type ProvisionTenantInput, type SupabaseAdminClient } from '../src/lib/tenantProvisioning.js';
import type { CloudAdminPermissions } from '../src/types.ts';

type Request = IncomingMessage & { body?: unknown };
export default async function handler(req: Request, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }
    try {
        const session = await requireCloudAdminSession(req.headers);
        if (!hasCloudAdminPermission(session.profile.permissions as Partial<CloudAdminPermissions>, 'tenants_manage')) {
            throw new CloudAdminAuthError(403, 'FORBIDDEN', 'No tienes permiso para crear tenants.');
        }
        let raw = req.body;
        if (raw === undefined) {
            const chunks: Buffer[] = []; let size = 0;
            for await (const chunk of req) {
                const buffer = Buffer.from(chunk); size += buffer.length;
                if (size > 32_000) throw new CloudAdminAuthError(413, 'TOO_LARGE', 'Solicitud demasiado grande.');
                chunks.push(buffer);
            }
            raw = Buffer.concat(chunks).toString('utf8');
        }
        if (JSON.stringify(raw).length > 32_000) throw new CloudAdminAuthError(413, 'TOO_LARGE', 'Solicitud demasiado grande.');
        const input = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ProvisionTenantInput;
        if (!input || ['name', 'slug', 'email', 'contactName', 'contactEmail', 'city'].some(key => {
            const value = input[key as keyof ProvisionTenantInput];
            return typeof value !== 'string' || !value.trim();
        })) throw new CloudAdminAuthError(400, 'INVALID', 'Faltan datos requeridos del tenant.');
        // The server owns Auth metadata, license checks, subscription creation and rollback.
        const result = await provisionTenant(session.admin as unknown as SupabaseAdminClient, {
            ...input, initialPassword: undefined,
        });
        res.statusCode = 200;
        res.end(JSON.stringify(result));
    } catch (error) {
        res.statusCode = error instanceof CloudAdminAuthError ? error.status : error instanceof SyntaxError ? 400 : 500;
        res.end(JSON.stringify({ message: error instanceof CloudAdminAuthError ? error.message : 'No se pudo aprovisionar el tenant. Verifica los datos y que el email no esté registrado.' }));
    }
}
