import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { invokeAuthenticatedEdgeFunction } from '../src/lib/authenticatedEdgeFunction.ts';

function clientWith({ sessionToken = 'session-token', invokeResults, refreshedToken = 'refreshed-token' }) {
    const calls = [];
    let refreshes = 0;
    const client = {
        auth: {
            async getSession() {
                return { data: { session: sessionToken ? { access_token: sessionToken } : null }, error: null };
            },
            async refreshSession() {
                refreshes += 1;
                return { data: { session: { access_token: refreshedToken } }, error: null };
            },
        },
        functions: {
            async invoke(name, options) {
                calls.push({ name, options });
                return invokeResults.shift();
            },
        },
    };
    return { client, calls, refreshCount: () => refreshes };
}

const success = clientWith({ invokeResults: [{ data: { ok: true }, error: null }] });
const successResult = await invokeAuthenticatedEdgeFunction(success.client, 'module-licensing-api', {
    body: { action: 'overview' },
});
assert.deepEqual(successResult.data, { ok: true });
assert.equal(success.calls[0].options.headers.Authorization, 'Bearer session-token');
assert.equal(success.refreshCount(), 0);

const unauthorizedError = { context: new Response('{}', { status: 401 }) };
const retry = clientWith({
    invokeResults: [
        { data: null, error: unauthorizedError },
        { data: { ok: true }, error: null },
    ],
});
await invokeAuthenticatedEdgeFunction(retry.client, 'pos-apk-releases-api');
assert.equal(retry.refreshCount(), 1);
assert.equal(retry.calls[1].options.headers.Authorization, 'Bearer refreshed-token');

const missing = clientWith({ sessionToken: '', invokeResults: [] });
await assert.rejects(
    invokeAuthenticatedEdgeFunction(missing.client, 'module-licensing-api'),
    /sesión administrativa expiró/i,
);

const tenantPage = readFileSync('src/pages/Tenants.tsx', 'utf8');
assert.match(
    tenantPage,
    /getLatestAvailablePosApkRelease\(\)\.catch\([\s\S]*?return null;/,
    'an auxiliary APK lookup failure must not block the terminal list',
);

console.log('authenticated Edge Function checks passed');
