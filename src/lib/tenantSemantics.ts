import type { Tenant } from '../types';
import {
    deriveTenantSemanticsFromTenant,
    type TenantSemanticConfig,
} from './tenantProducts';

export const getTenantSemantics = (tenant: Tenant): TenantSemanticConfig => {
    const fallback = deriveTenantSemanticsFromTenant(tenant.type, tenant.cloud_sync, tenant.max_pos_terminals, tenant.max_erp_users, {
        posVariant: tenant.pos_variant,
        offlineMode: tenant.offline_mode,
        explicitOffline: tenant.explicit_offline,
        cloudChannel: tenant.cloud_channel,
    });
    return {
        contractedProduct: tenant.contracted_product || fallback.contractedProduct,
        posVariant: tenant.pos_variant || fallback.posVariant,
        offlineMode: tenant.offline_mode ?? fallback.offlineMode,
        explicitOffline: tenant.explicit_offline ?? fallback.explicitOffline,
        cloudDisabledReason: tenant.cloud_disabled_reason ?? fallback.cloudDisabledReason,
        posRuntime: tenant.pos_runtime || fallback.posRuntime,
        cloudChannel: tenant.cloud_channel || fallback.cloudChannel,
        dataMaster: tenant.data_master || fallback.dataMaster,
        cloudSyncEnabled: tenant.cloud_sync_enabled ?? fallback.cloudSyncEnabled,
        erpCoreEnabled: tenant.erp_core_enabled ?? fallback.erpCoreEnabled,
        erpUiEnabled: tenant.erp_ui_enabled ?? fallback.erpUiEnabled,
        customerErpAccess: tenant.customer_erp_access ?? fallback.customerErpAccess,
        backupEnabled: tenant.backup_enabled ?? fallback.backupEnabled,
        lifecycleStatus: tenant.lifecycle_status || fallback.lifecycleStatus,
        provisioningStatus: tenant.provisioning_status || fallback.provisioningStatus,
    };
};

export const isLocalPosTenant = (tenant?: Tenant | null) => {
    if (!tenant) return false;
    const semantics = getTenantSemantics(tenant);
    return semantics.contractedProduct === 'POS_ONLY' && semantics.posRuntime !== 'SLAVE';
};

export const isExplicitOfflinePosTenant = (tenant?: Tenant | null) => {
    if (!tenant) return false;
    const semantics = getTenantSemantics(tenant);
    return semantics.contractedProduct === 'POS_ONLY'
        && (semantics.posVariant === 'POS_ONLY_OFFLINE' || semantics.offlineMode || semantics.cloudChannel === 'NONE');
};

export const isCloudRecoverableLocalPosTenant = (tenant?: Tenant | null) => (
    isLocalPosTenant(tenant) && !isExplicitOfflinePosTenant(tenant)
);

export const isFiscalEligibleTenant = (tenant?: Tenant | null) => {
    if (!tenant) return false;
    const semantics = getTenantSemantics(tenant);
    return semantics.contractedProduct === 'POS_ERP' || semantics.cloudChannel === 'ERP_ACTIVE';
};
