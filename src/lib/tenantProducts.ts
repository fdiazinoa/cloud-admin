import type {
    CloudChannel,
    ContractedProduct,
    DataMaster,
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
    pos_licenses: number;
    erp_users: number;
}

export interface TenantSemanticConfig {
    contractedProduct: ContractedProduct;
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
        pos_licenses: 1,
        erp_users: 1
    };
}

export function deriveProductsFromTenant(
    type: TenantType | undefined,
    cloudSync: boolean | undefined,
    maxPosTerminals?: number,
    maxErpUsers?: number
): TenantProductSelection {
    if (type === 'pos_only') {
        return {
            pos: true,
            erp: false,
            backup: cloudSync ?? true,
            pos_licenses: maxPosTerminals ?? 1,
            erp_users: maxErpUsers ?? 1
        };
    }

    if (type === 'erp_only') {
        return {
            pos: false,
            erp: true,
            backup: cloudSync ?? true,
            pos_licenses: maxPosTerminals ?? 1,
            erp_users: maxErpUsers ?? 1
        };
    }

    return {
        pos: true,
        erp: true,
        backup: cloudSync ?? true,
        pos_licenses: maxPosTerminals ?? 1,
        erp_users: maxErpUsers ?? 1
    };
}

export function deriveTenantConfigFromProducts(products: TenantProductSelection): { type: TenantType; cloudSync: boolean } {
    if (products.pos && products.erp) {
        return {
            type: 'full',
            cloudSync: true
        };
    }

    if (products.pos) {
        return {
            type: 'pos_only',
            cloudSync: products.backup
        };
    }

    if (products.erp) {
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
    if (posRuntime === 'SLAVE') {
        return {
            contractedProduct: products.erp ? 'POS_ERP' : 'POS_ONLY',
            posRuntime: 'SLAVE',
            cloudChannel: 'POS_MASTER',
            dataMaster: 'POS_MASTER',
            cloudSyncEnabled: false,
            erpCoreEnabled: products.erp,
            erpUiEnabled: false,
            customerErpAccess: products.erp,
            backupEnabled: false,
            lifecycleStatus: 'CLOUD_STAGING',
            provisioningStatus: 'SLAVE_WAITING_MASTER',
        };
    }

    if (products.erp) {
        return {
            contractedProduct: 'POS_ERP',
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

    if (products.pos && products.backup) {
        return {
            contractedProduct: 'POS_ONLY',
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

    if (products.pos) {
        return {
            contractedProduct: 'POS_ONLY',
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

    throw new Error('Activa al menos CLIC POS o CLIC ERP.');
}

export function deriveTenantSemanticsFromTenant(
    type: TenantType | undefined,
    cloudSync: boolean | undefined,
): TenantSemanticConfig {
    return deriveTenantSemanticsFromProducts(deriveProductsFromTenant(type, cloudSync));
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
