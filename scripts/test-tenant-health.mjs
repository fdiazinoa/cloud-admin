import assert from 'node:assert/strict';
import { getTenantHealth, formatRelativeTime } from '../src/lib/tenantHealth.ts';

const now = new Date('2026-03-12T12:00:00.000Z');

const baseTenant = {
    id: 'tenant-1',
    name: 'Supermercado El Sol',
    email: 'admin@elsol.do',
    status: 'ACTIVE',
    created_at: '2026-03-01T00:00:00.000Z',
};

const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();

// 1. Sync reciente => operativa.
const healthy = getTenantHealth({ ...baseTenant, last_sync_received_at: minutesAgo(2), pending_events_count: 0, blocked_events_count: 0 }, now);
assert.equal(healthy.level, 'ok');
assert.equal(healthy.label, 'Operativa');
assert.equal(healthy.reasons.length, 0);
assert.equal(healthy.syncAgeLabel, 'hace 2 min');

// 2. Sin sync => rojo, nunca.
const never = getTenantHealth({ ...baseTenant, last_sync_received_at: null }, now);
assert.equal(never.level, 'bad');
assert.equal(never.label, 'Sin sync');
assert.equal(never.syncAgeLabel, 'nunca');

// 3. Sync atrasado (> 6 h) => ámbar; detenido (> 48 h) => rojo.
const delayed = getTenantHealth({ ...baseTenant, last_sync_received_at: minutesAgo(7 * 60) }, now);
assert.equal(delayed.level, 'warn');
assert.equal(delayed.label, 'Requiere atención');

const stale = getTenantHealth({ ...baseTenant, last_sync_received_at: minutesAgo(49 * 60) }, now);
assert.equal(stale.level, 'bad');
assert.equal(stale.label, 'Sync detenido');

// 4. Eventos bloqueados fuerzan rojo; pendientes altos fuerzan ámbar.
const blocked = getTenantHealth({ ...baseTenant, last_sync_received_at: minutesAgo(5), blocked_events_count: 2 }, now);
assert.equal(blocked.level, 'bad');
assert.ok(blocked.reasons.some((reason) => reason.includes('2 eventos bloqueados')), 'Debe explicar los eventos bloqueados');

const pending = getTenantHealth({ ...baseTenant, last_sync_received_at: minutesAgo(5), pending_events_count: 12 }, now);
assert.equal(pending.level, 'warn');
assert.ok(pending.reasons.some((reason) => reason.includes('12 eventos pendientes')));

const lowPending = getTenantHealth({ ...baseTenant, last_sync_received_at: minutesAgo(5), pending_events_count: 3 }, now);
assert.equal(lowPending.level, 'ok', 'Pocos eventos pendientes no deben marcar alerta');

// 5. Suspendido siempre gris, sin importar el sync.
const suspended = getTenantHealth({ ...baseTenant, status: 'SUSPENDED', last_sync_received_at: null }, now);
assert.equal(suspended.level, 'muted');
assert.equal(suspended.label, 'Suspendida');

// 6. Formato relativo.
assert.equal(formatRelativeTime(null, now), 'nunca');
assert.equal(formatRelativeTime(minutesAgo(0), now), 'hace instantes');
assert.equal(formatRelativeTime(minutesAgo(30), now), 'hace 30 min');
assert.equal(formatRelativeTime(minutesAgo(5 * 60), now), 'hace 5 h');
assert.equal(formatRelativeTime(minutesAgo(3 * 24 * 60), now), 'hace 3 d');

console.log('tenant health checks passed');
