import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readinessFunction = readFileSync('supabase/functions/request-terminal-fiscal-readiness/index.ts', 'utf8');
const configFunction = readFileSync('supabase/functions/request-terminal-fiscal-config/index.ts', 'utf8');
const tenantsPage = readFileSync('src/pages/Tenants.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/202605271145_terminal_fiscal_config.sql', 'utf8');

assert.match(readinessFunction, /\/api\/sync\/terminals\/.*fiscal-readiness/, 'fiscal readiness must call ERP fiscal-readiness endpoint');
assert.match(configFunction, /\/api\/sync\/terminals\/.*ensure-fiscal-config/, 'fiscal config must call ERP ensure-fiscal-config endpoint');
assert.match(configFunction, /mode:\s*'QA_DEMO'/, 'QA demo mode must be sent without invented production ranges');
assert.match(configFunction, /validateProductionConfig/, 'production fiscal config must be validated');
assert.match(configFunction, /Los comprobantes|rango fiscal|productivo|oficial|INVALID_FISCAL_RANGE/s, 'production flow must treat fiscal ranges explicitly');

assert.match(migration, /fiscal_readiness JSONB/, 'migration must persist fiscal readiness metadata');
assert.match(migration, /terminal_fiscal_config_audit/, 'migration must create fiscal audit table');
assert.match(migration, /FISCAL_CONFIG_CREATED/, 'audit must include created action');
assert.match(migration, /FISCAL_CONFIG_UPDATED/, 'audit must include updated action');

assert.match(tenantsPage, /Configuracion fiscal/, 'UI must render fiscal configuration section');
assert.match(tenantsPage, /Verificar mapping fiscal/, 'UI must expose fiscal debug verification');
assert.match(tenantsPage, /FISCAL_CONFIG_MISSING/, 'UI must explain missing fiscal config');
assert.doesNotMatch(tenantsPage, /Crear fiscal demo/, 'UI must not create fiscal config from Cloud-Admin');

console.log('terminal-fiscal-config static checks passed');
