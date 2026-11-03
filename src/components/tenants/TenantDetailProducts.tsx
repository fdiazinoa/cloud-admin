import React, { useState } from 'react';
import { Check, Loader2, Pencil } from 'lucide-react';
import type { Tenant } from '../../types';
import {
    deriveProductsFromTenant,
    getActiveProductLabels,
    type TenantProductSelection,
} from '../../lib/tenantProducts';
import { TenantProductsEditor } from '../TenantProductsEditor';
import { TenantProductSummary } from './TenantProductSummary';

interface TenantDetailProductsProps {
    tenant: Tenant;
    saving: boolean;
    onSave: (products: TenantProductSelection) => Promise<void>;
}

export const TenantDetailProducts: React.FC<TenantDetailProductsProps> = ({ tenant, saving, onSave }) => {
    const currentProducts = deriveProductsFromTenant(
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
    );
    const [isEditing, setIsEditing] = useState(false);
    const labels = getActiveProductLabels(currentProducts);

    return (
        <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-400">Contratación actual</p>
                        <p className="mt-1 text-sm text-slate-500">
                            {labels.length ? labels.join(' + ') : 'Sin productos activos'}
                            {tenant.max_pos_terminals ? ` · ${tenant.max_pos_terminals} licencias POS` : ''}
                            {tenant.max_erp_users ? ` · ${tenant.max_erp_users} usuarios ERP` : ''}
                        </p>
                    </div>
                    {isEditing ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                            <Pencil size={12} /> Editando
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsEditing(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-600 hover:bg-slate-50"
                        >
                            <Pencil size={13} /> Cambiar productos
                        </button>
                    )}
                </div>
                <div className="mt-3">
                    <TenantProductSummary products={currentProducts} />
                </div>
            </section>

            {isEditing ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Seleccionar productos y licencias</p>
                    <div className="mt-3">
                        <TenantProductsEditor
                            initialProducts={currentProducts}
                            helperText="Los cambios recalculan el tipo de tenant, el canal cloud y los límites de licencias."
                            saveLabel={saving ? 'Guardando…' : 'Guardar productos'}
                            onCancel={() => setIsEditing(false)}
                            onSave={async (products) => {
                                await onSave(products);
                                setIsEditing(false);
                            }}
                        />
                    </div>
                    {saving ? (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                            <Loader2 className="animate-spin" size={12} /> Aplicando cambios…
                        </p>
                    ) : null}
                </section>
            ) : (
                <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-[12px] text-slate-500">
                    <p className="inline-flex items-center gap-1.5 font-bold text-slate-600">
                        <Check size={13} className="text-emerald-600" /> Los productos se editan aquí, sin abrir modales.
                    </p>
                    <p className="mt-1">Al guardar se sincronizan el tipo de tenant, el canal cloud y los límites de licencias.</p>
                </section>
            )}
        </div>
    );
};
