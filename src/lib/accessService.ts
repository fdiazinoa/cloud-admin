import { supabaseAdmin } from './supabase';
import type {
    CloudAdminPermissionKey,
    CloudAdminPermissions,
    CloudAdminProfile,
    CloudAdminUser,
    CloudAdminUserStatus,
} from '../types';

export const permissionCatalog: Array<{ key: CloudAdminPermissionKey; label: string; description: string }> = [
    { key: 'dashboard', label: 'Dashboard', description: 'Indicadores generales y operación actual.' },
    { key: 'tenants', label: 'Tenants', description: 'Empresas, productos, licencias y terminales.' },
    { key: 'plans', label: 'Planes', description: 'Planes SaaS y límites comerciales.' },
    { key: 'support', label: 'HelpDesk', description: 'Tickets, respuestas y acciones de soporte.' },
    { key: 'improvements', label: 'Mejoras', description: 'Solicitudes de mejora y seguimiento.' },
    { key: 'apk', label: 'APK POS', description: 'Versiones, notas de release y descargas.' },
    { key: 'terminal_recovery', label: 'Recuperación POS', description: 'Takeover y rebuild local de terminales.' },
    { key: 'billing', label: 'Facturación', description: 'Suscripciones, estado comercial y pagos.' },
    { key: 'settings', label: 'Configuración', description: 'Integraciones, llaves y parámetros técnicos.' },
    { key: 'kill_switch', label: 'Kill Switch', description: 'Suspensión crítica de tenants.' },
    { key: 'users', label: 'Usuarios', description: 'Perfiles, usuarios y niveles de acceso.' },
];

export const emptyPermissions = permissionCatalog.reduce((acc, permission) => {
    acc[permission.key] = false;
    return acc;
}, {} as CloudAdminPermissions);

export interface CreateProfileInput {
    code: string;
    name: string;
    description?: string;
    level: number;
    permissions: Partial<CloudAdminPermissions>;
}

export interface UpdateProfileInput {
    name: string;
    description?: string;
    level: number;
    permissions: Partial<CloudAdminPermissions>;
    is_active: boolean;
}

export interface CreateCloudAdminUserInput {
    email: string;
    fullName: string;
    phone?: string;
    profileId: string;
    status: CloudAdminUserStatus;
}

export interface UpdateCloudAdminUserInput {
    fullName: string;
    phone?: string;
    profileId: string;
    status: CloudAdminUserStatus;
}

export interface CreatedCloudAdminUser {
    user: CloudAdminUser;
    tempPassword: string;
}

function normalizeEmail(value: string) {
    return value.trim().toLowerCase();
}

function normalizeCode(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 16; i += 1) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

function normalizePermissions(permissions: Partial<CloudAdminPermissions>) {
    return {
        ...emptyPermissions,
        ...permissions,
    };
}

function withProfile(user: CloudAdminUser, profiles: CloudAdminProfile[]) {
    return {
        ...user,
        profile: profiles.find((profile) => profile.id === user.profile_id) || null,
    };
}

