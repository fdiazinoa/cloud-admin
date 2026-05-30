export function buildTenantAuthMetadataPayload(
    tenantId: string,
    userMetadata: Record<string, unknown>,
    erpTenantId?: string | null,
) {
    const erpMetadata = erpTenantId ? { erp_tenant_id: erpTenantId } : {};

    return {
        user_metadata: {
            ...userMetadata,
            tenant_id: tenantId,
            ...erpMetadata,
        },
        app_metadata: {
            tenant_id: tenantId,
            ...erpMetadata,
        },
    };
}
