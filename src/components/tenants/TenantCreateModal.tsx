import React, { useState } from 'react';
import { Boxes, Loader2, X } from 'lucide-react';
import type { Distributor } from '../../types';
import type { TenantProductSelection } from '../../lib/tenantProducts';
import { normalizeTenantProductSelection } from '../../lib/tenantProducts';
import { buildTenantSlug } from '../../lib/tenantSlug';
import { TenantProductsModal } from '../TenantProductsModal';
import type { TenantCreateFormData } from './types';
import { TenantProductSummary } from './TenantProductSummary';

interface TenantCreateModalProps {
    isOpen: boolean;
    formData: TenantCreateFormData;
    setFormData: React.Dispatch<React.SetStateAction<TenantCreateFormData>>;
    isSlugManuallyEdited: boolean;
    setIsSlugManuallyEdited: (value: boolean) => void;
    isSubmitting: boolean;
    distributors: Distributor[];
    distributorsLoading: boolean;
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
}

export const TenantCreateModal: React.FC<TenantCreateModalProps> = ({
    isOpen,
    formData,
    setFormData,
    isSlugManuallyEdited,
    setIsSlugManuallyEdited,
    isSubmitting,
    distributors,
    distributorsLoading,
    onClose,
    onSubmit,
}) => {
    const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);
    const [productsModalVersion, setProductsModalVersion] = useState(0);

    if (!isOpen) return null;

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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 backdrop-blur-sm sm:p-4">
                <div className="flex max-h-[calc(100vh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:max-h-[calc(100vh-2rem)]">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
                        <div>
                            <h3 className="font-black text-base text-slate-800 sm:text-lg">Aprovisionar Nueva Empresa</h3>
                            <p className="mt-0.5 text-[11px] text-slate-500">Datos de acceso, contacto y productos iniciales.</p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                            <label className="mb-1 block text-xs font-bold text-slate-700">Nombre Comercial <span className="text-red-500">*</span></label>
                            <input
                                required
                                type="text"
                                value={formData.name}
                                onChange={e => {
                                    const name = e.target.value;
                                    setFormData({
                                        ...formData,
                                        name,
                                        slug: isSlugManuallyEdited ? formData.slug : buildTenantSlug(name),
                                    });
                                }}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-blue-500"
                                placeholder="Ej. Supermercado El Sol"
                            />
                            <p className="mt-1 text-[10px] leading-tight text-slate-500">Puede repetirse; el identificador técnico debe ser único.</p>
                            </div>

                            <div>
                            <label className="mb-1 block text-xs font-bold text-slate-700">Identificador técnico <span className="text-red-500">*</span></label>
                            <input
                                required
                                type="text"
                                value={formData.slug}
                                onChange={e => {
                                    setIsSlugManuallyEdited(true);
                                    setFormData({ ...formData, slug: buildTenantSlug(e.target.value) });
                                }}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-blue-500"
                                placeholder="mercasend_srl_prod"
                            />
                            <p className="mt-1 text-[10px] leading-tight text-slate-500">Letras, números y guion bajo. Ej.: mercasend_srl_prod.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700">RNC / Cédula</label>
                                <input
                                    type="text"
                                    value={formData.taxId}
                                    onChange={e => setFormData({ ...formData, taxId: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    placeholder="Opcional"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700">Email de Acceso <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    placeholder="admin@empresa.com"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700">Persona de Contacto <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="text"
                                    value={formData.contactName}
                                    onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    placeholder="Nombre y apellido"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700">Mail de Contacto <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="email"
                                    value={formData.contactEmail}
                                    onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    placeholder="contacto@empresa.com"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700">Ciudad <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="text"
                                    value={formData.city}
                                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-blue-500"
                                    placeholder="Santo Domingo"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700">
                                    Distribuidor que Captó
                                    {distributorsLoading ? ' (cargando...)' : ''}
                                </label>
                                <select
                                    value={formData.capturedByDistributorId}
                                    onChange={e => setFormData({ ...formData, capturedByDistributorId: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Sin asignar</option>
                                    {distributors.map((distributor) => (
                                        <option key={distributor.id} value={distributor.id}>
                                            {distributor.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700">
                                    Distribuidor que da Servicio
                                    {distributorsLoading ? ' (cargando...)' : ''}
                                </label>
                                <select
                                    value={formData.servicedByDistributorId}
                                    onChange={e => setFormData({ ...formData, servicedByDistributorId: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Sin asignar</option>
                                    {distributors.map((distributor) => (
                                        <option key={distributor.id} value={distributor.id}>
                                            {distributor.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {distributors.length === 0 && !distributorsLoading && (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
                                No hay distribuidores activos. Puedes crear tenants sin asignación y completar este dato después.
                            </p>
                        )}

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black text-slate-800">Productos Activos</p>
                                    <p className="mt-0.5 text-[10px] text-slate-500">Combinación inicial de productos y addons.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={openProductsModal}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-blue-200 hover:text-blue-700"
                                >
                                    <Boxes size={14} />
                                    Gestionar
                                </button>
                            </div>
                            <div className="mt-2.5">
                                <TenantProductSummary products={formData.products} compact />
                            </div>
                        </div>
                        </div>

                        <div className="flex gap-3 border-t border-slate-100 bg-white px-5 py-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-70"
                            >
                                {isSubmitting ? <><Loader2 size={18} className="animate-spin" /> Creando Esquema...</> : 'Confirmar Registro'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>            <TenantProductsModal
                key={`create-products-${productsModalVersion}`}
                isOpen={isProductsModalOpen}
                title="Productos Iniciales del Tenant"
                initialProducts={formData.products}
                onClose={() => setIsProductsModalOpen(false)}
                onSave={applyProducts}
            />
        </>
    );
};
