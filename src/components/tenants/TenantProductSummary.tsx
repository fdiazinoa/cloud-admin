import React from 'react';
import {
    deriveTenantConfigFromProducts,
    deriveTenantSemanticsFromProducts,
    getActiveProductLabels,
    getTenantTypeLabel,
    normalizeTenantProductSelection,
    type TenantProductSelection,
} from '../../lib/tenantProducts';

interface TenantProductSummaryProps {
    products: TenantProductSelection;
    compact?: boolean;
}

export const TenantProductSummary: React.FC<TenantProductSummaryProps> = ({ products, compact = false }) => {
    const normalizedProducts = normalizeTenantProductSelection(products);
    const labels = getActiveProductLabels(normalizedProducts);
    const semantics = deriveTenantSemanticsFromProducts(normalizedProducts);
    let solutionLabel = 'Selecciona productos';

    try {
        solutionLabel = getTenantTypeLabel(deriveTenantConfigFromProducts(products).type);
    } catch {
        solutionLabel = 'Selecciona al menos un producto principal';
    }

    if (compact) {
        return (
            <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                    {labels.map((label) => (
                        <span key={label} className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700">
                            {label}
                        </span>
                    ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span>Solución: <strong className="text-slate-700">{solutionLabel}</strong></span>
                    <span>Contrato: <strong className="text-slate-700">{semantics.contractedProduct}</strong></span>
                    <span>Canal: <strong className="text-slate-700">{semantics.cloudChannel}</strong></span>
                    <span>Datos: <strong className="text-slate-700">{semantics.dataMaster}</strong></span>
                </div>
                {semantics.contractedProduct === 'POS_ONLY' && semantics.cloudChannel === 'POS_CLOUD_STAGING' ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
                        POS_ONLY SaaS incluye respaldo, recuperación y core interno; el cliente no ve ERP.
                    </div>
                ) : null}
                {semantics.posVariant === 'POS_ONLY_OFFLINE' ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                        POS Offline no incluye respaldo cloud, recuperación SaaS ni preparación automática para ERP.
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {labels.map((label) => (
                    <span key={label} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-black uppercase tracking-wide border border-blue-100">
                        {label}
                    </span>
                ))}
            </div>
            <p className="text-xs text-slate-500">
                Solucion base: <span className="font-bold text-slate-700">{solutionLabel}</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                    Contrato: <span className="font-black text-slate-800">{semantics.contractedProduct}</span>
                </span>
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                    Variante POS: <span className="font-black text-slate-800">{semantics.posVariant}</span>
                </span>
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                    Canal cloud: <span className="font-black text-slate-800">{semantics.cloudChannel}</span>
                </span>
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                    Fuente datos: <span className="font-black text-slate-800">{semantics.dataMaster}</span>
                </span>
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                    ERP cliente: <span className="font-black text-slate-800">{semantics.customerErpAccess ? 'SI' : 'NO'}</span>
                </span>
            </div>
            {semantics.contractedProduct === 'POS_ONLY' && semantics.cloudChannel === 'POS_CLOUD_STAGING' ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                    POS_ONLY SaaS: incluye Cloud Staging, respaldo, recuperacion y core interno. El cliente no ve ERP.
                </div>
            ) : null}
            {semantics.posVariant === 'POS_ONLY_OFFLINE' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    POS Offline explicito: no tendra respaldo cloud, recuperacion SaaS ni preparacion automatica para ERP.
                </div>
            ) : null}
        </div>
    );
};

