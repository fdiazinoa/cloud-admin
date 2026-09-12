import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [page, service, api, latestEndpoint, tenants, app, migration, config, workflow] = await Promise.all([
    read('src/pages/PosApkReleases.tsx'),
    read('src/lib/posApkReleases.ts'),
    read('supabase/functions/pos-apk-releases-api/index.ts'),
    read('api/pos-apk/latest.ts'),
    read('src/pages/Tenants.tsx'),
    read('src/App.tsx'),
    read('supabase/migrations/20260912192818_manage_pos_apk_release_status.sql'),
    read('supabase/config.toml'),
    read('.github/workflows/deploy-supabase-functions.yml'),
]);

for (const status of ['draft', 'internal_testing', 'beta', 'available', 'retired']) {
    assert.ok(page.includes(`${status}:`) || page.includes(`${status}: '`), `APK UI is missing ${status}`);
    assert.ok(api.includes(`'${status}'`), `APK API is missing ${status}`);
    assert.ok(migration.includes(`'${status}'`), `APK migration is missing ${status}`);
}

assert.ok(service.includes("supabase.functions.invoke('pos-apk-releases-api'"), 'APK management must use the protected API');
assert.ok(!service.includes('supabaseAdmin'), 'APK management must not expose service-role access in the browser');
assert.ok(api.includes("action === 'list'"), 'APK API must separate list permissions');
assert.ok(api.includes("action === 'latest'"), 'Tenant reference lookup must use its own action');
assert.ok(api.includes("? 'tenants_view'"), 'Tenant reference lookup must not require APK management access');
assert.ok(api.includes(": 'apk_manage'"), 'APK mutations must require manage permission');
assert.ok(api.includes("action === 'update_status'"), 'APK API must support status updates');
assert.ok(app.includes("canManage={allowed('apk_manage')}"), 'APK UI must receive manage permission');
assert.ok(page.includes('Descarga técnica'), 'Non-automatic releases need a technical download');
assert.ok(page.includes('Copiar enlace técnico'), 'Technical personnel need a direct copyable link');
assert.ok(page.includes("releaseStatus: 'internal_testing'"), 'New APKs must default to internal testing');
assert.ok(page.includes('Solo el estado Disponible habilita la actualización automática'), 'Upload UI must explain the automatic gate');
assert.match(latestEndpoint, /\.eq\('release_status', 'available'\)/, 'Automatic endpoint must only select available APKs');
assert.doesNotMatch(latestEndpoint, /\.eq\('is_latest', true\)/, 'Automatic endpoint must fall back to the highest available APK');
assert.ok(tenants.includes('getLatestAvailablePosApkRelease()'), 'Terminal comparisons must use the public available-only endpoint');
assert.ok(migration.includes('check (not is_latest or release_status = \'available\')'), 'Latest APK must always be available');
assert.ok(migration.includes('lock table landlord.pos_apk_releases'), 'Status promotion must be serialized');
assert.ok(migration.includes('status_changed_by'), 'APK status changes must preserve the actor');
assert.ok(migration.includes('revoke all on function'), 'The status RPC must not be public');
assert.match(config, /\[functions\.pos-apk-releases-api\][\s\S]*?verify_jwt = true/, 'APK API must verify JWT');
assert.ok(workflow.includes('functions deploy pos-apk-releases-api'), 'APK API deployment is missing');

console.log('POS APK release status contracts: OK');
