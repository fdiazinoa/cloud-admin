import React from 'react';
import { Skull, AlertTriangle, Key, ShieldAlert } from 'lucide-react';

export const KillSwitch: React.FC = () => {
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Simulate a specific action card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-slate-800">Ferretería Industrial</h3>
                            <p className="text-slate-500 text-sm">Tenant ID: e-4938210</p>
                        </div>
                        <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Servicio Activo</span>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Terminales Operativos</span>
                            <span className="font-bold text-slate-800">4 / 5 Límite</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Última Sincronización</span>
                            <span className="font-bold text-slate-800">Hace 2 horas</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Vencimiento Licencia</span>
                            <span className="font-bold text-slate-800">12 Dic 2026</span>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                        <button className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
                            <ShieldAlert size={18} />
                            SUSPENDER SERVICIO
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-slate-800">Boutique Camila</h3>
                            <p className="text-slate-500 text-sm">Tenant ID: e-1928374</p>
                        </div>
                        <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Suspendido</span>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Terminales Operativos</span>
                            <span className="font-bold text-slate-800">2 / 2 Límite</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Razón de Bloqueo</span>
                            <span className="font-bold text-red-600">Por Falta de Pago</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Fecha de Corte</span>
                            <span className="font-bold text-slate-800">Hace 3 días</span>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                        <button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
                            <Key size={18} />
                            REACTIVAR SERVICIO
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
