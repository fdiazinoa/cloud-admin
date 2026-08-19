import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
    'supabase/migrations/20260819190755_guard_orphaned_sync_domain_versions.sql',
    'utf8',
);

assert.match(
    migration,
    /IF tg_op = 'DELETE'\s+AND v_tenant_id IS NOT NULL\s+AND NOT EXISTS \(\s+SELECT 1\s+FROM public\.erp_tenants\s+WHERE id = v_tenant_id\s+\) THEN\s+RETURN old;/,
    'Cascading deletes must not write versions once the ERP tenant is gone',
);
assert.match(migration, /PERFORM public\.erp_sync_touch_domain_version/);
assert.match(migration, /SET search_path = ''/);
assert.match(
    migration,
    /INSERT INTO public\.erp_sync_domain_versions[\s\S]*?SELECT[\s\S]*?source_tenant\.id[\s\S]*?FROM public\.erp_tenants AS source_tenant[\s\S]*?WHERE source_tenant\.id = p_tenant_id/,
    'The central domain-version writer must only insert for an existing ERP tenant',
);
assert.doesNotMatch(
    migration,
    /INSERT INTO public\.erp_sync_domain_versions[\s\S]*?VALUES\s*\(\s*p_tenant_id/,
    'The central writer must not insert an unchecked tenant id',
);
for (const preservedOptimization of [
    "tg_table_name = 'erp_tenants' AND tg_op = 'DELETE'",
    "to_jsonb(new) - 'updated_at'",
    'v_old_terminal_stable',
    "- 'runtime'",
]) {
    assert.ok(migration.includes(preservedOptimization), `Trigger optimization must be preserved: ${preservedOptimization}`);
}

console.log('ERP orphaned delete version trigger migration checks passed');
