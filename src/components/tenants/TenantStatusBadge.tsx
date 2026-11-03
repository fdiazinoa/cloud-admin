import React from 'react';

interface TenantStatusBadgeProps {
    status: string;
}

export const TenantStatusBadge: React.FC<TenantStatusBadgeProps> = ({ status }) => {
    switch (status) {
        case 'ACTIVE': return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase transition-colors">Activo</span>;
        case 'SUSPENDED': return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase transition-colors">Suspendido</span>;
        case 'TRIAL': return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold uppercase transition-colors">Prueba</span>;
        default: return null;
    }
};

