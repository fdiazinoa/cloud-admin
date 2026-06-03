import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, LayoutDashboard, Users, ShieldPlus, BadgeDollarSign, Headset, LogOut, Settings, Smartphone, Lightbulb, UserCog } from 'lucide-react';

interface LayoutProps {
    adminName?: string | null;
    adminEmail?: string | null;
    adminRole?: string | null;
    signingOut?: boolean;
    onSignOut: () => void;
}

const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/tenants', label: 'Tenants', icon: Users },
    { path: '/plans', label: 'Planes SaaS', icon: BadgeDollarSign },
    { path: '/pos-apk', label: 'APK POS', icon: Smartphone },
    { path: '/support', label: 'Helpdesk & Soporte', icon: Headset },
    { path: '/mejoras', label: 'Mejoras solicitadas', icon: Lightbulb },
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

    return (
        <div className="bg-slate-50 text-slate-900 antialiased min-h-screen flex font-['Public_Sans']">
            {/* BEGIN: Navigation Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex-shrink-0 hidden lg:flex flex-col border-r border-slate-800">
                <div className="p-6">
                    <h1 className="text-xl font-bold tracking-tight text-indigo-400">CLIC-CLOUD</h1>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">Super Admin</p>
                </div>
                <nav className="flex-1 px-4 space-y-1">
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

            {/* BEGIN: Main Content Container */}
            <main className={`flex min-w-0 flex-1 flex-col ${isImmersiveWorkspace ? 'min-h-0 overflow-hidden' : 'overflow-auto'}`}>
                {/* BEGIN: Slim Header */}
                <header className="h-16 border-b border-slate-200 bg-white/80 sticky top-0 z-10 flex items-center justify-between px-8 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold text-slate-800">Console Overview</h2>
                        <div className="h-6 w-px bg-slate-200"></div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-500" htmlFor="periodo">Periodo:</label>
                            <select
                                className="text-xs font-semibold border-none bg-slate-100 rounded-md focus:ring-indigo-500 py-1 pl-2 pr-8 outline-none"
                                id="periodo"
                                defaultValue="30d"
                            >
                                <option value="hoy">Hoy</option>
                                <option value="7d">7d</option>
                                <option value="30d">30d</option>
                                <option value="ano">Año</option>
                            </select>
                        </div>
                    </div>
                </header>
                {/* END: Slim Header */}
                
                <div className={`flex-1 p-0 ${isImmersiveWorkspace ? 'min-h-0 overflow-hidden' : 'overflow-auto'}`}>
                    <Outlet />
                </div>
            </main>
            {/* END: Main Content Container */}
        </div>
    );
};
