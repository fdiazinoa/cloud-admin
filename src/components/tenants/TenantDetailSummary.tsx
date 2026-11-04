import React from 'react';
import { Activity, ArrowRight, Building2, Cloud, CloudOff, Database, HardDrive, MonitorSmartphone, Pencil } from 'lucide-react';
import type { Distributor, Tenant } from '../../types';
import { getTenantHealth, TENANT_HEALTH_CLASSES, formatRelativeTime } from '../../lib/tenantHealth';
import { getTenantSemantics } from '../../lib/tenantSemantics';
import { summarizeTenantTerminals } from '../../lib/tenantTerminalSummary';
import { formatApkVersion, getRegistryStatusClassName, getRegistryStatusLabel } from '../../lib/tenantTerminalFormatting';
import type { TenantFieldsDraft } from './types';
import { useTenantTerminalOverview } from './useTenantTerminalOverview';

interface TenantDetailSummaryProps {
    tenant: Tenant;
    distributors: Distributor[];
    fields: TenantFieldsDraft;
    isEditing: boolean;
    saving: boolean;
    onFieldChange: (patch: Partial<TenantFieldsDraft>) => void;
    onStartEditing: () => void;
    onManageProducts: () => void;
    onOpenTerminals: () => void;
}

const Field: React.FC<{ label: string; value: string; editing?: boolean; onChange?: (value: string) => void; type?: string; placeholder?: string; hint?: string }> = ({
    label,
    value,
    editing = false,
    onChange,
    type = 'text',
    placeholder,
    hint,
}) => (
    <div>
        <p className="text-[11px] font-bold text-slate-400">{label}</p>
        {editing && onChange ? (
            <>
                <input
                    type={type}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-bold text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
                {hint ? <p className="mt-1 text-[10px] text-slate-400">{hint}</p> : null}
            </>
        ) : (
            <p className="mt-0.5 truncate text-[13px] font-bold text-slate-800">{value || 'N/D'}</p>
        )}
    </div>
);

