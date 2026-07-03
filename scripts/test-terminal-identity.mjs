import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const identityLib = readFileSync('src/lib/terminalIdentity.ts', 'utf8');
const tenantsPage = readFileSync('src/pages/Tenants.tsx', 'utf8');
const fiscalDebugFunction = readFileSync('supabase/functions/request-terminal-fiscal-debug/index.ts', 'utf8');

assert.match(identityLib, /AUTHORIZED_CURRENT/, 'identity lib must classify authorized current devices');
assert.match(identityLib, /REJECTED_RECENT/, 'identity lib must classify rejected devices');
assert.match(identityLib, /SERVER_MASTER/, 'identity lib must classify server master endpoints');
assert.match(identityLib, /CLIENT_ENDPOINT/, 'identity lib must classify client endpoints');
assert.match(identityLib, /buildDeviceMismatchWarning/, 'identity lib must warn on POS vs authorized mismatch');

assert.match(tenantsPage, /Identidad y autorizacion/, 'UI must render identity section');
assert.match(tenantsPage, /Device autorizado actual/, 'UI must show authorized device separately');
assert.match(tenantsPage, /Device actual visto por POS/, 'UI must show POS reported device');
assert.match(tenantsPage, /Device actual en ERP/, 'UI must show ERP current device');
assert.match(tenantsPage, /Verificar mapping fiscal/, 'UI must expose fiscal debug refresh');
assert.match(tenantsPage, /matchedStrategy/, 'UI must show fiscal debug strategy');
assert.doesNotMatch(tenantsPage, /Crear fiscal demo/, 'UI must not create fiscal config from Cloud-Admin');
assert.doesNotMatch(tenantsPage, /Configurar fiscal/, 'UI must not open fiscal config editor');

assert.match(fiscalDebugFunction, /fiscal-debug/, 'fiscal debug must call ERP fiscal-debug endpoint');
assert.match(fiscalDebugFunction, /api\/sync\/terminals/, 'fiscal debug must target ERP terminal sync API');
assert.match(fiscalDebugFunction, /fiscal-readiness/, 'fiscal debug must fall back to fiscal-readiness');

console.log('terminal-identity static checks passed');
