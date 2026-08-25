import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
    'supabase/migrations/20260825232903_fix_auth_user_delete_trigger_permissions.sql',
    'utf8',
);

assert.match(
    migration,
    /ALTER FUNCTION public\.erp_sync_touch_domain_version_delete_stmt\(\)\s+SECURITY DEFINER/i,
    'the ERP delete trigger must retain the postgres owner privileges during Auth cascades',
);
assert.match(
    migration,
    /ALTER FUNCTION public\.erp_sync_touch_domain_version_delete_stmt\(\)\s+SET search_path = ''/i,
    'the SECURITY DEFINER trigger must keep an empty search_path',
);
assert.doesNotMatch(
    migration,
    /GRANT\s+SELECT[\s\S]*supabase_auth_admin/i,
    'the fix must not broaden direct ERP table access for the Auth service role',
);

console.log('Auth user delete trigger permission checks passed');
