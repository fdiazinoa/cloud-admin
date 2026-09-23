import { KeyRound, LogOut } from 'lucide-react';

interface AdminUserMenuProps {
    open: boolean;
    onClose: () => void;
    userName: string | null;
    userEmail: string | null;
    userRole: string | null;
    signingOut: boolean;
    onChangePassword: () => void;
    onSignOut: () => void;
}

export function AdminUserMenu({
    open,
    onClose,
    userName,
    userEmail,
    userRole,
    signingOut,
    onChangePassword,
    onSignOut,
}: AdminUserMenuProps) {
    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-30" onMouseDown={onClose} aria-hidden="true" />
            <div
                role="menu"
                aria-label="Cuenta de usuario"
                className="absolute bottom-3 left-[72px] z-40 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            >
                <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-black text-slate-900">{userName || 'Cloud Admin'}</p>
                    <p className="truncate text-xs text-slate-500">{userEmail || 'Sin correo'}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{userRole || 'Cloud Admin'}</p>
                </div>
                <div className="p-1.5">
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            onClose();
                            onChangePassword();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                        <KeyRound size={16} className="text-slate-400" />
                        Cambiar contraseña
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            onClose();
                            onSignOut();
                        }}
                        disabled={signingOut}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <LogOut size={16} className="text-slate-400" />
                        {signingOut ? 'Cerrando…' : 'Cerrar sesión'}
                    </button>
                </div>
            </div>
        </>
    );
}
