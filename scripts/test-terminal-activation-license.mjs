import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activationMigration = readFileSync('supabase/migrations/202605291500_terminal_activation_license_validation.sql', 'utf8');
const terminalSlotMigration = readFileSync('supabase/migrations/202605291600_pos_only_terminal_slot_licensing.sql', 'utf8');
const posErpMigration = readFileSync('supabase/migrations/202605301530_pos_erp_terminal_catalog_licensing.sql', 'utf8');
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

assert.match(posErpMigration, /tenant_uses_erp_terminal_catalog_licensing/, 'POS_ERP migration must detect ERP catalog licensing');
assert.match(posErpMigration, /validate_erp_terminal_creation_license/, 'POS_ERP migration must validate ERP terminal creation');
assert.match(posErpMigration, /public\.can_create_erp_terminal/, 'POS_ERP migration must expose ERP terminal creation RPC');
assert.match(posErpMigration, /enforce_erp_terminal_catalog_insert/, 'POS_ERP migration must enforce catalog insert trigger');
assert.match(posErpMigration, /POS_ERP licenses are enforced on ERP terminal creation/, 'POS_ERP must skip registry device licensing');
assert.match(
    posErpMigration,
    /SELECT landlord\.validate_terminal_activation_license\(p_tenant_id, p_device_id, p_terminal_id\)/,
    'check_terminal_license_availability must delegate to activation validation, not ERP creation',
);

assert.match(tenantsPage, /erp_terminal/, 'Tenants UI must label POS_ERP license counts');

console.log('terminal-activation-license static checks passed');
