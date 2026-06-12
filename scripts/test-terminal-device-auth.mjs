import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const actionFunction = readFileSync('supabase/functions/request-terminal-device-authorization/index.ts', 'utf8');
const attemptsFunction = readFileSync('supabase/functions/request-terminal-auth-attempts/index.ts', 'utf8');
const tenantsPage = readFileSync('src/pages/Tenants.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/202605271015_terminal_device_authorization.sql', 'utf8');
const pairingMigration = readFileSync('supabase/migrations/202605301845_terminal_pairing_code_flow.sql', 'utf8');
const clearDevicesMigration = readFileSync('supabase/migrations/202605302010_terminal_devices_clear_action.sql', 'utf8');
const bar001CanonicalMigration = readFileSync('supabase/migrations/202606121620_pos_erp_bar001_canonical_device.sql', 'utf8');
const tenantService = readFileSync('src/lib/tenantService.ts', 'utf8');
const observabilityService = readFileSync('src/lib/observabilityService.ts', 'utf8');

assert.match(attemptsFunction, /\/api\/sync\/terminals\/.*auth-attempts/, 'auth attempts must call the ERP sync attempts endpoint');
assert.match(actionFunction, /\/api\/sync\/terminals\/.*takeover/, 'device action must call the ERP sync takeover endpoint');
assert.match(actionFunction, /requestedAction === 'GENERATE_PAIRING_CODE' \? 'TAKEOVER' : requestedAction/, 'pairing-code generation must route through the takeover authorization flow');
assert.match(actionFunction, /rotateDeviceToken:\s*true/, 'takeover/rotation must request token rotation');
assert.match(actionFunction, /GENERATE_PAIRING_CODE/, 'device action must support pairing code generation');
assert.match(actionFunction, /CLEAR_TERMINAL_DEVICES/, 'device action must support clearing terminal device bindings');
assert.match(actionFunction, /tenant_server_registry[\s\S]*delete/, 'clear action must delete terminal registry bindings');
assert.doesNotMatch(actionFunction, /error:\s*'SAME_DEVICE_ID'/, 'takeover must be able to repair ERP mapping even when Cloud already authorizes the device');
assert.match(actionFunction, /ERP_DEVICE_MAPPING_REPAIR/, 'same-device takeover must repair Cloud/ERP terminal mapping drift');
assert.match(actionFunction, /tokenKeys/, 'function must define token keys to sanitize sensitive payloads');
assert.doesNotMatch(actionFunction, /return json\([\s\S]*syncAuthToken/, 'function must not return syncAuthToken directly');

assert.match(migration, /terminal_device_audit/, 'migration must create terminal device audit');
assert.match(migration, /DEVICE_MISMATCH/, 'migration must allow DEVICE_MISMATCH state');
assert.match(migration, /OLD_DEVICE_REVOKED/, 'migration must allow OLD_DEVICE_REVOKED state');
assert.match(pairingMigration, /GENERATE_PAIRING_CODE/, 'pairing migration must allow pairing-code audit action');
assert.match(clearDevicesMigration, /CLEAR_TERMINAL_DEVICES/, 'clear migration must allow terminal-devices-cleared audit action');
assert.match(bar001CanonicalMigration, /dfc69374-becc-4644-bad7-2808ddef2248/, 'Bar-001 migration must preserve the canonical ERP terminal id');
assert.match(bar001CanonicalMigration, /62fd00ca-c204-4dd4-9eb4-c35c933affa8/, 'Bar-001 migration must archive the ghost ERP terminal id');
assert.match(bar001CanonicalMigration, /DEV-XZ96929V/, 'Bar-001 migration must authorize the current POS device');
assert.match(bar001CanonicalMigration, /POS_ERP_GHOST_TERMINAL_CANONICALIZED/, 'Bar-001 migration must mark the ghost terminal as archived');
assert.match(bar001CanonicalMigration, /POS_ERP_CANONICAL_TERMINAL_ENFORCED/, 'Bar-001 migration must revoke duplicate registry rows');

assert.match(tenantsPage, /Intentos de conexion rechazados/, 'UI must render rejected connection attempts');
assert.match(tenantsPage, /Limpiar devices/, 'UI must expose terminal device cleanup action');
assert.match(tenantsPage, /LIMPIAR/, 'UI must require strong confirmation for device cleanup');
assert.match(tenantsPage, /Reautorizar/, 'UI must expose reauthorization action');
assert.match(tenantsPage, /Reparar enlace ERP/, 'UI must expose Cloud/ERP device mapping repair action');
assert.match(tenantsPage, /!erpCurrentDeviceId \|\| authorizedDeviceId !== erpCurrentDeviceId/, 'ERP repair action must appear when ERP device is missing or mismatched');
assert.match(tenantsPage, /Rotar credenciales/, 'UI must expose credential rotation action');
assert.match(tenantsPage, /Revocar equipo anterior/, 'UI must expose previous-device revocation action');
assert.match(tenantService, /isArchivedErpTerminalRow/, 'tenant service must filter archived ERP terminals from canonical bindings');
assert.match(tenantService, /metadata\.archived === true/, 'tenant service must ignore archived ERP terminal metadata');
assert.match(observabilityService, /isArchivedErpTerminal/, 'observability must filter archived ERP terminals from operational rows');
assert.match(observabilityService, /metadata\.archived === true/, 'observability must ignore archived ERP terminal metadata');

console.log('terminal-device-auth static checks passed');
