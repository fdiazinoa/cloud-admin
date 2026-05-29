import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/202605291500_terminal_activation_license_validation.sql', 'utf8');
const endpoint = readFileSync('api/activation/validate-terminal-license.ts', 'utf8');

assert.match(migration, /landlord\.validate_terminal_activation_license/, 'migration must define landlord RPC');
assert.match(migration, /public\.check_terminal_license_availability/, 'migration must expose POS fallback RPC');
assert.match(migration, /TERMINAL_LICENSE_LIMIT/, 'migration must return TERMINAL_LICENSE_LIMIT code');
assert.match(migration, /TENANT_SUSPENDED/, 'migration must return TENANT_SUSPENDED code');
assert.match(migration, /LICENSE_BLOCKED/, 'migration must return LICENSE_BLOCKED code');

assert.match(endpoint, /validate_terminal_activation_license/, 'endpoint must delegate to landlord RPC');
assert.match(endpoint, /licensed:\s*allowed/, 'endpoint must expose licensed boolean for POS');
assert.match(endpoint, /auth\.getUser\(bearerToken\)/, 'endpoint must validate Supabase JWT');
assert.match(endpoint, /403/, 'endpoint must reject cross-tenant tokens');
assert.match(endpoint, /validate-terminal-license\] blocked/, 'endpoint must log blocked attempts');

console.log('terminal-activation-license static checks passed');
