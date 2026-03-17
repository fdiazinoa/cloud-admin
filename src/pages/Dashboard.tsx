import React, { useEffect, useState } from 'react';
import { Users, Server, AlertCircle, DollarSign, CheckCircle2, AlertTriangle, MonitorPlay, Clock } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { tenantService } from '../lib/tenantService';

const mockMRRData = [
    { name: 'Ene', value: 1200 },
    { name: 'Feb', value: 1800 },
    { name: 'Mar', value: 2400 },
    { name: 'Abr', value: 2900 },
    { name: 'May', value: 3800 },
    { name: 'Jun', value: 4500 },
];

export const Dashboard: React.FC = () => {
    const [stats, setStats] = useState({
        activeTenants: 0,
        suspendedTenants: 0,
        terminals: 0
    });

    useEffect(() => {
        const fetchGlobalStats = async () => {
            try {
                const nextStats = await tenantService.getDashboardStats();
                setStats(nextStats);
            } catch (e) {
                console.error("Failed to fetch dashboard stats", e);
            }
        };

        fetchGlobalStats();
    }, []);

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto w-full">
            {/* BEGIN: Top Row - Advanced Stat Cards */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Card 1: Tenants */}
                <div className="glass-card rounded-2xl p-6 relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                            <Users size={24} />
                        </div>
                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-0.5">↑ 12.5%</span>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tenants Operativos</p>
                        <h3 className="text-3xl font-bold mt-1">{stats.activeTenants}</h3>
                    </div>
                    <div className="mt-4 h-8 flex items-end gap-1 opacity-50">
                        <div className="flex-1 bg-indigo-200 h-1/2 rounded-t-sm"></div>
                        <div className="flex-1 bg-indigo-300 h-2/3 rounded-t-sm"></div>
                        <div className="flex-1 bg-indigo-400 h-3/4 rounded-t-sm"></div>
                        <div className="flex-1 bg-indigo-600 h-full rounded-t-sm"></div>
                    </div>
                </div>

                {/* Card 2: Terminals */}
                <div className="glass-card rounded-2xl p-6 relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-slate-50 rounded-xl text-slate-400">
                            <Server size={24} />
                        </div>
                        <span className="text-xs font-bold text-slate-400">0.0% vs prev.</span>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Terminales Registradas</p>
                        <h3 className="text-3xl font-bold mt-1 text-slate-400">{stats.terminals}</h3>
                    </div>
                    <div className="mt-4 h-8 flex items-end gap-1 opacity-20">
                        <div className="flex-1 bg-slate-400 h-1/4 rounded-t-sm"></div>
                        <div className="flex-1 bg-slate-400 h-1/4 rounded-t-sm"></div>
                        <div className="flex-1 bg-slate-400 h-1/4 rounded-t-sm"></div>
                        <div className="flex-1 bg-slate-400 h-1/4 rounded-t-sm"></div>
                    </div>
                </div>

                {/* Card 3: Suspended */}
                <div className="glass-card rounded-2xl p-6 relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-orange-50 rounded-xl text-orange-600">
                            <AlertCircle size={24} />
                        </div>
                        <span className="text-xs font-bold text-orange-600 flex items-center gap-0.5">↑ 100%</span>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas Suspendidas</p>
                        <h3 className="text-3xl font-bold mt-1 text-orange-600">{stats.suspendedTenants}</h3>
                    </div>
                    <div className="mt-4 h-8 flex items-end gap-1">
                        <div className="flex-1 bg-orange-100 h-1/6 rounded-t-sm"></div>
                        <div className="flex-1 bg-orange-100 h-1/6 rounded-t-sm"></div>
                        <div className="flex-1 bg-orange-100 h-1/6 rounded-t-sm"></div>
                        <div className="flex-1 bg-orange-500 h-full rounded-t-sm"></div>
                    </div>
                </div>

                {/* Card 4: MRR */}
                <div className="glass-card rounded-2xl p-6 relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                            <DollarSign size={24} />
                        </div>
                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-0.5">↑ 5.2%</span>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ingresos MRR</p>
                        <h3 className="text-3xl font-bold mt-1 text-emerald-700">$4.5k</h3>
                    </div>
                    <div className="mt-4 h-8 flex items-end gap-1 opacity-50">
                        <div className="flex-1 bg-emerald-400 h-1/2 rounded-t-sm"></div>
                        <div className="flex-1 bg-emerald-500 h-3/5 rounded-t-sm"></div>
                        <div className="flex-1 bg-emerald-600 h-4/5 rounded-t-sm"></div>
                        <div className="flex-1 bg-emerald-700 h-full rounded-t-sm"></div>
                    </div>
                </div>
            </section>
            {/* END: Top Row */}

            {/* BEGIN: Middle Section - Main Chart & Activity Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left 2/3: MRR Chart Area */}
                <div className="lg:col-span-2 glass-card rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h4 className="font-bold text-slate-800">Crecimiento MRR (Suscripciones Activas)</h4>
                            <p className="text-sm text-slate-500">Evolución de ingresos recurrentes mensuales</p>
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-bold text-slate-800">$4,500.00</span>
                            <p className="text-xs text-slate-400 font-medium">Proyección Cierre Jun</p>
                        </div>
                    </div>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={mockMRRData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontFamily: '"Public Sans", sans-serif' }}
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    formatter={(value: any) => [`$${value ?? 0}`, 'MRR']}
                                />
                                <Area
                                    type="linear"
                                    dataKey="value"
                                    stroke="#4f46e5"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorValue)"
                                    activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                                    dot={{ r: 4, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Right 1/3: Activity Feed */}
                <div className="glass-card rounded-2xl p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h4 className="font-bold text-slate-800">Feed de Actividad</h4>
                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    </div>
                    <div className="space-y-6 flex-1">
                        <div className="flex gap-4 group">
                            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100 group-hover:scale-110 transition-transform">
                                <MonitorPlay className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold">Nueva Terminal vinculada</p>
                                <p className="text-xs text-slate-500">Empresa: Restaurante Central #4</p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tight">Hace 2 mins</p>
                            </div>
                        </div>

                        <div className="flex gap-4 group">
                            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100 group-hover:scale-110 transition-transform">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold">Suscripción Pro pagada</p>
                                <p className="text-xs text-slate-500">Factura #INV-2093 - $149.00</p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tight">Hace 14 mins</p>
                            </div>
                        </div>

                        <div className="flex gap-4 group">
                            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100 group-hover:scale-110 transition-transform">
                                <AlertTriangle className="w-5 h-5 text-orange-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-orange-700">Alerta: Terminal Offline</p>
                                <p className="text-xs text-slate-500">ID: T-8829 - Local ClicPos Sur</p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tight">Hace 1 h</p>
                            </div>
                        </div>
                    </div>
                    <button className="w-full mt-6 py-2 text-xs font-bold text-slate-400 hover:text-indigo-600 border border-slate-200 rounded-lg transition-colors uppercase tracking-wider">
                        Ver registro completo
                    </button>
                </div>
            </div>
            {/* END: Middle Section */}

            {/* BEGIN: Bottom Section - Tables & Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Block A: Helpdesk Snapshot */}
                <div className="glass-card rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h4 className="font-bold text-slate-800">Helpdesk Snapshot</h4>
                        <a className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer">Gestionar Tickets</a>
                    </div>
                    <div className="overflow-hidden border border-slate-100 rounded-xl">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-slate-50/50">
                                <tr>
                                    <th className="p-3 font-semibold text-slate-500">Ticket</th>
                                    <th className="p-3 font-semibold text-slate-500 gap-1">Prioridad</th>
                                    <th className="p-3 font-semibold text-slate-500 text-right">Espera</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white/40">
                                <tr>
                                    <td className="p-3">
                                        <p className="font-medium text-slate-800">Fallo en sincronización</p>
                                        <p className="text-[10px] text-slate-400">Café del Mar (Tenant #12)</p>
                                    </td>
                                    <td className="p-3">
                                        <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold">CRÍTICA</span>
                                    </td>
                                    <td className="p-3 text-right font-medium text-slate-600">12 min</td>
                                </tr>
                                <tr>
                                    <td className="p-3">
                                        <p className="font-medium text-slate-800">Configuración de Impresora</p>
                                        <p className="text-[10px] text-slate-400">Hotel Paradiso (Tenant #09)</p>
                                    </td>
                                    <td className="p-3">
                                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold">MEDIA</span>
                                    </td>
                                    <td className="p-3 text-right font-medium text-slate-600">45 min</td>
                                </tr>
                                <tr>
                                    <td className="p-3">
                                        <p className="font-medium text-slate-800">Solicitud de Nueva Licencia</p>
                                        <p className="text-[10px] text-slate-400">Distribuidora Gomez (Tenant #45)</p>
                                    </td>
                                    <td className="p-3">
                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">BAJA</span>
                                    </td>
                                    <td className="p-3 text-right font-medium text-slate-600">1h 12m</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Block B: Alertas de Vencimiento */}
                <div className="glass-card rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h4 className="font-bold text-slate-800">Alertas de Vencimiento</h4>
                        <div className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded font-bold">5 PRÓXIMOS</div>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-white/50 border border-slate-100 rounded-xl hover:border-indigo-200 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">PM</div>
                                <div>
                                    <p className="text-xs font-bold text-slate-800">Pizzería Napoli</p>
                                    <p className="text-[10px] text-orange-600 font-medium">Vence en 2 días</p>
                                </div>
                            </div>
                            <button className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 uppercase tracking-wide">
                                <Clock size={12} strokeWidth={2.5} />
                                Recordar
                            </button>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-white/50 border border-slate-100 rounded-xl hover:border-indigo-200 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">FB</div>
                                <div>
                                    <p className="text-xs font-bold text-slate-800">Fashion Boutique</p>
                                    <p className="text-[10px] text-orange-600 font-medium">Vence en 3 días</p>
                                </div>
                            </div>
                            <button className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 uppercase tracking-wide">
                                <Clock size={12} strokeWidth={2.5} />
                                Recordar
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white/50 border border-slate-100 rounded-xl opacity-60 grayscale">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">SM</div>
                                <div>
                                    <p className="text-xs font-bold text-slate-800">Supermarket XYZ</p>
                                    <p className="text-[10px] text-slate-400 font-medium">Vence en 7 días</p>
                                </div>
                            </div>
                            <button className="bg-slate-100 text-slate-400 px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-not-allowed uppercase tracking-wide">
                                Enviado
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {/* END: Bottom Section */}
        </div>
    );
};
