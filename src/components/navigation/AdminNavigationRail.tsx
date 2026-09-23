import { Search, Settings } from 'lucide-react';
import type { AdminNavigationModule } from '../../lib/adminNavigation';

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
    const source = name?.trim() || email?.split('@')[0] || 'AD';
    return source
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'AD';
}

interface AdminNavigationRailProps {
    modules: AdminNavigationModule[];
    activeModuleId: string | null;
    overlayModuleId: string | null;
    onToggleModule: (moduleId: string) => void;
    onOpenSearch: () => void;
    onOpenSettings: () => void;
    userName: string | null;
    userEmail: string | null;
    onOpenUserMenu: () => void;
}

export function AdminNavigationRail({
    modules,
    activeModuleId,
    overlayModuleId,
    onToggleModule,
    onOpenSearch,
    onOpenSettings,
    userName,
    userEmail,
    onOpenUserMenu,
}: AdminNavigationRailProps) {
    return (
        <nav
            aria-label="Navegación principal"
            className="hidden h-full w-[72px] shrink-0 flex-col border-r border-slate-800 bg-[#0F172A] text-slate-400 md:flex"
        >
            <div className="flex flex-col items-center gap-2 px-2 pb-2 pt-3">
                <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-black text-white shadow-lg shadow-blue-900/40"
                    title="CLIC-CLOUD · Cloud-Admin"
                    aria-label="CLIC-CLOUD · Cloud-Admin"
                >
                    CC
                </div>
                <button
                    type="button"
                    onClick={onOpenSearch}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                    title="Buscar (⌘K / Ctrl+K)"
                    aria-label="Abrir búsqueda global (⌘K / Ctrl+K)"
                >
                    <Search size={19} />
                </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-2">
                {modules.map((module) => {
                    const isActive = activeModuleId === module.id;
                    const isOpen = overlayModuleId === module.id;
                    return (
                        <button
                            key={module.id}
                            type="button"
                            onClick={() => onToggleModule(module.id)}
                            className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors motion-reduce:transition-none ${
                                isActive
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:bg-white/10 hover:text-white'
                            }`}
                            title={module.label}
                            aria-label={module.label}
                            aria-current={isActive ? 'page' : undefined}
                            aria-expanded={isOpen}
                            aria-controls="admin-module-overlay"
                        >
                            {isActive && (
                                <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-blue-400" aria-hidden="true" />
                            )}
                            <module.icon size={20} aria-hidden="true" />
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-col items-center gap-1 px-2 py-3">
                <button
                    type="button"
                    onClick={onOpenSettings}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                    title="Configuración"
                    aria-label="Configuración"
                >
                    <Settings size={19} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={onOpenUserMenu}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700/70 text-xs font-black text-white ring-1 ring-white/10 transition-colors hover:ring-white/30"
                    title={userEmail || 'Cuenta de usuario'}
                    aria-label="Abrir menú de cuenta"
                >
                    {getInitials(userName, userEmail)}
                </button>
            </div>
        </nav>
    );
}
