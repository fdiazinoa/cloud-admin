export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL';
export type TenantType = 'full' | 'pos_only' | 'erp_only';

export interface Tenant {
    id: string;
    name: string;
    slug?: string;
    legal_name?: string;
    tax_id?: string;
    email: string;
    phone?: string;
    contact_name?: string;
    contact_email?: string;
    city?: string;
    type?: TenantType;
    cloud_sync?: boolean;
    captured_by_distributor_id?: string;
    serviced_by_distributor_id?: string;
    status: TenantStatus;
    email_verified?: boolean;
    created_at: string;
}

export interface Distributor {
    id: string;
    name: string;
    code?: string;
    email?: string;
    phone?: string;
    city?: string;
    is_active: boolean;
    created_at: string;
}

export interface Terminal {
    id: string;
    tenant_id: string;
    device_token?: string | null;
    device_id?: string | null;
    current_device_id?: string | null;
    name?: string | null;
    terminal_name?: string | null;
    label?: string | null;
    is_active?: boolean | null;
    active?: boolean | null;
    last_checkin_at?: string;
    last_seen_at?: string | null;
    updated_at?: string | null;
    created_at: string;
}

export interface TenantTerminalRegistryEntry {
    id: string;
    tenant_id: string;
    device_id?: string | null;
    terminal_id?: string | null;
    terminal_name?: string | null;
    hostname?: string | null;
    protocol?: string | null;
    port?: number | null;
    local_ip?: string | null;
    local_ips?: string[];
    endpoint_url?: string | null;
    app_version?: string | null;
    app_version_code?: number | null;
    is_primary?: boolean | null;
    status?: string | null;
    last_seen_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface TenantTerminalSnapshot {
    id: string;
    tenant_id: string;
    terminal_id?: string | null;
    name: string;
    device_token?: string | null;
    is_active: boolean;
    last_checkin_at?: string | null;
    created_at?: string | null;
    registry_history_count?: number;
    registry_stale_count?: number;
    registry?: TenantTerminalRegistryEntry | null;
}

export interface TenantRegistryCleanupResult {
    removed: number;
    kept: number;
    logical_terminals: number;
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
