import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const actionFunction = readFileSync('supabase/functions/request-terminal-device-authorization/index.ts', 'utf8');
const attemptsFunction = readFileSync('supabase/functions/request-terminal-auth-attempts/index.ts', 'utf8');
const tenantsPage = readFileSync('src/pages/Tenants.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/202605271015_terminal_device_authorization.sql', 'utf8');

assert.match(attemptsFunction, /\/api\/sync\/terminals\/.*auth-attempts/, 'auth attempts must call the ERP sync attempts endpoint');
assert.match(actionFunction, /\/api\/sync\/terminals\/.*takeover/, 'device action must call the ERP sync takeover endpoint');
assert.match(actionFunction, /rotateDeviceToken:\s*true/, 'takeover/rotation must request token rotation');
assert.doesNotMatch(actionFunction, /error:\s*'SAME_DEVICE_ID'/, 'takeover must be able to repair ERP mapping even when Cloud already authorizes the device');
assert.match(actionFunction, /ERP_DEVICE_MAPPING_REPAIR/, 'same-device takeover must repair Cloud/ERP terminal mapping drift');
assert.match(actionFunction, /tokenKeys/, 'function must define token keys to sanitize sensitive payloads');
assert.doesNotMatch(actionFunction, /return json\([\s\S]*syncAuthToken/, 'function must not return syncAuthToken directly');

assert.match(migration, /terminal_device_audit/, 'migration must create terminal device audit');
assert.match(migration, /DEVICE_MISMATCH/, 'migration must allow DEVICE_MISMATCH state');
assert.match(migration, /OLD_DEVICE_REVOKED/, 'migration must allow OLD_DEVICE_REVOKED state');

assert.match(tenantsPage, /Intentos de conexion rechazados/, 'UI must render rejected connection attempts');
assert.match(tenantsPage, /Reautorizar/, 'UI must expose reauthorization action');
assert.match(tenantsPage, /Reparar enlace ERP/, 'UI must expose Cloud/ERP device mapping repair action');
assert.match(tenantsPage, /Rotar credenciales/, 'UI must expose credential rotation action');
assert.match(tenantsPage, /Revocar equipo anterior/, 'UI must expose previous-device revocation action');

console.log('terminal-device-auth static checks passed');
