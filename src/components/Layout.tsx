import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ShieldAlert, BadgeDollarSign, LogOut, Headset } from 'lucide-react';

const navItems = [
    { path: '/', label: 'Global Dashboard', icon: LayoutDashboard },
    { path: '/tenants', label: 'Gestión de Tenants', icon: Users },
    { path: '/plans', label: 'Planes SaaS', icon: BadgeDollarSign },
    { path: '/support', label: 'Helpdesk & Soporte', icon: Headset },
    { path: '/kill-switch', label: 'Kill Switch', icon: ShieldAlert },
];

export const Layout: React.FC = () => {
    return (
        <div className="flex h-screen bg-slate-50 text-slate-900">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between">
                <div className="p-6">
                    <div className="flex items-center gap-2 mb-8 text-blue-400">
                        <ShieldAlert size={28} />
                        <h1 className="text-xl font-black uppercase tracking-wider text-white">CLIC Admin</h1>
                    </div>

                    <nav className="space-y-2">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.path === '/'}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`
                                }
                            >
                                <item.icon size={20} />
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className="p-6 border-t border-slate-800">
                    <button className="flex items-center gap-3 text-slate-400 hover:text-white w-full px-4 py-2 transition-colors">
                        <LogOut size={20} />
                        <span className="font-medium">Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800">Super Admin Console</h2>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                            AD
                        </div>
                        <span className="text-sm font-medium text-slate-600">admin@clicpos.com</span>
                    </div>
                </header>
                <div className="flex-1 overflow-auto p-0">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};
