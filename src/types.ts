export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL';
export type TenantType = 'full' | 'pos_only' | 'erp_only';
export type ContractedProduct = 'POS_ONLY' | 'POS_ERP';
export type PosVariant = 'POS_ONLY_STANDARD' | 'POS_ONLY_OFFLINE' | 'POS_ERP';
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
    pos_variant?: PosVariant;
    offline_mode?: boolean;
    explicit_offline?: boolean;
    cloud_disabled_reason?: string | null;
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
    store_id?: string | null;
    device_token?: string | null;
    device_id?: string | null;
    current_device_id?: string | null;
    code?: string | null;
    name?: string | null;
    terminal_name?: string | null;
    terminal_type?: string | null;
    platform?: string | null;
    app_version?: string | null;
    is_active?: boolean | null;
    active?: boolean | null;
    last_checkin_at?: string | null;
    last_seen_at?: string | null;
    last_heartbeat_at?: string | null;
    created_at: string;
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
    last_rejected_device_id?: string | null;
    auth_status?: TerminalAuthorizationStatus | string | null;
    last_auth_error?: string | null;
    last_auth_attempt_at?: string | null;
    device_token_status?: string | null;
    token_preview?: string | null;
    is_revoked?: boolean | null;
    revocation_reason?: string | null;
    requires_pos_reauth?: boolean | null;
    requires_full_bootstrap?: boolean | null;
    erp_readiness?: TenantTerminalErpReadiness | null;
    last_erp_readiness_at?: string | null;
    fiscal_readiness?: TerminalFiscalReadiness | null;
    last_fiscal_readiness_at?: string | null;
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

export interface TerminalSyncDocument {
    id?: string | null;
    folio?: string | null;
    sequence?: string | number | null;
    document_no?: string | null;
    documentNo?: string | null;
    terminal_id?: string | null;
    terminalId?: string | null;
    status?: string | null;
    error_code?: string | null;
    errorCode?: string | null;
    message?: string | null;
    readiness?: TenantTerminalErpReadiness | null;
    created_at?: string | null;
    createdAt?: string | null;
    updated_at?: string | null;
    updatedAt?: string | null;
    retryable?: boolean | null;
    [key: string]: unknown;
}

export interface TerminalSyncPendingSummary {
    pending: number;
    repairable: number;
    functionalErrors: number;
}

export interface TerminalSyncPendingResult {
    status: string;
    documents: TerminalSyncDocument[];
    summary: TerminalSyncPendingSummary;
    message?: string | null;
}

export interface TerminalSyncRetryResult {
    status: string;
    message?: string | null;
    retried?: number | null;
    succeeded?: number | null;
    failed?: number | null;
    results?: unknown[];
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
    erp_terminal_uuid?: string | null;
    erp_current_device_id?: string | null;
    erp_app_version?: string | null;
    erp_app_version_code?: number | null;
    registry?: TenantTerminalRegistryEntry | null;
}

export type TerminalAuthorizationStatus =
    | 'AUTHORIZED'
    | 'DEVICE_MISMATCH'
    | 'TAKEOVER_PENDING'
    | 'TAKEOVER_COMPLETED'
    | 'OLD_DEVICE_REVOKED'
    | 'TOKEN_ROTATION_REQUIRED'
    | 'ERP_AUTH_ERROR';

export interface TerminalAuthAttempt {
    id?: string | null;
    tenant_id?: string | null;
    terminal_id?: string | null;
    terminal_name?: string | null;
    requested_device_id?: string | null;
    authorized_device_id?: string | null;
    device_id?: string | null;
    deviceId?: string | null;
    reason?: string | null;
    message?: string | null;
    status?: string | null;
    resolution_status?: string | null;
    endpoint_url?: string | null;
    ip_address?: string | null;
    apk_version?: string | null;
    app_version?: string | null;
    attempted_at?: string | null;
    created_at?: string | null;
    pairing_required?: boolean | null;
    metadata?: Record<string, unknown> | null;
}

export type TerminalFiscalStatus = 'MISSING' | 'READY' | 'DEMO_READY' | 'ERROR';

export interface TerminalFiscalReadiness {
    status?: TerminalFiscalStatus | string | null;
    fiscalReadiness?: TerminalFiscalStatus | string | null;
    fiscal_readiness?: TerminalFiscalStatus | string | null;
    canIssueFiscalDocuments?: boolean | null;
    can_issue_fiscal_documents?: boolean | null;
    canIssueNonFiscalSales?: boolean | null;
    can_issue_non_fiscal_sales?: boolean | null;
    documentTypes?: Array<string | Record<string, unknown>> | null;
    document_types?: Array<string | Record<string, unknown>> | null;
    series?: Array<string | Record<string, unknown>> | null;
    assignedSeries?: Array<string | Record<string, unknown>> | null;
    assigned_series?: Array<string | Record<string, unknown>> | null;
    ranges?: Array<string | Record<string, unknown>> | null;
    assignedRanges?: Array<string | Record<string, unknown>> | null;
    assigned_ranges?: Array<string | Record<string, unknown>> | null;
    currentConsecutive?: string | number | null;
    current_consecutive?: string | number | null;
    nextConsecutive?: string | number | null;
    next_consecutive?: string | number | null;
    expiresAt?: string | null;
    expires_at?: string | null;
    collection?: string | null;
    message?: string | null;
    checked_at?: string | null;
    [key: string]: unknown;
}

export interface TerminalFiscalProductionConfig {
    documentType: string;
    series: string;
    prefix: string;
    rangeFrom: string;
    rangeTo: string;
    nextConsecutive: string;
    expiresAt: string;
    companyId: string;
    storeId: string;
    terminalName: string;
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
    | 'observability'
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
