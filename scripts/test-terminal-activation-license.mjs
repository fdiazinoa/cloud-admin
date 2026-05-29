import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activationMigration = readFileSync('supabase/migrations/202605291500_terminal_activation_license_validation.sql', 'utf8');
const terminalSlotMigration = readFileSync('supabase/migrations/202605291600_pos_only_terminal_slot_licensing.sql', 'utf8');
const endpoint = readFileSync('api/activation/validate-terminal-license.ts', 'utf8');
const tenantsPage = readFileSync('src/pages/Tenants.tsx', 'utf8');

assert.match(activationMigration, /landlord\.validate_terminal_activation_license/, 'activation migration must define landlord RPC');
assert.match(activationMigration, /public\.check_terminal_license_availability/, 'activation migration must expose POS fallback RPC');

assert.match(terminalSlotMigration, /tenant_uses_terminal_slot_licensing/, 'terminal slot migration must detect POS_ONLY tenants');
assert.match(terminalSlotMigration, /license_unit.*terminal_id/, 'terminal slot migration must rank POS_ONLY by terminal_id');
assert.match(terminalSlotMigration, /TERMINAL_NAME_ALREADY_EXISTS/, 'terminal slot migration must reject duplicate caja names');
assert.match(terminalSlotMigration, /count_tenant_pos_license_seats/, 'terminal slot migration must centralize seat counting');

assert.match(endpoint, /validate_terminal_activation_license/, 'endpoint must delegate to landlord RPC');
assert.match(endpoint, /licensed:\s*allowed/, 'endpoint must expose licensed boolean for POS');
assert.match(endpoint, /license_unit/, 'endpoint must expose license_unit for POS diagnostics');

assert.match(tenantsPage, /usesTerminalSlotLicensing/, 'Tenants UI must count POS_ONLY licenses by terminal slot');

console.log('terminal-activation-license static checks passed');
