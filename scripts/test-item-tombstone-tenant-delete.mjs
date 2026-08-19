import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
    'supabase/migrations/20260819204403_guard_item_tombstone_tenant_delete.sql',
    'utf8',
);

assert.match(
    migration,
    /INSERT INTO public\.erp_sync_master_tombstones[\s\S]*?SELECT[\s\S]*?source_tenant\.id[\s\S]*?FROM public\.erp_tenants AS source_tenant[\s\S]*?WHERE source_tenant\.id = old\.tenant_id/,
    'item tombstones must only be inserted while the ERP tenant exists',
);
assert.match(
    migration,
    /LEFT JOIN public\.erp_companies AS source_company[\s\S]*?source_company\.id = old\.company_id[\s\S]*?source_company\.tenant_id = source_tenant\.id/,
    'company deletion must fall back to a tenant-scoped tombstone',
);
assert.doesNotMatch(
    migration,
    /VALUES\s*\(\s*old\.tenant_id/,
    'the trigger must not insert an unchecked tenant id',
);
assert.match(migration, /ON CONFLICT \(tenant_id, collection, record_id\)/);
assert.match(migration, /RETURN old;/);
assert.match(migration, /RETURN new;/);

console.log('item tombstone tenant-delete guard migration checks passed');
