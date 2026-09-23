import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import type { CloudAdminPermissions } from '../types';
import { hasCloudAdminPermission } from '../lib/cloudAdminPermissions';
import { adminNavigationModules, findActiveModule } from '../lib/adminNavigation';
import { AdminNavigationProvider } from '../lib/adminNavigationContext';
import { useAdminNavigation } from '../lib/adminNavigationStore';
import { AdminNavigationRail } from './navigation/AdminNavigationRail';
import { AdminModuleOverlay } from './navigation/AdminModuleOverlay';
import { GlobalCommandMenu } from './navigation/GlobalCommandMenu';
import { AdminUserMenu } from './navigation/AdminUserMenu';
import { ChangePasswordDialog } from './ChangePasswordDialog';

interface LayoutProps {
    adminName?: string | null;
    adminEmail?: string | null;
    adminRole?: string | null;
    permissions?: Partial<CloudAdminPermissions> | null;
    signingOut?: boolean;
    onSignOut: () => void;
}

export const Layout: React.FC<LayoutProps> = (props) => {
    const userKey = props.adminEmail?.trim().toLowerCase() || props.adminName?.trim() || 'admin';
    return (
        <AdminNavigationProvider userKey={userKey}>
            <AppShell {...props} />
        </AdminNavigationProvider>
    );
};

