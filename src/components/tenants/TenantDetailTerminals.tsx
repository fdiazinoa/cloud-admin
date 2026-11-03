import React from 'react';
import { AlertTriangle, ArrowUpRight, Loader2, Monitor, RefreshCcw } from 'lucide-react';
import type { Tenant } from '../../types';
import { getTerminalAuthorizedDeviceId, getTerminalPosReportedDeviceId } from '../../lib/terminalIdentity';
import {
    formatApkVersion,
    getApkVersionKey,
    getErpReadinessStatus,
    getFiscalStatusClasses,
    getReadinessBadgeClasses,
    getReadinessLabel,
    getRegistryStatusClassName,
    getRegistryStatusLabel,
} from '../../lib/tenantTerminalFormatting';
import { formatDateTime } from '../../lib/dateFormat';
import { formatRelativeTime } from '../../lib/tenantHealth';
import { summarizeTenantTerminals } from '../../lib/tenantTerminalSummary';
import { useTenantTerminalOverview } from './useTenantTerminalOverview';

interface TenantDetailTerminalsProps {
    tenant: Tenant;
    onOpenConsole: () => void;
}

const SummaryChip: React.FC<{ tone: 'ok' | 'warn' | 'bad' | 'muted'; children: React.ReactNode }> = ({ tone, children }) => {
    const tones: Record<string, string> = {
        ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        warn: 'border-amber-200 bg-amber-50 text-amber-700',
        bad: 'border-red-200 bg-red-50 text-red-700',
        muted: 'border-slate-200 bg-slate-50 text-slate-500',
    };
    return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
};

export const TenantDetailTerminals: React.FC<TenantDetailTerminalsProps> = ({ tenant, onOpenConsole }) => {
    const { terminals, seats, loading, error, reload } = useTenantTerminalOverview(tenant.id);

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-10 text-sm font-bold text-slate-500">
                <Loader2 className="animate-spin" size={18} /> Cargando terminales…
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
                <button type="button" onClick={() => void reload()} className="ml-2 font-black underline">Reintentar</button>
            </div>
        );
    }

    const rows = terminals ?? [];
    const summary = summarizeTenantTerminals(rows);
    const licenseLimit = seats?.maxSeats ?? tenant.max_pos_terminals ?? null;
    const usedSeats = seats?.usedSeats ?? null;
    const overLimit = typeof licenseLimit === 'number' && usedSeats !== null && usedSeats > licenseLimit;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <SummaryChip tone="muted">{summary.total} terminal{summary.total === 1 ? '' : 'es'}</SummaryChip>
                <SummaryChip tone="ok">{summary.online} online</SummaryChip>
                {summary.offline > 0 ? <SummaryChip tone="warn">{summary.offline} sin latido</SummaryChip> : null}
                {summary.revoked > 0 ? <SummaryChip tone="bad">{summary.revoked} revocada{summary.revoked === 1 ? '' : 's'}</SummaryChip> : null}
                {summary.outdated > 0 ? <SummaryChip tone="warn">{summary.outdated} con APK distinta</SummaryChip> : null}
                {summary.referenceVersionLabel ? <SummaryChip tone="muted">ref. {summary.referenceVersionLabel}</SummaryChip> : null}
                {typeof licenseLimit === 'number' ? (
                    <SummaryChip tone={overLimit ? 'bad' : 'ok'}>
                        licencias {usedSeats ?? '—'}/{licenseLimit}
                    </SummaryChip>
                ) : null}

                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void reload()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600 hover:bg-slate-50"
                    >
                        <RefreshCcw size={13} /> Actualizar
                    </button>
                    <button
                        type="button"
                        onClick={onOpenConsole}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-black text-white hover:bg-slate-800"
                    >
                        <Monitor size={13} /> Abrir consola completa
                        <ArrowUpRight size={12} />
                    </button>
                </div>
            </div>

            {overLimit ? (
                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    Hay más equipos POS en uso que licencias contratadas. Aplica el límite o libera cupo desde la consola.
                </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-[13px]">
                    <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <tr>
                            <th className="px-4 py-2.5">Terminal · sucursal</th>
                            <th className="px-3 py-2.5">Device autorizado</th>
                            <th className="px-3 py-2.5">APK</th>
                            <th className="px-3 py-2.5">Registro</th>
                            <th className="px-3 py-2.5">ERP</th>
                            <th className="px-3 py-2.5">Fiscal</th>
                            <th className="px-3 py-2.5">Último check-in</th>
                            <th className="px-3 py-2.5" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-8 text-center text-sm italic text-slate-500">
                                    Este tenant todavía no tiene terminales registradas.
                                </td>
                            </tr>
                        ) : rows.map((terminal) => {
                            const statusLabel = getRegistryStatusLabel(terminal);
                            const apkVersion = formatApkVersion(terminal);
                            const versionKey = getApkVersionKey(terminal);
                            const outdated = Boolean(summary.referenceVersionKey && versionKey && versionKey !== summary.referenceVersionKey);
                            const erpStatus = getErpReadinessStatus(terminal);
                            const fiscalStatus = terminal.registry?.fiscal_readiness?.status || 'PENDING';

                            return (
                                <tr key={terminal.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-2.5">
                                        <p className="font-bold text-slate-800">{terminal.name}</p>
                                        <p className="text-[11px] text-slate-500">
                                            {terminal.erp_store_name || terminal.erp_store_id || 'Sin sucursal'}
                                            {' · '}
                                            <span className="font-mono">{terminal.terminal_code || terminal.terminal_id || 'N/D'}</span>
                                        </p>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <p className="font-mono text-[11px] font-bold text-slate-700">{getTerminalAuthorizedDeviceId(terminal) || 'N/D'}</p>
                                        <p className="font-mono text-[10px] text-slate-400">pos {getTerminalPosReportedDeviceId(terminal) || 'N/D'}</p>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${outdated ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                            {apkVersion === 'N/D' ? 'N/D' : apkVersion.replace('APK ', '')}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${getRegistryStatusClassName(statusLabel)}`}>{statusLabel}</span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${getReadinessBadgeClasses(erpStatus)}`}>{getReadinessLabel(erpStatus)}</span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-black ${getFiscalStatusClasses(fiscalStatus)}`}>{fiscalStatus}</span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <p className="text-[11px] font-bold text-slate-600">{formatRelativeTime(terminal.last_checkin_at)}</p>
                                        <p className="text-[10px] text-slate-400">{formatDateTime(terminal.last_checkin_at)}</p>
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                        <button
                                            type="button"
                                            onClick={onOpenConsole}
                                            className="text-[11px] font-black text-blue-600 hover:text-blue-700"
                                        >
                                            Inspeccionar
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
