import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
    'supabase/migrations/20260730100000_skip_orphaned_sync_version_on_delete.sql',
    'utf8',
);

assert.match(
    migration,
    /IF tg_op = 'DELETE'\s+AND v_tenant_id IS NOT NULL\s+AND NOT EXISTS \(\s+SELECT 1\s+FROM public\.erp_tenants\s+WHERE id = v_tenant_id\s+\) THEN\s+RETURN old;/,
    'Cascading deletes must not write versions once the ERP tenant is gone',
);
assert.match(migration, /PERFORM public\.erp_sync_touch_domain_version/);
assert.match(migration, /SET search_path = ''/);

console.log('ERP orphaned delete version trigger migration checks passed');
