import React from 'react';
import type { TenantProvisionedCredentials } from './types';

interface TenantProvisionedCredentialsBannerProps {
    credentials: TenantProvisionedCredentials;
    onDismiss: () => void;
}

export const TenantProvisionedCredentialsBanner: React.FC<TenantProvisionedCredentialsBannerProps> = ({ credentials, onDismiss }) => (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
            <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-emerald-800">Credenciales temporales</h3>
                <p className="mt-1 text-sm text-emerald-700">
                    Entrega estas credenciales por un canal seguro y fuerza el cambio de contrasena en el primer acceso.
                </p>
                <p className="mt-3 text-sm text-slate-700">
                    <span className="font-bold">Email:</span> {credentials.email}
                </p>
                <p className="text-sm text-slate-700">
                    <span className="font-bold">Clave temporal:</span> {credentials.tempPassword}
                </p>
            </div>
            <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-100"
            >
                Ocultar
            </button>
        </div>
    </div>);
