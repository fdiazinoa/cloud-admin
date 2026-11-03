import React from 'react';
import { Activity, CalendarClock, CloudUpload, Database, ShieldCheck } from 'lucide-react';
import type { Tenant } from '../../types';
import { formatRelativeTime, getTenantHealth, TENANT_HEALTH_CLASSES } from '../../lib/tenantHealth';
import { getTenantSemantics } from '../../lib/tenantSemantics';
import { summarizeTenantTerminals } from '../../lib/tenantTerminalSummary';
import { formatDateTime } from '../../lib/dateFormat';
import { useTenantTerminalOverview } from './useTenantTerminalOverview';

interface TenantDetailActivityProps {
    tenant: Tenant;
}

const Row: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string; tone?: 'ok' | 'warn' | 'bad' | 'muted' }> = ({ icon, label, value, hint, tone = 'muted' }) => {
    const tones: Record<string, string> = {
        ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        warn: 'text-amber-700 bg-amber-50 border-amber-200',
        bad: 'text-red-700 bg-red-50 border-red-200',
        muted: 'text-slate-600 bg-slate-50 border-slate-200',
    };
    return (
        <li className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
            <div className="flex items-start gap-2.5">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${tones[tone]}`}>{icon}</span>
                <div>
                    <p className="text-[13px] font-bold text-slate-800">{label}</p>
                    {hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
                </div>
            </div>
            <p className="shrink-0 text-right text-[12px] font-black text-slate-700">{value}</p>
        </li>
    );
};

export const TenantDetailActivity: React.FC<TenantDetailActivityProps> = ({ tenant }) => {
    const health = getTenantHealth(tenant);
    const healthClasses = TENANT_HEALTH_CLASSES[health.level];
    const semantics = getTenantSemantics(tenant);
    const { terminals, loading } = useTenantTerminalOverview(tenant.id);
    const summary = summarizeTenantTerminals(terminals ?? []);

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                    <Activity size={15} /> Sincronización y respaldo
                </p>
                <ul className="mt-2">
                    <Row
                        icon={<CloudUpload size={15} />}
                        label="Última sincronización"
                        hint={formatDateTime(tenant.last_sync_received_at)}
                        value={health.syncAgeLabel}
                        tone={health.level === 'bad' ? 'bad' : health.level === 'warn' ? 'warn' : 'ok'}
                    />
                    <Row
                        icon={<Database size={15} />}
                        label="Último respaldo"
                        hint={formatDateTime(tenant.last_backup_at)}
                        value={formatRelativeTime(tenant.last_backup_at)}
                        tone={semantics.backupEnabled ? 'ok' : 'muted'}
                    />
                    <Row
                        icon={<Activity size={15} />}
                        label="Eventos pendientes"
                        hint="Cambios a la espera de confirmación"
                        value={String(health.pendingEvents)}
                        tone={health.pendingEvents > 0 ? 'warn' : 'ok'}
                    />
                    <Row
                        icon={<ShieldCheck size={15} />}
                        label="Eventos bloqueados"
                        hint="Requieren intervención manual"
                        value={String(health.blockedEvents)}
                        tone={health.blockedEvents > 0 ? 'bad' : 'ok'}
                    />
                    <Row
                        icon={<CalendarClock size={15} />}
                        label="Tenant creado"
                        hint={formatDateTime(tenant.created_at)}
                        value={formatRelativeTime(tenant.created_at)}
                    />
                </ul>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                    <Activity size={15} /> Actividad de terminales
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${healthClasses.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${healthClasses.dot}`} /> {health.label}
                    </span>
                    {loading ? <span className="text-[11px] font-bold text-slate-400">Cargando terminales…</span> : null}
                </div>
                <ul className="mt-2">
                    <Row icon={<ShieldCheck size={15} />} label="Terminales online" hint={`de ${summary.total} registradas`} value={`${summary.online}`} tone={summary.online > 0 ? 'ok' : 'muted'} />
                    <Row icon={<Database size={15} />} label="ERP listo" hint="Con readiness confirmado por ERP" value={`${summary.erpReady}`} tone={summary.erpReady > 0 ? 'ok' : 'muted'} />
                    <Row icon={<CalendarClock size={15} />} label="APK de referencia" hint={`${summary.withoutVersion} sin versión reportada`} value={summary.referenceVersionLabel || 'N/D'} />
                    <Row icon={<Activity size={15} />} label="Fuera de versión" hint="Terminales con APK distinta a la referencia" value={`${summary.outdated}`} tone={summary.outdated > 0 ? 'warn' : 'ok'} />
                    <Row icon={<Database size={15} />} label="Sucursales" hint="Agrupadas por tienda del ERP" value={`${summary.storeCount}`} />
                </ul>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                    Vista derivada del estado actual del tenant y sus terminales. El historial de auditoría se consulta desde la consola de terminales.
                </p>
            </section>
        </div>
    );
};
