import React, { useState } from 'react';
import { Check, Database, HardDrive, MonitorSmartphone, X } from 'lucide-react';
import type { TenantProductKey, TenantProductSelection } from '../lib/tenantProducts';
import { TENANT_PRODUCTS } from '../lib/tenantProducts';

const PRODUCT_ICONS: Record<TenantProductKey, React.ComponentType<{ size?: number; className?: string }>> = {
    pos: MonitorSmartphone,
    erp: Database,
    backup: HardDrive
};

interface TenantProductsModalProps {
    isOpen: boolean;
    title: string;
    tenantName?: string;
    initialProducts: TenantProductSelection;
    onClose: () => void;
    onSave: (products: TenantProductSelection) => void;
}

export const TenantProductsModal: React.FC<TenantProductsModalProps> = ({
    isOpen,
    title,
    tenantName,
    initialProducts,
    onClose,
    onSave
}) => {
    const [draft, setDraft] = useState<TenantProductSelection>(initialProducts);

    if (!isOpen) return null;

    const hasMainProduct = draft.pos || draft.erp;

    const toggleProduct = (key: TenantProductKey) => {
        setDraft((current) => ({
            ...current,
            [key]: !current[key]
        }));
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="font-black text-lg text-slate-800">{title}</h3>
                        <p className="text-sm text-slate-500">
                            {tenantName ? `Tenant: ${tenantName}` : 'Define que productos y addons quedan activos.'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                        Usa este modal para encender o apagar productos del tenant sin mezclarlo con los datos de la empresa.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {TENANT_PRODUCTS.map((product) => {
                            const Icon = PRODUCT_ICONS[product.key];
                            const active = draft[product.key];

                            return (
                                <button
                                    key={product.key}
                                    type="button"
                                    onClick={() => toggleProduct(product.key)}
                                    className={`rounded-2xl border p-4 text-left transition-all ${
                                        active
                                            ? 'border-blue-300 bg-blue-50 shadow-sm shadow-blue-100'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                                            active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            <Icon size={20} />
                                        </div>
                                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                                            active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'
                                        }`}>
                                            <Check size={14} />
                                        </div>
                                    </div>
                                    <h4 className="mt-4 font-black text-slate-800">{product.label}</h4>
                                    <p className="mt-2 text-sm text-slate-500 leading-relaxed">{product.description}</p>
                                </button>
                            );
                        })}
                    </div>

                    {!hasMainProduct && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                            Debes activar al menos uno de los productos principales: CLIC POS o CLIC ERP.
                        </div>
                    )}

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={!hasMainProduct}
                            onClick={() => onSave(draft)}
                            className="flex-1 px-4 py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-sm transition-colors disabled:opacity-60"
                        >
                            Aplicar Productos
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
