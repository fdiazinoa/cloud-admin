import type { Tenant } from '../types';

export type TenantHealthLevel = 'ok' | 'warn' | 'bad' | 'muted';

export interface TenantHealth {
    level: TenantHealthLevel;
    label: string;
    /** Motivos legibles que explican el semáforo. */
    reasons: string[];
    syncAgeLabel: string;
    pendingEvents: number;
    blockedEvents: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const SYNC_WARN_AFTER = 6 * HOUR;
const SYNC_BAD_AFTER = 48 * HOUR;
const PENDING_EVENTS_WARN = 10;

export const formatRelativeTime = (value: string | null | undefined, now: Date = new Date()): string => {
    if (!value) return 'nunca';
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return 'nunca';

    const diff = now.getTime() - timestamp;
    if (diff < MINUTE) return 'hace instantes';
    if (diff < HOUR) return `hace ${Math.floor(diff / MINUTE)} min`;
    if (diff < DAY) return `hace ${Math.floor(diff / HOUR)} h`;
    return `hace ${Math.floor(diff / DAY)} d`;
};

/** Semáforo operativo derivado sólo del tenant (sin llamadas extra por tenant). */
export const getTenantHealth = (tenant: Tenant, now: Date = new Date()): TenantHealth => {
    const pendingEvents = tenant.pending_events_count ?? 0;
    const blockedEvents = tenant.blocked_events_count ?? 0;
    const syncAgeLabel = formatRelativeTime(tenant.last_sync_received_at, now);
    const reasons: string[] = [];

    if (tenant.status === 'SUSPENDED') {
        return {
            level: 'muted',
            label: 'Suspendida',
            reasons: ['Cuenta suspendida'],
            syncAgeLabel,
            pendingEvents,
            blockedEvents,
        };
    }

    if (!tenant.last_sync_received_at) {
        return {
            level: 'bad',
            label: 'Sin sync',
            reasons: ['Nunca recibió sincronización'],
            syncAgeLabel,
            pendingEvents,
            blockedEvents,
        };
    }

    const syncTimestamp = new Date(tenant.last_sync_received_at).getTime();
    const age = Number.isNaN(syncTimestamp) ? Number.POSITIVE_INFINITY : now.getTime() - syncTimestamp;

    let level: TenantHealthLevel = 'ok';
    if (age >= SYNC_BAD_AFTER) {
        level = 'bad';
        reasons.push(`Sync detenido (${syncAgeLabel})`);
    } else if (age >= SYNC_WARN_AFTER) {
        level = 'warn';
        reasons.push(`Sync atrasado (${syncAgeLabel})`);
    }

    if (blockedEvents > 0) {
        level = 'bad';
        reasons.push(`${blockedEvents} evento${blockedEvents === 1 ? '' : 's'} bloqueado${blockedEvents === 1 ? '' : 's'}`);
    } else if (pendingEvents >= PENDING_EVENTS_WARN && level === 'ok') {
        level = 'warn';
        reasons.push(`${pendingEvents} eventos pendientes`);
    }

    return {
        level,
        label: level === 'ok' ? 'Operativa' : level === 'warn' ? 'Requiere atención' : 'Sync detenido',
        reasons,
        syncAgeLabel,
        pendingEvents,
        blockedEvents,
    };
};

export const TENANT_HEALTH_CLASSES: Record<TenantHealthLevel, { badge: string; dot: string }> = {
    ok: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    warn: { badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    bad: { badge: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500' },
    muted: { badge: 'border-slate-200 bg-slate-50 text-slate-500', dot: 'bg-slate-400' },
};
