import React from 'react';
import { Loader2, RefreshCcw, X } from 'lucide-react';
import type { TenantTerminalSnapshot } from '../../types';

type RebuildFormData = { reason: string; confirmRebuild: boolean };

interface TerminalRebuildModalProps {
    terminal: TenantTerminalSnapshot | null;
    isOpen: boolean;
    isSubmitting: boolean;
    formData: RebuildFormData;
    setFormData: React.Dispatch<React.SetStateAction<RebuildFormData>>;
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
    getTerminalTakeoverId: (terminal: TenantTerminalSnapshot) => string;
    getTerminalOperationalDeviceId: (terminal: TenantTerminalSnapshot) => string;
}

export const TerminalRebuildModal: React.FC<TerminalRebuildModalProps> = ({
    terminal,
    isOpen,
    isSubmitting,
    formData,
    setFormData,
    onClose,
    onSubmit,
    getTerminalTakeoverId,
    getTerminalOperationalDeviceId,
}) => {
    if (!isOpen || !terminal) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-700">
                            <RefreshCcw size={14} />
                            Rebuild local
                        </div>
                        <h3 className="mt-3 font-black text-lg text-slate-800">Reconstruir base local del POS</h3>
                        <p className="text-sm text-slate-500 mt-1">
                            Para la misma tablet cuando se corrompe la BD local. No cambia el device_id.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="p-6 space-y-5">
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                        <p className="font-bold">Antes de continuar:</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                            <li>Se mantiene el mismo device_id autorizado.</li>
                            <li>No se revoca la tablet actual.</li>
                            <li>El POS debera descargar un bootstrap completo desde el ERP.</li>
                            <li>Si habia ventas locales no sincronizadas, deben auditarse antes de reconstruir.</li>
                        </ul>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Terminal</p>
                            <p className="mt-1 font-bold text-slate-800">{terminal.name}</p>
                            <p className="mt-1 text-xs font-mono text-slate-500">{getTerminalTakeoverId(terminal) || 'N/D'}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Device actual</p>
                            <p className="mt-1 font-mono text-slate-700 break-all">{getTerminalOperationalDeviceId(terminal) || 'N/D'}</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Motivo de la reconstruccion <span className="text-red-500">*</span></label>
                        <textarea
                            required
                            value={formData.reason}
                            onChange={e => setFormData({ ...formData, reason: e.target.value })}
                            className="w-full min-h-[96px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 resize-y"
                            placeholder="Ej. BD local corrupta, reinstalacion del POS en la misma tablet o reparacion de datos locales."
                        />
                    </div>

                    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={formData.confirmRebuild}
                            onChange={e => setFormData({ ...formData, confirmRebuild: e.target.checked })}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>
                            Confirmo que es la misma tablet y deseo forzar un bootstrap completo sin revocar el dispositivo actual.
                        </span>
                    </label>

                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-slate-100 pt-5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
                            Preparar reconstruccion
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
