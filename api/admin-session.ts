import type { IncomingMessage, ServerResponse } from 'node:http';
import { CloudAdminAuthError, requireCloudAdminSession } from './lib/cloud-admin-session.ts';
export default async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'GET') { res.statusCode = 405; res.end('{}'); return; }
    try {
        const session = await requireCloudAdminSession(req.headers);
        res.end(JSON.stringify({ adminUser: session.adminUser, profile: session.profile }));
    } catch (error) {
        res.statusCode = error instanceof CloudAdminAuthError ? error.status : 503;
        res.end(JSON.stringify({ error: error instanceof CloudAdminAuthError ? error.message : 'No se pudo validar el acceso administrativo.' }));
    }
}
