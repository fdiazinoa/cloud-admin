import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const allowInsecureKeys = import.meta.env.VITE_ALLOW_INSECURE_SUPABASE_KEYS === 'true';

function decodeJwtRole(token: string): string | null {
    try {
        const [, payload] = token.split('.');
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(atob(normalized));
        return typeof decoded.role === 'string' ? decoded.role : null;
    } catch {
        return null;
    }
}

function isPublicClientKey(token: string): boolean {
    if (token.startsWith('sb_publishable_')) return true;
    return decodeJwtRole(token) === 'anon';
}

function isElevatedServerKey(token: string): boolean {
    if (token.startsWith('sb_secret_')) return true;
    return decodeJwtRole(token) === 'service_role';
}

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase Environment Variables');
}

if (!supabaseServiceKey) {
    throw new Error('Missing VITE_SUPABASE_SERVICE_ROLE_KEY for administrative operations');
}

if (!allowInsecureKeys) {
    if (!isPublicClientKey(supabaseKey)) {
        const anonRole = decodeJwtRole(supabaseKey);
        throw new Error(`VITE_SUPABASE_ANON_KEY must be anon or sb_publishable (current role: ${anonRole || 'unknown'})`);
    }
    if (!isElevatedServerKey(supabaseServiceKey)) {
        const serviceRole = decodeJwtRole(supabaseServiceKey);
        throw new Error(`VITE_SUPABASE_SERVICE_ROLE_KEY must be service_role or sb_secret (current role: ${serviceRole || 'unknown'})`);
    }
    if (supabaseKey === supabaseServiceKey) {
        throw new Error('VITE_SUPABASE_ANON_KEY and VITE_SUPABASE_SERVICE_ROLE_KEY cannot be the same key');
    }
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true },
    db: { schema: 'landlord' }
});

// TODO: Move all service-role operations to a trusted backend or Edge Function.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'landlord' }
});
