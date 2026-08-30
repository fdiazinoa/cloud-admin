import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
    attemptsProxy,
    actionProxy,
    rejectionProxy,
    sessionGuard,
    edgeAttempts,
    edgeAction,
    tenantService,
    page,
    permissionMigration,
    contract,
] = await Promise.all([
    readFile(new URL('../api/terminal-auth-attempts.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/terminal-device-action.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/terminal-device-request.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/lib/cloud-admin-session.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/request-terminal-auth-attempts/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/request-terminal-device-authorization/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/tenantService.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Tenants.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260830224924_cloud_admin_terminal_reauthorization_permission.sql', import.meta.url), 'utf8'),
    readFile(new URL('../docs/erp-terminal-device-requests-contract.md', import.meta.url), 'utf8'),
]);

for (const source of [attemptsProxy, edgeAttempts]) {
    assert.doesNotMatch(source, /permissivePosErpAuth/);
    assert.doesNotMatch(source, /authorized_device_id:\s*latestRejected\.requested_device_id/);
    assert.doesNotMatch(source, /registryUpdate\.device_id\s*=\s*latestRejected\.requested_device_id/);
    assert.match(source, /last_rejected_device_id:\s*latestRejected\.requested_device_id/);
    assert.match(source, /dedupePendingAttempts/);
    assert.match(source, /legacyPendingInferred/);
    assert.match(source, /DEVICE_SUPERSEDED/);
    assert.match(source, /serverless/);
}

assert.match(sessionGuard, /admin\.auth\.getUser\(accessToken\)/);
assert.match(sessionGuard, /profile\.permissions\?\.\[permission\] !== true/);
assert.match(actionProxy, /requireCloudAdminPermission\(request\.headers, "terminal_reauthorization"\)/);
assert.match(attemptsProxy, /requireCloudAdminPermission\(request\.headers, "terminal_reauthorization"\)/);
assert.doesNotMatch(`${attemptsProxy}\n${actionProxy}`, /bearerToken === serviceRoleKey/);
assert.match(actionProxy, /validateCanonicalErpActionScope/);
assert.match(actionProxy, /validatePendingDeviceRequest/);

assert.match(edgeAction, /request_id:\s*requestId/);
assert.match(edgeAction, /expected_authorized_device_id:\s*expectedAuthorizedDeviceId/);
assert.match(edgeAction, /request_status:/);
assert.match(tenantService, /payload\?\.request_id === input\.requestId/);
assert.match(tenantService, /payload\.request_status\?\.toUpperCase\(\) === "APPROVED"/);
assert.match(tenantService, /Authorization: `Bearer \$\{accessToken\}`/);
assert.doesNotMatch(tenantService.match(/export async function getTerminalAuthAttempts[\s\S]*?return Array\.isArray\(payload\?\.attempts\)/)?.[0] || '', /supabaseServiceRoleKey/);

assert.match(rejectionProxy, /auth-attempts\/\$\{encodeURIComponent\(requestId\)\}\/reject/);
assert.match(rejectionProxy, /!isPendingRequest\(pending\)/);
assert.match(rejectionProxy, /REJECTION_RESPONSE_AMBIGUOUS/);
assert.match(rejectionProxy, /responseStatus !== "REJECTED"/);
assert.match(rejectionProxy, /DEVICE_REQUEST_REJECTED/);

assert.match(page, /Solicitudes de dispositivo/);
assert.match(page, /Autorizar y reemplazar/);
assert.match(page, /Rechazar/);
assert.match(page, /UUID ERP:/);
assert.match(page, /canReauthorizeTerminals/);
assert.match(page, /deviceActionSubmittingKey !== null/);
assert.match(page, /requestId: request\?\.id \|\| null/);
assert.match(page, /getTenantTerminalOverview/);

assert.match(permissionMigration, /'terminal_reauthorization', code in \('owner', 'admin'\)/);
assert.match(permissionMigration, /'DEVICE_REQUEST_REJECTED'/);
assert.match(contract, /POST \/api\/sync\/bootstrap\/check/);
assert.match(contract, /POST \/api\/settings\/terminals\/\{terminal_id\}\/takeover/);
assert.match(contract, /FOR UPDATE/);
assert.match(contract, /\/auth-attempts\/\{request_id\}\/reject/);
assert.match(contract, /Ninguno de estos flujos puede usar `\/api\/sync\/terminals\/register`/);

console.log('Terminal device request contract checks passed.');
