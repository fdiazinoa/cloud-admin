import React, { useState } from 'react';
import { Boxes, Loader2, Puzzle, X } from 'lucide-react';
import type { Tenant } from '../../types';
import { deriveProductsFromTenant } from '../../lib/tenantProducts';
import type { TenantProductSelection } from '../../lib/tenantProducts';
import { normalizeTenantProductSelection } from '../../lib/tenantProducts';
import { TenantProductsModal } from '../TenantProductsModal';
import type { TenantEditFormData } from './types';
import { TenantProductSummary } from './TenantProductSummary';

interface TenantEditModalProps {
    tenant: Tenant | null;
    formData: TenantEditFormData;
    setFormData: React.Dispatch<React.SetStateAction<TenantEditFormData>>;
    isSubmitting: boolean;
    canViewErpModules: boolean;
    activeModuleCounts: Record<string, number>;
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
    onOpenModuleStore: (tenant: Tenant) => void;
}

export const TenantEditModal: React.FC<TenantEditModalProps> = ({
    tenant,
    formData,
    setFormData,
    isSubmitting,
    canViewErpModules,
    activeModuleCounts,
    onClose,
    onSubmit,
    onOpenModuleStore,
}) => {
    const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);
    const [productsModalVersion, setProductsModalVersion] = useState(0);

    if (!tenant) return null;

    const hasActiveErp = deriveProductsFromTenant(
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
    ).erp;

    const openProductsModal = () => {
        setProductsModalVersion((current) => current + 1);
        setIsProductsModalOpen(true);
    };

    const applyProducts = (products: TenantProductSelection) => {
        setFormData((current) => ({ ...current, products: normalizeTenantProductSelection(products) }));
        setIsProductsModalOpen(false);
    };

    return (
        <>
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-black text-lg text-slate-800">Editar Empresa</h3>
                        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                    <form onSubmit={onSubmit} className="p-6 space-y-5">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Comercial <span className="text-red-500">*</span></label>
                            <input
                                required
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Razón Social</label>
                            <input
                                type="text"
                                value={formData.legalName}
                                onChange={e => setFormData({ ...formData, legalName: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                placeholder="Opcional"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">RNC / Cédula</label>
                                <input
                                    type="text"
                                    value={formData.taxId}
                                    onChange={e => setFormData({ ...formData, taxId: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    placeholder="Opcional"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Teléfono</label>
                                <input
                                    type="text"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    placeholder="Opcional"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Email de Acceso</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    placeholder="admin@empresa.com"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">Sincroniza con Supabase Auth.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nueva Contraseña</label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    placeholder="Dejar vacío para no cambiar"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">Reemplaza la contraseña actual del usuario de acceso.</p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-sm font-black text-slate-800">Productos Activos</p>
                                    <p className="text-xs text-slate-500 mt-1">Activa o desactiva productos del tenant sin mezclarlo con los datos de empresa.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={openProductsModal}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:border-blue-200 hover:text-blue-700 transition-colors"
                                >
                                    <Boxes size={16} />
                                    Gestionar Productos
                                </button>
                            </div>
                            <div className="mt-4">
                                <TenantProductSummary products={formData.products} />
                            </div>
                            {canViewErpModules && tenant ? (
                                <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-start gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Puzzle size={19} /></span>
                                        <div>
                                            <p className="text-sm font-black text-slate-800">Módulos y licencias ERP</p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {hasActiveErp
                                                    ? 'Administra RRHH, Nómina, Contabilidad e integraciones adicionales.'
                                                    : 'Activa CLIC ERP y guarda el tenant para habilitar módulos adicionales.'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onOpenModuleStore(tenant)}
                                        disabled={!hasActiveErp}
                                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                    >
                                        <Puzzle size={16} />
                                        {typeof activeModuleCounts[tenant.id] === 'number'
                                            ? `Módulos ERP · ${activeModuleCounts[tenant.id]} activos`
                                            : 'Abrir módulos ERP'}
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 px-4 py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-sm transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? <><Loader2 size={18} className="animate-spin" /> Guardando...</> : 'Guardar Cambios'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>            <TenantProductsModal
                key={`edit-products-${tenant.id}-${productsModalVersion}`}
                isOpen={isProductsModalOpen}
                title="Administrar Productos del Tenant"
                tenantName={tenant.name}
                initialProducts={formData.products}
                onClose={() => setIsProductsModalOpen(false)}
                onSave={applyProducts}
            />
        </>
    );
};
