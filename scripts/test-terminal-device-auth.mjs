import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const actionFunction = readFileSync('supabase/functions/request-terminal-device-authorization/index.ts', 'utf8');
const attemptsFunction = readFileSync('supabase/functions/request-terminal-auth-attempts/index.ts', 'utf8');
const tenantsPage = readFileSync('src/pages/Tenants.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/202605271015_terminal_device_authorization.sql', 'utf8');
const pairingMigration = readFileSync('supabase/migrations/202605301845_terminal_pairing_code_flow.sql', 'utf8');
const clearDevicesMigration = readFileSync('supabase/migrations/202605302010_terminal_devices_clear_action.sql', 'utf8');

assert.match(attemptsFunction, /\/api\/sync\/terminals\/.*auth-attempts/, 'auth attempts must call the ERP sync attempts endpoint');
assert.match(actionFunction, /\/api\/sync\/terminals\/.*takeover/, 'device action must call the ERP sync takeover endpoint');
assert.match(actionFunction, /\/api\/sync\/terminals\/.*pairing-code/, 'device action must call the ERP pairing-code endpoint');
assert.match(actionFunction, /rotateDeviceToken:\s*true/, 'takeover/rotation must request token rotation');
assert.match(actionFunction, /GENERATE_PAIRING_CODE/, 'device action must support pairing code generation');
assert.match(actionFunction, /CLEAR_TERMINAL_DEVICES/, 'device action must support clearing terminal device bindings');
assert.match(actionFunction, /tenant_server_registry[\s\S]*delete/, 'clear action must delete terminal registry bindings');
assert.match(actionFunction, /tokenKeys/, 'function must define token keys to sanitize sensitive payloads');
assert.doesNotMatch(actionFunction, /return json\([\s\S]*syncAuthToken/, 'function must not return syncAuthToken directly');

assert.match(migration, /terminal_device_audit/, 'migration must create terminal device audit');
assert.match(migration, /DEVICE_MISMATCH/, 'migration must allow DEVICE_MISMATCH state');
assert.match(migration, /OLD_DEVICE_REVOKED/, 'migration must allow OLD_DEVICE_REVOKED state');
assert.match(pairingMigration, /GENERATE_PAIRING_CODE/, 'pairing migration must allow pairing-code audit action');
assert.match(clearDevicesMigration, /CLEAR_TERMINAL_DEVICES/, 'clear migration must allow terminal-devices-cleared audit action');

assert.match(tenantsPage, /Intentos de conexion rechazados/, 'UI must render rejected connection attempts');
assert.match(tenantsPage, /Limpiar devices/, 'UI must expose terminal device cleanup action');
assert.match(tenantsPage, /LIMPIAR/, 'UI must require strong confirmation for device cleanup');
assert.match(tenantsPage, /Generar codigo/, 'UI must expose pairing code generation');
assert.match(tenantsPage, /Codigo de vinculacion para escribir en el POS/, 'UI must show generated pairing codes for POS input');
assert.match(tenantsPage, /Reautorizar/, 'UI must expose reauthorization action');
assert.match(tenantsPage, /Rotar credenciales/, 'UI must expose credential rotation action');
assert.match(tenantsPage, /Revocar equipo anterior/, 'UI must expose previous-device revocation action');

console.log('terminal-device-auth static checks passed');
