import type { TenantTerminalSnapshot } from '../types';
import { formatApkVersion, getApkVersionKey, getRegistryStatusLabel } from './tenantTerminalFormatting.ts';

export interface TenantTerminalSummary {
    total: number;
    online: number;
    offline: number;
    revoked: number;
    erpReady: number;
    withoutVersion: number;
    outdated: number;
    referenceVersionKey: string;
    referenceVersionLabel: string;
    storeCount: number;
}

/**
 * Agrega el estado de las terminales de un tenant para la ficha.
 * Usa la misma regla de versión de referencia que la consola: la más repetida.
 */
export const summarizeTenantTerminals = (terminals: TenantTerminalSnapshot[]): TenantTerminalSummary => {
    const versions = new Map<string, { count: number; label: string }>();
    const stores = new Set<string>();
    let online = 0;
    let revoked = 0;
    let erpReady = 0;
    let withoutVersion = 0;

    for (const terminal of terminals) {
        const status = getRegistryStatusLabel(terminal);
        if (status === 'ONLINE') online += 1;
        if (status === 'REVOCADA') revoked += 1;

        if (terminal.registry?.erp_readiness?.status === 'ready') erpReady += 1;

        const storeKey = terminal.erp_store_id || terminal.erp_store_name;
        if (storeKey) stores.add(storeKey);

        const versionKey = getApkVersionKey(terminal);
        if (!versionKey) {
            withoutVersion += 1;
            continue;
        }

        const current = versions.get(versionKey);
        versions.set(versionKey, {
            count: (current?.count || 0) + 1,
            label: current?.label || formatApkVersion(terminal),
        });
    }

    const ranked = Array.from(versions.entries()).sort((a, b) => b[1].count - a[1].count);
    const referenceVersionKey = ranked[0]?.[0] ?? '';
    const referenceVersionLabel = ranked[0]?.[1].label ?? '';

    const outdated = referenceVersionKey
        ? terminals.filter((terminal) => {
            const key = getApkVersionKey(terminal);
            return Boolean(key) && key !== referenceVersionKey;
        }).length
        : 0;

    return {
        total: terminals.length,
        online,
        offline: terminals.length - online - revoked,
        revoked,
        erpReady,
        withoutVersion,
        outdated,
        referenceVersionKey,
        referenceVersionLabel,
        storeCount: stores.size,
    };
};
