import type { SupabaseClient, User } from "@supabase/supabase-js";

export type LandlordTenantRef = {
    id: string;
    email: string;
    slug: string | null;
};

function normalizeEmail(value: string) {
    return value.trim().toLowerCase();
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function getUserTenantId(user: User) {
    const metadata = user.user_metadata as Record<string, unknown> | undefined;
    const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
    const tenantId = metadata?.tenant_id ?? appMetadata?.tenant_id;
    return typeof tenantId === "string" && tenantId.trim().length > 0 ? tenantId.trim() : null;
}

export function userBelongsToLandlordTenant(
    user: User,
    tenant: LandlordTenantRef,
    bodyEmail?: string | null,
) {
    const metaTenantId = getUserTenantId(user);
    if (metaTenantId === tenant.id) return true;

    const userEmail = isNonEmptyString(user.email) ? normalizeEmail(user.email) : null;
    if (userEmail && userEmail === normalizeEmail(tenant.email)) return true;

    if (bodyEmail && userEmail && userEmail === normalizeEmail(bodyEmail)) return true;

    return false;
}

async function fetchLandlordTenantById(
    supabaseLandlord: SupabaseClient,
    tenantId: string,
): Promise<LandlordTenantRef | null> {
    const { data, error } = await supabaseLandlord
        .from("tenants")
        .select("id,email,slug")
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
        .select("id,email,slug")
        .eq("email", normalizeEmail(email))
        .maybeSingle();

    if (error) throw error;
    return (data as LandlordTenantRef | null) ?? null;
}

async function fetchLandlordTenantBySlug(
    supabaseLandlord: SupabaseClient,
    slug: string,
): Promise<LandlordTenantRef | null> {
    const { data, error } = await supabaseLandlord
        .from("tenants")
        .select("id,email,slug")
        .eq("slug", slug)
        .maybeSingle();

    if (error) throw error;
    return (data as LandlordTenantRef | null) ?? null;
}

async function fetchErpTenantById(
    supabasePublic: SupabaseClient,
    erpTenantId: string,
): Promise<{ id: string; name: string | null } | null> {
    const { data, error } = await supabasePublic
        .from("erp_tenants")
        .select("id,name")
        .eq("id", erpTenantId)
        .maybeSingle();

    if (error) {
        const code = (error as { code?: string }).code;
        if (code === "42P01" || code === "PGRST205") return null;
        throw error;
    }

    return (data as { id: string; name: string | null } | null) ?? null;
}

export async function syncLandlordTenantAuthMetadata(
    supabaseAuth: SupabaseClient,
    user: User,
    landlordTenantId: string,
    erpTenantId?: string | null,
): Promise<boolean> {
    const currentMetaId = getUserTenantId(user);
    const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;

    const resolvedErpTenantId = erpTenantId
        ?? (typeof userMetadata.erp_tenant_id === "string" ? userMetadata.erp_tenant_id : null)
        ?? (typeof appMetadata.erp_tenant_id === "string" ? appMetadata.erp_tenant_id : null)
        ?? (currentMetaId && currentMetaId !== landlordTenantId ? currentMetaId : null);

    const needsRepair = currentMetaId !== landlordTenantId
        || userMetadata.tenant_id !== landlordTenantId
        || appMetadata.tenant_id !== landlordTenantId;

    if (!needsRepair) return false;

    const { error } = await supabaseAuth.auth.admin.updateUserById(user.id, {
        app_metadata: {
            ...appMetadata,
            tenant_id: landlordTenantId,
            ...(resolvedErpTenantId ? { erp_tenant_id: resolvedErpTenantId } : {}),
        },
        user_metadata: {
            ...userMetadata,
            tenant_id: landlordTenantId,
            ...(resolvedErpTenantId ? { erp_tenant_id: resolvedErpTenantId } : {}),
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
    let mismatchReason: string | null = null;

    if (!tenant) {
        mismatchReason = "requested tenant_id not found in landlord.tenants";

        const emailCandidates = [
            isNonEmptyString(user.email) ? user.email : null,
            bodyEmail,
        ].filter(Boolean) as string[];

        for (const email of emailCandidates) {
            tenant = await fetchLandlordTenantByEmail(supabaseLandlord, email);
            if (tenant) {
                mismatchReason = "resolved landlord tenant by authenticated user email";
                break;
            }
        }
    }

    if (!tenant) {
        const erpTenant = await fetchErpTenantById(supabasePublic, requestedTenantId);
        if (erpTenant) {
            mismatchReason = "requested tenant_id matched erp_tenants.id";

            if (erpTenant.name) {
                tenant = await fetchLandlordTenantBySlug(supabaseLandlord, erpTenant.name);
                if (tenant) {
                    mismatchReason = "resolved landlord tenant from erp_tenants slug";
                }
            }

            if (!tenant && isNonEmptyString(user.email)) {
                tenant = await fetchLandlordTenantByEmail(supabaseLandlord, user.email);
                if (tenant) {
                    mismatchReason = "resolved landlord tenant by user email after erp tenant match";
                }
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

    const erpTenantId = requestedTenantId !== tenant.id ? requestedTenantId : null;
    const metadataRepaired = await syncLandlordTenantAuthMetadata(
        supabasePublic,
        user,
        tenant.id,
        erpTenantId,
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
