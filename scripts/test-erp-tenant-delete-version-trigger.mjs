import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
    'supabase/migrations/20260729100000_skip_sync_version_on_erp_tenant_delete.sql',
    'utf8',
);

assert.match(
    migration,
    /IF tg_table_name = 'erp_tenants' AND tg_op = 'DELETE' THEN\s+RETURN old;/,
    'ERP tenant deletion must return before writing a domain version',
);
assert.match(migration, /PERFORM public\.erp_sync_touch_domain_version/);
assert.match(migration, /SET search_path = ''/);

console.log('ERP tenant delete version trigger migration checks passed');