function AppShell({ adminName, adminEmail, adminRole, permissions, signingOut = false, onSignOut }: LayoutProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const {
        overlayModuleId,
        toggleOverlay,
        closeOverlay,
        pinned,
        togglePinned,
        favorites,
        isFavorite,
        toggleFavorite,
        recents,
        recordVisit,
    } = useAdminNavigation();

    const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
    const [changePasswordOpen, setChangePasswordOpen] = useState(false);
    const [commandMenuOpen, setCommandMenuOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const allowed = useCallback(
        (permission: Parameters<typeof hasCloudAdminPermission>[1]) => hasCloudAdminPermission(permissions, permission),
        [permissions],
    );

    const modules = useMemo(
        () => adminNavigationModules.filter((module) => allowed(module.permission)),
        [allowed],
    );

    const activeModule = useMemo(() => findActiveModule(location.pathname), [location.pathname]);
    const overlayModule = useMemo(
        () => modules.find((module) => module.id === overlayModuleId) ?? null,
        [modules, overlayModuleId],
    );

    const isImmersiveWorkspace = location.pathname === '/support';
    const currentLabel = activeModule?.label || 'CLIC-CLOUD';

    const navigateTo = useCallback((path: string) => {
        navigate(path);
        closeOverlay();
        setCommandMenuOpen(false);
        setUserMenuOpen(false);
        setMobileNavigationOpen(false);
    }, [navigate, closeOverlay]);

    // Registra la visita (recientes) en cada cambio de ruta.
    useEffect(() => {
        recordVisit(location.pathname);
    }, [location.pathname, recordVisit]);

    // Cierra el overlay al cambiar de ruta, salvo que esté fijado.
    useEffect(() => {
        if (!pinned) closeOverlay();
    }, [location.pathname, pinned, closeOverlay]);

    // Búsqueda global: ⌘K (macOS) / Ctrl+K (Windows).
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setCommandMenuOpen((current) => !current);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Escape cierra overlay, menú de usuario y drawer móvil.
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setUserMenuOpen(false);
            setMobileNavigationOpen(false);
            closeOverlay();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [closeOverlay]);

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50 font-['Public_Sans'] text-slate-900 antialiased">
            <AdminNavigationRail
                modules={modules}
                activeModuleId={activeModule?.id ?? null}
                overlayModuleId={overlayModuleId}
                onToggleModule={toggleOverlay}
                onOpenSearch={() => setCommandMenuOpen(true)}
                onOpenSettings={() => navigateTo('/configuracion')}
                userName={adminName ?? null}
                userEmail={adminEmail ?? null}
                onOpenUserMenu={() => setUserMenuOpen((current) => !current)}
            />

            {overlayModule ? (
                <AdminModuleOverlay
                    key={overlayModule.id}
                    module={overlayModule}
                    activePath={location.pathname}
                    isFavorite={isFavorite}
                    toggleFavorite={toggleFavorite}
                    pinned={pinned}
                    onTogglePin={togglePinned}
                    onClose={closeOverlay}
                    onNavigate={navigateTo}
                />
            ) : null}

            <AdminUserMenu
                open={userMenuOpen}
                onClose={() => setUserMenuOpen(false)}
                userName={adminName ?? null}
                userEmail={adminEmail ?? null}
                userRole={adminRole ?? null}
                signingOut={signingOut}
                onChangePassword={() => setChangePasswordOpen(true)}
                onSignOut={onSignOut}
            />

            {commandMenuOpen ? (
                <GlobalCommandMenu
                    onClose={() => setCommandMenuOpen(false)}
                    onNavigate={navigateTo}
                    allowed={allowed}
                    favorites={favorites}
                    recents={recents}
                />
            ) : null}

            {mobileNavigationOpen ? (
                <div className="fixed inset-0 z-50 md:hidden">
                    <button
                        type="button"
                        aria-label="Cerrar navegación"
                        onClick={() => setMobileNavigationOpen(false)}
                        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
                    />
                    <aside className="relative flex h-full w-[min(86vw,320px)] flex-col border-r border-slate-800 bg-[#0F172A] text-white shadow-2xl">
                        <div className="flex items-center justify-between p-5">
                            <div>
                                <h1 className="text-lg font-black tracking-tight text-blue-400">CLIC-CLOUD</h1>
                                <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Cloud Admin</p>
                            </div>
                            <button type="button" onClick={() => setMobileNavigationOpen(false)} className="rounded-lg border border-slate-700 p-2 text-slate-300" aria-label="Cerrar navegación">
                                <X size={18} />
                            </button>
                        </div>
                        <nav className="flex-1 space-y-1 overflow-y-auto px-4 pb-4" aria-label="Navegación principal">
                            {modules.map((module) => {
                                const isActive = activeModule?.id === module.id;
                                return (
                                    <button
                                        key={module.id}
                                        type="button"
                                        onClick={() => navigateTo(module.path)}
                                        className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                                            isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                                        }`}
                                        aria-current={isActive ? 'page' : undefined}
                                    >
                                        <module.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                                        <span className="flex-1 truncate">{module.label}</span>
                                    </button>
                                );
                            })}
                        </nav>
                        <div className="border-t border-slate-800 p-4">
                            <p className="truncate text-xs font-bold">{adminEmail || 'Sin correo'}</p>
                            <p className="mt-1 truncate text-[10px] text-slate-400">{adminRole || 'Cloud Admin'}</p>
                            <button
                                type="button"
                                onClick={() => {
                                    setMobileNavigationOpen(false);
                                    setChangePasswordOpen(true);
                                }}
                                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2.5 text-sm font-bold text-slate-200"
                            >
                                Cambiar contraseña
                            </button>
                            <button
                                type="button"
                                onClick={onSignOut}
                                disabled={signingOut}
                                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2.5 text-sm font-bold text-slate-200 disabled:opacity-60"
                            >
                                {signingOut ? 'Cerrando…' : 'Cerrar sesión'}
                            </button>
                        </div>
                    </aside>
                </div>
            ) : null}

            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur-md sm:px-6">
                    <button
                        type="button"
                        onClick={() => setMobileNavigationOpen(true)}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm md:hidden"
                        aria-label="Abrir navegación"
                    >
                        <Menu size={19} />
                    </button>
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                        <h2 className="shrink-0 truncate text-base font-black text-slate-800 sm:text-lg">{currentLabel}</h2>
                    </div>
                </header>

                <div className={`min-h-0 flex-1 p-0 ${isImmersiveWorkspace ? 'overflow-hidden' : 'overflow-auto'}`}>
                    <Outlet />
                </div>
            </main>

            <ChangePasswordDialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
        </div>
    );
}
