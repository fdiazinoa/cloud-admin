import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    buildTerminalIdentitySummary,
    CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE,
    getCanonicalIdentityBlockingMessage,
    getErpTerminalUuid,
    hasCanonicalErpBinding,
} from '../src/lib/terminalIdentity.ts';
import { buildTerminalReconciliationPreview } from '../src/lib/terminalReconciliation.ts';

const tenantId = 'c1e7daab-4845-4161-9a98-e8061328f209';
const catalogId = 'efdc61ae-f485-41ea-b50e-3ca4e08123e2';
const oldRegistry = {
    id: '11111111-1111-4111-8111-111111111111', tenant_id: tenantId,
    terminal_id: 'Slav-01', terminal_name: 'Slav-01', device_id: 'DEV-JJP90FCP',
    auth_status: 'AUTHORIZED', last_seen_at: '2026-08-01T00:00:00Z',
};
const newRegistry = {
    id: '22222222-2222-4222-8222-222222222222', tenant_id: tenantId,
    terminal_id: 'POS-001', terminal_name: 'Slav-01', device_id: 'DEV-R9CUIS87',
    app_version: '1.1.113', last_seen_at: '2026-08-10T00:00:00Z',
};
const legacySnapshot = {
    id: catalogId,
    catalog_terminal_id: catalogId,
    tenant_id: tenantId,
    terminal_id: 'POS-001',
    terminal_code: 'POS-001',
    name: 'Slav-01',
    is_active: true,
    erp_terminal_uuid: null,
    erp_store_id: null,
    identity_status: 'PENDING_RECONCILIATION',
    identity_binding_source: 'catalog_only',
    legacy_identity: true,
    registry: newRegistry,
    registries: [newRegistry, oldRegistry],
};

const identity = buildTerminalIdentitySummary(legacySnapshot);
assert.equal(getErpTerminalUuid(legacySnapshot), '');
assert.equal(identity.erpTerminalUuid, 'N/D');
assert.equal(identity.catalogTerminalId, catalogId);
assert.equal(identity.terminalCode, 'POS-001');
assert.equal(identity.localName, 'Slav-01');
assert.equal(identity.authorizedDeviceId, 'DEV-JJP90FCP');
assert.equal(identity.posReportedDeviceId, 'DEV-R9CUIS87');
assert.equal(identity.identityStatus, 'PENDING_RECONCILIATION');
assert.equal(identity.deviceRows.filter((row) => row.roles.includes('AUTHORIZED_CURRENT')).length, 1);
assert.equal(hasCanonicalErpBinding(legacySnapshot), false);
assert.equal(getCanonicalIdentityBlockingMessage(legacySnapshot), CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE);

const blockedPreview = buildTerminalReconciliationPreview(legacySnapshot);
assert.equal(blockedPreview.dryRun, true);
assert.equal(blockedPreview.writesPerformed, false);
assert.equal(blockedPreview.executable, false);
assert.ok(blockedPreview.blockers.length >= 3);

const erpTerminalUuid = '33333333-3333-4333-8333-333333333333';
const storeId = '44444444-4444-4444-8444-444444444444';
const validPreview = buildTerminalReconciliationPreview(legacySnapshot, {
    erpTerminalUuid,
    storeId,
    authorizedDeviceId: 'DEV-R9CUIS87',
    reason: 'Consolidación administrativa validada',
    adminConfirmed: true,
});
assert.equal(validPreview.executable, true);
assert.equal(validPreview.writesPerformed, false);
assert.equal(validPreview.targetErpTerminalUuid, erpTerminalUuid);

const canonicalSnapshot = {
    ...legacySnapshot,
    erp_terminal_uuid: erpTerminalUuid,
    erp_store_id: storeId,
    identity_binding_source: 'metadata_erp_terminal_id',
};
assert.equal(hasCanonicalErpBinding(canonicalSnapshot), true);
assert.equal(getCanonicalIdentityBlockingMessage(canonicalSnapshot), null);

const [serviceSource, apiSource, edgeSource] = await Promise.all([
    readFile(new URL('../src/lib/tenantService.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/terminal-device-action.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/request-terminal-device-authorization/index.ts', import.meta.url), 'utf8'),
]);
assert.match(serviceSource, /CATALOG:\$\{terminal\.id\}/);
assert.match(serviceSource, /catalogCodeCounts\.get\(catalogCode\) === 1/);
assert.doesNotMatch(serviceSource, /bindings\.set\(normalizeKey\(terminal\.device_id\)/);
const overviewSource = serviceSource.slice(
    serviceSource.indexOf('export async function getTenantTerminalOverview'),
    serviceSource.indexOf('export async function requestTerminalTakeover'),
);
assert.doesNotMatch(overviewSource, /\.(insert|update|delete|upsert|rpc)\(/, 'overview must remain read-only');
for (const source of [apiSource, edgeSource]) {
    assert.match(source, /CANONICAL_ERP_IDENTITY_REQUIRED/);
    assert.match(source, /Debe reconciliarse esta identidad con una terminal ERP/);
}
assert.doesNotMatch(apiSource, /config->metadata->>terminal_id/);
assert.doesNotMatch(edgeSource, /config->metadata->>terminal_id/);

console.log('terminal canonical identity regression: ok');
