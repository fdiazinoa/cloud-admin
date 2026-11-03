import type { TenantProductSelection } from '../../lib/tenantProducts';
import type { TenantStatus } from '../../types';

export type TenantDetailTab = 'resumen' | 'productos' | 'terminales' | 'modulos' | 'actividad';

export type TenantStatusFilter = 'ALL' | TenantStatus;

export type TenantCreateFormData = {
    name: string;
    slug: string;
    email: string;
    taxId: string;
    contactName: string;
    contactEmail: string;
    city: string;
    capturedByDistributorId: string;
    servicedByDistributorId: string;
    products: TenantProductSelection;
};

/** Campos editables en sitio desde la ficha. */
export type TenantFieldsDraft = {
    name: string;
    legalName: string;
    taxId: string;
    phone: string;
    email: string;
    password: string;
};

export type TenantProvisionedCredentials = {
    email: string;
    tempPassword: string;
};

export interface TenantDetailActions {
    onSaveFields: (draft: TenantFieldsDraft) => Promise<void>;
    onSaveProducts: (products: TenantProductSelection) => Promise<void>;
    onToggleStatus: () => Promise<void>;
    onActivateTrial: () => Promise<void>;
    onDelete: () => Promise<void>;
    onOpenConsole: () => void;
}
