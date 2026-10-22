import type { IncomingMessage, ServerResponse } from 'node:http';
import { CloudAdminAuthError, requireCloudAdminSession } from './lib/cloud-admin-session.js';
import { authorizeGatewayRequest } from './lib/admin-gateway-policy.js';
import type { CloudAdminPermissions } from '../src/types.ts';
type Request = IncomingMessage & { body?: unknown };
export default async function handler(req: Request, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }
    try {
        const session = await requireCloudAdminSession(req.headers);
        let raw = req.body;
        if (raw === undefined) {
            const chunks: Buffer[] = []; let size = 0;
            for await (const chunk of req) {
                const buffer = Buffer.from(chunk); size += buffer.length;
                if (size > 2_000_000) throw new CloudAdminAuthError(413, 'TOO_LARGE', 'Solicitud demasiado grande.');
                chunks.push(buffer);
            }
            raw = Buffer.concat(chunks).toString('utf8');
        }
        if (JSON.stringify(raw).length > 2_000_000) throw new CloudAdminAuthError(413, 'TOO_LARGE', 'Solicitud demasiado grande.');
        const body = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
        if (!body || typeof body.path !== 'string' || typeof body.method !== 'string') throw new CloudAdminAuthError(400, 'INVALID', 'Solicitud inválida.');
        const headers = new Headers(body.headers as HeadersInit);
        const contentProfile = headers.get('content-profile');
        const acceptProfile = headers.get('accept-profile');
        if (contentProfile && acceptProfile && contentProfile !== acceptProfile) throw new CloudAdminAuthError(403, 'FORBIDDEN', 'Esquema inválido.');
        const schema = contentProfile || acceptProfile || 'landlord';
        if (!authorizeGatewayRequest(body.path, body.method, schema, session.profile.permissions as Partial<CloudAdminPermissions>, session.profile.code === 'owner')) {
            throw new CloudAdminAuthError(403, 'FORBIDDEN', 'Operación administrativa no autorizada.');
        }
        const target = new URL(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key || target.protocol !== 'https:' || !target.hostname.endsWith('.supabase.co')) throw new Error('Invalid server configuration');
        const upstreamHeaders = new Headers({ apikey: key, Authorization: `Bearer ${key}` });
        if (body.path.startsWith('/functions/v1/')) {
            upstreamHeaders.set('Authorization', String(req.headers.authorization));
            upstreamHeaders.set('x-actor-user-id', session.actor.id);
            upstreamHeaders.set('x-actor-email', session.actor.email);
            upstreamHeaders.set('x-actor-source', 'cloud-admin-server');
        }
        for (const name of ['content-type', 'accept', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile', 'x-client-info']) {
            const value = headers.get(name); if (value) upstreamHeaders.set(name, value);
        }
        const upstream = await fetch(new URL(body.path, target), {
            method: body.method, headers: upstreamHeaders, redirect: 'manual', signal: AbortSignal.timeout(25000),
            body: ['GET', 'HEAD'].includes(body.method) ? undefined : typeof body.body === 'string' ? body.body : undefined,
        });
        if (upstream.status >= 300 && upstream.status < 400) throw new Error('Unexpected redirect');
        res.statusCode = upstream.status;
        for (const name of ['content-type', 'content-range', 'range-unit', 'preference-applied']) {
            const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
        }
        res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
        res.statusCode = error instanceof CloudAdminAuthError ? error.status : 502;
        res.end(JSON.stringify({ message: error instanceof CloudAdminAuthError ? error.message : 'No se pudo ejecutar la operación administrativa.' }));
    }
}
