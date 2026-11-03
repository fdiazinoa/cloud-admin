import { useState } from 'react';
import { AlertTriangle, Check, Cloud, CloudOff } from 'lucide-react';
import {
    normalizeTenantProductSelection,
    TENANT_PRODUCTS,
    type TenantProductKey,
    type TenantProductSelection,
} from '../lib/tenantProducts';
import { TenantProductsCards } from './tenants/TenantProductsCards';

interface TenantProductsEditorProps {
    initialProducts: TenantProductSelection;
    onSave: (products: TenantProductSelection) => void;
    onCancel?: () => void;
    saveLabel?: string;
    cancelLabel?: string;
    helperText?: string;
    /** `inline` se usa dentro de la ficha; `modal` conserva la versión en diálogo. */
    layout?: 'inline' | 'modal';
}

/** Selector de productos y addons del tenant, reutilizable con o sin modal. */
export const TenantProductsEditor: React.FC<TenantProductsEditorProps> = ({
    initialProducts,
    onSave,
    onCancel,
    saveLabel = 'Aplicar Productos',
    cancelLabel = 'Cancelar',
    helperText,
    layout = 'inline',
}) => {
    const [draft, setDraft] = useState<TenantProductSelection>(initialProducts);

    const normalizedDraft = normalizeTenantProductSelection(draft);
    const hasMainProduct = normalizedDraft.pos || normalizedDraft.erp;

    const toggleProduct = (key: TenantProductKey) => {
        setDraft((current) => {
            const next = { ...current, [key]: !current[key] };

            if (key === 'erp' && next.erp) {
                next.backup = true;
                next.offlineMode = false;
            }

            if (key === 'backup' && next.pos && !next.erp) {
                next.offlineMode = !next.backup;
            }

            return normalizeTenantProductSelection(next);
        });
    };

    const setPosOnlyVariant = (offlineMode: boolean) => {
        setDraft((current) => normalizeTenantProductSelection({
            ...current,
            pos: true,
            erp: false,
            backup: !offlineMode,
            offlineMode,
        }));
    };

    return (
        <div className="space-y-4">
            {helperText ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
                    {helperText}
                </div>
            ) : null}

            <TenantProductsCards
                products={TENANT_PRODUCTS}
                draft={draft}
                normalizedDraft={normalizedDraft}
                onToggle={toggleProduct}
                onLicensesChange={(value) => setDraft((current) => ({ ...current, pos_licenses: value }))}
                onUsersChange={(value) => setDraft((current) => ({ ...current, erp_users: value }))}
            />

            {normalizedDraft.pos && !normalizedDraft.erp && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                        type="button"
                        onClick={() => setPosOnlyVariant(false)}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                            !normalizedDraft.offlineMode
                                ? 'border-emerald-300 bg-emerald-50 shadow-sm shadow-emerald-100'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`grid h-11 w-11 place-items-center rounded-2xl ${
                                !normalizedDraft.offlineMode ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                                <Cloud size={20} />
                            </div>
                            <div>
                                <h4 className="font-black text-slate-800">POS_ONLY SaaS con Cloud Staging</h4>
                                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                                    Recomendado. Incluye respaldo cloud, recuperacion SaaS y core interno sin ERP visible.
                                </p>
                            </div>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPosOnlyVariant(true)}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                            normalizedDraft.offlineMode
                                ? 'border-amber-300 bg-amber-50 shadow-sm shadow-amber-100'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`grid h-11 w-11 place-items-center rounded-2xl ${
                                normalizedDraft.offlineMode ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                                <CloudOff size={20} />
                            </div>
                            <div>
                                <h4 className="font-black text-slate-800">POS_ONLY Offline / Sin nube</h4>
                                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                                    Solo para excepciones. Sin backup cloud, recuperacion SaaS ni staging automatico.
                                </p>
                            </div>
                        </div>
                    </button>
                </div>
            )}

            {normalizedDraft.offlineMode && (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
                    <AlertTriangle size={18} className="shrink-0" />
                    Este tenant quedara explicitamente sin nube. Usa este modo solo cuando el contrato lo requiera.
                </div>
            )}

            {!hasMainProduct && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
                    Debes activar al menos uno de los productos principales: CLIC POS o CLIC ERP.
                </div>
            )}

            <div className={`flex gap-3 ${layout === 'modal' ? 'pt-2' : ''}`}>
                {onCancel ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200"
                    >
                        {cancelLabel}
                    </button>
                ) : null}
                <button
                    type="button"
                    disabled={!hasMainProduct}
                    onClick={() => onSave(normalizedDraft)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                    <Check size={16} />
                    {saveLabel}
                </button>
            </div>
        </div>
    );
};
