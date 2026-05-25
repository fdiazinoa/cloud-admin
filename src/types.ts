export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL';
export type TenantType = 'full' | 'pos_only' | 'erp_only';
export type ContractedProduct = 'POS_ONLY' | 'POS_ERP';
export type PosRuntime = 'LOCAL_SQLITE' | 'MASTER' | 'SLAVE';
export type CloudChannel = 'NONE' | 'POS_CLOUD_STAGING' | 'ERP_ACTIVE' | 'POS_MASTER';
export type DataMaster = 'POS' | 'ERP' | 'POS_MASTER';
export type TenantLifecycleStatus =
    | 'CLOUD_DISABLED'
    | 'CLOUD_STAGING'
    | 'CLOUD_SYNCING'
    | 'CLOUD_READY'
    | 'READY_FOR_ERP_ACTIVATION'
    | 'ERP_ACTIVE'
    | 'BLOCKED';
export type TenantProvisioningStatus =
    | 'PENDING'
    | 'CLOUD_STAGING_REQUIRED'
    | 'CLOUD_STAGING_READY'
    | 'ERP_ACTIVE_REQUIRED'
    | 'ERP_ACTIVE_READY'
    | 'SLAVE_WAITING_MASTER'
    | 'BLOCKED';

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
    contracted_product?: ContractedProduct;
    pos_runtime?: PosRuntime;
    cloud_channel?: CloudChannel;
    data_master?: DataMaster;
    cloud_sync_enabled?: boolean;
    erp_core_enabled?: boolean;
    erp_ui_enabled?: boolean;
    customer_erp_access?: boolean;
    backup_enabled?: boolean;
    lifecycle_status?: TenantLifecycleStatus;
    provisioning_status?: TenantProvisioningStatus;
    last_sync_received_at?: string | null;
    last_backup_at?: string | null;
    ready_for_erp_activation?: boolean | null;
    pending_events_count?: number | null;
    blocked_events_count?: number | null;
    captured_by_distributor_id?: string;
    serviced_by_distributor_id?: string;
    status: TenantStatus;
    email_verified?: boolean;
    max_pos_terminals?: number;
    max_erp_users?: number;
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
    last_checkin_at?: string | null;
    last_seen_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    config?: {
        is_active?: boolean;
        [key: string]: unknown;
    } | null;
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
    authorized_device_id?: string | null;
    is_revoked?: boolean | null;
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
    registries: TenantTerminalRegistryEntry[];
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
