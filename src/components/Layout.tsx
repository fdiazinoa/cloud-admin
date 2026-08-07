import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, BookOpen, CalendarDays, ClipboardList, LayoutDashboard, Users, ShieldPlus, BadgeDollarSign, Headset, LogOut, Menu, Settings, Smartphone, Lightbulb, UserCog, X } from 'lucide-react';

interface LayoutProps {
    adminName?: string | null;
    adminEmail?: string | null;
    adminRole?: string | null;
    signingOut?: boolean;
    onSignOut: () => void;
}

interface SupportCenterHeaderStats {
    open: number;
    critical: number;
    email: number;
    unassigned: number;
    filterStatus: string;
    filterSource: string;
    quickFilter: 'none' | 'critical' | 'unassigned';
}

const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/tenants', label: 'Tenants', icon: Users },
    { path: '/plans', label: 'Planes SaaS', icon: BadgeDollarSign },
    { path: '/pos-apk', label: 'APK POS', icon: Smartphone },
    { path: '/support', label: 'Helpdesk & Soporte', icon: Headset },
    { path: '/conocimiento', label: 'Manuales y videos', icon: BookOpen },
    { path: '/calendario', label: 'Implementaciones', icon: CalendarDays },
    { path: '/mejoras', label: 'Mejoras solicitadas', icon: Lightbulb },
    { path: '/solicitudes-internas', label: 'Solicitudes internas', icon: ClipboardList },
    { path: '/configuracion', label: 'Configuración', icon: Settings },
    { path: '/observabilidad', label: 'Observabilidad', icon: Activity },
    { path: '/accesos', label: 'Usuarios y perfiles', icon: UserCog },
    { path: '/kill-switch', label: 'Kill Switch', icon: ShieldPlus },
];

function getInitials(name?: string | null, email?: string | null) {
    const source = name?.trim() || email?.split('@')[0] || 'AD';
    return source
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'AD';
}

