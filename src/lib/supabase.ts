import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase Environment Variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true },
    db: { schema: 'landlord' }
});

// Admin client for backend operations (Auth User Creation)
// Warning: Use with caution in frontend applications
export const supabaseAdmin = supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: 'landlord' }
    })
    : supabase; // Fallback to anon if not provided (will fail on admin ops)
