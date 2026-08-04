import type { SupabaseClient, User } from "@supabase/supabase-js";

export type LandlordTenantRef = {
    id: string;
    email: string;
    name: string | null;
    slug: string | null;
};

type ErpTenantRef = {
    id: string;
    name: string | null;
    cloudAdminTenantId: string | null;
};

function normalizeEmail(value: string) {
    return value.trim().toLowerCase();
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function getAppMetadataTenantId(user: User) {
    const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
    const tenantId = appMetadata?.tenant_id ?? appMetadata?.cloud_admin_tenant_id;
    return typeof tenantId === "string" && tenantId.trim().length > 0 ? tenantId.trim() : null;
}

function getUserMetadataErpTenantId(user: User) {
    const metadata = user.user_metadata as Record<string, unknown> | undefined;
    const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
    const erpTenantId = metadata?.erp_tenant_id ?? appMetadata?.erp_tenant_id ?? metadata?.tenant_id;
    return typeof erpTenantId === "string" && erpTenantId.trim().length > 0 ? erpTenantId.trim() : null;
}

export function userBelongsToLandlordTenant(
    user: User,
    tenant: LandlordTenantRef,
    bodyEmail?: string | null,
) {
    const appTenantId = getAppMetadataTenantId(user);
    if (appTenantId === tenant.id) return true;

    const userEmail = isNonEmptyString(user.email) ? normalizeEmail(user.email) : null;
    if (userEmail && userEmail === normalizeEmail(tenant.email)) return true;

    if (
        bodyEmail
        && userEmail
        && userEmail === normalizeEmail(bodyEmail)
        && normalizeEmail(bodyEmail) === normalizeEmail(tenant.email)
    ) {
        return true;
    }

    return false;
}

async function fetchLandlordTenantById(
    supabaseLandlord: SupabaseClient,
    tenantId: string,
): Promise<LandlordTenantRef | null> {
    const { data, error } = await supabaseLandlord
        .from("tenants")
        .select("id,name,email,slug")
        .eq("id", tenantId)
        .maybeSingle();

    if (error) throw error;
    return (data as LandlordTenantRef | null) ?? null;
}

async function fetchLandlordTenantByEmail(
    supabaseLandlord: SupabaseClient,
    email: string,
): Promise<LandlordTenantRef | null> {
    const { data, error } = await supabaseLandlord
        .from("tenants")
        .select("id,name,email,slug")
        .eq("email", normalizeEmail(email))
        .limit(2);

    if (error) throw error;
    const matches = (data as LandlordTenantRef[] | null) ?? [];
    if (matches.length > 1) {
        throw new Error("Authenticated email is associated with multiple landlord tenants; explicit tenant mapping required.");
    }
    return matches[0] ?? null;
}

async function fetchErpTenantById(
    supabasePublic: SupabaseClient,
    erpTenantId: string,
): Promise<ErpTenantRef | null> {
    const { data, error } = await supabasePublic
        .from("erp_tenants")
        .select("id,name,config")
        .eq("id", erpTenantId)
        .maybeSingle();

    if (error) {
        const code = (error as { code?: string }).code;
        if (code === "42P01" || code === "PGRST205") return null;
        throw error;
    }

    const erpTenant = data as { id: string; name: string | null; config?: Record<string, unknown> | null } | null;
    if (!erpTenant) return null;

    const cloudAdminTenantId = erpTenant.config?.cloudAdminTenantId;
    return {
        id: erpTenant.id,
        name: erpTenant.name,
        cloudAdminTenantId: typeof cloudAdminTenantId === "string" && cloudAdminTenantId.trim()
            ? cloudAdminTenantId.trim()
            : null,
    };
}

async function fetchErpTenantByCloudAdminTenantId(
    supabasePublic: SupabaseClient,
    landlordTenantId: string,
): Promise<ErpTenantRef | null> {
    const { data, error } = await supabasePublic
        .from("erp_tenants")
        .select("id,name,config")
        .eq("config->>cloudAdminTenantId", landlordTenantId)
        .limit(2);

    if (error) {
        const code = (error as { code?: string }).code;
        if (code === "42P01" || code === "PGRST205") return null;
        throw error;
    }

    const matches = (data as Array<{ id: string; name: string | null; config?: Record<string, unknown> | null }> | null) ?? [];
    if (matches.length > 1) {
        throw new Error("Multiple ERP tenants are mapped to the same landlord tenant.");
    }

    const erpTenant = matches[0];
    if (!erpTenant) return null;

    const cloudAdminTenantId = erpTenant.config?.cloudAdminTenantId;
    return {
        id: erpTenant.id,
        name: erpTenant.name,
        cloudAdminTenantId: typeof cloudAdminTenantId === "string" && cloudAdminTenantId.trim()
            ? cloudAdminTenantId.trim()
            : null,
    };
}

export async function syncLandlordTenantAuthMetadata(
    supabaseAuth: SupabaseClient,
    user: User,
    landlordTenantId: string,
    erpTenantId?: string | null,
    tenantName?: string | null,
): Promise<boolean> {
    const currentLandlordTenantId = getAppMetadataTenantId(user);
    const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;

    const resolvedErpTenantId = erpTenantId
        ?? (typeof appMetadata.erp_tenant_id === "string" ? appMetadata.erp_tenant_id : null)
        ?? getUserMetadataErpTenantId(user);

    const userTenantId = resolvedErpTenantId ?? landlordTenantId;

    const needsRepair = currentLandlordTenantId !== landlordTenantId
        || userMetadata.tenant_id !== userTenantId
        || userMetadata.cloud_admin_tenant_id !== landlordTenantId
        || appMetadata.tenant_id !== landlordTenantId
        || appMetadata.cloud_admin_tenant_id !== landlordTenantId
        || (resolvedErpTenantId ? userMetadata.erp_tenant_id !== resolvedErpTenantId || appMetadata.erp_tenant_id !== resolvedErpTenantId : false)
        || (tenantName ? userMetadata.tenant_name !== tenantName || appMetadata.tenant_name !== tenantName : false);

    if (!needsRepair) return false;

    const { error } = await supabaseAuth.auth.admin.updateUserById(user.id, {
        app_metadata: {
            ...appMetadata,
            tenant_id: landlordTenantId,
            cloud_admin_tenant_id: landlordTenantId,
            ...(resolvedErpTenantId ? { erp_tenant_id: resolvedErpTenantId } : {}),
            ...(tenantName ? { tenant_name: tenantName } : {}),
        },
        user_metadata: {
            ...userMetadata,
            tenant_id: userTenantId,
            cloud_admin_tenant_id: landlordTenantId,
            ...(resolvedErpTenantId ? { erp_tenant_id: resolvedErpTenantId } : {}),
            ...(tenantName ? { tenant_name: tenantName } : {}),
        },
    });

    if (error) throw error;
    return true;
}

export async function resolveLandlordTenantForActivation(
    supabaseLandlord: SupabaseClient,
    supabasePublic: SupabaseClient,
    options: {
        requestedTenantId: string;
        user: User;
        bodyEmail?: string | null;
    },
): Promise<{
    tenant: LandlordTenantRef | null;
    effectiveTenantId: string | null;
    metadataRepaired: boolean;
    mismatchReason: string | null;
}> {
    const { requestedTenantId, user, bodyEmail } = options;
    let tenant = await fetchLandlordTenantById(supabaseLandlord, requestedTenantId);
    let erpTenant = tenant ? await fetchErpTenantByCloudAdminTenantId(supabasePublic, tenant.id) : null;
    let mismatchReason: string | null = null;

    if (!tenant) {
        mismatchReason = "requested tenant_id not found in landlord.tenants";
        erpTenant = await fetchErpTenantById(supabasePublic, requestedTenantId);
        if (erpTenant) {
            mismatchReason = "requested tenant_id matched erp_tenants.id";

            if (!erpTenant.cloudAdminTenantId) {
                return {
                    tenant: null,
                    effectiveTenantId: null,
                    metadataRepaired: false,
                    mismatchReason: "erp tenant is not mapped to a landlord tenant",
                };
            }

            tenant = await fetchLandlordTenantById(supabaseLandlord, erpTenant.cloudAdminTenantId);
            if (!tenant) {
                return {
                    tenant: null,
                    effectiveTenantId: null,
                    metadataRepaired: false,
                    mismatchReason: "erp tenant landlord mapping not found",
                };
            }

            mismatchReason = "resolved landlord tenant from erp_tenants cloudAdminTenantId";
        }
    }

    if (!tenant) {
        const emailCandidates = [
            isNonEmptyString(user.email) ? user.email : null,
            bodyEmail,
        ].filter(Boolean) as string[];

        for (const email of emailCandidates) {
            tenant = await fetchLandlordTenantByEmail(supabaseLandlord, email);
            if (tenant) {
                erpTenant = await fetchErpTenantByCloudAdminTenantId(supabasePublic, tenant.id);
                mismatchReason = "resolved landlord tenant by unique authenticated user email";
                break;
            }
        }
    }

    if (!tenant) {
        return {
            tenant: null,
            effectiveTenantId: null,
            metadataRepaired: false,
            mismatchReason,
        };
    }

    if (!userBelongsToLandlordTenant(user, tenant, bodyEmail)) {
        return {
            tenant: null,
            effectiveTenantId: null,
            metadataRepaired: false,
            mismatchReason: "resolved tenant does not belong to authenticated user",
        };
    }

    const erpTenantId = erpTenant?.id ?? (requestedTenantId !== tenant.id ? requestedTenantId : null);
    const tenantName = erpTenant?.name ?? tenant.name ?? null;
    const metadataRepaired = await syncLandlordTenantAuthMetadata(
        supabasePublic,
        user,
        tenant.id,
        erpTenantId,
        tenantName,
    );

    if (metadataRepaired) {
        console.warn("[tenant-auth-metadata] repaired tenant_id mismatch", {
            userId: user.id,
            requestedTenantId,
            landlordTenantId: tenant.id,
            erpTenantId,
            reason: mismatchReason,
        });
    }

    return {
        tenant,
        effectiveTenantId: tenant.id,
        metadataRepaired,
        mismatchReason,
    };
}
