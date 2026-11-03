import type React from 'react';
import { Check, Database, HardDrive, MonitorSmartphone } from 'lucide-react';
import type { TenantProductDefinition, TenantProductKey, TenantProductSelection } from '../../lib/tenantProducts';

const PRODUCT_ICONS: Record<TenantProductKey, React.ComponentType<{ size?: number; className?: string }>> = {
    pos: MonitorSmartphone,
    erp: Database,
    backup: HardDrive,
};

interface TenantProductsCardsProps {
    products: TenantProductDefinition[];
    draft: TenantProductSelection;
    normalizedDraft: TenantProductSelection;
    onToggle: (key: TenantProductKey) => void;
    onLicensesChange: (value: number) => void;
    onUsersChange: (value: number) => void;
}

/** Tarjetas de producto con sus límites contratados. */
export const TenantProductsCards: React.FC<TenantProductsCardsProps> = ({
    products,
    draft,
    normalizedDraft,
    onToggle,
    onLicensesChange,
    onUsersChange,
}) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {products.map((product) => {
            const Icon = PRODUCT_ICONS[product.key];
            const active = normalizedDraft[product.key];

            return (
                <div
                    key={product.key}
                    className={`flex flex-col overflow-hidden rounded-2xl border transition-all ${
                        active
                            ? 'border-blue-300 bg-blue-50 shadow-sm shadow-blue-100'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                >
                    <button
                        type="button"
                        onClick={() => onToggle(product.key)}
                        className="flex-1 p-4 text-left transition-colors hover:bg-slate-50/50"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className={`grid h-11 w-11 place-items-center rounded-2xl ${
                                active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                                <Icon size={20} />
                            </div>
                            <div className={`grid h-6 w-6 place-items-center rounded-full border ${
                                active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'
                            }`}>
                                <Check size={14} />
                            </div>
                        </div>
                        <h4 className="mt-3 font-black text-slate-800">{product.label}</h4>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{product.description}</p>
                    </button>

                    {active && product.key === 'pos' && (
                        <div className="mt-auto border-t border-blue-100 bg-blue-50/50 px-4 pb-4 pt-3">
                            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-blue-800">
                                Límite de terminales
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={draft.pos_licenses}
                                onChange={(event) => onLicensesChange(parseInt(event.target.value) || 1)}
                                className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-900 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    )}

                    {active && product.key === 'erp' && (
                        <div className="mt-auto border-t border-blue-100 bg-blue-50/50 px-4 pb-4 pt-3">
                            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-blue-800">
                                Usuarios concurrentes
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={draft.erp_users}
                                onChange={(event) => onUsersChange(parseInt(event.target.value) || 1)}
                                className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-900 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    )}
                </div>
            );
        })}
    </div>
);
