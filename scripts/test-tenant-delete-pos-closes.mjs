import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
    'supabase/migrations/20260921143000_allow_confirmed_tenant_delete_of_pos_closes.sql',
    'utf8',
);

assert.match(migration, /p_tenant_id::TEXT = ANY\(COALESCE\(/);
assert.match(migration, /current_setting\(\s*'landlord\.tenant_delete_erp_tenant_ids', TRUE/);
assert.match(migration, /private\.tenant_delete_allows\(old\.tenant_id\)/);
assert.match(migration, /tg_op='DELETE' and private\.tenant_delete_allows\(tenant\)/);
assert.match(migration, /PERFORM private\.purge_deleted_pos_tenants\(v_erp_tenant_ids\)/);
assert.match(migration, /DELETE FROM private\.pos_recovered_close_commits WHERE tenant_id = ANY\(p_tenant_ids\)/);
assert.match(migration, /DELETE FROM private\.pos_z_sequence_authorities WHERE tenant_id = ANY\(p_tenant_ids\)/);
assert.match(migration, /RAISE EXCEPTION 'Unexpected definition for %'/);
assert.match(migration, /RAISE EXCEPTION 'Unexpected landlord\.delete_tenant definition'/);
assert.doesNotMatch(migration, /DISABLE TRIGGER|session_replication_role/i);

const posAssignments = migration.indexOf('DELETE FROM public.erp_pos_role_assignments');
const posRoles = migration.indexOf('DELETE FROM public.erp_pos_roles');
assert.ok(posAssignments >= 0 && posAssignments < posRoles);
for (const table of [
    'erp_roles',
    'erp_property_layout_items',
    'erp_property_documents',
    'erp_property_operations',
    'erp_property_owners',
    'erp_property_layouts',
]) {
    assert.match(migration, new RegExp(`DELETE FROM public\\.${table} WHERE tenant_id = ANY\\(v_erp_tenant_ids\\)`));
}
assert.match(migration, /IF strpos\(v_definition, v_replacement\) > 0 THEN/);
assert.match(migration, /DELETE FROM public\.erp_property_layouts WHERE tenant_id = ANY\(v_erp_tenant_ids\);[\s\S]*\|\| v_anchor/);

console.log('tenant delete POS close checks passed');
