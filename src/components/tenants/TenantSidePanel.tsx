import React from 'react';
import { AlertTriangle, Ban, CheckCircle2, Loader2, Power, Trash2, Users } from 'lucide-react';
import type { Distributor, Tenant } from '../../types';
import { getTenantHealth, TENANT_HEALTH_CLASSES } from '../../lib/tenantHealth';
import { getTenantSemantics } from '../../lib/tenantSemantics';

interface TenantSidePanelProps {
    tenant: Tenant;
    distributors: Distributor[];
    moduleCount: number | null;
    statusBusy: boolean;
    deleting: boolean;
    onToggleStatus: () => void;
    onActivateTrial: () => void;
    onDelete: () => void;
    onOpenModules: () => void;
    canViewModules: boolean;
}

const Metric: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'text-slate-800' }) => (
    <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="text-slate-500">{label}</span>
        <span className={`font-black ${tone}`}>{value}</span>
    </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode; tone?: 'default' | 'danger' }> = ({ title, children, tone = 'default' }) => (
    <section className={`rounded-2xl border p-4 ${tone === 'danger' ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'}`}>
        <p className={`text-[10px] font-black uppercase tracking-wider ${tone === 'danger' ? 'text-red-700' : 'text-slate-400'}`}>{title}</p>
        <div className="mt-2.5 space-y-1.5">{children}</div>
    </section>
);

export const TenantSidePanel: React.FC<TenantSidePanelProps> = ({
    tenant,
    distributors,
    moduleCount,
    statusBusy,
    deleting,
    onToggleStatus,
    onActivateTrial,
    onDelete,
    onOpenModules,
    canViewModules,
}) => {
    const semantics = getTenantSemantics(tenant);
    const health = getTenantHealth(tenant);
    const healthClasses = TENANT_HEALTH_CLASSES[health.level];
    const distributorName = (id?: string) => distributors.find((item) => item.id === id)?.name || 'Sin asignar';
    const isTrial = tenant.status === 'TRIAL';
    const isActive = tenant.status === 'ACTIVE';

    return (
        <aside aria-label="Metadatos del tenant" className="w-full shrink-0 space-y-3 border-t border-slate-200 bg-slate-50 px-4 py-4 xl:w-[300px] xl:border-l xl:border-t-0 xl:overflow-y-auto">
            <Card title="Ciclo de vida">
                <Metric
                    label="Estado"
                    value={<span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${isActive ? 'bg-emerald-100 text-emerald-700' : isTrial ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{tenant.status}</span>}
                />
                <Metric label="Lifecycle" value={semantics.lifecycleStatus} />
                <Metric label="Provisioning" value={semantics.provisioningStatus} />
                <Metric label="Canal cloud" value={semantics.cloudChannel} />
                <Metric label="Runtime POS" value={semantics.posRuntime} />
                <Metric label="ERP cliente" value={semantics.customerErpAccess ? 'Sí' : 'No'} />
                <Metric
                    label="Listo para ERP"
                    value={tenant.ready_for_erp_activation ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} />Sí</span> : 'No'}
                />
                {canViewModules ? (
                    <button
                        type="button"
                        onClick={onOpenModules}
                        className="mt-1 flex w-full items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-black text-indigo-700 hover:bg-indigo-100"
                    >
                        Módulos ERP
                        <span>{moduleCount === null ? 'Ver' : `${moduleCount} activos`}</span>
                    </button>
                ) : null}
            </Card>

            <Card title="Distribuidores">
                <div>
                    <p className="text-[10px] font-bold text-slate-400">Captó</p>
                    <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-700"><Users size={12} className="text-slate-400" />{distributorName(tenant.captured_by_distributor_id)}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400">Da servicio</p>
                    <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-700"><Users size={12} className="text-slate-400" />{distributorName(tenant.serviced_by_distributor_id)}</p>
                </div>
            </Card>

            <Card title="Salud">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-slate-500">Semáforo</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black ${healthClasses.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${healthClasses.dot}`} />{health.label}
                    </span>
                </div>
                <Metric label="Último sync" value={health.syncAgeLabel} />
                <Metric label="Eventos pendientes" value={health.pendingEvents} tone={health.pendingEvents > 0 ? 'text-amber-700' : 'text-slate-800'} />
                <Metric label="Eventos bloqueados" value={health.blockedEvents} tone={health.blockedEvents > 0 ? 'text-red-700' : 'text-slate-800'} />
                {health.reasons.length ? (
                    <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-700">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        {health.reasons[0]}
                    </p>
                ) : null}
            </Card>

            <Card title="Zona sensible" tone="danger">
                {isTrial ? (
                    <button
                        type="button"
                        disabled={statusBusy}
                        onClick={onActivateTrial}
                        className="flex w-full items-center gap-2 rounded-xl border border-emerald-200 bg-white px-2.5 py-2 text-left text-[12px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    >
                        {statusBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Activar empresa
                    </button>
                ) : (
                    <button
                        type="button"
                        disabled={statusBusy}
                        onClick={onToggleStatus}
                        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left text-[12px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        {statusBusy ? <Loader2 size={14} className="animate-spin" /> : isActive ? <Ban size={14} /> : <Power size={14} />}
                        {isActive ? 'Suspender cuenta' : 'Reactivar cuenta'}
                    </button>
                )}
                <button
                    type="button"
                    disabled={deleting}
                    onClick={onDelete}
                    className="flex w-full items-center gap-2 rounded-xl border border-red-200 bg-white px-2.5 py-2 text-left text-[12px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Eliminar tenant
                </button>
                <p className="text-[10px] leading-snug text-red-700/70">El borrado exige escribir el nombre del tenant y no se puede deshacer.</p>
            </Card>
        </aside>
    );
};
