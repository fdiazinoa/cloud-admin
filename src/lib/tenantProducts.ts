import type {
    CloudChannel,
    ContractedProduct,
    DataMaster,
    PosVariant,
    PosRuntime,
    TenantLifecycleStatus,
    TenantProvisioningStatus,
    TenantType,
} from '../types';

export type TenantProductKey = 'pos' | 'erp' | 'backup';

export interface TenantProductSelection {
    pos: boolean;
    erp: boolean;
    backup: boolean;
    offlineMode?: boolean;
}

export interface TenantSemanticConfig {
    contractedProduct: ContractedProduct;
    posVariant: PosVariant;
    offlineMode: boolean;
    explicitOffline: boolean;
    cloudDisabledReason?: string | null;
    posRuntime: PosRuntime;
    cloudChannel: CloudChannel;
    dataMaster: DataMaster;
    cloudSyncEnabled: boolean;
    erpCoreEnabled: boolean;
    erpUiEnabled: boolean;
    customerErpAccess: boolean;
    backupEnabled: boolean;
    lifecycleStatus: TenantLifecycleStatus;
    provisioningStatus: TenantProvisioningStatus;
}

export interface TenantProductDefinition {
    key: TenantProductKey;
    label: string;
    description: string;
}

export const TENANT_PRODUCTS: TenantProductDefinition[] = [
    {
        key: 'pos',
        label: 'CLIC POS',
        description: 'Terminales, licenciamiento de cajas y operacion local.'
    },
    {
        key: 'erp',
        label: 'CLIC ERP',
        description: 'Backoffice web, reportes y administracion central.'
    },
    {
        key: 'backup',
        label: 'Respaldo Cloud',
        description: 'Sincronizacion y respaldo continuo hacia la nube.'
    }
];

export function getDefaultTenantProducts(): TenantProductSelection {
    return {
        pos: true,
        erp: true,
        backup: true,
        offlineMode: false
    };
}

export function normalizeTenantProductSelection(products: TenantProductSelection): TenantProductSelection {
    const normalized: TenantProductSelection = {
        pos: Boolean(products.pos),
        erp: Boolean(products.erp),
        backup: Boolean(products.backup),
        offlineMode: Boolean(products.offlineMode),
    };

    if (normalized.erp) {
        return {
            ...normalized,
            backup: true,
            offlineMode: false,
        };
    }

    if (normalized.pos && normalized.offlineMode) {
        return {
            ...normalized,
            backup: false,
        };
    }

    if (normalized.pos) {
        return {
            ...normalized,
            backup: true,
        };
    }

    return {
        ...normalized,
        offlineMode: false,
        backup: normalized.erp || normalized.backup,
    };
}

export function isExplicitOfflineSelection(products: TenantProductSelection): boolean {
    const normalized = normalizeTenantProductSelection(products);
    return normalized.pos && !normalized.erp && normalized.offlineMode === true;
}

export function deriveProductsFromTenant(
    type: TenantType | undefined,
    cloudSync: boolean | undefined,
    semantics?: {
        posVariant?: PosVariant | null;
        offlineMode?: boolean | null;
        explicitOffline?: boolean | null;
        cloudChannel?: CloudChannel | null;
    },
): TenantProductSelection {
    const explicitOffline = semantics?.posVariant === 'POS_ONLY_OFFLINE'
        || semantics?.offlineMode === true
        || semantics?.explicitOffline === true
        || semantics?.cloudChannel === 'NONE';

    if (type === 'pos_only') {
        return {
            pos: true,
            erp: false,
            backup: explicitOffline ? false : true,
            offlineMode: explicitOffline,
        };
    }

    if (type === 'erp_only') {
        return {
            pos: false,
            erp: true,
            backup: cloudSync ?? true,
            offlineMode: false,
        };
    }

    return {
        pos: true,
        erp: true,
        backup: true,
        offlineMode: false,
    };
}

export function deriveTenantConfigFromProducts(products: TenantProductSelection): { type: TenantType; cloudSync: boolean } {
    const normalized = normalizeTenantProductSelection(products);

    if (normalized.pos && normalized.erp) {
        return {
            type: 'full',
            cloudSync: true
        };
    }

    if (normalized.pos) {
        return {
            type: 'pos_only',
            cloudSync: !normalized.offlineMode
        };
    }

    if (normalized.erp) {
        return {
            type: 'erp_only',
            cloudSync: true
        };
    }

    throw new Error('Activa al menos un producto principal: CLIC POS o CLIC ERP.');
}

