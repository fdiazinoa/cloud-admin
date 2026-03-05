import React, { useEffect, useState } from 'react';
import { Users, Server, AlertCircle, DollarSign } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { tenantService } from '../lib/tenantService';

const mockMRRData = [
    { name: 'Ene', value: 1200 },
    { name: 'Feb', value: 1900 },
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
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tenants Operativos</p>
                            <h3 className="text-3xl font-black text-slate-800">{stats.activeTenants}</h3>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                            <Users size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Terminales Registrados</p>
                            <h3 className="text-3xl font-black text-slate-800">{stats.terminals}</h3>
                        </div>
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Server size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cuentas Suspendidas</p>
                            <h3 className="text-3xl font-black text-red-600">{stats.suspendedTenants}</h3>
                        </div>
                        <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                            <AlertCircle size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ingresos MRR</p>
                            <h3 className="text-3xl font-black text-emerald-600">$4.5k</h3>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                            <DollarSign size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-6">Crecimiento MRR (Suscripciones Activas)</h3>
                <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={mockMRRData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value) => [`$${value}`, 'MRR']}
                            />
                            <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
