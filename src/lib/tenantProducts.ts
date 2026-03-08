import type { TenantType } from '../types';

export type TenantProductKey = 'pos' | 'erp' | 'backup';

export interface TenantProductSelection {
    pos: boolean;
    erp: boolean;
    backup: boolean;
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
        backup: true
    };
}

export function deriveProductsFromTenant(type: TenantType | undefined, cloudSync: boolean | undefined): TenantProductSelection {
    if (type === 'pos_only') {
        return {
            pos: true,
            erp: false,
            backup: cloudSync ?? true
        };
    }

    if (type === 'erp_only') {
        return {
            pos: false,
            erp: true,
            backup: cloudSync ?? true
        };
    }

    return {
        pos: true,
        erp: true,
        backup: cloudSync ?? true
    };
}

export function deriveTenantConfigFromProducts(products: TenantProductSelection): { type: TenantType; cloudSync: boolean } {
    if (products.pos && products.erp) {
        return {
            type: 'full',
            cloudSync: products.backup
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
            cloudSync: products.backup
        };
    }

    throw new Error('Activa al menos un producto principal: CLIC POS o CLIC ERP.');
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
