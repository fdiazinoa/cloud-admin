import assert from 'node:assert/strict';
import { authorizeGatewayRequest as allowed } from '../api/lib/admin-gateway-policy.ts';
import sessionHandler from '../api/admin-session.ts';
import gateway from '../api/admin-gateway.ts';
assert(!allowed('/auth/v1/admin/users', 'PATCH', 'landlord', { users_manage: true, profiles_manage: true }));
assert(allowed('/auth/v1/admin/users', 'POST', 'landlord', { users_manage: true, profiles_manage: true }, true));
assert(allowed('/functions/v1/get-operational-telemetry', 'GET', 'landlord', { observability: true }));
assert(!allowed('/functions/v1/get-operational-telemetry', 'POST', 'landlord', { observability: true }));
const view = { tenants_view: true };
assert(allowed('/rest/v1/tenants?select=id,name', 'GET', 'landlord', view));
assert(!allowed('/rest/v1/tenants', 'PATCH', 'landlord', view));
assert(!allowed('/rest/v1/tenants?select=*,cloud_admin_users(*)', 'GET', 'landlord', view));
assert(!allowed('/rest/v1/tenants?select=id&select=cloud_admin_users(*)', 'GET', 'landlord', view));
assert(!allowed('/rest/v1/cloud_admin_users', 'GET', 'landlord', view));
assert(!allowed('/rest/v1/tenants', 'GET', 'public', view));
assert(!allowed('//attacker.invalid/rest/v1/tenants', 'GET', 'landlord', view));
assert(!allowed('/rest/v1/%74enants', 'GET', 'landlord', view));
assert(!allowed('/rest/v1/rpc/execute_sql', 'POST', 'landlord', { settings: true }));
assert(!allowed('/auth/v1/admin/users', 'POST', 'landlord', { tenants_manage: true }));
assert(!allowed('/rest/v1/support_integration_secrets?select=*', 'GET', 'landlord', { settings: true }));
assert(allowed('/rest/v1/support_integration_secrets?select=provider,secret_last4,updated_at', 'GET', 'landlord', { settings_view: true }));
assert(!allowed('/rest/v1/support_integration_secrets?select=provider,secret_last4,updated_at&secret_ciphertext=not.is.null', 'GET', 'landlord', { settings_view: true }));
assert(allowed('/rest/v1/tenants', 'GET', 'landlord', { tenants: true }));
assert(!allowed('/rest/v1/tenants', 'GET', 'landlord', { tenants: true, tenants_view: false }));
const originalFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-test-secret';
let permissions = { tenants_view: true };
let active = true;
let calls = [];
globalThis.fetch = async (input, init) => {
 const url = String(input); calls.push({ url, headers: new Headers(init?.headers) });
 if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'auth-user', email: 'test@example.invalid' });
 if (url.includes('/rest/v1/cloud_admin_users')) return Response.json({ id: 'admin-user', auth_user_id: 'auth-user', status: active ? 'active' : 'suspended', profile_id: 'profile', cloud_admin_profiles: { is_active: true, permissions } });
 return Response.json([{ id: 'tenant' }], { headers: { 'content-range': '0-0/1' } });
};
function response() {
 return { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(body) { this.body = body?.toString() || ''; } };
}
try {
 let res = response(); await sessionHandler({ method: 'GET', headers: {} }, res);
 assert.equal(res.statusCode, 401); assert.equal(calls.length, 0);
 res = response(); await sessionHandler({ method: 'GET', headers: { authorization: 'Bearer user-jwt' } }, res);
 assert.equal(res.statusCode, 200); assert.equal(JSON.parse(res.body).adminUser.id, 'admin-user');
 assert(!res.body.includes('server-test-secret'));
 active = false; res = response(); await sessionHandler({ method: 'GET', headers: { authorization: 'Bearer user-jwt' } }, res);
 assert.equal(res.statusCode, 403); active = true;
 calls = []; res = response();
 await gateway({ method: 'POST', headers: { authorization: 'Bearer user-jwt' }, body: { path: '/rest/v1/tenants?select=id', method: 'GET', headers: { 'accept-profile': 'landlord', apikey: 'attacker', 'x-custom': 'never-forward' } } }, res);
 assert.equal(res.statusCode, 200); assert.equal(res.headers['content-range'], '0-0/1');
 const outbound = calls.at(-1); assert.equal(outbound.headers.get('apikey'), 'server-test-secret');
 assert.equal(outbound.headers.get('x-custom'), null); assert.equal(res.headers['Cache-Control'], 'no-store');
 calls = []; res = response();
 await gateway({ method: 'POST', headers: { authorization: 'Bearer user-jwt' }, body: { path: '/rest/v1/tenants', method: 'PATCH', headers: {}, body: '{}' } }, res);
 assert.equal(res.statusCode, 403); assert.equal(calls.length, 2);
 res = response(); await gateway({ method: 'POST', headers: { authorization: 'Bearer user-jwt' }, body: { path: '/rest/v1/tenants', method: 'GET', headers: { 'accept-profile': 'public', 'content-profile': 'landlord' } } }, res);
 assert.equal(res.statusCode, 403);
 console.log('PASS: gateway policies, bootstrap, suspended actor, authorization, SSRF, secret isolation and response headers');
} finally { globalThis.fetch = originalFetch; }
