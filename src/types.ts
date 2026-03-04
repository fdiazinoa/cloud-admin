export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL';

export interface Tenant {
    id: string;
    name: string;
    legal_name?: string;
    tax_id?: string;
    email: string;
    phone?: string;
    status: TenantStatus;
    created_at: string;
}

export interface Terminal {
    id: string;
    tenant_id: string;
    device_token: string;
    name: string;
    is_active: boolean;
    last_checkin_at?: string;
    created_at: string;
}

export interface BillingPlan {
    id: string;
    name: string;
    price_monthly: number;
    max_terminals: number;
}

export interface Subscription {
    id: string;
    tenant_id: string;
    plan_id: string;
    end_date?: string;
    is_active: boolean;
}
