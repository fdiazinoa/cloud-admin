import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { CloudAdminPermissions, Tenant } from '../types';
import { tenantService } from '../lib/tenantService';
import { hasCloudAdminPermission } from '../lib/cloudAdminPermissions';
import { getErrorMessage } from '../lib/errorMessage';
import { TenantTerminalConsole } from '../components/tenants/TenantTerminalConsole';

interface TenantConsoleProps {
    permissions?: Partial<CloudAdminPermissions> | null;
}

/** Consola de terminales como pantalla completa (sin modal), ruta /tenants/:tenantId/terminales. */
export const TenantConsole: React.FC<TenantConsoleProps> = ({ permissions }) => {
    const { tenantId = '' } = useParams();
    const [searchParams] = useSearchParams();
    const initialTerminalKey = searchParams.get('terminal');
    const navigate = useNavigate();
    const [state, setState] = useState<{ tenantId: string; tenant: Tenant | null; error: string | null; total: number }>({
        tenantId: '',
        tenant: null,
        error: null,
        total: 0,
    });
    // `loading` se deriva del tenant solicitado: sin setState sincrónico en el efecto.
    const loading = state.tenantId !== tenantId;
    const tenant = state.tenantId === tenantId ? state.tenant : null;
    const error = state.tenantId === tenantId ? state.error : null;
    const canReauthorizeTerminals = hasCloudAdminPermission(permissions, 'terminal_reauthorization');

    const backToTenant = useCallback(() => {
        navigate(tenantId ? `/tenants?tenant=${encodeURIComponent(tenantId)}` : '/tenants');
    }, [navigate, tenantId]);

    useEffect(() => {
        let mounted = true;

        void tenantService.getTenants()
            .then((rows) => {
                if (!mounted) return;
                const list = rows || [];
                const found = list.find((row) => row.id === tenantId) ?? null;
                setState({
                    tenantId,
                    tenant: found,
                    error: found ? null : 'No encontramos ese tenant. Puede que se haya eliminado.',
                    total: list.length,
                });
            })
            .catch((loadError: unknown) => {
                if (mounted) setState({ tenantId, tenant: null, error: getErrorMessage(loadError), total: 0 });
            });

        return () => { mounted = false; };
    }, [tenantId]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-100">
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
                <button
                    type="button"
                    onClick={backToTenant}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50"
                >
                    <ArrowLeft size={15} />
                    Volver a la ficha
                </button>
                <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-800">
                        {tenant ? tenant.name : 'Terminales del tenant'}
                    </p>
                    <p className="truncate font-mono text-[11px] text-slate-400">{tenantId || 'sin tenant'}</p>
                </div>
                {tenant ? (
                    <span className="ml-auto hidden items-center gap-2 text-[11px] font-bold text-slate-500 sm:flex">
                        <span>{state.total} tenants en cartera</span>
                    </span>
                ) : null}
            </div>

            <div className="min-h-0 flex-1 p-0">
                {loading ? (
                    <div className="flex h-full items-center justify-center gap-3 text-sm font-bold text-slate-500">
                        <Loader2 className="animate-spin" size={20} /> Cargando consola de terminales...
                    </div>
                ) : error ? (
                    <div className="p-6">
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
                            {error}
                        </div>
                    </div>
                ) : tenant ? (
                    <TenantTerminalConsole
                        presentation="page"
                        tenant={tenant}
                        canReauthorizeTerminals={canReauthorizeTerminals}
                        onClose={backToTenant}
                        initialTerminalKey={initialTerminalKey}
                        onSelectTenant={(next) => setState((current) => ({ ...current, tenant: next }))}
                    />
                ) : null}
            </div>
        </div>
    );
};
