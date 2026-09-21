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

console.log('tenant delete POS close checks passed');
