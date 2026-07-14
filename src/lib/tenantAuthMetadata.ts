export function buildTenantAuthMetadataPayload(
    tenantId: string,
    userMetadata: Record<string, unknown>,
    erpTenantId?: string | null,
    tenantName?: string | null,
) {
    const erpMetadata = erpTenantId ? { erp_tenant_id: erpTenantId } : {};
    const nameMetadata = tenantName ? { tenant_name: tenantName } : {};
    const activationTenantId = erpTenantId || tenantId;

    return {
        user_metadata: {
            ...userMetadata,
            tenant_id: activationTenantId,
            cloud_admin_tenant_id: tenantId,
            ...erpMetadata,
            ...nameMetadata,
        },
        app_metadata: {
            tenant_id: tenantId,
            cloud_admin_tenant_id: tenantId,
            ...erpMetadata,
            ...nameMetadata,
        },
    };
}
