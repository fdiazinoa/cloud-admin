import assert from 'node:assert/strict';
import { summarizeTenantTerminals } from '../src/lib/tenantTerminalSummary.ts';

const terminal = (overrides) => ({
    id: 'terminal-1',
    tenant_id: 'tenant-1',
    name: 'Caja 1',
    is_active: true,
    registries: [],
    registry: null,
    ...overrides,
});

const registry = (overrides = {}) => ({
    id: 'registry-1',
    status: 'ONLINE',
    app_version: '2.4.1',
    app_version_code: 241,
    ...overrides,
});

// 1. Mezcla de estados: online, offline, revocada y sin versión.
const summary = summarizeTenantTerminals([
    terminal({ id: 't1', registry: registry(), erp_store_id: 'store-1' }),
    terminal({ id: 't2', registry: registry({ status: 'OFFLINE' }), erp_store_id: 'store-1' }),
    terminal({ id: 't3', registry: registry({ is_revoked: true, app_version: null, app_version_code: null }) }),
    terminal({ id: 't4', registry: registry({ status: 'OFFLINE' }), erp_store_name: 'Depósito' }),
]);

assert.equal(summary.total, 4);
assert.equal(summary.online, 1);
assert.equal(summary.revoked, 1);
assert.equal(summary.offline, 2, 'offline excluye revocadas');
assert.equal(summary.storeCount, 2, 'agrupa por sucursal del ERP');
assert.equal(summary.withoutVersion, 1, 'cuenta terminales sin versión reportada');
assert.equal(summary.referenceVersionLabel, 'APK v2.4.1 (241)');

// 2. Fuera de versión respecto de la referencia dominante.
const outdated = summarizeTenantTerminals([
    terminal({ id: 't1', registry: registry() }),
    terminal({ id: 't2', registry: registry() }),
    terminal({ id: 't3', registry: registry({ app_version: '2.3.9', app_version_code: 239 }) }),
]);
assert.equal(outdated.referenceVersionLabel, 'APK v2.4.1 (241)');
assert.equal(outdated.outdated, 1, 'una terminal con APK distinta queda fuera de versión');

// 3. ERP listo y tenant sin terminales.
const erpReady = summarizeTenantTerminals([
    terminal({ id: 't1', registry: registry({ erp_readiness: { status: 'ready' } }) }),
]);
assert.equal(erpReady.erpReady, 1);

const empty = summarizeTenantTerminals([]);
assert.deepEqual(
    { total: empty.total, online: empty.online, offline: empty.offline, referenceVersionLabel: empty.referenceVersionLabel },
    { total: 0, online: 0, offline: 0, referenceVersionLabel: '' },
);

console.log('tenant terminal summary checks passed');
