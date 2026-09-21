export interface TenantAuthCandidate {
    id: string;
    email?: string;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
}

function landlordTenantId(user: TenantAuthCandidate): string | null {
    for (const value of [
        user.app_metadata?.cloud_admin_tenant_id,
        user.app_metadata?.tenant_id,
        user.user_metadata?.cloud_admin_tenant_id,
    ]) {
        if (typeof value === "string" && value.trim()) return value;
    }
    return null;
}

export function selectTenantAuthUser<T extends TenantAuthCandidate>(
    users: T[],
    tenant: { id: string; email: string },
): T | null {
    const email = tenant.email.trim().toLowerCase();
    const linkedUsers = users.filter((user) => landlordTenantId(user) === tenant.id);
    const emailUsers = users.filter((user) => user.email?.trim().toLowerCase() === email);

    if (linkedUsers.length > 1 || emailUsers.length > 1) {
        throw new Error("Hay varios usuarios de autenticación asociados a este tenant");
    }

    const linkedUser = linkedUsers[0];
    const emailUser = emailUsers[0];
    if (linkedUser && emailUser && linkedUser.id !== emailUser.id) {
        throw new Error("El email de acceso pertenece a otro usuario de autenticación");
    }
    if (emailUser && landlordTenantId(emailUser) && landlordTenantId(emailUser) !== tenant.id) {
        throw new Error("El email de acceso pertenece a otro tenant");
    }

    return linkedUser || emailUser || null;
}
