import React, { useState, useEffect } from 'react';
import { Search, Plus, Power, Edit3, Loader2, X } from 'lucide-react';
import type { Tenant } from '../types';
import { tenantService } from '../lib/tenantService';

export const Tenants: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [provisionedCredentials, setProvisionedCredentials] = useState<{
        email: string;
        tempPassword: string;
    } | null>(null);

    // Form state
    const [formData, setFormData] = useState({ name: '', email: '', taxId: '', type: 'full' as 'full' | 'pos_only', cloudSync: true });

    const getErrorMessage = (error: unknown) => {
        if (typeof error === 'string') return error;
        if (error instanceof Error) return error.message;
        if (
            typeof error === 'object'
            && error !== null
            && 'error_description' in error
            && typeof error.error_description === 'string'
        ) {
            return error.error_description;
        }
        return 'Error desconocido';
    };

    useEffect(() => {
        fetchTenants();
    }, []);

    const fetchTenants = async () => {
        setLoading(true);
        try {
            const data = await tenantService.getTenants();
            setTenants(data || []);
        } catch (err) {
            console.error('Error fetching tenants:', err);
        } finally {
            setLoading(false);
        }
    };

    const filteredTenants = tenants.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.tax_id && t.tax_id.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const toggleTenantStatus = async (tenant: Tenant) => {
        const isCurrentlyActive = tenant.status === 'ACTIVE' || tenant.status === 'TRIAL';
        const newStatusLabel = isCurrentlyActive ? 'SUSPENDER' : 'REACTIVAR';

        if (!confirm(`¿Estás seguro que deseas ${newStatusLabel} esta empresa?`)) return;

        try {
            if (isCurrentlyActive) {
                await tenantService.suspendTenant(tenant.id);
            } else {
                await tenantService.reactivateTenant(tenant.id);
            }
            await fetchTenants(); // Reload
        } catch (err) {
            console.error('Error toggling status:', err);
            alert('Hubo un error al actualizar el estatus');
        }
    };

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            // Generate basic slug from name
            const slug = formData.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

            // 1. Call the Postgres Provisioner Function
            const { tenantId, tempPassword } = await tenantService.createTenant({
                name: formData.name,
                slug,
                email: formData.email,
                plan: 'TRIAL',
                type: formData.type,
                cloudSync: formData.cloudSync,
            });

            // Update optional fields like tax_id
            if (formData.taxId) {
                await tenantService.updateTenantTaxId(tenantId, formData.taxId);
            }

            // Success cleanup
            setProvisionedCredentials({
                email: formData.email,
                tempPassword,
            });
            setFormData({ name: '', email: '', taxId: '', type: 'full', cloudSync: true });
            setIsModalOpen(false);
            await fetchTenants();

        } catch (err: unknown) {
            console.error('Error provisioning tenant:', err);
            alert('Error al aprovisionar el Tenant: ' + getErrorMessage(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE': return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase transition-colors">Activo</span>;
            case 'SUSPENDED': return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase transition-colors">Suspendido</span>;
            case 'TRIAL': return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold uppercase transition-colors">Prueba</span>;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">Gestión de Tenants</h2>
                    <p className="text-slate-500 text-sm">Administra las cuentas de clientes y empresas suscritas.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors focus:ring-4 focus:ring-blue-100"
                >
                    <Plus size={20} />
                    Nuevo Tenant
                </button>
            </div>

            {provisionedCredentials && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-800">Credenciales temporales</h3>
                            <p className="mt-1 text-sm text-emerald-700">
                                Entrega estas credenciales por un canal seguro y fuerza el cambio de contrasena en el primer acceso.
                            </p>
                            <p className="mt-3 text-sm text-slate-700">
                                <span className="font-bold">Email:</span> {provisionedCredentials.email}
                            </p>
                            <p className="text-sm text-slate-700">
                                <span className="font-bold">Clave temporal:</span> {provisionedCredentials.tempPassword}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setProvisionedCredentials(null)}
                            className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                            Ocultar
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="relative w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar compañía por nombre o RNC..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                        />
                    </div>
                    <div className="flex gap-2 text-sm text-slate-600 font-medium items-center">
                        {loading ? <Loader2 className="animate-spin text-blue-500" size={16} /> : null}
                        <span>Total: {filteredTenants.length}</span>
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
                        {filteredTenants.length === 0 && !loading && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">No se encontraron tenants.</td>
                            </tr>
                        )}
                        {filteredTenants.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-slate-800">{t.name}</div>
                                    <div className="text-xs text-slate-400 font-mono mt-0.5">{t.id}</div>
                                </td>
                                <td className="px-6 py-4 font-mono text-slate-600">{t.tax_id || 'N/A'}</td>
                                <td className="px-6 py-4 text-slate-600">{t.email}</td>
                                <td className="px-6 py-4 text-center">{getStatusBadge(t.status)}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                                            <Edit3 size={18} />
                                        </button>
                                        <button
                                            onClick={() => toggleTenantStatus(t)}
                                            className={`p-2 rounded-lg transition-colors ${t.status === 'ACTIVE' ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                            title={t.status === 'ACTIVE' ? 'Forzar Suspensión' : 'Reactivar'}
                                        >
                                            <Power size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create Tenant Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-black text-lg text-slate-800">Aprovisionar Nueva Empresa</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateTenant} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Comercial <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    placeholder="Ej. Supermercado El Sol"
                                />
                                <p className="text-xs text-slate-500 mt-1">El nombre se usará para generar el slug del esquema de base de datos.</p>
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
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Email <span className="text-red-500">*</span></label>
                                    <input
                                        required
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="admin@empresa.com"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Tipo de Solución</label>
                                    <select
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value as 'full' | 'pos_only' })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    >
                                        <option value="full">MALL POS + Cloud ERP</option>
                                        <option value="pos_only">Solo MALL POS</option>
                                    </select>
                                </div>
                                <div className="flex items-center pt-7">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className="relative flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                checked={formData.cloudSync}
                                                onChange={e => setFormData({ ...formData, cloudSync: e.target.checked })}
                                                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-colors"
                                            />
                                        </div>
                                        <span className="text-sm font-bold text-slate-700 select-none group-hover:text-blue-700 transition-colors">Activar Respaldo Cloud</span>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-sm transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <><Loader2 size={18} className="animate-spin" /> Creando Esquema...</> : 'Confirmar Registro'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
