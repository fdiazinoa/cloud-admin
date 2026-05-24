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
    device_token: string;
    name: string;
    is_active: boolean;
    last_checkin_at?: string;
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
    last_takeover_at?: string | null;
    last_rebuild_at?: string | null;
    previous_device_id?: string | null;
    current_device_id?: string | null;
    revocation_reason?: string | null;
    requires_pos_reauth?: boolean | null;
    requires_full_bootstrap?: boolean | null;
    erp_readiness?: TenantTerminalErpReadiness | null;
    last_erp_readiness_at?: string | null;
    is_primary?: boolean | null;
    status?: string | null;
    last_seen_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface TenantTerminalErpReadiness {
    status?: string | null;
    erpTenantId?: string | null;
    erp_tenant_id?: string | null;
    companyId?: string | null;
    company_id?: string | null;
    storeId?: string | null;
    store_id?: string | null;
    terminalId?: string | null;
    terminal_id?: string | null;
    profileStatus?: string | null;
    profile_status?: string | null;
    checks?: Record<string, unknown> | null;
    lastSyncEventAt?: string | null;
    last_sync_event_at?: string | null;
    lastSyncEventType?: string | null;
    last_sync_event_type?: string | null;
    lastSyncStatus?: string | null;
    last_sync_status?: string | null;
    checked_at?: string | null;
    http_status?: number | null;
    error_code?: string | null;
    message?: string | null;
    [key: string]: unknown;
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
    registry?: TenantTerminalRegistryEntry | null;
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

export type CloudAdminUserStatus = 'active' | 'invited' | 'suspended';

export type CloudAdminPermissionKey =
    | 'dashboard'
    | 'tenants'
    | 'plans'
    | 'support'
    | 'improvements'
    | 'apk'
    | 'terminal_recovery'
    | 'billing'
    | 'settings'
    | 'kill_switch'
    | 'users';

export type CloudAdminPermissions = Record<CloudAdminPermissionKey, boolean>;

export interface CloudAdminProfile {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    level: number;
    permissions: Partial<CloudAdminPermissions>;
    is_system: boolean;
    is_active: boolean;
    created_at: string;
    updated_at?: string | null;
}

export interface CloudAdminUser {
    id: string;
    auth_user_id?: string | null;
    email: string;
    full_name: string;
    profile_id?: string | null;
    status: CloudAdminUserStatus;
    phone?: string | null;
    metadata?: Record<string, unknown> | null;
    last_sign_in_at?: string | null;
    created_at: string;
    updated_at?: string | null;
    profile?: CloudAdminProfile | null;
}
