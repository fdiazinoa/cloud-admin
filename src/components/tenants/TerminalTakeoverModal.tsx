import React from 'react';
import { Loader2, RefreshCcw, X } from 'lucide-react';
import type { TenantTerminalSnapshot } from '../../types';
import { getTakeoverSelectionKey } from '../../lib/tenantTerminalFormatting';
import { getTerminalAuthorizedDeviceId, getTerminalPosReportedDeviceId } from '../../lib/terminalIdentity';

type TakeoverFormData = {
    terminalId: string;
    registryId: string;
    newDeviceId: string;
    deviceName: string;
    reason: string;
    confirmTakeover: boolean;
};

type TakeoverOption = {
    key: string;
    terminal: TenantTerminalSnapshot;
    terminalId: string;
    registryId: string;
    label: string;
};

interface TerminalTakeoverModalProps {
    terminal: TenantTerminalSnapshot | null;
    isOpen: boolean;
    isSubmitting: boolean;
    formData: TakeoverFormData;
    setFormData: React.Dispatch<React.SetStateAction<TakeoverFormData>>;
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
    onChangeSelection: (selectionKey: string) => void;
    getTakeoverOptions: () => TakeoverOption[];
}

export const TerminalTakeoverModal: React.FC<TerminalTakeoverModalProps> = ({
    terminal,
    isOpen,
    isSubmitting,
    formData,
    setFormData,
    onClose,
    onSubmit,
    onChangeSelection,
    getTakeoverOptions,
}) => {
    if (!isOpen || !terminal) return null;

    const takeoverOptions = getTakeoverOptions();

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-700">
                            <RefreshCcw size={14} />
                            Disaster Recovery
                        </div>
                        <h3 className="mt-3 font-black text-lg text-slate-800">Tomar control de terminal</h3>
                        <p className="text-sm text-slate-500 mt-1">
                            Solo disponible para POS local. POS + ERP mantiene su flujo actual.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="p-6 space-y-5">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        <p className="font-bold">Antes de continuar:</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                            <li>La tablet anterior quedara revocada.</li>
                            <li>La nueva tablet debera autenticarse de nuevo contra el ERP.</li>
                            <li>No se borran ventas historicas.</li>
                            <li>El POS anterior ya no podra sincronizar.</li>
                        </ul>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Terminal a recuperar <span className="text-red-500">*</span></label>
                        <select
                            required
                            value={getTakeoverSelectionKey(formData.terminalId, formData.registryId)}
                            onChange={e => onChangeSelection(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-slate-800"
                        >
                            {takeoverOptions.map((option) => (
                                <option key={option.key} value={option.key}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <p className="mt-2 text-xs text-slate-500">
                            Device POS reportado: <span className="font-mono">{getTerminalPosReportedDeviceId(terminal) || 'N/D'}</span>
                            {' · '}
                            Autorizado: <span className="font-mono">{getTerminalAuthorizedDeviceId(terminal) || 'N/D'}</span>
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Nuevo device_id <span className="text-red-500">*</span></label>
                            <input
                                required
                                type="text"
                                value={formData.newDeviceId}
                                onChange={e => setFormData({ ...formData, newDeviceId: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-slate-800 font-mono"
                                placeholder="nuevo-device-id"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Nombre de dispositivo</label>
                            <input
                                type="text"
                                value={formData.deviceName}
                                onChange={e => setFormData({ ...formData, deviceName: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-slate-800"
                                placeholder="Tablet Caja 1"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Motivo del cambio <span className="text-red-500">*</span></label>
                        <textarea
                            required
                            value={formData.reason}
                            onChange={e => setFormData({ ...formData, reason: e.target.value })}
                            className="w-full min-h-[96px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-slate-800 resize-y"
                            placeholder="Ej. Tablet danada, perdida o reemplazo por garantia."
                        />
                    </div>

                    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={formData.confirmTakeover}
                            onChange={e => setFormData({ ...formData, confirmTakeover: e.target.checked })}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span>
                            Confirmo que deseo revocar la tablet anterior y que la nueva tablet debera iniciar sesion/autenticarse de nuevo.
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
                            className="px-5 py-3 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
                            Ejecutar recuperacion
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
