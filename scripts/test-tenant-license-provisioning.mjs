import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tenantsPage = readFileSync('src/pages/Tenants.tsx', 'utf8');
const tenantService = readFileSync('src/lib/tenantService.ts', 'utf8');
const provisioning = readFileSync('src/lib/tenantProvisioning.ts', 'utf8');
const provisioningApi = readFileSync('api/activation/provision-tenant.ts', 'utf8');
const migration = readFileSync(
    'supabase/migrations/20260830123111_persist_initial_tenant_license_limits.sql',
    'utf8',
);

assert.match(
    tenantsPage,
    /maxPosTerminals:\s*products\.pos_licenses[\s\S]*maxErpUsers:\s*products\.erp_users/,
    'tenant creation must send the selected POS and ERP license limits',
);

for (const source of [tenantService, provisioning, provisioningApi]) {
    assert.match(source, /p_max_pos_terminals:\s*normalizedMaxPosTerminals/);
    assert.match(source, /p_max_erp_users:\s*normalizedMaxErpUsers/);
    assert.match(source, /select\("id,max_pos_terminals,max_erp_users"\)/);
}

for (const source of [tenantService, provisioning]) {
    assert.match(source, /getTenantLicenseProvisioningMismatch/);
}

assert.match(provisioning, /Math\.max\(1, Math\.trunc\(numericValue\)\)/);
assert.match(migration, /^begin;/);
assert.match(migration, /rename to create_new_tenant_without_license_limits/);
assert.match(migration, /p_max_pos_terminals integer default 1/);
assert.match(migration, /p_max_erp_users integer default 1/);
assert.match(
    migration,
    /update landlord\.tenants[\s\S]*max_pos_terminals = v_max_pos_terminals[\s\S]*max_erp_users = v_max_erp_users/,
);
assert.match(migration, /if not found then[\s\S]*raise exception/);
assert.match(migration, /revoke all on function landlord\.create_new_tenant\([\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function landlord\.create_new_tenant\([\s\S]*to service_role/);
assert.match(migration, /commit;\s*$/);

console.log('tenant initial license provisioning regression: ok');
