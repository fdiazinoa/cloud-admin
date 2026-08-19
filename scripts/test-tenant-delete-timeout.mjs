import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
    'supabase/migrations/20260819195742_optimize_delete_tenant_timeout.sql',
    'utf8',
);

assert.match(
    migration,
    /SET statement_timeout = '2min'/,
    'tenant deletion must override the short PostgREST timeout with a bounded local timeout',
);
assert.match(
    migration,
    /attribute\.atttypid AS tenant_id_type_oid/,
    'the dynamic purge must inspect the tenant_id column type',
);
assert.match(
    migration,
    /IF v_table\.tenant_id_type_oid = 'uuid'::REGTYPE THEN[\s\S]*?WHERE tenant_id = ANY\(\$1\)[\s\S]*?USING v_erp_tenant_ids/,
    'UUID tenant tables must use the indexed UUID comparison',
);
assert.match(
    migration,
    /ELSE[\s\S]*?WHERE tenant_id::TEXT = ANY\(\$1\)[\s\S]*?USING v_erp_tenant_id_texts/,
    'legacy text tenant tables must retain the compatible fallback',
);
assert.match(migration, /REVOKE ALL ON FUNCTION landlord\.delete_tenant/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION landlord\.delete_tenant\(UUID, TEXT\) TO service_role/);

console.log('tenant delete timeout migration checks passed');
