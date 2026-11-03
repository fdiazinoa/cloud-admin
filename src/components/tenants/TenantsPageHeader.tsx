import React from 'react';
import { Plus } from 'lucide-react';

interface TenantsPageHeaderProps {
    onCreateTenant: () => void;
}

export const TenantsPageHeader: React.FC<TenantsPageHeaderProps> = ({ onCreateTenant }) => (
    <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-black text-slate-800">Gestión de Tenants</h2>
            <p className="text-slate-500 text-sm">Administra las cuentas de clientes y empresas suscritas.</p>
        </div>
        <button
            onClick={onCreateTenant}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors focus:ring-4 focus:ring-blue-100"
        >
            <Plus size={20} />
            Nuevo Tenant
        </button>
    </div>);
