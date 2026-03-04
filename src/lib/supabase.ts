import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase Environment Variables');
}

if (!supabaseServiceKey) {
    throw new Error('Missing VITE_SUPABASE_SERVICE_ROLE_KEY for administrative operations');
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
