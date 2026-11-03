import React from 'react';
import type {
    Tenant,
} from '../../types';
import {
    formatDateTime,
} from '../../lib/dateFormat';
import {
    getTenantSemantics,
} from '../../lib/tenantSemantics';

interface TenantSemanticsGridProps {
    tenant: Tenant;
}

export const TenantSemanticsGrid: React.FC<TenantSemanticsGridProps> = ({ tenant }) => {
    const semantics = getTenantSemantics(tenant);
    const fields = [
        ['Producto contratado', semantics.contractedProduct],
        ['Variante POS', semantics.posVariant],
        ['Runtime POS', semantics.posRuntime],
        ['Canal cloud', semantics.cloudChannel],
        ['Fuente de datos', semantics.dataMaster],
        ['Cloud Sync', semantics.cloudSyncEnabled ? 'ACTIVO' : 'INACTIVO'],
        ['ERP Core interno', semantics.erpCoreEnabled ? 'PREPARADO' : 'NO PREPARADO'],
        ['Acceso ERP cliente', semantics.customerErpAccess ? 'SI' : 'NO'],
        ['ERP UI', semantics.erpUiEnabled ? 'SI' : 'NO'],
        ['Modo offline', semantics.offlineMode ? 'SI' : 'NO'],
        ['Lifecycle', semantics.lifecycleStatus],
        ['Provisioning', semantics.provisioningStatus],
        ['Ultimo sync recibido', formatDateTime(tenant.last_sync_received_at)],
        ['Ultimo backup', formatDateTime(tenant.last_backup_at)],
        ['Listo activar ERP', tenant.ready_for_erp_activation ? 'SI' : 'NO'],
        ['Eventos pendientes', String(tenant.pending_events_count ?? 0)],
        ['Eventos bloqueados', String(tenant.blocked_events_count ?? 0)],
    ];

    return (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-1 mb-4">
                <p className="text-sm font-black text-slate-800">Semantica comercial y tecnica</p>
                <p className="text-xs text-slate-500">
                    El contrato controla acceso ERP; el canal cloud controla sincronizacion, staging y recuperacion.
                </p>
            </div>
            {semantics.contractedProduct === 'POS_ONLY' && semantics.cloudChannel === 'NONE' ? (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    Este POS esta en modo offline/sin Cloud Staging. No tendra respaldo cloud, recuperacion SaaS ni preparacion automatica para activar ERP.
                </div>
            ) : null}
            {semantics.contractedProduct === 'POS_ONLY' && semantics.cloudChannel === 'POS_CLOUD_STAGING' ? (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    POS_ONLY SaaS correcto: opera local con SQLite, sincroniza al cloud/core para respaldo y staging, y mantiene ERP visible apagado para el cliente.
                </div>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {fields.map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                        <p className="mt-1 text-sm font-bold text-slate-800 break-words">{value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

