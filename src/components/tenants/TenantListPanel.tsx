import React from 'react';
import { CheckCircle2, Edit3, Loader2, Monitor, Power, Search, Trash2 } from 'lucide-react';
import type { Tenant } from '../../types';
import { deriveProductsFromTenant, getActiveProductLabels } from '../../lib/tenantProducts';
import { getTenantSemantics } from '../../lib/tenantSemantics';
import { TenantStatusBadge } from './TenantStatusBadge';

interface TenantListPanelProps {
    tenants: Tenant[];
    loading: boolean;
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    deletingTenantId: string | null;
    updatingStatusTenantId: string | null;
    onOpenTerminals: (tenant: Tenant) => void;
    onEdit: (tenant: Tenant) => void;
    onActivateTrial: (tenant: Tenant) => void;
    onToggleStatus: (tenant: Tenant) => void;
    onDelete: (tenant: Tenant) => void;
}

export const TenantListPanel: React.FC<TenantListPanelProps> = ({
    tenants,
    loading,
    searchTerm,
    onSearchTermChange,
    deletingTenantId,
    updatingStatusTenantId,
    onOpenTerminals,
    onEdit,
    onActivateTrial,
    onToggleStatus,
    onDelete,
}) => (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div className="relative w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                    type="text"
                    placeholder="Buscar por nombre, RNC, contacto o ciudad..."
                    value={searchTerm}
                    onChange={(e) => onSearchTermChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                />
            </div>
            <div className="flex gap-2 text-sm text-slate-600 font-medium items-center">
                {loading ? <Loader2 className="animate-spin text-blue-500" size={16} /> : null}
                <span>Total: {tenants.length}</span>
            </div>
        </div>

        <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                <tr>
                    <th className="px-6 py-4">Empresa / ID</th>
                    <th className="px-6 py-4">RNC / Cédula</th>
                    <th className="px-6 py-4">Contacto</th>
                    <th className="px-6 py-4 text-center">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
                {tenants.length === 0 && !loading && (
                    <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">No se encontraron tenants.</td>
                    </tr>
                )}
                {tenants.map((tenant) => {
                    const semantics = getTenantSemantics(tenant);
                    return (
                    <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                            <div className="font-bold text-slate-800">{tenant.name}</div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">{tenant.id}</div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {getActiveProductLabels(deriveProductsFromTenant(tenant.type, tenant.cloud_sync, tenant.max_pos_terminals, tenant.max_erp_users, {
                                    posVariant: tenant.pos_variant,
                                    offlineMode: tenant.offline_mode,
                                    explicitOffline: tenant.explicit_offline,
                                    cloudChannel: tenant.cloud_channel,
                                })).map((label) => (
                                    <span key={label} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wide">
                                        {label}
                                    </span>
                                ))}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-wide">
                                    {semantics.contractedProduct}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-black uppercase tracking-wide">
                                    {semantics.cloudChannel}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wide">
                                    ERP cliente: {semantics.customerErpAccess ? 'SI' : 'NO'}
                                </span>
                            </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-600">{tenant.tax_id || 'N/A'}</td>
                        <td className="px-6 py-4">
                            <div className="font-semibold text-slate-700">{tenant.contact_name || 'Sin persona de contacto'}</div>
                            <div className="text-xs text-slate-500">{tenant.contact_email || tenant.email}</div>
                            <div className="text-xs text-slate-400">{tenant.city || 'Ciudad no definida'}</div>
                        </td>
                        <td className="px-6 py-4 text-center"><TenantStatusBadge status={tenant.status} /></td>
                        <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => void onOpenTerminals(tenant)}
                                    className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                    title="Ver terminales"
                                >
                                    <Monitor size={18} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onEdit(tenant)}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Editar"
                                >
                                    <Edit3 size={18} />
                                </button>
                                {tenant.status === 'TRIAL' ? (
                                    <button
                                        type="button"
                                        onClick={() => void onActivateTrial(tenant)}
                                        disabled={updatingStatusTenantId === tenant.id}
                                        className="p-2 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                        title="Activar empresa"
                                    >
                                        {updatingStatusTenantId === tenant.id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onToggleStatus(tenant)}
                                        disabled={updatingStatusTenantId === tenant.id}
                                        className={`p-2 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${tenant.status === 'ACTIVE' ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                        title={tenant.status === 'ACTIVE' ? 'Forzar Suspensión' : 'Reactivar'}
                                    >
                                        {updatingStatusTenantId === tenant.id ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => void onDelete(tenant)}
                                    disabled={deletingTenantId === tenant.id}
                                    className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    title="Eliminar tenant"
                                >
                                    {deletingTenantId === tenant.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                </button>
                            </div>
                        </td>
                    </tr>
                )})}
            </tbody>
        </table>
    </div>
);
