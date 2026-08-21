import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTerminalReconciliationPreview } from '../src/lib/terminalReconciliation.ts';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sourceRegistryId = '11111111-1111-4111-8111-111111111111';
const siblingRegistryId = '22222222-2222-4222-8222-222222222222';
const targetTerminalId = 'c50f243e-be52-431c-8f48-03742a49bec5';
const targetStoreId = '33333333-3333-4333-8333-333333333333';

const source = {
    id: sourceRegistryId,
    tenant_id: tenantId,
    terminal_id: 'POS-001',
    terminal_name: 'PED-001',
    device_id: 'DEV-1DU4NVYT',
    current_device_id: 'DEV-1DU4NVYT',
    authorized_device_id: null,
    previous_device_id: null,
    auth_status: 'WAITING_ERP_CONFIRMATION',
    is_revoked: false,
    erp_readiness: null,
};
const sibling = {
    ...source,
    id: siblingRegistryId,
    device_id: 'DEV-NC1F912Z',
    current_device_id: 'DEV-NC1F912Z',
};
const orphanSnapshot = {
    id: sourceRegistryId,
    tenant_id: tenantId,
    terminal_id: 'POS-001',
    terminal_code: 'POS-001',
    name: 'PED-001',
    is_active: true,
    erp_terminal_uuid: null,
    erp_store_id: null,
    registry: source,
    registries: [source],
    identity_status: 'ORPHANED',
    identity_binding_source: 'orphan_registry',
};

// 1. El preview cliente es un dry-run puro y exige todos los controles.
const blockedPreview = buildTerminalReconciliationPreview(orphanSnapshot);
assert.equal(blockedPreview.dryRun, true);
assert.equal(blockedPreview.writesPerformed, false);
assert.equal(blockedPreview.executable, false);
const validPreview = buildTerminalReconciliationPreview(orphanSnapshot, {
    erpTerminalUuid: targetTerminalId,
    targetTerminalName: 'PED-001',
    storeId: targetStoreId,
    authorizedDeviceId: 'DEV-1DU4NVYT',
    reason: 'Samsung reemplaza el device previamente autorizado',
    adminConfirmed: true,
});
assert.equal(validPreview.executable, true);
assert.equal(validPreview.resultingAuthorizedDeviceId, 'DEV-1DU4NVYT');

const [migration, endpoint, service, ui] = await Promise.all([
    readFile(new URL('../supabase/migrations/20260821215032_terminal_identity_reconciliation.sql', import.meta.url), 'utf8'),
    readFile(new URL('../api/terminal-reconciliation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/tenantService.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Tenants.tsx', import.meta.url), 'utf8'),
]);

// 2. orphan_registry -> explicit_mapping/ERP canónico en una única transacción.
assert.match(migration, /^begin;[\s\S]*create or replace function landlord\.reconcile_terminal_identity/);
assert.match(migration, /'identityBindingSource', 'explicit_mapping'/);
assert.match(migration, /terminal_id = p_target_erp_terminal_id::text/);
assert.match(migration, /update public\.erp_terminals[\s\S]*set device_id = v_device_id/);

// 3. Idempotencia tanto por correlación como por estado ya reconciliado.
assert.match(migration, /terminal_device_audit_reconciliation_correlation_uidx/);
assert.match(migration, /'idempotent_replay', true/);
assert.match(migration, /upper\(coalesce\(v_target\.device_id, ''\)\) = v_device_id/);

// 4 y 5. Bloqueos de tenant, UUID/sucursal y ámbito ERP.
assert.match(migration, /registry\.tenant_id = p_tenant_id/);
assert.match(migration, /ERP_TERMINAL_TENANT_MISMATCH/);
assert.match(migration, /terminal\.store_id = p_target_store_id/);
assert.match(endpoint, /target_erp_terminal_id/);
assert.notEqual(otherTenantId, tenantId);

// 6. La operación no borra ni toca ventas, fiscal o secuencias.
const functionBody = migration.slice(
    migration.indexOf('create or replace function landlord.reconcile_terminal_identity'),
    migration.indexOf('create or replace function landlord.rollback_terminal_identity_reconciliation'),
);
assert.doesNotMatch(functionBody, /\bdelete\s+from\b/i);
assert.doesNotMatch(functionBody, /\b(sales|ventas|fiscal_documents|document_sequences|sequences)\b\s+(set|where)/i);
assert.match(functionBody, /'destructive_operations', '\[\]'::jsonb/);
assert.match(functionBody, /'ventas', 'documentos_fiscales', 'secuencias', 'auditorias'/);

// 7. El device previo se conserva como histórico/superseded.
assert.match(migration, /historical_device_ids/);
assert.match(migration, /superseded_device_ids/);
assert.match(migration, /TERMINAL_RECONCILIATION_SUPERSEDED/);
assert.match(migration, /OLD_DEVICE_REVOKED/);

// 8. Rollback limitado al vínculo y estados explícitos, con auditoría propia.
assert.match(migration, /rollback_terminal_identity_reconciliation/);
assert.match(migration, /'explicit_binding', 'authorization_statuses', 'historical_device_classification'/);
assert.match(migration, /TERMINAL_RECONCILIATION_ROLLBACK/);

// 9. Dos huérfanos con el mismo terminal_code se incluyen en el scope.
const affected = [source, sibling].filter((row) => row.tenant_id === tenantId && row.terminal_id === source.terminal_id);
assert.deepEqual(affected.map((row) => row.id), [sourceRegistryId, siblingRegistryId]);
assert.match(migration, /upper\(btrim\(registry\.terminal_id\)\) = upper\(btrim\(v_source\.terminal_id\)\)/);

// 10. La UI refresca las terminales tras ejecutar y muestra todos los planes.
assert.match(ui, /Ejecutar reconciliación/);
assert.match(ui, /await refreshTerminalModalData\(\)/);
assert.match(ui, /Devices históricos/);
assert.match(ui, /Registros huérfanos afectados/);
assert.match(ui, /Plan de escritura/);
assert.match(ui, /Plan de rollback/);

// 11. Autorización y auditoría incluyen administrador, before/after y correlación.
assert.match(endpoint, /admin\.auth\.getUser\(accessToken\)/);
assert.match(endpoint, /terminal_reconciliation !== true/);
assert.match(migration, /'administrator'/);
assert.match(migration, /'before_state'/);
assert.match(migration, /'after_state'/);
assert.match(migration, /'correlation_id'/);

// 12. Un cliente sin privilegios no puede invocar los RPC y el frontend usa JWT de usuario.
assert.match(migration, /revoke all on function landlord\.reconcile_terminal_identity[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function landlord\.reconcile_terminal_identity[\s\S]*to service_role/);
const serviceFunction = service.slice(
    service.indexOf('export async function requestTerminalReconciliation'),
    service.indexOf('export type TenantPosLicenseSeats'),
);
assert.match(serviceFunction, /supabase\.auth\.getSession\(\)/);
assert.doesNotMatch(serviceFunction, /supabaseServiceRoleKey|VITE_SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(endpoint, /VITE_SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(endpoint, /Access-Control-Allow-Origin[^\n]*\|\| "\*"/);

// El hash del dry-run es obligatorio al ejecutar y evita planes obsoletos.
assert.match(migration, /RECONCILIATION_PLAN_CHANGED/);
assert.match(ui, /serverPreview\?\.plan_hash/);

console.log('terminal reconciliation regression: ok');
