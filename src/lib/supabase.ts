import { createClient } from '@supabase/supabase-js';

export const supabaseProjectUrl = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseProjectUrl || !publicKey) throw new Error('Missing Supabase Environment Variables');
function isPublicKey(key: string) {
    if (key.startsWith('sb_publishable_')) return true;
    try { return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; }
    catch { return false; }
}
if (!isPublicKey(publicKey)) throw new Error('The browser requires a public Supabase key');
export const supabase = createClient(supabaseProjectUrl, publicKey, {
    auth: { persistSession: true }, db: { schema: 'landlord' },
});

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error('La sesión administrativa expiró. Inicia sesión nuevamente.');
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.delete('apikey');
    headers.set('Authorization', `Bearer ${token}`);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
        return fetch(url, { ...init, headers });
    }
    if (url.origin !== new URL(supabaseProjectUrl).origin) throw new Error('Administrative destination not allowed');
    return fetch('/api/admin-gateway', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: url.pathname + url.search, method: init.method || 'GET',
            headers: Object.fromEntries(headers.entries()), body: init.body ?? null }),
        signal: init.signal,
    });
}

// Only a public key is used to construct the SDK; privileged HTTP calls run on the server.
export const supabaseAdmin = createClient(supabaseProjectUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false, storageKey: 'cloud-admin-gateway-client' },
    db: { schema: 'landlord' }, global: { fetch: adminFetch },
});
// Realtime always uses the signed-in user and database authorization, never a service key.
export const authorizeAdminRealtime = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) await supabaseAdmin.realtime.setAuth(data.session.access_token);
};
