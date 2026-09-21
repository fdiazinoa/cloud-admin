import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectTenantAuthUser } from '../src/lib/tenantAuthLookup.ts';

const tenant = { id: 'local-3-id', email: 'local3@gmail.com' };
const users = Array.from({ length: 61 }, (_, index) => ({
    id: `other-${index}`,
    email: `other-${index}@example.com`,
    app_metadata: {},
    user_metadata: {},
}));
users.push({
    id: 'local-3-auth-user',
    email: 'LOCAL3@gmail.com',
    app_metadata: { tenant_id: tenant.id },
    user_metadata: { tenant_id: 'local-3-erp-id', erp_tenant_id: 'local-3-erp-id' },
});

assert.equal(selectTenantAuthUser(users, tenant)?.id, 'local-3-auth-user');
assert.equal(selectTenantAuthUser([
    { id: 'legacy', email: tenant.email, app_metadata: {}, user_metadata: {} },
], tenant)?.id, 'legacy');
assert.throws(() => selectTenantAuthUser([
    { id: 'other-tenant', email: tenant.email, app_metadata: { tenant_id: 'different-tenant' } },
], tenant), /otro tenant/);
assert.throws(() => selectTenantAuthUser([
    { id: 'linked', email: 'old@example.com', app_metadata: { tenant_id: tenant.id } },
    { id: 'email-match', email: tenant.email, app_metadata: {} },
], tenant), /otro usuario/);

const service = readFileSync('src/lib/tenantService.ts', 'utf8');
assert.match(service, /listUsers\(\{ page, perPage \}\)/);
assert.match(service, /allUsers\.push\(\.\.\.users\)/);
assert.match(service, /if \(users\.length < perPage\) return selectTenantAuthUser\(allUsers, tenant\)/);
assert.match(service, /updateTenantCredentials[\s\S]*?await findTenantAuthUser\(/);

console.log('tenant Auth lookup checks passed');
