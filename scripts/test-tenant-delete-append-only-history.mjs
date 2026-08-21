import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
    'supabase/migrations/20260821225223_allow_tenant_purge_of_append_only_currency_history.sql',
    'utf8',
);

assert.match(migration, /CREATE OR REPLACE FUNCTION private\.erp_currency_history_append_only\(\)/);
assert.match(
    migration,
    /IF tg_op = 'DELETE'[\s\S]*old\.tenant_id::TEXT = ANY\(COALESCE\(v_allowed_tenant_ids, ARRAY\[\]::TEXT\[\]\)\)[\s\S]*RETURN old;/,
    'only a DELETE for an explicitly allowed ERP tenant may bypass append-only protection',
);
assert.match(migration, /RAISE EXCEPTION 'erp_currency_rate_history is append-only'/);
assert.match(
    migration,
    /PERFORM set_config\([\s\S]*'landlord\.tenant_delete_erp_tenant_ids'[\s\S]*array_to_string\(v_erp_tenant_ids, ','\)[\s\S]*TRUE[\s\S]*\);/,
    'tenant deletion must use a transaction-local purge context',
);
assert.match(
    migration,
    /DELETE FROM public\.erp_tenants[\s\S]*PERFORM set_config\('landlord\.tenant_delete_erp_tenant_ids', '', TRUE\);/,
    'the purge context must remain active through cascades and then be cleared',
);
assert.match(migration, /COALESCE\(p_confirm_name, ''\) <> v_tenant\.name/);
assert.match(migration, /REVOKE ALL ON FUNCTION landlord\.delete_tenant\(UUID, TEXT\) FROM PUBLIC/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION landlord\.delete_tenant\(UUID, TEXT\) TO service_role/);
assert.doesNotMatch(migration, /5ccbc5c2-07c1-4f22-893b-846b96e26b64|PANCUVI/i);

console.log('tenant delete append-only history checks passed');
