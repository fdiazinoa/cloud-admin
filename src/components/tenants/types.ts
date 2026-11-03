import type { TenantProductSelection } from '../../lib/tenantProducts';

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

export type TenantEditFormData = {
    name: string;
    legalName: string;
    taxId: string;
    phone: string;
    email: string;
    password: string;
    products: TenantProductSelection;
};

export type TenantProvisionedCredentials = {
    email: string;
    tempPassword: string;
};
