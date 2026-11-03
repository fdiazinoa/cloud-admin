import React, {
    useMemo,
    useState,
} from 'react';
import {
    AlertTriangle,
    KeyRound,
    Loader2,
    Monitor,
    RefreshCcw,
    Search,
    Wifi,
    WifiOff,
    X,
} from 'lucide-react';
import type {
    Tenant,
} from '../../types';
import {
    useTenantTerminalConsole,
    type TerminalRequestFilter,
} from '../../hooks/useTenantTerminalConsole';
import {
    formatApkVersion,
    getApkVersionKey,
    getErpReadinessStatus,
    getRegistryStatusLabel,
    getTerminalKey,
} from '../../lib/tenantTerminalFormatting';
import {
    getAttemptDeviceId,
    getTerminalAuthorizedDeviceId,
    isPendingDeviceUnauthorizedAttempt,
} from '../../lib/terminalIdentity';
import {
    formatRelativeTime,
} from '../../lib/tenantHealth';
import {
    TerminalDetail,
} from './TerminalDetail';
import {
    TerminalRebuildModal,
} from './TerminalRebuildModal';
import {
    TerminalTakeoverModal,
} from './TerminalTakeoverModal';

interface TenantTerminalConsoleProps {
    tenant: Tenant;
    canReauthorizeTerminals: boolean;
    onClose: () => void;
    /** Keeps the page tenant list in sync after terminal-side mutations. */
    onTenantsLoaded?: (tenants: Tenant[]) => void;
    /** Replaces the selected tenant with a freshly loaded row. */
    onSelectTenant?: (tenant: Tenant) => void;
    /** `page` renderiza la consola a pantalla completa, sin diálogo. */
    presentation?: 'modal' | 'page';
    /** Terminal a inspeccionar al abrir (deep-link `?terminal=`). */
    initialTerminalKey?: string | null;
}

type AlertTone = 'ok' | 'warn' | 'bad' | 'info';

interface TerminalAlert {
    label: string;
    tone: AlertTone;
}

const ALERT_CLASSES: Record<AlertTone, string> = {
    ok: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    bad: 'bg-red-50 text-red-700',
    info: 'bg-blue-50 text-blue-700',
};

const DOT_CLASSES: Record<AlertTone, string> = {
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    bad: 'bg-red-500',
    info: 'bg-blue-500',
};

const SEVERITY_ORDER: Record<AlertTone, number> = { bad: 0, warn: 1, info: 2, ok: 3 };

const getSeverity = (alerts: TerminalAlert[]): AlertTone => {
    if (alerts.some((alert) => alert.tone === 'bad')) return 'bad';
    if (alerts.some((alert) => alert.tone === 'warn')) return 'warn';
    if (alerts.some((alert) => alert.tone === 'info')) return 'info';
    return 'ok';
};

