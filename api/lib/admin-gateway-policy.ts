import { hasCloudAdminPermission } from '../../src/lib/cloudAdminPermissions.ts';
import type { CloudAdminPermissions, CloudAdminPermissionKey } from '../../src/types.ts';

type Grants = Partial<CloudAdminPermissions>;
const tables: Record<string, [CloudAdminPermissionKey[], CloudAdminPermissionKey[]]> = {
    tenants: [['tenants_view', 'dashboard_view', 'observability_view'], ['tenants_manage']],
    subscriptions: [['tenants_view', 'plans_view', 'dashboard_view'], ['plans_manage']],
    distributors: [['tenants_view'], ['tenants_manage']],
    terminals: [['tenants_view', 'observability_view', 'dashboard_view'], ['terminal_reauthorization']],
    erp_tenants: [['tenants_view', 'observability_view'], ['tenants_manage']],
    erp_stores: [['tenants_view', 'observability_view'], ['tenants_manage']],
    erp_terminals: [['tenants_view', 'observability_view'], ['terminal_reauthorization']],
    tenant_server_registry: [['tenants_view', 'observability_view'], ['terminal_reauthorization']],
    terminal_device_audit: [['tenants_view', 'observability_view'], []],
    terminal_takeover_audit: [['tenants_view', 'observability_view'], []],
    support_tickets: [['support_view', 'dashboard_view', 'observability_view'], ['support_manage']],
    support_integration_settings: [['settings_view'], ['settings_manage']],
    support_integration_secrets: [['settings_view'], []],
    cloud_admin_users: [['users_view'], []],
    cloud_admin_profiles: [['users_view'], []],
    support_teams: [['users_view'], []],
    support_team_members: [['users_view'], []],
};
const rpcs: Record<string, CloudAdminPermissionKey> = {
    create_new_tenant: 'tenants_manage', verify_tenant_email: 'tenants_manage',
    delete_tenant: 'tenants_delete', count_tenant_pos_license_seats: 'tenants_view',
    enforce_tenant_pos_license_limits: 'tenants_manage', register_tenant_server_endpoint: 'terminal_reauthorization',
};
const functions: Record<string, CloudAdminPermissionKey> = {
    'get-operational-telemetry': 'observability_view',
    'request-terminal-local-rebuild': 'terminal_reauthorization',
    'request-pos-erp-readiness': 'terminal_reauthorization',
    'request-terminal-erp-profile': 'terminal_reauthorization',
    'request-terminal-sync-pending': 'terminal_reauthorization',
    'request-terminal-sync-retry': 'terminal_reauthorization',
    'request-terminal-fiscal-debug': 'terminal_reauthorization',
    'request-terminal-fiscal-readiness': 'terminal_reauthorization',
    'request-terminal-fiscal-config': 'terminal_reauthorization',
};
export function authorizeGatewayRequest(path: string, method: string, schema: string, permissions: Grants, owner = false) {
    if (!['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return false;
    if (!['landlord', 'public'].includes(schema)) return false;
    if (!path.startsWith('/') || path.startsWith('//') || /[\\#\r\n]/.test(path)) return false;
    const url = new URL(path, 'https://gateway.invalid');
    if (url.origin !== 'https://gateway.invalid' || /%|\.\./.test(url.pathname)) return false;
    const can = (p: CloudAdminPermissionKey) => hasCloudAdminPermission(permissions, p);
    const read = method === 'GET' || method === 'HEAD';
    const rest = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (rest) {
        const table = rest[1];
        if (url.searchParams.getAll('select').length > 1) return false;
        // Do not allow embedded relations, casts or aggregates to access an unchecked resource.
        if (/[():!]/.test(url.searchParams.get('select') || '')) return false;
        if (table === 'support_integration_secrets') {
            if (!read || url.searchParams.get('select') !== 'provider,secret_last4,updated_at') return false;
            if ([...url.searchParams.keys()].some(k => !['select', 'order', 'limit', 'offset'].includes(k))) return false;
        }
        // Public schema access is restricted to the ERP registry used by the terminal monitor.
        if (schema === 'public' && !['erp_tenants', 'erp_stores', 'erp_terminals', 'terminals'].includes(table)) return false;
        const policy = tables[table];
        if (!policy) return false;
        if (table === 'tenants' && method === 'DELETE') return can('tenants_delete');
        return policy[read ? 0 : 1].some(can);
    }
    const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
    if (rpc) return schema === 'landlord' && ['POST', 'GET'].includes(method) && !!rpcs[rpc[1]] && can(rpcs[rpc[1]]);
    const fn = /^\/functions\/v1\/([a-z-]+)$/.exec(url.pathname);
    if (fn) return (fn[1] === 'get-operational-telemetry' ? method === 'GET' : method === 'POST') && !!functions[fn[1]] && can(functions[fn[1]]);
    // Auth administration can modify global user privileges: require both access-management capabilities.
    if (/^\/auth\/v1\/admin\/users(?:\/[a-zA-Z0-9-]+)?$/.test(url.pathname)) {
        return owner && can('users_manage') && can('profiles_manage');
    }
    return false;
}
