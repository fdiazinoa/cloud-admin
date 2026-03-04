import React, { useEffect, useState } from 'react';
import { Skull, AlertTriangle, Key, ShieldAlert, Loader2 } from 'lucide-react';
import { tenantService } from '../lib/tenantService';

export const KillSwitch: React.FC = () => {
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const fetchTenants = async () => {
        try {
            const data = await tenantService.getTenants();
            setTenants(data);
        } catch (error) {
            console.error("Failed to load tenants", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTenants();
    }, []);

    const handleToggleStatus = async (id: string, currentStatus: string) => {
        const isCurrentlyActive = currentStatus === 'ACTIVE' || currentStatus === 'TRIAL';
        setActionLoading(id);
        try {
            if (isCurrentlyActive) {
                await tenantService.suspendTenant(id);
            } else {
                await tenantService.reactivateTenant(id);
            }
            await fetchTenants();
        } catch (error) {
            console.error("Action failed", error);
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl">
            <div>
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <Skull className="text-red-500" size={28} />
                    Central de Activaciones (Kill Switch)
                </h2>
                <p className="text-slate-500 text-sm mt-1">Bloqueo remoto y control de licenciamiento de dispositivos Terminales POS.</p>
            </div>

            <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex gap-4 items-start">
                <AlertTriangle className="text-red-600 shrink-0 mt-0.5" />
                <div>
                    <h4 className="font-bold text-red-800">Zona de Peligro Global</h4>
                    <p className="text-red-600 text-sm mt-1">Suspender una empresa desconectará inmediatamente todos sus terminales POS, impidiendo la venta y sincronización. Usa esta herramienta solo ante faltas de pago graves o violaciones de TdS.</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-blue-500" size={40} />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {tenants.map((tenant) => (
                        <div key={tenant.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-slate-800">{tenant.name}</h3>
                                    <p className="text-slate-500 text-xs">ID: {tenant.id.substring(0, 8)}...</p>
                                    <p className="text-slate-400 text-[10px] mt-0.5 font-mono">{tenant.email}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${(tenant.status === 'ACTIVE' || tenant.status === 'TRIAL')
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}>
                                    {(tenant.status === 'ACTIVE' || tenant.status === 'TRIAL') ? 'Servicio Activo' : 'Suspendido'}
                                </span>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500 uppercase tracking-wider font-semibold">Tipo</span>
                                    <span className="font-bold text-slate-700 uppercase">{tenant.type}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500 uppercase tracking-wider font-semibold">Respaldo Cloud</span>
                                    <span className={`font-bold ${tenant.cloud_sync ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {tenant.cloud_sync ? 'HABILITADO' : 'DESACTIVADO'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs pt-2 border-t border-slate-50">
                                    <span className="text-slate-400 italic">Estado de Seguridad</span>
                                    <span className={`font-bold ${(tenant.status === 'ACTIVE' || tenant.status === 'TRIAL') ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {(tenant.status === 'ACTIVE' || tenant.status === 'TRIAL') ? 'VALIDADO' : 'BLOQUEADO'}
                                    </span>
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100">
                                <button
                                    onClick={() => handleToggleStatus(tenant.id, tenant.status)}
                                    disabled={actionLoading === tenant.id}
                                    className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${(tenant.status === 'ACTIVE' || tenant.status === 'TRIAL')
                                            ? 'bg-red-600 hover:bg-red-700 text-white'
                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                        } disabled:opacity-50`}
                                >
                                    {actionLoading === tenant.id ? (
                                        <Loader2 className="animate-spin" size={18} />
                                    ) : (tenant.status === 'ACTIVE' || tenant.status === 'TRIAL') ? (
                                        <><ShieldAlert size={18} /> SUSPENDER SERVICIO</>
                                    ) : (
                                        <><Key size={18} /> REACTIVAR SERVICIO</>
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}

                    {tenants.length === 0 && (
                        <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
                            <p className="text-slate-400 font-medium">No hay tenants registrados en la base de datos.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
