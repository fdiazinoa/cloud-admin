import { supabase } from './supabase';

export type ErpModuleLicenseMetric =
    | 'boolean'
    | 'users'
    | 'employees'
    | 'locations'
    | 'connections'
    | 'transactions'
    | 'unlimited';

export type ErpModuleEntitlementStatus = 'active' | 'inactive' | 'suspended';
export type ErpModuleProvisioningStatus = 'pending' | 'provisioned' | 'error';

export interface ErpModuleDefinition {
    code: string;
    name: string;
    description: string;
    category: string;
    icon_key: string;
    license_metric: ErpModuleLicenseMetric;
    default_limit: number;
    is_active: boolean;
    is_featured: boolean;
    display_order: number;
}

export interface ErpModuleDependency {
    module_code: string;
    required_module_code: string;
}

export interface TenantErpModuleEntitlement {
    id: string;
    tenant_id: string;
    module_code: string;
    status: ErpModuleEntitlementStatus;
    licensed_quantity: number;
    provisioning_status: ErpModuleProvisioningStatus;
    provisioned_at?: string | null;
    last_error?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    version: number;
}

export interface ErpModuleStoreOverview {
    tenant: {
        id: string;
        name: string;
        type?: string | null;
        contracted_product?: string | null;
        erp_ui_enabled?: boolean | null;
        customer_erp_access?: boolean | null;
        erp_enabled: boolean;
    };
    modules: ErpModuleDefinition[];
    dependencies: ErpModuleDependency[];
    entitlements: TenantErpModuleEntitlement[];
}

export interface ErpModuleSelection {
    module_code: string;
    enabled: boolean;
    licensed_quantity: number;
}

async function invoke<T>(action: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('module-licensing-api', {
        body: { action, ...payload },
    });
    if (error) {
        let message = error.message || 'No se pudo administrar las licencias ERP.';
        const context = error.context as Response | undefined;
        if (context?.clone) {
            const detail = await context.clone().json().catch(() => null) as { error?: string } | null;
            message = detail?.error || message;
        }
        throw new Error(message);
    }
    if (data?.error) throw new Error(String(data.error));
    return data as T;
}

export const erpModuleLicensingService = {
    getOverview(tenantId: string) {
        return invoke<ErpModuleStoreOverview>('overview', { tenant_id: tenantId });
    },

    save(tenantId: string, entitlements: ErpModuleSelection[]) {
        return invoke<ErpModuleStoreOverview>('save', { tenant_id: tenantId, entitlements });
    },
};
