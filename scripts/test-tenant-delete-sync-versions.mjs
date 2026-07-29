import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
    'supabase/migrations/20260728145000_fix_delete_tenant_sync_domain_versions.sql',
    'utf8',
);

const versionDelete = migration.indexOf('DELETE FROM public.erp_sync_domain_versions');
const erpTenantDelete = migration.indexOf('DELETE FROM public.erp_tenants');

assert.ok(versionDelete >= 0, 'tenant deletion must purge sync domain versions');
assert.ok(erpTenantDelete > versionDelete, 'sync domain versions must be purged before ERP tenants');
assert.match(migration, /WHERE tenant_id = ANY\(v_erp_tenant_ids\)/);
assert.match(migration, /REVOKE ALL ON FUNCTION landlord\.delete_tenant/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION landlord\.delete_tenant\(UUID, TEXT\) TO service_role/);

console.log('tenant delete sync versions migration checks passed');
