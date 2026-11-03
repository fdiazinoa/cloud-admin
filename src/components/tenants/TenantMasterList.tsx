import React, { useMemo } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import type { Tenant, TenantStatus } from '../../types';
import { deriveProductsFromTenant, getActiveProductLabels } from '../../lib/tenantProducts';
import { TENANT_HEALTH_CLASSES, getTenantHealth } from '../../lib/tenantHealth';
import type { TenantStatusFilter } from './types';

interface TenantMasterListProps {
    tenants: Tenant[];
    loading: boolean;
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    statusFilter: TenantStatusFilter;
    onStatusFilterChange: (filter: TenantStatusFilter) => void;
    selectedTenantId: string | null;
    onSelect: (tenant: Tenant) => void;
    onCreate: () => void;
}

const getInitials = (name: string) => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'T';

const getProductLabel = (tenant: Tenant) => getActiveProductLabels(deriveProductsFromTenant(
    tenant.type,
    tenant.cloud_sync,
    tenant.max_pos_terminals,
    tenant.max_erp_users,
    {
        posVariant: tenant.pos_variant,
        offlineMode: tenant.offline_mode,
        explicitOffline: tenant.explicit_offline,
        cloudChannel: tenant.cloud_channel,
    },
)).join(' + ') || 'Sin productos';

const STATUS_FILTERS: Array<{ key: TenantStatusFilter; label: string; status?: TenantStatus }> = [
    { key: 'ALL', label: 'Todos' },
    { key: 'TRIAL', label: 'Trial', status: 'TRIAL' },
    { key: 'ACTIVE', label: 'Activos', status: 'ACTIVE' },
    { key: 'SUSPENDED', label: 'Susp.', status: 'SUSPENDED' },
];

export const TenantMasterList: React.FC<TenantMasterListProps> = ({
    tenants,
    loading,
    searchTerm,
    onSearchTermChange,
    statusFilter,
    onStatusFilterChange,
    selectedTenantId,
    onSelect,
    onCreate,
}) => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const visibleTenants = useMemo(() => tenants.filter((tenant) => {
        const matchesStatus = statusFilter === 'ALL' || tenant.status === statusFilter;
        const matchesSearch = !normalizedSearch
            || tenant.name.toLowerCase().includes(normalizedSearch)
            || (tenant.tax_id || '').toLowerCase().includes(normalizedSearch)
            || (tenant.contact_name || '').toLowerCase().includes(normalizedSearch)
            || (tenant.city || '').toLowerCase().includes(normalizedSearch);
        return matchesStatus && matchesSearch;
    }), [normalizedSearch, statusFilter, tenants]);

    const counts = useMemo(() => ({
        ALL: tenants.length,
        TRIAL: tenants.filter((tenant) => tenant.status === 'TRIAL').length,
        ACTIVE: tenants.filter((tenant) => tenant.status === 'ACTIVE').length,
        SUSPENDED: tenants.filter((tenant) => tenant.status === 'SUSPENDED').length,
    }), [tenants]);

    return (
        <section aria-label="Cartera de tenants" className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:w-[340px] lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <h1 className="text-base font-black text-slate-800">
                        Tenants
                        <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">{counts.ALL}</span>
                    </h1>
                    <button
                        type="button"
                        onClick={onCreate}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-2.5 py-1.5 text-xs font-black text-white transition-colors hover:bg-blue-700"
                    >
                        <Plus size={14} />
                        Nuevo
                    </button>
                </div>

                <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 focus-within:border-blue-300 focus-within:bg-white">
                    <Search size={15} />
                    <input
                        type="search"
                        value={searchTerm}
                        onChange={(event) => onSearchTermChange(event.target.value)}
                        placeholder="Buscar nombre, RNC, contacto o ciudad"
                        className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
                    />
                    {loading ? <Loader2 className="animate-spin text-blue-500" size={15} /> : null}
                </div>

                <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-black">
                    {STATUS_FILTERS.map((filter) => (
                        <button
                            key={filter.key}
                            type="button"
                            onClick={() => onStatusFilterChange(filter.key)}
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 transition-colors ${
                                statusFilter === filter.key
                                    ? 'bg-slate-900 text-white'
                                    : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            {filter.label}
                            <span className={`ml-1 ${statusFilter === filter.key ? 'text-white/70' : 'text-slate-400'}`}>{counts[filter.key]}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {visibleTenants.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-500">
                        {loading ? 'Cargando tenants…' : 'No hay tenants que coincidan con el filtro.'}
                    </div>
                ) : visibleTenants.map((tenant) => {
                    const health = getTenantHealth(tenant);
                    const healthClasses = TENANT_HEALTH_CLASSES[health.level];
                    const selected = tenant.id === selectedTenantId;

                    return (
                        <button
                            key={tenant.id}
                            type="button"
                            onClick={() => onSelect(tenant)}
                            className={`flex w-full items-start gap-2.5 border-l-[3px] px-4 py-3 text-left transition-colors ${
                                selected
                                    ? 'border-blue-600 bg-blue-50/60'
                                    : 'border-transparent hover:bg-slate-50'
                            }`}
                        >
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-black ${
                                selected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                                {getInitials(tenant.name)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className={`truncate text-sm ${selected ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>{tenant.name}</p>
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${healthClasses.dot}`} title={health.label} />
                                </div>
                                <p className="truncate text-[11px] text-slate-500">
                                    {tenant.city || 'Sin ciudad'} · {getProductLabel(tenant)}
                                </p>
                                <div className="mt-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide">
                                    <span className="text-slate-500">sync {health.syncAgeLabel}</span>
                                    {health.blockedEvents > 0 ? (
                                        <>
                                            <span className="text-slate-300">·</span>
                                            <span className="text-red-700">{health.blockedEvents} bloqueados</span>
                                        </>
                                    ) : health.pendingEvents > 0 ? (
                                        <>
                                            <span className="text-slate-300">·</span>
                                            <span className="text-amber-700">{health.pendingEvents} pendientes</span>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="shrink-0 border-t border-slate-100 px-4 py-2 text-[11px] font-bold text-slate-400">
                {visibleTenants.length} de {tenants.length} tenants
            </div>
        </section>
    );
};