export const TenantTerminalConsole: React.FC<TenantTerminalConsoleProps> = ({
    tenant,
    canReauthorizeTerminals,
    onClose,
    onTenantsLoaded,
    onSelectTenant,
    presentation = 'modal',
    initialTerminalKey = null,
}) => {
    const isPage = presentation === 'page';
    const state = useTenantTerminalConsole({
        tenant,
        canReauthorizeTerminals,
        onTenantsLoaded,
        onSelectTenant,
    });

    const {
        tenantTerminals,
        visibleTenantTerminals,
        terminalSearchTerm,
        setTerminalSearchTerm,
        terminalStoreFilter,
        setTerminalStoreFilter,
        terminalRequestFilter,
        setTerminalRequestFilter,
        terminalStoreOptions,
        isTerminalModalLoading,
        pendingDeviceRequestTerminalCount,
        terminalLicenseLimit,
        activeLicensedTerminalCount,
        isTerminalLicenseOverLimit,
        hasFreeLicenseSlot,
        licenseExceededDeviceCount,
        licenseCountUnit,
        onlineTerminalCount,
        offlineTerminalCount,
        revokedTerminalCount,
        erpReadyTerminalCount,
        masterTerminalCount,
        clientTerminalCount,
        publishedEndpointCount,
        outOfVersionCount,
        missingVersionCount,
        referenceVersionCandidate,
        referenceVersionKey,
        authAttemptsByTerminal,
        handleEnforcePosLicenseLimits,
        reloadConsole,
        rebuildTerminal,
        isRebuildModalOpen,
        isRebuildSubmitting,
        rebuildFormData,
        setRebuildFormData,
        closeRebuildModal,
        handleTerminalLocalRebuild,
        getTerminalTakeoverId,
        getTerminalOperationalDeviceId,
        takeoverTerminal,
        isTakeoverModalOpen,
        isTakeoverSubmitting,
        takeoverFormData,
        setTakeoverFormData,
        closeTakeoverModal,
        handleTerminalTakeover,
        handleTakeoverTerminalChange,
        getTakeoverOptions,
    } = state;

    const [selectedTerminalKey, setSelectedTerminalKey] = useState<string | null>(initialTerminalKey);

    /** Semáforo de la flota: señales baratas que no requieren abrir el detalle. */
    const rows = useMemo(() => visibleTenantTerminals.map((terminal) => {
        const terminalKey = getTerminalKey(terminal);
        const alerts: TerminalAlert[] = [];
        const registryStatus = getRegistryStatusLabel(terminal);

        if (registryStatus === 'REVOCADA') alerts.push({ label: 'Revocada', tone: 'bad' });
        else if (registryStatus !== 'ONLINE') alerts.push({ label: 'Sin latido', tone: 'warn' });

        if ((terminal.registry?.auth_status || '').toUpperCase() === 'LICENSE_EXCEEDED') {
            alerts.push({ label: 'Sin licencia', tone: 'bad' });
        }

        const versionKey = getApkVersionKey(terminal);
        if (versionKey && referenceVersionKey && versionKey !== referenceVersionKey) {
            alerts.push({ label: 'APK vieja', tone: 'warn' });
        }

        if (getErpReadinessStatus(terminal) !== 'ready') {
            alerts.push({ label: 'ERP pendiente', tone: 'warn' });
        }

        const authorizedDeviceId = getTerminalAuthorizedDeviceId(terminal);
        const attempts = authAttemptsByTerminal[terminalKey] || [];
        const hasPendingRequest = attempts.some((attempt) => (
            isPendingDeviceUnauthorizedAttempt(attempt) && getAttemptDeviceId(attempt) !== authorizedDeviceId
        ));
        if (hasPendingRequest) alerts.push({ label: 'Solicitud', tone: 'info' });

        return { terminal, terminalKey, alerts, severity: getSeverity(alerts) };
    }).sort((a, b) => {
        const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (bySeverity !== 0) return bySeverity;
        return a.terminal.name.localeCompare(b.terminal.name, 'es');
    }), [authAttemptsByTerminal, referenceVersionKey, visibleTenantTerminals]);

    const effectiveKey = selectedTerminalKey && rows.some((row) => row.terminalKey === selectedTerminalKey)
        ? selectedTerminalKey
        : rows[0]?.terminalKey ?? null;
    const selectedTerminal = rows.find((row) => row.terminalKey === effectiveKey)?.terminal ?? null;
    const terminalsWithAlerts = rows.filter((row) => row.severity !== 'ok').length;
    const isLicenseExceeded = isTerminalLicenseOverLimit || licenseExceededDeviceCount > 0;
    const silentTerminals = offlineTerminalCount + revokedTerminalCount;

    return (
        <>
            <div className={isPage
                ? 'flex h-full min-h-0 flex-col'
                : 'fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50'}>
                <div className={isPage
                    ? 'flex h-full w-full flex-col overflow-hidden bg-slate-100'
                    : 'bg-white rounded-3xl shadow-2xl w-full max-w-7xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col'}>

                    {/* barra superior */}
                    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
                        <div className="min-w-0">
                            <h3 className="text-base font-black text-slate-900">Terminales del tenant</h3>
                            {tenant.status === 'SUSPENDED' ? <p role="alert" className="text-sm font-bold text-red-700">Tenant suspendido: acceso bloqueado para todas las cajas. Una caja desconectada recibirá el estado al reconectarse.</p> : null}
                            <p className="truncate text-[11px] text-slate-500">
                                {tenant.name} · {tenant.contracted_product || 'sin producto'} · {tenantTerminals.length} terminal(es)
                            </p>
                        </div>

                        <div className="ml-auto flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                <Wifi size={11} /> {onlineTerminalCount} online
                            </span>
                            {silentTerminals > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-red-700">
                                    <WifiOff size={11} /> {silentTerminals} sin latido
                                </span>
                            ) : null}
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${terminalsWithAlerts > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                {terminalsWithAlerts} con incidencia
                            </span>
                            <button
                                type="button"
                                onClick={() => void reloadConsole()}
                                disabled={isTerminalModalLoading}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                                <RefreshCcw size={13} />
                                Actualizar
                            </button>
                            {!isPage ? (
                                <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:text-slate-700">
                                    <X size={18} />
                                </button>
                            ) : null}
                        </div>
                    </header>

                    <div className="flex min-h-0 flex-1">
                        {/* columna izquierda: flota */}
                        <section aria-label="Terminales de la flota" className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white xl:w-[300px] xl:border-b-0 xl:border-r">
                            <div className="border-b border-slate-100 px-3 py-2.5">
                                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-400 focus-within:border-blue-300 focus-within:bg-white">
                                    <Search size={15} />
                                    <input
                                        type="search"
                                        value={terminalSearchTerm}
                                        onChange={(event) => setTerminalSearchTerm(event.target.value)}
                                        placeholder="Terminal, código o device"
                                        className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
                                    />
                                    {isTerminalModalLoading ? <Loader2 className="animate-spin text-blue-500" size={15} /> : null}
                                </div>
                                <div className="mt-2 flex gap-1.5">
                                    <select
                                        value={terminalStoreFilter}
                                        onChange={(event) => setTerminalStoreFilter(event.target.value)}
                                        aria-label="Filtrar terminales por sucursal"
                                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-600 outline-none focus:border-blue-300"
                                    >
                                        <option value="ALL">Todas las sucursales ({tenantTerminals.length})</option>
                                        {terminalStoreOptions.map(([storeId, storeName]) => (
                                            <option key={storeId} value={storeId}>{storeName}</option>
                                        ))}
                                    </select>
                                    {canReauthorizeTerminals ? (
                                        <select
                                            value={terminalRequestFilter}
                                            onChange={(event) => setTerminalRequestFilter(event.target.value as TerminalRequestFilter)}
                                            aria-label="Filtrar por solicitudes pendientes"
                                            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-600 outline-none focus:border-blue-300"
                                        >
                                            <option value="ALL">Todas</option>
                                            <option value="PENDING">Solicitudes ({pendingDeviceRequestTerminalCount})</option>
                                        </select>
                                    ) : null}
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto">
                                {isTerminalModalLoading ? (
                                    <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm font-bold text-slate-500">
                                        <Loader2 className="animate-spin" size={17} /> Cargando terminales…
                                    </div>
                                ) : tenantTerminals.length === 0 ? (
                                    <p className="px-4 py-10 text-center text-sm text-slate-500">
                                        No hay terminales ni endpoints reportados para este tenant.
                                    </p>
                                ) : rows.length === 0 ? (
                                    <p className="px-4 py-10 text-center text-sm text-slate-500">
                                        {terminalRequestFilter === 'PENDING'
                                            ? 'No hay terminales con solicitudes pendientes que coincidan con los filtros seleccionados.'
                                            : 'No hay terminales que coincidan con la búsqueda o sucursal seleccionada.'}
                                    </p>
                                ) : rows.map(({ terminal, terminalKey, alerts, severity }) => {
                                    const selected = terminalKey === effectiveKey;
                                    return (
                                        <button
                                            key={terminalKey}
                                            type="button"
                                            onClick={() => setSelectedTerminalKey(terminalKey)}
                                            className={`flex w-full items-start gap-2.5 border-l-[3px] px-3 py-2.5 text-left transition-colors ${
                                                selected ? 'border-blue-600 bg-blue-50/60' : 'border-transparent hover:bg-slate-50'
                                            }`}
                                        >
                                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                <Monitor size={15} />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className={`truncate text-sm ${selected ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>{terminal.name}</p>
                                                    <span
                                                        className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASSES[severity]}`}
                                                        title={alerts.map((alert) => alert.label).join(' · ') || 'Operativa'}
                                                    />
                                                </div>
                                                <p className="truncate text-[11px] text-slate-500">
                                                    {terminal.erp_store_name || terminal.erp_store_id || 'Sin sucursal'} · {formatApkVersion(terminal).replace('APK ', '')} · {formatRelativeTime(terminal.last_checkin_at)}
                                                </p>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {alerts.length ? alerts.slice(0, 3).map((alert) => (
                                                        <span key={alert.label} className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${ALERT_CLASSES[alert.tone]}`}>
                                                            {alert.label}
                                                        </span>
                                                    )) : (
                                                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">Operativa</span>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="shrink-0 border-t border-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-400">
                                {rows.length} de {tenantTerminals.length} terminales · ordenadas por incidencia
                            </div>
                        </section>

                        {/* columna central: detalle */}
                        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50">
                            {isLicenseExceeded ? (
                                <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5">
                                    <p className="text-[12px] font-bold text-red-800">
                                        Límite de licencias POS excedido: {activeLicensedTerminalCount} equipo(s) para {terminalLicenseLimit ?? 1} licencia(s)
                                        {licenseExceededDeviceCount > 0 ? ` · ${licenseExceededDeviceCount} sin licencia` : ''}
                                        {hasFreeLicenseSlot ? ' · hay cupo libre' : ''}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void handleEnforcePosLicenseLimits()}
                                        className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[11px] font-black text-red-800 hover:bg-red-100"
                                    >
                                        Aplicar límite
                                    </button>
                                </div>
                            ) : null}

                            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                                {isTerminalModalLoading ? (
                                    <div className="flex h-full items-center justify-center gap-2 text-sm font-bold text-slate-500">
                                        <Loader2 className="animate-spin" size={18} /> Cargando terminales…
                                    </div>
                                ) : selectedTerminal ? (
                                    <TerminalDetail
                                        key={effectiveKey ?? 'terminal'}
                                        tenant={tenant}
                                        terminal={selectedTerminal}
                                        canReauthorizeTerminals={canReauthorizeTerminals}
                                        console={state}
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center px-6 text-center">
                                        <div>
                                            <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm">
                                                <Monitor size={20} />
                                            </span>
                                            <p className="mt-2 text-sm font-black text-slate-700">Sin terminal seleccionada</p>
                                            <p className="mt-1 text-[12px] text-slate-500">
                                                {tenantTerminals.length === 0
                                                    ? 'Este tenant todavía no tiene terminales registradas.'
                                                    : 'Elige una terminal de la lista para inspeccionarla.'}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* columna derecha: cupo, versión y flota */}
                        <aside aria-label="Cupo y salud de la flota" className="w-full shrink-0 space-y-3 overflow-y-auto border-t border-slate-200 bg-white px-3.5 py-3.5 xl:w-[268px] xl:border-l xl:border-t-0">
                            <section className={`rounded-xl border p-3 ${isTerminalLicenseOverLimit ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Licencia POS</p>
                                <div className="mt-1 flex items-end gap-1">
                                    <span className={`text-xl font-black ${isTerminalLicenseOverLimit ? 'text-red-700' : 'text-slate-800'}`}>{activeLicensedTerminalCount}</span>
                                    <span className="mb-0.5 text-xs font-black text-slate-400">
                                        / {terminalLicenseLimit ?? '—'} {licenseCountUnit}
                                    </span>
                                </div>
                                {typeof terminalLicenseLimit === 'number' && terminalLicenseLimit > 0 ? (
                                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className={`h-full rounded-full ${isTerminalLicenseOverLimit ? 'bg-red-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${Math.min(100, Math.round((activeLicensedTerminalCount / terminalLicenseLimit) * 100))}%` }}
                                        />
                                    </div>
                                ) : null}
                                <p className="mt-1.5 text-[10px] text-slate-500">
                                    {hasFreeLicenseSlot ? 'Hay cupo libre' : isTerminalLicenseOverLimit ? 'Cupo excedido' : 'Sin cupo definido'}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => void handleEnforcePosLicenseLimits()}
                                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                                >
                                    <KeyRound size={12} /> Aplicar límite
                                </button>
                            </section>

                            <section className="rounded-xl border border-slate-200 p-3">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Versión de referencia</p>
                                <p className="mt-1 text-sm font-black text-slate-800">{referenceVersionCandidate?.label || 'Sin datos'}</p>
                                <p className="text-[10px] text-slate-500">fuente: {referenceVersionCandidate?.source || 'sin APK reportada'}</p>
                                <div className="mt-2 space-y-1 text-[11px]">
                                    <div className="flex items-center justify-between"><span className="text-slate-500">Fuera de versión</span><span className={`font-black ${outOfVersionCount > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{outOfVersionCount}</span></div>
                                    <div className="flex items-center justify-between"><span className="text-slate-500">Sin versión</span><span className="font-black text-slate-800">{missingVersionCount}</span></div>
                                </div>
                            </section>

                            <section className="rounded-xl border border-slate-200 p-3">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Flota</p>
                                <div className="mt-1.5 space-y-1.5 text-[11px]">
                                    <div className="flex items-center justify-between"><span className="text-slate-500">Online</span><span className="font-black text-emerald-700">{onlineTerminalCount}</span></div>
                                    <div className="flex items-center justify-between"><span className="text-slate-500">Sin latido / revocadas</span><span className={`font-black ${silentTerminals > 0 ? 'text-red-700' : 'text-slate-800'}`}>{silentTerminals}</span></div>
                                    <div className="flex items-center justify-between"><span className="text-slate-500">ERP listo</span><span className="font-black text-slate-800">{erpReadyTerminalCount}</span></div>
                                    <div className="flex items-center justify-between"><span className="text-slate-500">Clientes / master</span><span className="font-black text-slate-800">{clientTerminalCount} / {masterTerminalCount}</span></div>
                                    <div className="flex items-center justify-between"><span className="text-slate-500">Endpoints publicados</span><span className="font-black text-slate-800">{publishedEndpointCount}</span></div>
                                    <div className="flex items-center justify-between"><span className="text-slate-500">Solicitudes</span><span className={`font-black ${pendingDeviceRequestTerminalCount > 0 ? 'text-blue-700' : 'text-slate-800'}`}>{pendingDeviceRequestTerminalCount}</span></div>
                                </div>
                            </section>

                            <section className="rounded-xl border border-slate-200 p-3">
                                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    <AlertTriangle size={12} /> Cómo leer la flota
                                </p>
                                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                                    El semáforo combina latido del endpoint, versión de APK, readiness de ERP y licencia POS.
                                    Las terminales con más incidencias aparecen primero en la lista.
                                </p>
                            </section>
                        </aside>
                    </div>
                </div>
            </div>

            <TerminalRebuildModal
                terminal={rebuildTerminal}
                isOpen={isRebuildModalOpen}
                isSubmitting={isRebuildSubmitting}
                formData={rebuildFormData}
                setFormData={setRebuildFormData}
                onClose={closeRebuildModal}
                onSubmit={handleTerminalLocalRebuild}
                getTerminalTakeoverId={getTerminalTakeoverId}
                getTerminalOperationalDeviceId={getTerminalOperationalDeviceId}
            />

            <TerminalTakeoverModal
                terminal={takeoverTerminal}
                isOpen={isTakeoverModalOpen}
                isSubmitting={isTakeoverSubmitting}
                formData={takeoverFormData}
                setFormData={setTakeoverFormData}
                onClose={closeTakeoverModal}
                onSubmit={handleTerminalTakeover}
                onChangeSelection={handleTakeoverTerminalChange}
                getTakeoverOptions={getTakeoverOptions}
            />
        </>
    );
};
