import { supabase } from './supabase';
import type {
    CloudAdminAuditEvent,
    CloudAdminPermissions,
    CloudAdminProfile,
    CloudAdminUser,
    CloudAdminUserStatus,
    SupportDepartment,
} from '../types';
import type {
    CreateCloudAdminUserInput,
    CreateProfileInput,
    SupportDepartmentInput,
    UpdateCloudAdminUserInput,
    UpdateProfileInput,
} from './accessService';

export interface AccessActor {
    id: string;
    profileCode: string;
    profileLevel: number;
    permissions: Partial<CloudAdminPermissions>;
}

async function invokeAccess<T>(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('access-management-api', { body: { action, ...payload } });
    if (error) {
        let detail = error.message;
        const context = error.context as Response | undefined;
        if (context?.clone) {
            const response = await context.clone().json().catch(() => null) as { error?: string } | null;
            detail = response?.error || detail;
        }
        throw new Error(detail);
    }
    return data as T;
}

export function getAccessOverview() {
    return invokeAccess<{
        profiles: CloudAdminProfile[];
        users: CloudAdminUser[];
        departments: SupportDepartment[];
        actor: AccessActor;
    }>('overview');
}

export function createProfile(input: CreateProfileInput) {
    return invokeAccess<{ profile: CloudAdminProfile }>('create_profile', { fields: input });
}

export function updateProfile(profileId: string, input: UpdateProfileInput) {
    return invokeAccess<{ profile: CloudAdminProfile }>('update_profile', { profile_id: profileId, fields: input });
}

export function deleteProfile(profileId: string) {
    return invokeAccess<{ ok: true }>('delete_profile', { profile_id: profileId });
}

function userFields(input: CreateCloudAdminUserInput | UpdateCloudAdminUserInput) {
    return {
        email: 'email' in input ? input.email : undefined,
        full_name: input.fullName,
        phone: input.phone,
        profile_id: input.profileId,
        status: input.status,
        department_ids: input.departmentIds,
        helpdesk_all_departments: input.helpdeskAllDepartments,
    };
}

export async function createCloudAdminUser(input: CreateCloudAdminUserInput) {
    const response = await invokeAccess<{ user: CloudAdminUser; temp_password?: string | null; auth_link_type: 'created' | 'linked_existing' }>('create_user', { fields: userFields(input) });
    return { user: response.user, tempPassword: response.temp_password, authLinkType: response.auth_link_type };
}

export function updateCloudAdminUser(userId: string, input: UpdateCloudAdminUserInput) {
    return invokeAccess<{ user: CloudAdminUser }>('update_user', { user_id: userId, fields: userFields(input) });
}

export function createSupportDepartment(input: SupportDepartmentInput) {
    return invokeAccess<{ department: SupportDepartment }>('create_department', {
        fields: { code: input.code, name: input.name, description: input.description, is_active: input.isActive },
    });
}

export function updateSupportDepartment(departmentId: string, input: Omit<SupportDepartmentInput, 'code'>) {
    return invokeAccess<{ department: SupportDepartment }>('update_department', {
        department_id: departmentId,
        fields: { name: input.name, description: input.description, is_active: input.isActive },
    });
}

export function listAuditEvents() {
    return invokeAccess<{ events: CloudAdminAuditEvent[] }>('list_audit');
}

export const accessApiService = {
    getAccessOverview,
    createProfile,
    updateProfile,
    deleteProfile,
    createCloudAdminUser,
    updateCloudAdminUser,
    createSupportDepartment,
    updateSupportDepartment,
    listAuditEvents,
};

export type { CloudAdminUserStatus };
