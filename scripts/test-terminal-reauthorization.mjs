import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [edge, service, page, proxy] = await Promise.all([
    readFile(new URL('../supabase/functions/request-terminal-device-authorization/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/tenantService.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Tenants.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../api/terminal-device-action.ts', import.meta.url), 'utf8'),
]);

assert.match(edge, /canonicalErpPath = `\/api\/settings\/terminals\/\$\{terminalPathId\}\/takeover`/);
assert.doesNotMatch(edge, /`\/api\/sync\/terminals\/\$\{terminalPathId\}\/takeover`/);
assert.doesNotMatch(`${edge}\n${service}\n${proxy}`, /\/terminals\/register/);

for (const requiredField of [
    'terminal_id: terminalId',
    'device_id: effectiveDeviceId',
    'tenant_id: erpTenantId || tenantId',
    'takeover: action === \'TAKEOVER\'',
    'rotate_device_token: true',
    'requested_by: performedBy',
    "canonicalTakeoverReason = 'CLOUD_ADMIN_TERMINAL_REAUTHORIZATION'",
]) {
    assert.ok(edge.includes(requiredField), `Falta campo canónico: ${requiredField}`);
}

assert.match(edge, /'Idempotency-Key': idempotencyKey/);
assert.match(edge, /action === 'TAKEOVER' && !isUuid\(terminalId\)/);
assert.match(service, /crypto\.randomUUID\(\)/);
assert.match(page, /deviceActionInFlightRef\.current/);
assert.match(page, /Dispositivo actualmente autorizado:/);
assert.match(page, /todas sus credenciales\/tokens serán revocados/);

for (const confirmation of [
    'payload?.terminal_id === input.terminalId',
    'payload.previous_device_id !== undefined',
    'payload.authorized_device_id === input.deviceId',
    'payload.takeover_confirmed === true',
    'payload.previous_device_revoked === true',
    'payload.rotate_device_token === true',
]) {
    assert.ok(service.includes(confirmation), `Falta validación de respuesta: ${confirmation}`);
}

assert.match(edge, /fetchCanonicalTerminalState\(/);
assert.match(edge, /TAKEOVER_RESPONSE_AMBIGUOUS/);
assert.match(edge, /BOUND_AUTH_MISMATCH/);
assert.match(page, /ERP_CANONICAL_STATE_MISMATCH/);
assert.match(page, /Auditoría de reautorización/);
assert.match(page, /entry\.metadata\?\.operation_id/);

const consolidationReferences = edge.match(/consolidateErpTerminalDeviceDuplicates\(/g) || [];
assert.equal(consolidationReferences.length, 1, 'El takeover no debe invocar consolidaciones directas de erp_terminals.');

for (const errorCode of [
    'DEVICE_SUPERSEDED',
    'DEVICE_NOT_AUTHORIZED',
    'TAKEOVER_REQUIRED',
    'TAKEOVER_POLICY_DENIED',
    'TERMINAL_NOT_FOUND',
    'TENANT_MISMATCH',
]) {
    assert.ok(edge.includes(errorCode), `Falta manejo explícito de ${errorCode}`);
}

console.log('Terminal reauthorization contract checks passed.');