export const TenantDetailSummary: React.FC<TenantDetailSummaryProps> = ({
    tenant,
    distributors,
    fields,
    isEditing,
    saving,
    onFieldChange,
    onStartEditing,
    onManageProducts,
    onOpenTerminals,
}) => {
    const semantics = getTenantSemantics(tenant);
    const health = getTenantHealth(tenant);
    const healthClasses = TENANT_HEALTH_CLASSES[health.level];
    const { terminals, seats, loading } = useTenantTerminalOverview(tenant.id);
    const summary = summarizeTenantTerminals(terminals ?? [], tenant.status);

    const distributorName = (id?: string) => distributors.find((item) => item.id === id)?.name || 'Sin asignar';
    const licenseLimit = seats?.maxSeats ?? tenant.max_pos_terminals ?? null;
    const usedSeats = seats?.usedSeats ?? null;

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                        <Building2 size={15} /> Datos de la empresa
                    </p>
                    {isEditing ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">
                            Editando
                        </span>
                    ) : (
                        <button type="button" onClick={onStartEditing} className="inline-flex items-center gap-1 text-[11px] font-black text-blue-600 hover:text-blue-700">
                            <Pencil size={12} /> Editar campos
                        </button>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    <Field label="Nombre comercial" value={fields.name} editing={isEditing} onChange={(value) => onFieldChange({ name: value })} />
                    <Field label="Razón social" value={fields.legalName} editing={isEditing} onChange={(value) => onFieldChange({ legalName: value })} placeholder="Opcional" />
                    <Field label="RNC / Cédula" value={fields.taxId} editing={isEditing} onChange={(value) => onFieldChange({ taxId: value })} placeholder="Opcional" />
                    <Field label="Teléfono" value={fields.phone} editing={isEditing} onChange={(value) => onFieldChange({ phone: value })} placeholder="Opcional" />
                    <Field label="Email de acceso" value={fields.email} editing={isEditing} onChange={(value) => onFieldChange({ email: value })} type="email" hint={isEditing ? 'Sincroniza con Supabase Auth.' : undefined} />
                    {isEditing ? (
                        <Field label="Nueva contraseña" value={fields.password} editing onChange={(value) => onFieldChange({ password: value })} type="password" placeholder="Dejar vacío para no cambiar" hint="Reemplaza la contraseña del usuario de acceso." />
                    ) : (
                        <Field label="Contacto" value={[tenant.contact_name, tenant.contact_email].filter(Boolean).join(' · ')} />
                    )}
                    {!isEditing ? <Field label="Ciudad" value={tenant.city || 'N/D'} /> : null}
                    {!isEditing ? <Field label="Slug técnico" value={tenant.slug || 'N/D'} /> : null}
                </div>

                {saving ? (
                    <p className="mt-3 text-[11px] font-bold text-slate-400">Guardando cambios…</p>
                ) : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                        <HardDrive size={15} /> Productos y licencias
                    </p>
                    <button type="button" onClick={onManageProducts} className="text-[11px] font-black text-blue-600 hover:text-blue-700">
                        Gestionar
                    </button>
                </div>

                <div className="mt-4 space-y-2.5">
                    <div className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${semantics.contractedProduct.includes('POS') ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center gap-2.5">
                            <span className={`grid h-9 w-9 place-items-center rounded-xl ${semantics.contractedProduct.includes('POS') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                <MonitorSmartphone size={17} />
                            </span>
                            <div>
                                <p className="text-sm font-black text-slate-800">CLIC POS</p>
                                <p className="text-[11px] text-slate-500">
                                    {loading ? 'Consultando cupo…' : typeof licenseLimit === 'number' ? `${usedSeats ?? '—'} de ${licenseLimit} licencias en uso` : 'Sin cupo definido'}
                                </p>
                            </div>
                        </div>
                        <span className={`text-xs font-black ${semantics.contractedProduct.includes('POS') ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {semantics.contractedProduct.includes('POS') ? 'Activo' : 'No contratado'}
                        </span>
                    </div>

                    <div className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${semantics.erpCoreEnabled ? 'border-violet-200 bg-violet-50/60' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center gap-2.5">
                            <span className={`grid h-9 w-9 place-items-center rounded-xl ${semantics.erpCoreEnabled ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                <Database size={17} />
                            </span>
                            <div>
                                <p className="text-sm font-black text-slate-800">CLIC ERP</p>
                                <p className="text-[11px] text-slate-500">
                                    {semantics.customerErpAccess ? 'Con acceso de cliente' : 'Uso interno'}
                                    {tenant.max_erp_users ? ` · ${tenant.max_erp_users} usuarios concurrentes` : ''}
                                </p>
                            </div>
                        </div>
                        <span className={`text-xs font-black ${semantics.erpCoreEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {semantics.erpCoreEnabled ? 'Activo' : 'No contratado'}
                        </span>
                    </div>

                    <div className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${semantics.backupEnabled ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center gap-2.5">
                            <span className={`grid h-9 w-9 place-items-center rounded-xl ${semantics.backupEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {semantics.backupEnabled ? <Cloud size={17} /> : <CloudOff size={17} />}
                            </span>
                            <div>
                                <p className="text-sm font-black text-slate-800">Respaldo cloud</p>
                                <p className="text-[11px] text-slate-500">
                                    Último backup: {formatRelativeTime(tenant.last_backup_at)}
                                    {semantics.offlineMode ? ' · sin nube (offline explícito)' : ''}
                                </p>
                            </div>
                        </div>
                        <span className={`text-xs font-black ${semantics.backupEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {semantics.backupEnabled ? 'Activo' : 'No contratado'}
                        </span>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white xl:col-span-2">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                        <MonitorSmartphone size={15} /> Terminales
                    </p>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide">
                        {loading ? (
                            <span className="text-slate-400">Cargando…</span>
                        ) : (
                            <>
                                {tenant.status !== 'SUSPENDED' ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{summary.online} online</span> : null}
                                {summary.suspended > 0 ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">{summary.suspended} suspendidas</span> : null}
                                {summary.offline > 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{summary.offline} sin latido</span> : null}
                                {summary.outdated > 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{summary.outdated} APK distinta</span> : null}
                            </>
                        )}
                        <button type="button" onClick={onOpenTerminals} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700">
                            Ver todas <ArrowRight size={12} />
                        </button>
                    </div>
                </div>

                <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50/60 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <tr>
                            <th className="px-5 py-2">Terminal · sucursal</th>
                            <th className="px-3 py-2">APK</th>
                            <th className="px-3 py-2">Registro</th>
                            <th className="px-3 py-2">Último check-in</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {(terminals ?? []).slice(0, 3).map((terminal) => {
                            const status = getRegistryStatusLabel(terminal, tenant.status);
                            return (
                                <tr key={terminal.id}>
                                    <td className="px-5 py-2.5">
                                        <span className="font-bold text-slate-800">{terminal.name}</span>
                                        <span className="text-slate-400"> · {terminal.erp_store_name || terminal.erp_store_id || 'Sin sucursal'}</span>
                                    </td>
                                    <td className="px-3 py-2.5 font-bold text-slate-600">{formatApkVersion(terminal).replace('APK ', '')}</td>
                                    <td className="px-3 py-2.5">
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${getRegistryStatusClassName(status)}`}>{status}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-slate-600">{formatRelativeTime(terminal.last_checkin_at)}</td>
                                </tr>
                            );
                        })}
                        {!loading && (terminals ?? []).length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-5 py-6 text-center text-[12px] italic text-slate-500">
                                    Este tenant todavía no tiene terminales registradas.
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 xl:col-span-2">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                    <Activity size={15} /> Estado operativo
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${healthClasses.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${healthClasses.dot}`} /> {health.label}
                    </span>
                    <span className="text-[12px] text-slate-600">Último sync: <span className="font-black text-slate-800">{health.syncAgeLabel}</span></span>
                    <span className="text-[12px] text-slate-600">Eventos: <span className="font-black text-slate-800">{health.pendingEvents} pendientes · {health.blockedEvents} bloqueados</span></span>
                    <span className="text-[12px] text-slate-600">Distribuidor: <span className="font-black text-slate-800">{distributorName(tenant.captured_by_distributor_id)}</span></span>
                </div>
                {health.reasons.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-slate-500">
                        {health.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                ) : null}
            </section>
        </div>
    );
};