export function deriveTenantSemanticsFromProducts(
    products: TenantProductSelection,
    posRuntime: PosRuntime = 'LOCAL_SQLITE',
): TenantSemanticConfig {
    const normalized = normalizeTenantProductSelection(products);
    const explicitOffline = normalized.pos && !normalized.erp && normalized.offlineMode === true;

    if (posRuntime === 'SLAVE') {
        return {
            contractedProduct: normalized.erp ? 'POS_ERP' : 'POS_ONLY',
            posVariant: normalized.erp ? 'POS_ERP' : explicitOffline ? 'POS_ONLY_OFFLINE' : 'POS_ONLY_STANDARD',
            offlineMode: explicitOffline,
            explicitOffline,
            cloudDisabledReason: explicitOffline ? 'POS_ONLY_OFFLINE' : null,
            posRuntime: 'SLAVE',
            cloudChannel: 'POS_MASTER',
            dataMaster: 'POS_MASTER',
            cloudSyncEnabled: false,
            erpCoreEnabled: normalized.erp,
            erpUiEnabled: false,
            customerErpAccess: normalized.erp,
            backupEnabled: false,
            lifecycleStatus: 'CLOUD_STAGING',
            provisioningStatus: 'SLAVE_WAITING_MASTER',
        };
    }

    if (normalized.erp) {
        return {
            contractedProduct: 'POS_ERP',
            posVariant: 'POS_ERP',
            offlineMode: false,
            explicitOffline: false,
            cloudDisabledReason: null,
            posRuntime,
            cloudChannel: 'ERP_ACTIVE',
            dataMaster: 'ERP',
            cloudSyncEnabled: true,
            erpCoreEnabled: true,
            erpUiEnabled: true,
            customerErpAccess: true,
            backupEnabled: true,
            lifecycleStatus: 'ERP_ACTIVE',
            provisioningStatus: 'ERP_ACTIVE_REQUIRED',
        };
    }

    if (normalized.pos && explicitOffline) {
        return {
            contractedProduct: 'POS_ONLY',
            posVariant: 'POS_ONLY_OFFLINE',
            offlineMode: true,
            explicitOffline: true,
            cloudDisabledReason: 'POS_ONLY_OFFLINE',
            posRuntime,
            cloudChannel: 'NONE',
            dataMaster: 'POS',
            cloudSyncEnabled: false,
            erpCoreEnabled: false,
            erpUiEnabled: false,
            customerErpAccess: false,
            backupEnabled: false,
            lifecycleStatus: 'CLOUD_DISABLED',
            provisioningStatus: 'PENDING',
        };
    }

    if (normalized.pos) {
        return {
            contractedProduct: 'POS_ONLY',
            posVariant: 'POS_ONLY_STANDARD',
            offlineMode: false,
            explicitOffline: false,
            cloudDisabledReason: null,
            posRuntime,
            cloudChannel: 'POS_CLOUD_STAGING',
            dataMaster: 'POS',
            cloudSyncEnabled: true,
            erpCoreEnabled: true,
            erpUiEnabled: false,
            customerErpAccess: false,
            backupEnabled: true,
            lifecycleStatus: 'CLOUD_STAGING',
            provisioningStatus: 'CLOUD_STAGING_REQUIRED',
        };
    }

    throw new Error('Activa al menos CLIC POS o CLIC ERP.');
}

export function deriveTenantSemanticsFromTenant(
    type: TenantType | undefined,
    cloudSync: boolean | undefined,
    semantics?: {
        posVariant?: PosVariant | null;
        offlineMode?: boolean | null;
        explicitOffline?: boolean | null;
        cloudChannel?: CloudChannel | null;
    },
): TenantSemanticConfig {
    return deriveTenantSemanticsFromProducts(deriveProductsFromTenant(type, cloudSync, semantics));
}

export function getTenantTypeLabel(type: TenantType | undefined): string {
    if (type === 'pos_only') return 'CLIC POS';
    if (type === 'erp_only') return 'CLIC ERP';
    return 'CLIC POS + CLIC ERP';
}

export function getActiveProductLabels(products: TenantProductSelection): string[] {
    return TENANT_PRODUCTS
        .filter((product) => products[product.key])
        .map((product) => product.label);
}