export async function getAccessOverview() {
    const [profilesRes, usersRes] = await Promise.all([
        supabaseAdmin
            .from('cloud_admin_profiles')
            .select('*')
            .order('level', { ascending: false })
            .order('name', { ascending: true }),
        supabaseAdmin
            .from('cloud_admin_users')
            .select('*')
            .order('created_at', { ascending: false }),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (usersRes.error) throw usersRes.error;

    const profiles = ((profilesRes.data || []) as CloudAdminProfile[]).map((profile) => ({
        ...profile,
        permissions: normalizePermissions(profile.permissions || {}),
    }));
    const users = ((usersRes.data || []) as CloudAdminUser[]).map((user) => withProfile(user, profiles));

    return { profiles, users };
}

export async function createProfile(input: CreateProfileInput): Promise<CloudAdminProfile> {
    const code = normalizeCode(input.code);
    if (!code) throw new Error('El código del perfil es requerido.');

    const { data, error } = await supabaseAdmin
        .from('cloud_admin_profiles')
        .insert({
            code,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            level: input.level,
            permissions: normalizePermissions(input.permissions),
            is_system: false,
            is_active: true,
        })
        .select('*')
        .single();

    if (error) throw error;
    return data as CloudAdminProfile;
}

export async function updateProfile(profileId: string, input: UpdateProfileInput): Promise<CloudAdminProfile> {
    const { data, error } = await supabaseAdmin
        .from('cloud_admin_profiles')
        .update({
            name: input.name.trim(),
            description: input.description?.trim() || null,
            level: input.level,
            permissions: normalizePermissions(input.permissions),
            is_active: input.is_active,
        })
        .eq('id', profileId)
        .select('*')
        .single();

    if (error) throw error;
    return data as CloudAdminProfile;
}

export async function deleteProfile(profileId: string): Promise<void> {
    const { count, error: countError } = await supabaseAdmin
        .from('cloud_admin_users')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId);

    if (countError) throw countError;
    if ((count || 0) > 0) {
        throw new Error('No se puede eliminar un perfil asignado a usuarios.');
    }

    const { error } = await supabaseAdmin
        .from('cloud_admin_profiles')
        .delete()
        .eq('id', profileId)
        .eq('is_system', false);

    if (error) throw error;
}

export async function createCloudAdminUser(input: CreateCloudAdminUserInput): Promise<CreatedCloudAdminUser> {
    const email = normalizeEmail(input.email);
    const tempPassword = generateTempPassword();
    const profile = await getProfile(input.profileId);

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
            full_name: input.fullName.trim(),
            phone: input.phone?.trim() || null,
            cloud_admin: true,
        },
        app_metadata: {
            cloud_admin: true,
            cloud_admin_profile_id: profile.id,
            cloud_admin_profile_code: profile.code,
            cloud_admin_level: profile.level,
            cloud_admin_permissions: normalizePermissions(profile.permissions || {}),
        },
    });

    if (authError) throw authError;
    const authUserId = authData.user?.id;
    if (!authUserId) throw new Error('No se pudo crear el usuario de autenticación.');

    const { data, error } = await supabaseAdmin
        .from('cloud_admin_users')
        .insert({
            auth_user_id: authUserId,
            email,
            full_name: input.fullName.trim(),
            phone: input.phone?.trim() || null,
            profile_id: profile.id,
            status: input.status,
            metadata: {
                created_from: 'cloud_admin',
                profile_code: profile.code,
            },
        })
        .select('*')
        .single();

    if (error) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        throw error;
    }

    return { user: { ...(data as CloudAdminUser), profile }, tempPassword };
}

export async function updateCloudAdminUser(userId: string, input: UpdateCloudAdminUserInput): Promise<CloudAdminUser> {
    const profile = await getProfile(input.profileId);
    const { data, error } = await supabaseAdmin
        .from('cloud_admin_users')
        .update({
            full_name: input.fullName.trim(),
            phone: input.phone?.trim() || null,
            profile_id: profile.id,
            status: input.status,
            metadata: {
                profile_code: profile.code,
            },
        })
        .eq('id', userId)
        .select('*')
        .single();

    if (error) throw error;
    const user = data as CloudAdminUser;

    if (user.auth_user_id) {
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.auth_user_id, {
            user_metadata: {
                full_name: input.fullName.trim(),
                phone: input.phone?.trim() || null,
                cloud_admin: true,
            },
            app_metadata: {
                cloud_admin: true,
                cloud_admin_profile_id: profile.id,
                cloud_admin_profile_code: profile.code,
                cloud_admin_level: profile.level,
                cloud_admin_permissions: normalizePermissions(profile.permissions || {}),
                cloud_admin_status: input.status,
            },
        });
        if (authError) throw authError;
    }

    return { ...user, profile };
}

export async function deleteCloudAdminUser(user: CloudAdminUser): Promise<void> {
    const { error } = await supabaseAdmin
        .from('cloud_admin_users')
        .delete()
        .eq('id', user.id);

    if (error) throw error;

    if (user.auth_user_id) {
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.auth_user_id);
        if (authError) throw authError;
    }
}

async function getProfile(profileId: string): Promise<CloudAdminProfile> {
    const { data, error } = await supabaseAdmin
        .from('cloud_admin_profiles')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Perfil no encontrado.');
    return {
        ...(data as CloudAdminProfile),
        permissions: normalizePermissions(((data as CloudAdminProfile).permissions || {})),
    };
}

export const accessService = {
    getAccessOverview,
    createProfile,
    updateProfile,
    deleteProfile,
    createCloudAdminUser,
    updateCloudAdminUser,
    deleteCloudAdminUser,
};