export const Layout: React.FC<LayoutProps> = ({ adminName, adminEmail, adminRole, signingOut = false, onSignOut }) => {
    const location = useLocation();
    const isImmersiveWorkspace = location.pathname === '/support';
    const isSupportRoute = location.pathname === '/support';
    const [supportHeaderStats, setSupportHeaderStats] = useState<SupportCenterHeaderStats | null>(null);
    const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
    const currentLabel = navItems.find((item) => item.path === location.pathname)?.label || 'CLIC-CLOUD';

    useEffect(() => {
        const handleSupportHeaderStats = (event: Event) => {
            const customEvent = event as CustomEvent<SupportCenterHeaderStats>;
            if (customEvent.detail) {
                setSupportHeaderStats(customEvent.detail);
            }
        };

        const clearSupportHeaderStats = () => {
            setSupportHeaderStats(null);
        };

        window.addEventListener('support-command-center-stats', handleSupportHeaderStats);

        return () => {
            window.removeEventListener('support-command-center-stats', handleSupportHeaderStats);
            clearSupportHeaderStats();
        };
    }, [location.pathname]);

    const triggerSupportQuickFilter = (action: 'open' | 'critical' | 'email' | 'unassigned') => {
        window.dispatchEvent(new CustomEvent('support-command-center-quick-filter', { detail: { action } }));
    };

    return (
        <div className="bg-slate-50 text-slate-900 antialiased flex h-screen overflow-hidden font-['Public_Sans']">
            {/* BEGIN: Navigation Sidebar */}
            <aside className="hidden h-screen w-64 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-white lg:flex">
                <div className="p-6">
                    <h1 className="text-xl font-bold tracking-tight text-indigo-400">CLIC-CLOUD</h1>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">Super Admin</p>
                </div>
                <nav className="flex-1 space-y-1 overflow-y-auto px-4 pb-4">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    isActive 
                                    ? 'bg-indigo-600 text-white' 
                                    : 'text-slate-300 hover:bg-slate-800'
                                }`
                            }
                        >
                            <item.icon className="w-5 h-5" />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
                <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-xl mb-4">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold">{getInitials(adminName, adminEmail)}</div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-xs font-semibold truncate">{adminEmail || 'Sin correo'}</p>
                            <p className="text-[10px] text-slate-400 truncate">{adminRole || 'Cloud Admin'}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onSignOut}
                        disabled={signingOut}
                        className="flex items-center gap-3 text-slate-400 hover:text-white disabled:opacity-60 w-full px-2 py-2 transition-colors text-sm font-medium"
                    >
                        <LogOut size={16} />
                        <span>{signingOut ? 'Cerrando...' : 'Cerrar Sesión'}</span>
                    </button>
                </div>
            </aside>
            {/* END: Navigation Sidebar */}

            {mobileNavigationOpen ? (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <button type="button" aria-label="Cerrar navegación" onClick={() => setMobileNavigationOpen(false)} className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
                    <aside className="relative flex h-full w-[min(86vw,320px)] flex-col border-r border-slate-800 bg-slate-900 text-white shadow-2xl">
                        <div className="flex items-center justify-between p-5">
                            <div><h1 className="text-lg font-black tracking-tight text-indigo-400">CLIC-CLOUD</h1><p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Cloud Admin</p></div>
                            <button type="button" onClick={() => setMobileNavigationOpen(false)} className="rounded-lg border border-slate-700 p-2 text-slate-300"><X size={18} /></button>
                        </div>
                        <nav className="flex-1 space-y-1 overflow-y-auto px-4 pb-4">
                            {navItems.map((item) => (
                                <NavLink key={item.path} to={item.path} end={item.path === '/'} onClick={() => setMobileNavigationOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                                    <item.icon className="h-5 w-5" />{item.label}
                                </NavLink>
                            ))}
                        </nav>
                        <div className="border-t border-slate-800 p-4">
                            <p className="truncate text-xs font-bold">{adminEmail || 'Sin correo'}</p><p className="mt-1 truncate text-[10px] text-slate-400">{adminRole || 'Cloud Admin'}</p>
                            <button type="button" onClick={onSignOut} disabled={signingOut} className="mt-3 flex w-full items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200"><LogOut size={16} />{signingOut ? 'Cerrando...' : 'Cerrar sesión'}</button>
                        </div>
                    </aside>
                </div>
            ) : null}

            {/* BEGIN: Main Content Container */}
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {/* BEGIN: Slim Header */}
                <header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur-md sm:px-6 xl:px-8">
                    <button type="button" onClick={() => setMobileNavigationOpen(true)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm lg:hidden" aria-label="Abrir navegación"><Menu size={19} /></button>
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                        <h2 className="shrink-0 truncate text-base font-black text-slate-800 sm:text-lg">{currentLabel}</h2>

                        {isSupportRoute && supportHeaderStats ? (
                            <div className="ml-auto flex min-w-0 items-center gap-2 overflow-x-auto py-1">
                                <button
                                    type="button"
                                    onClick={() => triggerSupportQuickFilter('open')}
                                    className={`h-9 rounded-lg border px-2.5 text-center text-xs font-bold uppercase transition-colors ${supportHeaderStats.filterStatus === 'Abierto' && supportHeaderStats.quickFilter === 'none' ? 'border-orange-300 bg-orange-100 text-orange-700' : 'border-orange-100 bg-orange-50 hover:border-orange-200 text-orange-600'}`}
                                >
                                    <span className="font-bold text-sm">{supportHeaderStats.open}</span> Abiertos
                                </button>
                                <button
                                    type="button"
                                    onClick={() => triggerSupportQuickFilter('critical')}
                                    className={`h-9 rounded-lg border px-2.5 text-center text-xs font-bold uppercase transition-colors ${supportHeaderStats.quickFilter === 'critical' ? 'border-red-300 bg-red-100 text-red-700' : 'border-red-100 bg-red-50 hover:border-red-200 text-red-600'}`}
                                >
                                    <span className="font-bold text-sm">{supportHeaderStats.critical}</span> Críticos
                                </button>
                                <button
                                    type="button"
                                    onClick={() => triggerSupportQuickFilter('email')}
                                    className={`h-9 rounded-lg border px-2.5 text-center text-xs font-bold uppercase transition-colors ${supportHeaderStats.filterSource === 'Email' && supportHeaderStats.quickFilter === 'none' ? 'border-violet-300 bg-violet-100 text-violet-700' : 'border-violet-100 bg-violet-50 hover:border-violet-200 text-violet-600'}`}
                                >
                                    <span className="font-bold text-sm">{supportHeaderStats.email}</span> Email
                                </button>
                                <button
                                    type="button"
                                    onClick={() => triggerSupportQuickFilter('unassigned')}
                                    className={`h-9 rounded-lg border px-2.5 text-center text-xs font-bold uppercase transition-colors ${supportHeaderStats.quickFilter === 'unassigned' ? 'border-slate-400 bg-slate-200 text-slate-700' : 'border-slate-200 bg-slate-50 hover:border-slate-300 text-slate-600'}`}
                                >
                                    <span className="font-bold text-sm">{supportHeaderStats.unassigned}</span> Asignar
                                </button>
                            </div>
                        ) : null}
                    </div>
                </header>
                {/* END: Slim Header */}
                
                <div className={`min-h-0 flex-1 p-0 ${isImmersiveWorkspace ? 'overflow-hidden' : 'overflow-auto'}`}>
                    <Outlet />
                </div>
            </main>
            {/* END: Main Content Container */}
        </div>
    );
};
