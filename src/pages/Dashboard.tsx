import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, HelpCircle, Server, ShieldAlert, Users } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { tenantService, type DashboardStats } from '../lib/tenantService';

const emptyStats: DashboardStats = {
    totalTenants: 0,
    activeTenants: 0,
    trialTenants: 0,
    suspendedTenants: 0,
    terminals: 0,
    activeSubscriptions: 0,
    openTickets: 0,
    criticalTickets: 0,
    tenantGrowth: [],
    recentTickets: [],
    expiringSubscriptions: [],
    lastUpdatedAt: new Date().toISOString(),
};

function formatInteger(value: number): string {
    return new Intl.NumberFormat('es-DO').format(value);
}

function formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-DO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(value));
}

function formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('es-DO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

function formatRelativeAge(value: string): string {
    const diffMs = Date.now() - new Date(value).getTime();
    const minutes = Math.max(0, Math.floor(diffMs / 60000));

    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;

    const days = Math.floor(hours / 24);
    return `Hace ${days} d`;
}

function priorityClass(priority: string): string {
    const normalized = priority.toLowerCase();

    if (normalized.startsWith('cr')) return 'bg-red-50 text-red-600';
    if (normalized === 'alta') return 'bg-orange-50 text-orange-600';
    if (normalized === 'media') return 'bg-blue-50 text-blue-600';

    return 'bg-slate-100 text-slate-600';
}

export const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<DashboardStats>(emptyStats);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const fetchGlobalStats = async () => {
            try {
                const nextStats = await tenantService.getDashboardStats();
                if (!mounted) return;

                setStats(nextStats);
                setErrorMessage(null);
            } catch (error) {
                console.error('Failed to fetch dashboard stats', error);
                if (mounted) setErrorMessage('No se pudo cargar el Dashboard desde Supabase.');
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        fetchGlobalStats();

        return () => {
            mounted = false;
        };
    }, []);

    const activeOperations = stats.activeTenants + stats.trialTenants;

    return (
        <div className="space-y-6">
            {errorMessage && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {errorMessage}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tenants Activos</p>
                            <h3 className="text-3xl font-black text-slate-800">{isLoading ? '...' : formatInteger(stats.activeTenants)}</h3>
                            <p className="text-xs text-slate-500 mt-2">Total registrados: {formatInteger(stats.totalTenants)}</p>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                            <Users size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">En Prueba</p>
                            <h3 className="text-3xl font-black text-amber-600">{isLoading ? '...' : formatInteger(stats.trialTenants)}</h3>
                            <p className="text-xs text-slate-500 mt-2">Operativos: {formatInteger(activeOperations)}</p>
                        </div>
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                            <Clock size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cuentas Suspendidas</p>
                            <h3 className="text-3xl font-black text-red-600">{isLoading ? '...' : formatInteger(stats.suspendedTenants)}</h3>
                            <p className="text-xs text-slate-500 mt-2">Bloqueadas desde landlord.tenants</p>
                        </div>
                        <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                            <AlertCircle size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Terminales POS</p>
                            <h3 className="text-3xl font-black text-indigo-600">{isLoading ? '...' : formatInteger(stats.terminals)}</h3>
                            <p className="text-xs text-slate-500 mt-2">Registradas en public.terminals</p>
                        </div>
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Server size={24} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Altas de Tenants</h3>
                            <p className="text-sm text-slate-500">Últimos 6 meses según fecha de creación real</p>
                        </div>
                        <p className="text-xs font-semibold text-slate-400">Actualizado {formatDateTime(stats.lastUpdatedAt)}</p>
                    </div>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.tenantGrowth} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="tenantGrowthValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: number | string | undefined) => [formatInteger(Number(value ?? 0)), 'Altas']}
                                />
                                <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#tenantGrowthValue)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Operación Actual</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <span className="text-sm font-semibold text-slate-600">Suscripciones activas</span>
                            <span className="text-lg font-black text-slate-900">{formatInteger(stats.activeSubscriptions)}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <span className="text-sm font-semibold text-slate-600">Tickets abiertos</span>
                            <span className="text-lg font-black text-slate-900">{formatInteger(stats.openTickets)}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <span className="text-sm font-semibold text-slate-600">Tickets críticos</span>
                            <span className="text-lg font-black text-red-600">{formatInteger(stats.criticalTickets)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-600">Tenants operativos</span>
                            <span className="text-lg font-black text-emerald-600">{formatInteger(activeOperations)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800">Tickets Recientes</h3>
                        <Link to="/support" className="text-xs font-bold text-indigo-600 hover:underline">
                            Gestionar Tickets
                        </Link>
                    </div>

                    {stats.recentTickets.length === 0 ? (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
                            <HelpCircle size={18} />
                            No hay tickets recientes disponibles.
                        </div>
                    ) : (
                        <div className="overflow-hidden border border-slate-100 rounded-xl">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="bg-slate-50/70">
                                    <tr>
                                        <th className="p-3 font-semibold text-slate-500">Ticket</th>
                                        <th className="p-3 font-semibold text-slate-500">Prioridad</th>
                                        <th className="p-3 font-semibold text-slate-500 text-right">Recibido</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stats.recentTickets.map((ticket) => (
                                        <tr key={ticket.id}>
                                            <td className="p-3">
                                                <p className="font-medium text-slate-800">{ticket.subject}</p>
                                                <p className="text-[10px] text-slate-400">{ticket.tenantName}</p>
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${priorityClass(ticket.priority)}`}>
                                                    {ticket.priority}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right font-medium text-slate-600">{formatRelativeAge(ticket.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800">Vencimientos de Suscripción</h3>
                        <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                            {formatInteger(stats.expiringSubscriptions.length)} PRÓXIMOS
                        </span>
                    </div>

                    {stats.expiringSubscriptions.length === 0 ? (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
                            <CheckCircle2 size={18} />
                            No hay vencimientos registrados en los próximos 30 días.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {stats.expiringSubscriptions.map((subscription) => (
                                <div key={`${subscription.tenantId}-${subscription.endDate}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                                            {subscription.tenantName.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-bold text-slate-800">{subscription.tenantName}</p>
                                            <p className="text-[10px] font-medium text-orange-600">
                                                {subscription.planName} vence en {subscription.daysRemaining} día{subscription.daysRemaining === 1 ? '' : 's'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                                        <ShieldAlert size={14} />
                                        {formatDate(subscription.endDate)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
