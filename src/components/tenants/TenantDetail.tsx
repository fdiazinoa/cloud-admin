import React, { useMemo, useState } from 'react';
import { Monitor, Pencil, X } from 'lucide-react';
import type { Distributor, Tenant } from '../../types';
import { getTenantSemantics } from '../../lib/tenantSemantics';
import { getTenantHealth, TENANT_HEALTH_CLASSES } from '../../lib/tenantHealth';
import { formatDateTime } from '../../lib/dateFormat';
import { TenantStatusBadge } from './TenantStatusBadge';
import { TenantDetailSummary } from './TenantDetailSummary';
import { TenantDetailProducts } from './TenantDetailProducts';
import { TenantDetailTerminals } from './TenantDetailTerminals';
import { TenantDetailActivity } from './TenantDetailActivity';
import { TenantSidePanel } from './TenantSidePanel';
import { ErpModuleStoreModal } from '../ErpModuleStoreModal';
import type { TenantDetailActions, TenantDetailTab, TenantFieldsDraft } from './types';

interface TenantDetailProps {
    tenant: Tenant;
    distributors: Distributor[];
    tab: TenantDetailTab;
    onTabChange: (tab: TenantDetailTab) => void;
    canViewModules: boolean;
    canManageModules: boolean;
    moduleCount: number | null;
    onModuleCountChange: (count: number) => void;
    actions: TenantDetailActions;
    savingFields: boolean;
    savingProducts: boolean;
    statusBusy: boolean;
    deleting: boolean;
}

const buildFields = (tenant: Tenant): TenantFieldsDraft => ({
    name: tenant.name || '',
    legalName: tenant.legal_name || '',
    taxId: tenant.tax_id || '',
    phone: tenant.phone || '',
    email: tenant.email || '',
    password: '',
});

const getInitials = (name: string) => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'T';

export const TenantDetail: React.FC<TenantDetailProps> = ({
    tenant,
    distributors,
    tab,
    onTabChange,
    canViewModules,
    canManageModules,
    moduleCount,
    onModuleCountChange,
    actions,
    savingFields,
    savingProducts,
    statusBusy,
    deleting,
}) => {
    const [fields, setFields] = useState<TenantFieldsDraft>(() => buildFields(tenant));
    const [isEditing, setIsEditing] = useState(false);

    const semantics = getTenantSemantics(tenant);
    const health = getTenantHealth(tenant);
    const healthClasses = TENANT_HEALTH_CLASSES[health.level];

    const isDirty = useMemo(() => {
        const base = buildFields(tenant);
        return fields.name !== base.name
            || fields.legalName !== base.legalName
            || fields.taxId !== base.taxId
            || fields.phone !== base.phone
            || fields.email !== base.email
            || fields.password.trim().length > 0;
    }, [fields, tenant]);

    const tabs: Array<{ key: TenantDetailTab; label: string }> = [
        { key: 'resumen', label: 'Resumen' },
        { key: 'productos', label: 'Productos y licencias' },
        { key: 'terminales', label: 'Terminales' },
        ...(canViewModules ? [{ key: 'modulos' as TenantDetailTab, label: 'Módulos ERP' }] : []),
        { key: 'actividad', label: 'Actividad' },
    ];

    const startEditing = () => {
        onTabChange('resumen');
        setIsEditing(true);
    };

    const discardChanges = () => {
        setFields(buildFields(tenant));
        setIsEditing(false);
    };

    const saveFields = async () => {
        await actions.onSaveFields(fields);
        setFields((current) => ({ ...current, password: '' }));
        setIsEditing(false);
    };

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col xl:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50">
                <header className="shrink-0 border-b border-slate-200 bg-white px-4 pt-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-sm font-black text-white">
                                {getInitials(tenant.name)}
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="truncate text-xl font-black text-slate-900">{tenant.name}</h2>
                                    <TenantStatusBadge status={tenant.status} />
                                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700">
                                        {semantics.contractedProduct}
                                    </span>
                                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black ${healthClasses.badge}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${healthClasses.dot}`} />
                                        {health.label}
                                    </span>
                                </div>
                                <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                                    {tenant.slug || 'sin-slug'} · {tenant.tax_id || 'sin RNC'} · creado {formatDateTime(tenant.created_at)}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={isEditing ? discardChanges : startEditing}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
                            >
                                {isEditing ? <X size={14} /> : <Pencil size={14} />}
                                {isEditing ? 'Cancelar edición' : 'Editar'}
                            </button>
                            <button
                                type="button"
                                onClick={() => actions.onOpenConsole()}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800"
                            >
                                <Monitor size={14} />
                                Consola de terminales
                            </button>
                        </div>
                    </div>

                    <nav className="mt-3 flex gap-5 overflow-x-auto text-xs font-bold">
                        {tabs.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => onTabChange(item.key)}
                                className={`whitespace-nowrap border-b-2 pb-2.5 transition-colors ${
                                    tab === item.key
                                        ? 'border-blue-600 font-black text-blue-700'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                    {tab === 'resumen' ? (
                        <TenantDetailSummary
                            tenant={tenant}
                            distributors={distributors}
                            fields={fields}
                            isEditing={isEditing}
                            saving={savingFields}
                            onFieldChange={(patch) => setFields((current) => ({ ...current, ...patch }))}
                            onStartEditing={startEditing}
                            onManageProducts={() => onTabChange('productos')}
                            onOpenTerminals={() => onTabChange('terminales')}
                        />
                    ) : null}

                    {tab === 'productos' ? (
                        <TenantDetailProducts tenant={tenant} saving={savingProducts} onSave={actions.onSaveProducts} />
                    ) : null}

                    {tab === 'terminales' ? (
                        <TenantDetailTerminals tenant={tenant} onOpenConsole={actions.onOpenConsole} />
                    ) : null}

                    {tab === 'modulos' && canViewModules ? (
                        <ErpModuleStoreModal
                            isOpen
                            presentation="inline"
                            tenantId={tenant.id}
                            tenantName={tenant.name}
                            canManage={canManageModules}
                            onClose={() => onTabChange('resumen')}
                            onSaved={onModuleCountChange}
                        />
                    ) : null}

                    {tab === 'actividad' ? <TenantDetailActivity tenant={tenant} /> : null}
                </div>

                {isEditing ? (
                    <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold text-amber-800">
                                {isDirty ? 'Tienes cambios sin guardar en la ficha' : 'Edita los campos y guarda para aplicar los cambios'}
                                <span className="ml-1 font-normal text-amber-700">· {tenant.name}</span>
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={discardChanges}
                                    className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800"
                                >
                                    Descartar
                                </button>
                                <button
                                    type="button"
                                    disabled={!isDirty || savingFields}
                                    onClick={() => void saveFields()}
                                    className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {savingFields ? 'Guardando…' : 'Guardar cambios'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            <TenantSidePanel
                tenant={tenant}
                distributors={distributors}
                moduleCount={moduleCount}
                statusBusy={statusBusy}
                deleting={deleting}
                onToggleStatus={() => void actions.onToggleStatus()}
                onActivateTrial={() => void actions.onActivateTrial()}
                onDelete={() => void actions.onDelete()}
                onOpenModules={() => onTabChange('modulos')}
                canViewModules={canViewModules}
            />
        </div>
    );
};
