import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
    'supabase/migrations/20260830195440_reapply_orphaned_sync_domain_version_guard.sql',
    'utf8',
);

assert.match(
    migration,
    /INSERT INTO public\.erp_sync_domain_versions[\s\S]*?SELECT[\s\S]*?source_tenant\.id[\s\S]*?FROM public\.erp_tenants AS source_tenant[\s\S]*?WHERE source_tenant\.id = p_tenant_id/,
    'the writer must source tenant_id from an existing ERP tenant',
);
assert.doesNotMatch(
    migration,
    /INSERT INTO public\.erp_sync_domain_versions[\s\S]*?VALUES\s*\(\s*p_tenant_id/,
    'the writer must not insert an unchecked tenant id',
);
assert.match(migration, /'pos_users'/, 'the newer POS user sync domain must be preserved');
assert.match(
    migration,
    /IF to_regclass\('public\.erp_sync_snapshots'\) IS NOT NULL[\s\S]*?UPDATE public\.erp_sync_snapshots/,
    'snapshot invalidation must be preserved',
);
assert.match(
    migration,
    /GET DIAGNOSTICS v_touched_rows = ROW_COUNT;[\s\S]*?IF v_touched_rows = 0 THEN\s+RETURN;/,
    'orphaned calls must stop before snapshot invalidation',
);
assert.match(migration, /SET search_path = ''/);

console.log('ERP sync-domain tenant delete regression checks passed');
