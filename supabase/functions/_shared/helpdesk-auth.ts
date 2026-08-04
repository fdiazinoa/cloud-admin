import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
};

export interface HelpdeskActor {
    id: string;
    authUserId: string;
    email: string;
    fullName: string;
    profileCode: string;
    permissions: Record<string, boolean>;
}

interface AdminProfileRow {
    code?: string | null;
    is_active?: boolean | null;
    permissions?: Record<string, boolean> | null;
}

interface AdminUserRow {
    id: string;
    auth_user_id?: string | null;
    email: string;
    full_name: string;
    status: string;
    cloud_admin_profiles?: AdminProfileRow | AdminProfileRow[] | null;
}

function getEnv(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

export function createHelpdeskAdminClient() {
    return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: 'landlord' },
    });
}

export async function requireHelpdeskActor(request: Request, permission = 'support'): Promise<HelpdeskActor> {
    const authorization = request.headers.get('authorization') ?? '';
    const bearerToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!bearerToken) throw new Error('Unauthorized helpdesk request');

    const supabaseAdmin = createHelpdeskAdminClient();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
    if (authError || !authData.user?.id) throw new Error('Unauthorized helpdesk request');

    const { data, error } = await supabaseAdmin
        .from('cloud_admin_users')
        .select(`
            id,
            auth_user_id,
            email,
            full_name,
            status,
            cloud_admin_profiles (
                code,
                is_active,
                permissions
            )
        `)
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();

    if (error || !data) throw new Error('Unauthorized helpdesk request');

    const adminUser = data as AdminUserRow;
    const profile = normalizeRelation(adminUser.cloud_admin_profiles);
    const permissions = profile?.permissions ?? {};
    if (adminUser.status !== 'active' || !profile?.is_active || permissions[permission] !== true) {
        throw new Error('Forbidden helpdesk request');
    }

    return {
        id: adminUser.id,
        authUserId: authData.user.id,
        email: adminUser.email,
        fullName: adminUser.full_name,
        profileCode: profile.code ?? 'support',
        permissions,
    };
}

export function isAuthorizationError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /unauthorized|forbidden/i.test(message);
}
