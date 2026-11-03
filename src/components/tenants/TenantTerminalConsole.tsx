import React from 'react';
import {
    Search,
    Loader2,
    X,
    Wifi,
    WifiOff,
    Trash2,
    RefreshCcw,
    KeyRound,
    ShieldCheck,
    Ban,
    CheckCircle2,
    Unlink,
} from 'lucide-react';
import type {
    Tenant,
} from '../../types';
import {
    buildTerminalIdentitySummary,
    CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE,
    getAttemptDeviceId,
    getDeviceRoleClasses,
    getDeviceRoleLabel,
    getRegistryEndpointRole,
    getTerminalAuthStatus,
    getTerminalPersistedAuthorizedDeviceId,
    hasCanonicalErpBinding,
    isPendingDeviceUnauthorizedAttempt,
    summarizeTerminalFiscalDebug,
} from '../../lib/terminalIdentity';
import {
    buildTerminalReconciliationPreview,
} from '../../lib/terminalReconciliation';
import {
    getTerminalKey,
    getAttemptTime,
    getDeviceRequestStatusLabel,
    getAuthStatusLabel,
    getAuthStatusClasses,
    isDeviceIdentityAligned,
    getEffectiveAuthStatus,
    getFiscalStatusClasses,
    getReadinessValue,
    getReadinessCheckValue,
    isErpProfileIncomplete,
    getSyncDocumentId,
    getSyncDocumentFolio,
    getSyncDocumentErrorCode,
    getSyncDocumentCreatedAt,
    isRepairableSyncDocument,
    getErpReadinessStatus,
    getReadinessBadgeClasses,
    getReadinessLabel,
    getOperationalStatusLabel,
    getOperationalStatusClasses,
    getCheckLabel,
    formatApkVersion,
    getApkVersionKey,
    getApkVersionSourceLabel,
    getRegistryStatusClassName,
    getRegistryStatusLabel,
} from '../../lib/tenantTerminalFormatting';
import {
    isLocalPosTenant,
    isExplicitOfflinePosTenant,
    isFiscalEligibleTenant,
} from '../../lib/tenantSemantics';
import {
    formatDateTime,
} from '../../lib/dateFormat';
import {
    useTenantTerminalConsole,
    type TerminalRequestFilter,
    type TerminalTabKey,
} from '../../hooks/useTenantTerminalConsole';
import { TenantSemanticsGrid } from './TenantSemanticsGrid';
import { TerminalRebuildModal } from './TerminalRebuildModal';
import { TerminalTakeoverModal } from './TerminalTakeoverModal';

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
}

export const TenantTerminalConsole: React.FC<TenantTerminalConsoleProps> = ({
    tenant,
    canReauthorizeTerminals,
    onClose,
    onTenantsLoaded,
    onSelectTenant,
    presentation = 'modal',
}) => {
    const isPage = presentation === 'page';
    const {
        tenantTerminals,
        terminalSearchTerm,
        terminalStoreFilter,
        terminalRequestFilter,
        terminalTabs,
        terminalAdvancedOpen,
        isTerminalModalLoading,
        takeoverTerminal,
        isTakeoverModalOpen,
        isTakeoverSubmitting,
        rebuildTerminal,
        isRebuildModalOpen,
        isRebuildSubmitting,
        erpReadinessSubmittingKey,
        authAttemptsByTerminal,
        authAttemptsErrorByTerminal,
        deviceAuditByTerminal,
        authAttemptsLoadingKey,
        deviceActionSubmittingKey,
        manualDeviceIds,
        reconciliationDrafts,
        reconciliationSubmittingKey,
        fiscalReadinessByTerminal,
        fiscalReadinessLoadingKey,
        syncPendingByTerminal,
        syncPendingLoadingKey,
        syncRetrySubmittingKey,
        takeoverFormData,
        rebuildFormData,
        isCanonicalTerminalActionBlocked,
        getTerminalTakeoverId,
        getTakeoverOptions,
        getFiscalReadiness,
        openTakeoverModal,
        closeTakeoverModal,
        openRebuildModal,
        closeRebuildModal,
        getTerminalOperationalDeviceId,
        handleRetryErpReadiness,
        handlePrepareErpProfile,
        handlePrepareAndRetryDocument,
        handleRetryTerminalPending,
        loadTerminalAuthAttempts,
        handleEnforcePosLicenseLimits,
        updateReconciliationDraft,
        handleTerminalReconciliation,
        loadTerminalSyncPending,
        loadTerminalFiscalReadiness,
        handleAuthorizeDeviceForManualInput,
        handleReauthorizeAttempt,
        handleRejectDeviceRequest,
        handleRepairErpDeviceMapping,
        handleSyncAuthorizedDevice,
        handleReleasePosOnlyProvisioningBlock,
        handleRotateTerminalCredentials,
        handleReleaseTerminalLicenseSlot,
        handleRevokePreviousDevice,
        handleClearTerminalDevices,
        handleTakeoverTerminalChange,
        handleTerminalTakeover,
        handleTerminalLocalRebuild,
        referenceVersionCandidate,
        referenceVersionKey,
        outOfVersionCount,
        missingVersionCount,
        getPreferredLanIp,
        onlineTerminalCount,
        offlineTerminalCount,
        revokedTerminalCount,
        masterTerminalCount,
        clientTerminalCount,
        publishedEndpointCount,
        terminalLicenseLimit,
        activeLicensedTerminalCount,
        licenseCountUnit,
        isTerminalLicenseOverLimit,
        hasFreeLicenseSlot,
        licenseExceededDeviceCount,
        erpReadyTerminalCount,
        terminalStoreOptions,
        pendingDeviceRequestTerminalCount,
        visibleTenantTerminals,
        setTerminalSearchTerm,
        setTerminalStoreFilter,
        setTerminalRequestFilter,
        setTerminalTabs,
        setTerminalAdvancedOpen,
        setManualDeviceIds,
        setTakeoverFormData,
        setRebuildFormData,
    } = useTenantTerminalConsole({
        tenant,
        canReauthorizeTerminals,
        onTenantsLoaded,
        onSelectTenant,
    });

    return (
        <>
            <div className={isPage
                ? 'flex h-full min-h-0 flex-col'
                : 'fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50'}>
                <div className={isPage
                    ? 'flex h-full w-full flex-col overflow-hidden bg-white'
                    : 'bg-white rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col'}>
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <h3 className="font-black text-lg text-slate-800">Terminales Activas del Tenant</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    {tenant.name} · {tenant.email}
                                </p>
                                <p className="text-xs text-slate-400 font-mono mt-1">{tenant.id}</p>
                            </div>
                            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {(isTerminalLicenseOverLimit || licenseExceededDeviceCount > 0) ? (
                                <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <p className="text-sm font-black text-red-800">Limite de terminales POS excedido</p>
                                        <p className="mt-1 text-sm text-red-700">
                                            Este tenant tiene contratada{typeof terminalLicenseLimit === 'number' && terminalLicenseLimit === 1 ? '' : 's'}
                                            {' '}
                                            {terminalLicenseLimit ?? 1} equipo(s) POS contratado(s), pero hay {activeLicensedTerminalCount} Android/caja(s) online
                                            {licenseExceededDeviceCount > 0
                                                ? ` y ${licenseExceededDeviceCount} equipo(s) marcado(s) sin licencia.`
                                                : '.'}
                                            {hasFreeLicenseSlot
                                                ? ' Hay cupo libre para activar otro equipo/caja.'
                                                : ' Libere una caja completa con Liberar cupo antes de activar otra.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void handleEnforcePosLicenseLimits()}
                                        className="inline-flex items-center justify-center rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-800 shadow-sm hover:bg-red-100 transition-colors"
                                    >
                                        Aplicar limite de licencias
                                    </button>
                                </div>
                            ) : null}

                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                <div className={`rounded-2xl border px-4 py-4 ${isTerminalLicenseOverLimit ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                                    <p className={`text-xs font-bold uppercase tracking-wider ${isTerminalLicenseOverLimit ? 'text-red-700' : 'text-slate-500'}`}>Licencia POS</p>
                                    <p className={`mt-2 text-3xl font-black ${isTerminalLicenseOverLimit ? 'text-red-700' : 'text-slate-800'}`}>
                                        {activeLicensedTerminalCount}
                                        {typeof terminalLicenseLimit === 'number' && (
                                            <span className={`text-sm font-bold ml-2 ${isTerminalLicenseOverLimit ? 'text-red-500' : 'text-slate-400'}`}>
                                                / {terminalLicenseLimit} permitida{terminalLicenseLimit === 1 ? '' : 's'}
                                            </span>
                                        )}
                                    </p>
                                    <p className="mt-2 text-[11px] font-semibold text-slate-500">
                                        {tenantTerminals.length} grupo(s) · {publishedEndpointCount} registro(s) · cuenta {licenseCountUnit} autorizadas
                                    </p>
                                    {tenant?.contracted_product === 'POS_ONLY' ? (
                                        <p className="mt-1 text-[10px] text-slate-500">
                                            POS_ONLY: 1 licencia = 1 caja (nombre unico). Liberar cupo libera toda la caja.
                                        </p>
                                    ) : tenant?.contracted_product === 'POS_ERP' ? (
                                        <p className="mt-1 text-[10px] text-slate-500">
                                            POS+ERP: el limite se controla al crear terminales en el ERP. Vincular cajas POS no consume licencias adicionales.
                                        </p>
                                    ) : null}
                                </div>
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Endpoints Online</p>
                                    <p className="mt-2 text-3xl font-black text-emerald-700">{onlineTerminalCount}</p>
                                </div>
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Fuera de versión</p>
                                    <p className="mt-2 text-3xl font-black text-amber-700">{outOfVersionCount}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Clientes / cajas</p>
                                    <p className="mt-2 text-3xl font-black text-slate-800">{clientTerminalCount}</p>
                                </div>
                                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-blue-700">ERP listo</p>
                                    <p className="mt-2 text-3xl font-black text-blue-700">{erpReadyTerminalCount}</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                                <p>
                                    Esta vista combina el catálogo de terminales del tenant con el registry de endpoints publicados en cloud. La máscara de red aún no se persiste, por eso se muestra como <span className="font-bold">N/D</span>.
                                </p>
                                <p className="mt-2">
                                    Use <span className="font-bold">IP LAN recomendada</span> o <span className="font-bold">Endpoint publicado</span> para conectar nuevas cajas. Las IPs virtuales o de emulador se separan como descartadas.
                                </p>
                                <p className="mt-2">
                                    {referenceVersionCandidate
                                        ? <>Versión de referencia: <span className="font-bold">v {referenceVersionCandidate.label}</span> desde <span className="font-bold">{referenceVersionCandidate.source}</span>.</>
                                        : <>Aún no hay versión de APK reportada por las terminales de este tenant.</>}
                                    {missingVersionCount > 0 ? <> <span className="font-bold">{missingVersionCount}</span> terminal(es) todavía no reportan versión.</> : null}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-violet-700">Server master</p>
                                    <p className="mt-2 text-3xl font-black text-violet-700">{masterTerminalCount}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Con endpoint cloud</p>
                                    <p className="mt-2 text-3xl font-black text-slate-800">{publishedEndpointCount}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Revocadas / offline</p>
                                    <p className="mt-2 text-3xl font-black text-slate-800">{revokedTerminalCount + offlineTerminalCount}</p>
                                </div>
                            </div>

                            <TenantSemanticsGrid tenant={tenant} />

                            {tenantTerminals.length > 0 ? (
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                                            <input
                                                type="search"
                                                value={terminalSearchTerm}
                                                onChange={(event) => setTerminalSearchTerm(event.target.value)}
                                                placeholder="Buscar sucursal, terminal, código o dispositivo"
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                            />
                                        </div>
                                        <select
                                            value={terminalStoreFilter}
                                            onChange={(event) => setTerminalStoreFilter(event.target.value)}
                                            aria-label="Filtrar terminales por sucursal"
                                            className="min-w-64 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                        >
                                            <option value="ALL">Todas las sucursales ({tenantTerminals.length})</option>
                                            {terminalStoreOptions.map(([storeId, storeName]) => (
                                                <option key={storeId} value={storeId}>
                                                    {storeName} ({tenantTerminals.filter((terminal) => (terminal.erp_store_id || 'UNASSIGNED') === storeId).length})
                                                </option>
                                            ))}
                                        </select>
                                        {canReauthorizeTerminals ? (
                                            <select
                                                value={terminalRequestFilter}
                                                onChange={(event) => setTerminalRequestFilter(event.target.value as TerminalRequestFilter)}
                                                aria-label="Filtrar terminales por solicitudes de dispositivo"
                                                className="min-w-64 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                            >
                                                <option value="ALL">Todas las solicitudes</option>
                                                <option value="PENDING">Con solicitudes pendientes ({pendingDeviceRequestTerminalCount})</option>
                                            </select>
                                        ) : null}
                                    </div>
                                    <p className="mt-2 text-xs font-semibold text-slate-500">
                                        Mostrando {visibleTenantTerminals.length} de {tenantTerminals.length} terminal(es), ordenadas por sucursal.
                                    </p>
                                </div>
                            ) : null}

                            {isTerminalModalLoading ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-500 flex items-center justify-center gap-3">
                                    <Loader2 className="animate-spin text-violet-500" size={20} />
                                    Cargando terminales...
                                </div>
                            ) : tenantTerminals.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-500">
                                    No hay terminales ni endpoints reportados para este tenant.
                                </div>
                            ) : visibleTenantTerminals.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-500">
                                    {terminalRequestFilter === 'PENDING'
                                        ? 'No hay terminales con solicitudes pendientes que coincidan con los filtros seleccionados.'
                                        : 'No hay terminales que coincidan con la búsqueda o sucursal seleccionada.'}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-6">
                                    {visibleTenantTerminals.map((terminal) => {
                                        const hasOnlineRegistry = (terminal.registries || []).some((reg) => (
                                            getRegistryStatusLabel({ ...terminal, registry: reg }) === 'ONLINE'
                                        ));
                                        const erpReadiness = terminal.registry?.erp_readiness || null;
                                        const erpReadinessStatus = getErpReadinessStatus(terminal);
                                        const erpTenantId = getReadinessValue(erpReadiness, ['erpTenantId', 'erp_tenant_id']);
                                        const profileStatus = getReadinessValue(erpReadiness, ['profileStatus', 'profile_status']) || (erpReadinessStatus === 'ready' ? 'READY' : 'MISSING');
                                        const tenantReady = getReadinessCheckValue(erpReadiness, ['tenant']);
                                        const companyReady = getReadinessCheckValue(erpReadiness, ['company']);
                                        const storeReady = getReadinessCheckValue(erpReadiness, ['store']);
                                        const terminalReady = getReadinessCheckValue(erpReadiness, ['terminal']);
                                        const profileReady = getReadinessCheckValue(erpReadiness, ['profile']);
                                        const taxesReady = getReadinessCheckValue(erpReadiness, ['taxes', 'tax']);
                                        const paymentMethodsReady = getReadinessCheckValue(erpReadiness, ['paymentMethods', 'payment_methods', 'payments']);
                                        const warehousesReady = getReadinessCheckValue(erpReadiness, ['warehouses', 'warehouse']);
                                        const documentSeriesReady = getReadinessCheckValue(erpReadiness, ['documentSeries', 'document_series', 'series', 'sequences', 'sequencesReady', 'sequences_ready']);
                                        const itemsReady = getReadinessCheckValue(erpReadiness, ['items', 'catalog', 'catalogReady', 'catalog_ready', 'itemsReady', 'items_ready']);
                                        const profileIncomplete = isErpProfileIncomplete(erpReadiness);
                                        const lastSyncAt = getReadinessValue(erpReadiness, ['lastSyncEventAt', 'last_sync_event_at', 'lastSyncAt', 'last_sync_at']);
                                        const lastSyncType = getReadinessValue(erpReadiness, ['lastSyncEventType', 'last_sync_event_type', 'lastSyncStatus', 'last_sync_status']);
                                        const isReadinessSubmitting = erpReadinessSubmittingKey === getTerminalKey(terminal);
                                        const terminalKey = getTerminalKey(terminal);
                                        const terminalSyncPending = syncPendingByTerminal[terminalKey];
                                        const syncPending = {
                                            ...terminalSyncPending,
                                            status: terminalSyncPending?.status || 'idle',
                                            documents: terminalSyncPending?.documents || [],
                                            summary: { pending: 0, repairable: 0, functionalErrors: 0 },
                                            ...(terminalSyncPending?.summary ? { summary: terminalSyncPending.summary } : {}),
                                        };
                                        const repairableSyncCount = syncPending.documents.filter((document) => isRepairableSyncDocument(document, erpReadiness)).length;
                                        const functionalSyncErrorCount = Math.max(syncPending.summary.functionalErrors, syncPending.summary.pending - repairableSyncCount);
                                        const isSyncLoading = syncPendingLoadingKey === terminalKey;
                                        const syncBulkSubmitting = syncRetrySubmittingKey === `${terminalKey}-bulk`;
                                        const authAttempts = authAttemptsByTerminal[terminalKey] || [];
                                        const authAttemptsError = authAttemptsErrorByTerminal[terminalKey] || '';
                                        const deviceAudit = deviceAuditByTerminal[terminalKey] || [];
                                        const authStatus = getTerminalAuthStatus(terminal, authAttempts);
                                        const identity = buildTerminalIdentitySummary(terminal, authAttempts);
                                        const canonicalActionBlocked = isCanonicalTerminalActionBlocked(terminal);
                                        const reconciliationDraft = reconciliationDrafts[terminalKey] || {
                                            erpTerminalUuid: '',
                                            targetTerminalName: '',
                                            storeId: '',
                                            authorizedDeviceId: terminal.registry?.current_device_id || terminal.registry?.device_id || '',
                                            reason: '',
                                            adminConfirmed: false,
                                            correlationId: '',
                                            serverPreview: null,
                                        };
                                        const reconciliationPreview = buildTerminalReconciliationPreview(terminal, reconciliationDraft);
                                        const canonicalTerminalOptions = tenantTerminals.filter((candidate) => (
                                            candidate.id !== terminal.id && hasCanonicalErpBinding(candidate)
                                        ));
                                        const serverReconciliationPlan = reconciliationDraft.serverPreview?.plan;
                                        const isReconciliationSubmitting = reconciliationSubmittingKey === terminalKey;
                                        const authorizedDeviceId = identity.authorizedDeviceId !== 'N/D' ? identity.authorizedDeviceId : '';
                                        const posReportedDeviceId = identity.posReportedDeviceId !== 'N/D' ? identity.posReportedDeviceId : '';
                                        const erpCurrentDeviceId = identity.erpCurrentDeviceId !== 'N/D' ? identity.erpCurrentDeviceId : '';
                                        const requiresErpConfirmation = tenant.contracted_product === 'POS_ERP';
                                        const deviceIdentityAligned = isDeviceIdentityAligned(authorizedDeviceId, posReportedDeviceId, erpCurrentDeviceId, requiresErpConfirmation);
                                        const needsErpDeviceRepair = Boolean(
                                            requiresErpConfirmation
                                            && authorizedDeviceId
                                            && (!erpCurrentDeviceId || authorizedDeviceId !== erpCurrentDeviceId)
                                        );
                                        const effectiveAuthStatus = getEffectiveAuthStatus(
                                            authStatus,
                                            authorizedDeviceId,
                                            posReportedDeviceId,
                                            erpCurrentDeviceId,
                                            requiresErpConfirmation,
                                        );
                                        const authStatusClasses = getAuthStatusClasses(effectiveAuthStatus);
                                        const actionableAuthAttempts = authAttempts.filter((attempt) => {
                                            const requestedDeviceId = getAttemptDeviceId(attempt);
                                            return isPendingDeviceUnauthorizedAttempt(attempt)
                                                && requestedDeviceId !== authorizedDeviceId;
                                        });
                                        const lastRejectedDeviceId = identity.lastRejectedDeviceId !== 'N/D' ? identity.lastRejectedDeviceId : '';
                                        const lastAuthAttempt = authAttempts[0] || null;
                                        const lastAuthAttemptAt = terminal.registry?.last_auth_attempt_at || (lastAuthAttempt ? getAttemptTime(lastAuthAttempt) : null);
                                        const lastAuthError = terminal.registry?.last_auth_error || lastAuthAttempt?.reason || lastAuthAttempt?.message || '';
                                        const isAuthAttemptsLoading = authAttemptsLoadingKey === terminalKey;
                                        const rotateSubmittingKey = `${terminalKey}-ROTATE`;
                                        const syncAuthSubmittingKey = `${terminalKey}-SYNC-AUTH`;
                                        const repairErpSubmittingKey = `${terminalKey}-REPAIR-ERP`;
                                        const persistedAuthorizedDeviceId = getTerminalPersistedAuthorizedDeviceId(terminal);
                                        const needsAuthorizedDeviceSync = Boolean(
                                            terminal.registry?.device_id?.trim()
                                            && !persistedAuthorizedDeviceId,
                                        );
                                        const posOnlyProvisioningBlocked = tenant.contracted_product === 'POS_ONLY'
                                            && tenant.lifecycle_status === 'BLOCKED';
                                        const revokeDeviceId = terminal.registry?.previous_device_id || lastRejectedDeviceId;
                                        const revokeSubmittingKey = revokeDeviceId ? `${terminalKey}-REVOKE-${revokeDeviceId}` : '';
                                        const clearDevicesSubmittingKey = `${terminalKey}-CLEAR-DEVICES`;
                                        const fiscalReadiness = getFiscalReadiness(terminal);
                                        const fiscalDebug = summarizeTerminalFiscalDebug(fiscalReadiness);
                                        const fiscalStatus = fiscalDebug.fiscalReadiness;
                                        const fiscalStatusClasses = getFiscalStatusClasses(fiscalStatus);
                                        const isFiscalLoading = fiscalReadinessLoadingKey === terminalKey;
                                        const hasActionableAuthIssue = needsErpDeviceRepair || (!deviceIdentityAligned && (
                                            !['AUTHORIZED', 'TAKEOVER_COMPLETED', 'REAUTH_COMPLETED'].includes(effectiveAuthStatus)
                                            || actionableAuthAttempts.length > 0
                                        ));
                                        const hasActionableErpIssue = profileIncomplete && (syncPending.summary.pending > 0 || erpReadinessStatus === 'error');
                                        const hasActionableSyncIssue = syncPending.summary.pending > 0 && (repairableSyncCount > 0 || functionalSyncErrorCount > 0);
                                        const hasActionableFiscalIssue = isFiscalEligibleTenant(tenant) && fiscalStatus === 'ERROR';
                                        const hasAdvancedSignal = hasActionableAuthIssue || hasActionableErpIssue || hasActionableSyncIssue || hasActionableFiscalIssue;
                                        const isAdvancedOpen = Boolean(terminalAdvancedOpen[terminalKey]);
                                        const showHistoricalAuthDetails = isAdvancedOpen || hasActionableAuthIssue;
                                        const displayRejectedDeviceId = showHistoricalAuthDetails ? identity.lastRejectedDeviceId : 'N/D';
                                        const displayLastAuthError = showHistoricalAuthDetails ? lastAuthError : '';
                                        const displayLastAuthAttemptAt = showHistoricalAuthDetails ? lastAuthAttemptAt : null;
                                        const hasVisibleMismatchWarning = Boolean(identity.mismatchWarning && hasActionableAuthIssue);
                                        const operationalStatus = !hasOnlineRegistry
                                            ? 'OFFLINE'
                                            : hasActionableAuthIssue
                                                ? 'AUTH_REQUIRED'
                                                : hasActionableErpIssue || hasActionableSyncIssue || hasActionableFiscalIssue
                                                    ? 'ATTENTION'
                                                    : authorizedDeviceId || erpReadinessStatus === 'ready' || posReportedDeviceId
                                                        ? 'OPERATIVE'
                                                        : 'PENDING';
                                        const requestedTerminalTab = terminalTabs[terminalKey] || 'summary';
                                        const baseTerminalTabOptions: Array<{ key: TerminalTabKey; label: string; count?: number }> = [
                                            { key: 'summary', label: 'Resumen' },
                                            { key: 'devices', label: 'Dispositivos' },
                                            ...(canReauthorizeTerminals
                                                ? [{ key: 'attempts' as TerminalTabKey, label: 'Solicitudes', count: actionableAuthAttempts.length }]
                                                : []),
                                        ];
                                        const advancedTerminalTabOptions: Array<{ key: TerminalTabKey; label: string; count?: number }> = [
                                            { key: 'erp', label: 'Preparacion ERP' },
                                            { key: 'sync', label: 'Sync', count: syncPending.summary.pending },
                                            ...(isFiscalEligibleTenant(tenant) ? [{ key: 'fiscal' as TerminalTabKey, label: 'Fiscal' }] : []),
                                        ];
                                        const terminalTabOptions = isAdvancedOpen
                                            ? [...baseTerminalTabOptions, ...advancedTerminalTabOptions]
                                            : baseTerminalTabOptions;
                                        const activeTerminalTab = terminalTabOptions.some((tab) => tab.key === requestedTerminalTab)
                                            ? requestedTerminalTab
                                            : 'summary';
                                        const detectedAuthorizationDeviceId = lastRejectedDeviceId
                                            || (posReportedDeviceId && posReportedDeviceId !== authorizedDeviceId ? posReportedDeviceId : '');
                                        const manualDeviceId = manualDeviceIds[terminalKey]?.trim() || '';
                                        const authorizationDeviceId = detectedAuthorizationDeviceId || manualDeviceId;
                                        const manualAuthorizeKey = authorizationDeviceId ? `${terminalKey}-TAKEOVER-${authorizationDeviceId}` : '';

                                        return (
                                            <div key={`${terminal.id}`} className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
                                                <div className="bg-slate-50 border-b border-slate-100 p-5 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`rounded-2xl p-3 ${hasOnlineRegistry ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                                            {hasOnlineRegistry ? <Wifi size={20} /> : <WifiOff size={20} />}
                                                        </div>
                                                        <div>
                                                            <p className={`text-[10px] font-black uppercase tracking-wider ${terminal.erp_store_name ? 'text-blue-600' : 'text-amber-600'}`}>
                                                                {terminal.erp_store_name ? 'Sucursal' : 'Contexto pendiente'}
                                                            </p>
                                                            <div className="mt-0.5 flex flex-wrap items-center gap-3">
                                                                <h4 className="font-black text-slate-800 text-lg">
                                                                    <span>{terminal.erp_store_name || 'Sin sucursal vinculada'}</span>
                                                                    <span className="mx-2 text-slate-300">·</span>
                                                                    <span>{terminal.name}</span>
                                                                </h4>
                                                                <span className={`font-bold text-xs px-2.5 py-1 rounded-lg ${
                                                                    (terminal.registries || []).length > 1 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                                                }`}>
                                                                    {terminal.registries?.length || 0} Registro(s)
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-slate-500 font-mono mt-0.5">
                                                                Terminal ID: {terminal.terminal_id || 'N/D'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <span className={`px-3 py-1 rounded-full border text-[11px] font-bold uppercase ${getOperationalStatusClasses(operationalStatus)}`}>
                                                            {getOperationalStatusLabel(operationalStatus)}
                                                        </span>
                                                        {hasAdvancedSignal ? (
                                                            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase text-amber-700">
                                                                Revisar soporte
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                <div className="p-5 space-y-5">
                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-1">
                                                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                                            <div className="flex min-w-0 gap-1 overflow-x-auto">
                                                            {terminalTabOptions.map((tab) => {
                                                                const isActive = activeTerminalTab === tab.key;
                                                                return (
                                                                    <button
                                                                        key={tab.key}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setTerminalTabs((current) => ({
                                                                                ...current,
                                                                                [terminalKey]: tab.key,
                                                                            }));
                                                                            if (tab.key === 'attempts' && !authAttemptsByTerminal[terminalKey]) {
                                                                                void loadTerminalAuthAttempts(tenant.id, terminal);
                                                                            }
                                                                            if (tab.key === 'fiscal' && !fiscalReadinessByTerminal[terminalKey]) {
                                                                                void loadTerminalFiscalReadiness(tenant.id, terminal);
                                                                            }
                                                                            if (tab.key === 'sync' && !terminalSyncPending) {
                                                                                void loadTerminalSyncPending(tenant.id, terminal);
                                                                            }
                                                                        }}
                                                                        className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                                                                            isActive
                                                                                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100'
                                                                                : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                                                                        }`}
                                                                    >
                                                                        {tab.label}
                                                                        {typeof tab.count === 'number' && tab.count > 0 ? (
                                                                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                                                                                isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                                                                            }`}>
                                                                                {tab.count}
                                                                            </span>
                                                                        ) : null}
                                                                    </button>
                                                                );
                                                            })}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setTerminalAdvancedOpen((current) => ({
                                                                    ...current,
                                                                    [terminalKey]: !isAdvancedOpen,
                                                                }))}
                                                                className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                                                                    isAdvancedOpen
                                                                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                                                                        : 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:text-slate-900'
                                                                }`}
                                                            >
                                                                {isAdvancedOpen ? 'Ocultar soporte avanzado' : 'Soporte avanzado'}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {activeTerminalTab === 'summary' ? (
                                                    <div className={`rounded-2xl border px-4 py-4 ${authStatusClasses}`}>
                                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                            <div>
                                                                <p className="text-xs font-bold uppercase tracking-wider">Identidad y autorizacion</p>
                                                                <p className="mt-1 text-sm font-bold">{getAuthStatusLabel(effectiveAuthStatus)}</p>
                                                                <p className="mt-1 text-xs opacity-80">
                                                                    Cloud-Admin muestra autorizacion, heartbeat del POS y device actual reportado por ERP por separado.
                                                                </p>
                                                            </div>
                                                            {(isAdvancedOpen || hasActionableAuthIssue || posOnlyProvisioningBlocked || needsAuthorizedDeviceSync || detectedAuthorizationDeviceId || !hasOnlineRegistry) ? (
                                                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                                                                {posOnlyProvisioningBlocked ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleReleasePosOnlyProvisioningBlock()}
                                                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 shadow-sm hover:bg-amber-100 transition-colors"
                                                                    >
                                                                        <ShieldCheck size={16} />
                                                                        Quitar bloqueo POS
                                                                    </button>
                                                                ) : null}
                                                                {needsAuthorizedDeviceSync && tenant.contracted_product !== 'POS_ERP' ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleSyncAuthorizedDevice(terminal)}
                                                                        disabled={deviceActionSubmittingKey === syncAuthSubmittingKey}
                                                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900 shadow-sm hover:bg-emerald-100 transition-colors disabled:opacity-60"
                                                                    >
                                                                        {deviceActionSubmittingKey === syncAuthSubmittingKey ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                                                        Persistir device autorizado
                                                                    </button>
                                                                ) : null}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void loadTerminalAuthAttempts(tenant.id, terminal)}
                                                                    disabled={isAuthAttemptsLoading}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-current bg-white/80 px-4 py-2 text-sm font-bold shadow-sm hover:bg-white transition-colors disabled:opacity-60"
                                                                >
                                                                    {isAuthAttemptsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                                                    Actualizar intentos
                                                                </button>
                                                                {detectedAuthorizationDeviceId && canReauthorizeTerminals ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleAuthorizeDeviceForManualInput(terminal, detectedAuthorizationDeviceId)}
                                                                        disabled={canonicalActionBlocked || deviceActionSubmittingKey === manualAuthorizeKey}
                                                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 shadow-sm hover:bg-amber-100 transition-colors disabled:opacity-60"
                                                                    >
                                                                        {deviceActionSubmittingKey === manualAuthorizeKey ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                                                                        Autorizar device detectado
                                                                    </button>
                                                                ) : null}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleRotateTerminalCredentials(terminal)}
                                                                    disabled={!canReauthorizeTerminals || canonicalActionBlocked || !authorizedDeviceId || deviceActionSubmittingKey !== null}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    {deviceActionSubmittingKey === rotateSubmittingKey ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                                                                    Rotar credenciales
                                                                </button>
                                                                {needsErpDeviceRepair ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleRepairErpDeviceMapping(terminal)}
                                                                        disabled={canonicalActionBlocked || !authorizedDeviceId || deviceActionSubmittingKey === repairErpSubmittingKey}
                                                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                                                                    >
                                                                        {deviceActionSubmittingKey === repairErpSubmittingKey ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                                                                        Reparar enlace ERP
                                                                    </button>
                                                                ) : null}
                                                            </div>
                                                            ) : null}
                                                        </div>
                                                        {hasVisibleMismatchWarning ? (
                                                            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-3 text-sm font-semibold text-red-800">
                                                                {identity.mismatchWarning}
                                                            </div>
                                                        ) : null}
                                                        {identity.reconciliationWarning ? (
                                                            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                                                                <p className="font-bold">{identity.reconciliationWarning}</p>
                                                                <p className="mt-1">{CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE}</p>
                                                                <details className="mt-3 rounded-lg border border-amber-200 bg-white/70 p-3">
                                                                    <summary className="cursor-pointer font-bold">Vista previa de reconciliación (dry-run)</summary>
                                                                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                                                                        <select
                                                                            value={reconciliationDraft.erpTerminalUuid}
                                                                            onChange={(event) => {
                                                                                const target = canonicalTerminalOptions.find((candidate) => candidate.erp_terminal_uuid === event.target.value);
                                                                                updateReconciliationDraft(terminalKey, reconciliationDraft, {
                                                                                    erpTerminalUuid: event.target.value,
                                                                                    targetTerminalName: target?.name || '',
                                                                                    storeId: target?.erp_store_id || '',
                                                                                });
                                                                            }}
                                                                            className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"
                                                                        >
                                                                            <option value="">Terminal ERP destino…</option>
                                                                            {canonicalTerminalOptions.map((candidate) => (
                                                                                <option key={candidate.erp_terminal_uuid} value={candidate.erp_terminal_uuid || ''}>
                                                                                    {candidate.name} · {candidate.erp_terminal_uuid}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                        <select
                                                                            value={reconciliationDraft.storeId}
                                                                            onChange={(event) => updateReconciliationDraft(terminalKey, reconciliationDraft, { storeId: event.target.value })}
                                                                            className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"
                                                                        >
                                                                            <option value="">Sucursal ERP destino…</option>
                                                                            {canonicalTerminalOptions
                                                                                .filter((candidate) => candidate.erp_store_id)
                                                                                .map((candidate) => (
                                                                                    <option key={`${candidate.erp_terminal_uuid}-${candidate.erp_store_id}`} value={candidate.erp_store_id || ''}>
                                                                                        {candidate.name} · {candidate.erp_store_id}
                                                                                    </option>
                                                                                ))}
                                                                        </select>
                                                                        <input
                                                                            value={reconciliationDraft.authorizedDeviceId}
                                                                            onChange={(event) => updateReconciliationDraft(terminalKey, reconciliationDraft, { authorizedDeviceId: event.target.value })}
                                                                            placeholder="Device ID autorizado resultante"
                                                                            className="rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs"
                                                                        />
                                                                        <input
                                                                            value={reconciliationDraft.reason}
                                                                            onChange={(event) => updateReconciliationDraft(terminalKey, reconciliationDraft, { reason: event.target.value })}
                                                                            placeholder="Motivo administrativo obligatorio"
                                                                            className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"
                                                                        />
                                                                    </div>
                                                                    <label className="mt-2 flex items-center gap-2 text-xs font-semibold">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={reconciliationDraft.adminConfirmed}
                                                                            onChange={(event) => updateReconciliationDraft(terminalKey, reconciliationDraft, { adminConfirmed: event.target.checked })}
                                                                        />
                                                                        Confirmo que revisé tenant, sucursal, terminal, devices y rollback
                                                                    </label>
                                                                    <p className="mt-3 text-xs font-bold">DRY-RUN · escrituras realizadas: no</p>
                                                                    <p className="mt-1 text-xs">Estado: {reconciliationPreview.executable ? 'Plan validable' : 'Bloqueado'}</p>
                                                                    <p className="mt-1 text-xs"><strong>Origen:</strong> registry {terminal.registry?.id || 'N/D'}</p>
                                                                    <p className="mt-1 text-xs"><strong>Destino:</strong> {reconciliationDraft.targetTerminalName || 'N/D'} · {reconciliationDraft.erpTerminalUuid || 'N/D'}</p>
                                                                    <p className="mt-1 text-xs"><strong>Sucursal:</strong> {reconciliationDraft.storeId || 'N/D'}</p>
                                                                    <p className="mt-1 text-xs"><strong>Device resultante:</strong> {reconciliationDraft.authorizedDeviceId || 'N/D'}</p>
                                                                    {reconciliationPreview.blockers.length ? (
                                                                        <ul className="mt-1 list-disc pl-5 text-xs">
                                                                            {reconciliationPreview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                                                                        </ul>
                                                                    ) : null}
                                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void handleTerminalReconciliation(terminal, reconciliationDraft, 'DRY_RUN')}
                                                                            disabled={!reconciliationPreview.executable || isReconciliationSubmitting}
                                                                            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
                                                                        >
                                                                            {isReconciliationSubmitting ? 'Validando…' : 'Validar dry-run servidor'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void handleTerminalReconciliation(terminal, reconciliationDraft, 'EXECUTE')}
                                                                            disabled={
                                                                                !reconciliationPreview.executable
                                                                                || isReconciliationSubmitting
                                                                                || reconciliationDraft.serverPreview?.status !== 'dry_run'
                                                                                || !reconciliationDraft.serverPreview.plan_hash
                                                                                || Boolean(serverReconciliationPlan?.destructive_operations?.length)
                                                                            }
                                                                            className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                                                        >
                                                                            Ejecutar reconciliación
                                                                        </button>
                                                                    </div>
                                                                    {serverReconciliationPlan ? (
                                                                        <div className="mt-3 grid gap-3 rounded-lg border border-amber-200 bg-white p-3 md:grid-cols-2">
                                                                            <div>
                                                                                <p className="font-bold">Devices históricos</p>
                                                                                <p className="font-mono text-xs">{serverReconciliationPlan.historical_device_ids.join(', ') || 'Ninguno'}</p>
                                                                                <p className="mt-2 font-bold">Registros huérfanos afectados</p>
                                                                                <p className="font-mono text-xs break-all">{serverReconciliationPlan.orphan_registry_ids.join(', ') || 'Ninguno'}</p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="font-bold">Plan de escritura</p>
                                                                                <ul className="list-disc pl-4 text-xs">{serverReconciliationPlan.writes.map((item) => <li key={item}>{item}</li>)}</ul>
                                                                                <p className="mt-2 font-bold">Plan de rollback</p>
                                                                                <ul className="list-disc pl-4 text-xs">{serverReconciliationPlan.rollback.map((item) => <li key={item}>{item}</li>)}</ul>
                                                                            </div>
                                                                            <p className="md:col-span-2 font-mono text-[10px] break-all">Plan hash: {reconciliationDraft.serverPreview?.plan_hash}</p>
                                                                        </div>
                                                                    ) : null}
                                                                </details>
                                                            </div>
                                                        ) : null}

                                                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Terminal ERP UUID</p>
                                                                <p className="mt-1 font-mono break-all text-xs">{identity.erpTerminalUuid}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">UUID catálogo Cloud</p>
                                                                <p className="mt-1 font-mono break-all text-xs">{identity.catalogTerminalId}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Terminal code / POS ID</p>
                                                                <p className="mt-1 font-mono break-all">{identity.terminalCode}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Nombre local</p>
                                                                <p className="mt-1 font-bold">{identity.localName}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Estado autorizacion</p>
                                                                <p className="mt-1 font-bold uppercase">{getAuthStatusLabel(effectiveAuthStatus)}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Device autorizado actual</p>
                                                                <p className="mt-1 font-mono break-all">{identity.authorizedDeviceId}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Device actual visto por POS</p>
                                                                <p className="mt-1 font-mono break-all">{identity.posReportedDeviceId}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Device actual en ERP</p>
                                                                <p className={`mt-1 font-mono break-all ${needsErpDeviceRepair ? 'text-red-700' : ''}`}>{identity.erpCurrentDeviceId}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Device registrado en Cloud</p>
                                                                <p className="mt-1 font-mono break-all">{terminal.registry?.device_id || 'N/D'}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Estado de reconciliación</p>
                                                                <p className="mt-1 font-bold uppercase">{identity.identityStatus}</p>
                                                                <p className="mt-1 text-xs opacity-70">Fuente: {identity.bindingSource}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Ultimo device rechazado</p>
                                                                <p className="mt-1 font-mono break-all">{displayRejectedDeviceId}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 md:col-span-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Devices historicos</p>
                                                                <p className="mt-1 font-mono break-words text-xs">
                                                                    {identity.historicalDeviceIds.length
                                                                        ? identity.historicalDeviceIds.join(' · ')
                                                                        : 'N/D'}
                                                                </p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Ultimo error auth</p>
                                                                <p className="mt-1 font-bold break-words">{displayLastAuthError || 'N/D'}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Ultimo intento</p>
                                                                <p className="mt-1">{formatDateTime(displayLastAuthAttemptAt)}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    ) : null}

                                                    {activeTerminalTab === 'devices' ? (
                                                    <div>
                                                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                            <div>
                                                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dispositivos registrados y roles</h5>
                                                                <p className="mt-1 text-xs text-slate-500">Limpia solo autorizaciones de devices de prueba; no borra ventas, maestros, fiscal ni secuencias.</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleClearTerminalDevices(terminal)}
                                                                disabled={canonicalActionBlocked || deviceActionSubmittingKey === clearDevicesSubmittingKey}
                                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-red-700 shadow-sm hover:bg-red-50 transition-colors disabled:opacity-60"
                                                            >
                                                                {deviceActionSubmittingKey === clearDevicesSubmittingKey ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                                                Limpiar devices
                                                            </button>
                                                        </div>
                                                        {identity.deviceRows.length === 0 ? (
                                                            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                                                                <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Fallback tecnico: autorizar device reportado</p>
                                                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                                                    <input
                                                                        type="text"
                                                                        value={manualDeviceIds[terminalKey] || ''}
                                                                        onChange={(event) => setManualDeviceIds((current) => ({
                                                                            ...current,
                                                                            [terminalKey]: event.target.value.toUpperCase(),
                                                                        }))}
                                                                        placeholder="Device reportado por el POS, ej. DEV-D31OAKBD"
                                                                        className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleAuthorizeDeviceForManualInput(terminal, manualDeviceIds[terminalKey] || '')}
                                                                        disabled={canonicalActionBlocked || !manualDeviceId || deviceActionSubmittingKey === manualAuthorizeKey}
                                                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                                    >
                                                                        {deviceActionSubmittingKey === manualAuthorizeKey ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                                                                        Autorizar device
                                                                    </button>
                                                                </div>
                                                                <p className="mt-2 text-xs text-amber-800">
                                                                    Usar solo si el ERP todavia no reporto el intento rechazado.
                                                                </p>
                                                            </div>
                                                        ) : null}
                                                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                                                            <table className="w-full text-left text-sm whitespace-nowrap">
                                                                <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-100 bg-slate-50">
                                                                    <tr>
                                                                        <th className="px-4 py-3 font-bold">Roles</th>
                                                                        <th className="px-4 py-3 font-bold">Device ID</th>
                                                                        <th className="px-4 py-3 font-bold">Estado red</th>
                                                                        <th className="px-4 py-3 font-bold">Red / Endpoint</th>
                                                                        <th className="px-4 py-3 font-bold">Version APK</th>
                                                                        <th className="px-4 py-3 font-bold text-right">Ultimo tick</th>
                                                                        <th className="px-4 py-3 font-bold text-right">Acciones</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-50">
                                                                    {identity.deviceRows.length === 0 ? (
                                                                        <tr>
                                                                            <td colSpan={7} className="px-4 py-6 text-center text-slate-500 text-sm">
                                                                                Sin devices reportados para esta terminal.
                                                                            </td>
                                                                        </tr>
                                                                    ) : identity.deviceRows.map((deviceRow, deviceIndex) => {
                                                                        const registry = (terminal.registries || []).find((reg) => reg.id === deviceRow.registryId) || terminal.registry;
                                                                        const mockTerminal = registry ? { ...terminal, registry } : terminal;
                                                                        const rStatusLabel = registry ? getRegistryStatusLabel(mockTerminal) : 'N/D';
                                                                        const rVersionKey = getApkVersionKey(mockTerminal);
                                                                        const rIsOutOfVersion = Boolean(referenceVersionKey && rVersionKey && rVersionKey !== referenceVersionKey);
                                                                        const rVersionSource = getApkVersionSourceLabel(mockTerminal);
                                                                        const prefLanIp = registry ? getPreferredLanIp(mockTerminal) : 'N/D';
                                                                        const endpointRole = getRegistryEndpointRole(registry);
                                        const canReleaseLicenseSlot = Boolean(
                                            tenant?.contracted_product !== 'POS_ERP'
                                            && registry?.id
                                            && rStatusLabel === 'ONLINE'
                                            && !registry.is_revoked
                                            && registry.auth_status !== 'OLD_DEVICE_REVOKED',
                                        );
                                                                        const releaseSubmittingKey = registry?.id
                                                                            ? `${terminalKey}-RELEASE-${deviceRow.deviceId}`
                                                                            : '';
                                                                        const rowDeviceId = deviceRow.deviceId.trim();
                                                                        const authorizeRowKey = rowDeviceId ? `${terminalKey}-TAKEOVER-${rowDeviceId}` : '';
                                                                        const canAuthorizeDeviceRow = canReauthorizeTerminals
                                                                            && Boolean(rowDeviceId)
                                                                            && !deviceRow.roles.includes('AUTHORIZED_CURRENT')
                                                                            && !deviceRow.roles.includes('LICENSE_EXCEEDED');

                                                                        return (
                                                                            <tr key={`${deviceRow.deviceId}-${deviceIndex}`} className={`hover:bg-slate-50 transition-colors ${rIsOutOfVersion ? 'bg-amber-50/20' : ''}`}>
                                                                                <td className="px-4 py-3 align-top">
                                                                                    <div className="flex flex-wrap gap-1 max-w-xs">
                                                                                        {deviceRow.roles.map((role) => (
                                                                                            <span
                                                                                                key={`${deviceRow.deviceId}-${role}`}
                                                                                                className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${getDeviceRoleClasses(role)}`}
                                                                                                title={getDeviceRoleLabel(role)}
                                                                                            >
                                                                                                {role}
                                                                                            </span>
                                                                                        ))}
                                                                                        {!deviceRow.roles.includes(endpointRole) ? (
                                                                                            <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${getDeviceRoleClasses(endpointRole)}`}>
                                                                                                {endpointRole}
                                                                                            </span>
                                                                                        ) : null}
                                                                                    </div>
                                                                                    <p className="mt-1 text-[10px] text-slate-400">{deviceRow.source}</p>
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top">
                                                                                    <p className="font-mono font-bold text-slate-700 text-[11px]">{deviceRow.deviceId}</p>
                                                                                    {registry?.hostname ? <p className="text-[10px] text-slate-500">{registry.hostname}</p> : null}
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top">
                                                                                    {registry ? (
                                                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${getRegistryStatusClassName(rStatusLabel)}`}>
                                                                                            {rStatusLabel}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-[10px] text-slate-400">Sin heartbeat</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top">
                                                                                    <p className="font-mono text-emerald-700 font-bold text-[11px]">{prefLanIp}</p>
                                                                                    {registry?.endpoint_url ? (
                                                                                        <p className="text-[10px] text-slate-400 font-mono" title="Endpoint">{registry.endpoint_url}</p>
                                                                                    ) : null}
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top">
                                                                                    {registry ? (
                                                                                        <div className="flex flex-col items-start gap-0.5">
                                                                                            <span className="font-mono text-slate-700 text-[11px]">{formatApkVersion(mockTerminal)}</span>
                                                                                            {rVersionSource ? <span className="text-[10px] text-slate-400 font-bold">Fuente: {rVersionSource}</span> : null}
                                                                                            {rIsOutOfVersion ? <span className="text-[10px] text-amber-600 font-bold">Desfasado</span> : null}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="text-[10px] text-slate-400">N/D</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top text-right">
                                                                                    <p className="text-[10px] text-slate-500">{formatDateTime(deviceRow.lastSeenAt)}</p>
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top text-right">
                                                                                    <div className="flex flex-col items-end gap-1.5">
                                                                                        {canAuthorizeDeviceRow ? (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => void handleAuthorizeDeviceForManualInput(terminal, rowDeviceId)}
                                                                                                disabled={canonicalActionBlocked || deviceActionSubmittingKey !== null}
                                                                                                title={`Autoriza ${rowDeviceId} para ${terminal.name} y revoca el device activo anterior.`}
                                                                                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold uppercase text-emerald-900 hover:bg-emerald-100 transition-colors disabled:opacity-60"
                                                                                            >
                                                                                                {deviceActionSubmittingKey === authorizeRowKey
                                                                                                    ? <Loader2 size={12} className="animate-spin" />
                                                                                                    : <ShieldCheck size={12} />}
                                                                                                Autorizar
                                                                                            </button>
                                                                                        ) : null}
                                                                                        {canReleaseLicenseSlot && registry?.id ? (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => void handleReleaseTerminalLicenseSlot(
                                                                                                    terminal,
                                                                                                    registry.id,
                                                                                                    deviceRow.deviceId,
                                                                                                )}
                                                                                                disabled={deviceActionSubmittingKey === releaseSubmittingKey}
                                                                                                title={tenant?.contracted_product === 'POS_ONLY'
                                                                                    ? 'Libera toda la caja (terminal) para reactivar otro Android'
                                                                                    : 'Libera el cupo de licencia para otro Android'}
                                                                                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold uppercase text-amber-900 hover:bg-amber-100 transition-colors disabled:opacity-60"
                                                                                            >
                                                                                                {deviceActionSubmittingKey === releaseSubmittingKey
                                                                                                    ? <Loader2 size={12} className="animate-spin" />
                                                                                                    : <Unlink size={12} />}
                                                                                                Liberar cupo
                                                                                            </button>
                                                                                        ) : null}
                                                                                        {!canAuthorizeDeviceRow && !(canReleaseLicenseSlot && registry?.id) ? (
                                                                                            <span className="text-[10px] text-slate-400">—</span>
                                                                                        ) : null}
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                    ) : null}
                                                </div>

                                                {activeTerminalTab === 'attempts' ? (
                                                <div className={`mx-5 rounded-2xl border px-4 py-4 ${authStatusClasses}`}>
                                                    <p className="text-xs font-bold uppercase tracking-wider">Solicitudes de dispositivo</p>
                                                    <div className="mt-3 rounded-xl border border-white/60 bg-white/70 overflow-hidden">
                                                        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/60">
                                                            <div>
                                                                <p className="text-sm font-black text-slate-800">{terminal.name} / {terminal.terminal_code || terminal.terminal_id || 'N/D'}</p>
                                                                <p className="mt-0.5 font-mono text-[10px] text-slate-500">UUID ERP: {getTerminalTakeoverId(terminal) || 'N/D'}</p>
                                                            </div>
                                                            {isAuthAttemptsLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                                                        </div>
                                                        {authAttemptsError ? (
                                                            <div className="px-3 py-4 text-sm text-red-800">
                                                                <p className="font-bold">No se pudieron cargar las solicitudes de dispositivo.</p>
                                                                <p className="mt-1 text-xs">{authAttemptsError}</p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void loadTerminalAuthAttempts(tenant.id, terminal)}
                                                                    disabled={isAuthAttemptsLoading}
                                                                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-800 hover:bg-red-50 disabled:opacity-60"
                                                                >
                                                                    {isAuthAttemptsLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                                                                    Reintentar carga
                                                                </button>
                                                            </div>
                                                        ) : authAttempts.length === 0 ? (
                                                            <div className="px-3 py-4 text-sm opacity-75">
                                                                <p>No hay solicitudes de dispositivo reportadas por el ERP para esta terminal.</p>
                                                            </div>
                                                        ) : (
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-left text-xs">
                                                                    <thead className="bg-white/80 uppercase tracking-wider opacity-70">
                                                                        <tr>
                                                                            <th className="px-3 py-2">Dispositivo autorizado</th>
                                                                            <th className="px-3 py-2">Dispositivo solicitante</th>
                                                                            <th className="px-3 py-2">Solicitud</th>
                                                                            <th className="px-3 py-2">Estado</th>
                                                                            <th className="px-3 py-2 text-right">Acciones</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-white/70">
                                                                        {authAttempts.map((attempt, attemptIndex) => {
                                                                            const requestedDeviceId = getAttemptDeviceId(attempt);
                                                                            const attemptStatus = getDeviceRequestStatusLabel(attempt);
                                                                            const canReauthorize = canReauthorizeTerminals
                                                                                && Boolean(attempt.id)
                                                                                && isPendingDeviceUnauthorizedAttempt(attempt);
                                                                            const reauthorizeKey = `${terminalKey}-TAKEOVER-${requestedDeviceId}`;
                                                                            const rejectKey = `${terminalKey}-REJECT-${attempt.id || requestedDeviceId}`;
                                                                            return (
                                                                                <React.Fragment key={attempt.id || `${requestedDeviceId}-${attemptIndex}`}>
                                                                                    <tr>
                                                                                        <td className="px-3 py-2 font-mono">{attempt.authorized_device_id || authorizedDeviceId || 'N/D'}</td>
                                                                                        <td className="px-3 py-2 font-mono font-bold">{requestedDeviceId || 'N/D'}</td>
                                                                                        <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(getAttemptTime(attempt))}</td>
                                                                                        <td className="px-3 py-2 font-bold uppercase">{attemptStatus}</td>
                                                                                        <td className="px-3 py-2 text-right">
                                                                                            {canReauthorize ? (
                                                                                                <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:justify-end">
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => void handleReauthorizeAttempt(terminal, attempt)}
                                                                                                        disabled={canonicalActionBlocked || deviceActionSubmittingKey !== null}
                                                                                                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-60"
                                                                                                    >
                                                                                                        {deviceActionSubmittingKey === reauthorizeKey ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                                                                                        Autorizar y reemplazar
                                                                                                    </button>
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => void handleRejectDeviceRequest(terminal, attempt)}
                                                                                                        disabled={deviceActionSubmittingKey !== null}
                                                                                                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                                                                                    >
                                                                                                        {deviceActionSubmittingKey === rejectKey ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
                                                                                                        Rechazar
                                                                                                    </button>
                                                                                                </div>
                                                                                            ) : (
                                                                                                <span className="text-slate-400">Sin accion</span>
                                                                                            )}
                                                                                        </td>
                                                                                    </tr>
                                                                                </React.Fragment>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-4 rounded-xl border border-white/60 bg-white/70 overflow-hidden">
                                                        <div className="px-3 py-2 border-b border-white/60">
                                                            <p className="text-xs font-bold uppercase tracking-wider">Auditoría de reautorización</p>
                                                        </div>
                                                        {deviceAudit.length === 0 ? (
                                                            <p className="px-3 py-4 text-sm opacity-75">No hay operaciones auditadas para esta terminal.</p>
                                                        ) : (
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-left text-xs">
                                                                    <thead className="bg-white/80 uppercase tracking-wider opacity-70">
                                                                        <tr>
                                                                            <th className="px-3 py-2">Anterior</th>
                                                                            <th className="px-3 py-2">Nuevo</th>
                                                                            <th className="px-3 py-2">Usuario</th>
                                                                            <th className="px-3 py-2">Fecha</th>
                                                                            <th className="px-3 py-2">Resultado</th>
                                                                            <th className="px-3 py-2">Operación</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-white/70">
                                                                        {deviceAudit.map((entry) => {
                                                                            const operationId = typeof entry.metadata?.operation_id === 'string'
                                                                                ? entry.metadata.operation_id
                                                                                : entry.id;
                                                                            return (
                                                                                <tr key={entry.id}>
                                                                                    <td className="px-3 py-2 font-mono">{entry.old_device_id || 'N/D'}</td>
                                                                                    <td className="px-3 py-2 font-mono font-bold">{entry.new_device_id || 'N/D'}</td>
                                                                                    <td className="px-3 py-2">{entry.performed_by || 'N/D'}</td>
                                                                                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(entry.performed_at)}</td>
                                                                                    <td className="px-3 py-2 font-bold">{entry.result || entry.erp_error_code || 'N/D'}</td>
                                                                                    <td className="px-3 py-2 font-mono text-[10px] break-all">{operationId}</td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {revokeDeviceId && revokeDeviceId !== authorizedDeviceId ? (
                                                        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/60 bg-white/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                                                            <div className="text-sm">
                                                                <p className="font-bold">Device anterior detectado</p>
                                                                <p className="font-mono text-xs break-all">{revokeDeviceId}</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleRevokePreviousDevice(terminal, revokeDeviceId)}
                                                                disabled={canonicalActionBlocked || deviceActionSubmittingKey === revokeSubmittingKey}
                                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60"
                                                            >
                                                                {deviceActionSubmittingKey === revokeSubmittingKey ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                                                                Revocar equipo anterior
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                                ) : null}

                                                {activeTerminalTab === 'erp' ? (
                                                <div className={`mx-5 mt-5 rounded-2xl border px-4 py-4 ${getReadinessBadgeClasses(erpReadinessStatus)}`}>
                                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                        <div>
                                                            <p className="text-xs font-bold uppercase tracking-wider">Preparacion ERP</p>
                                                            <p className="mt-1 text-sm font-bold">{getReadinessLabel(erpReadinessStatus)}</p>
                                                            {erpReadinessStatus !== 'ready' ? (
                                                                <p className="mt-1 text-sm">
                                                                    POS vinculado, pero el contexto ERP aun no esta listo.
                                                                </p>
                                                            ) : null}
                                                            {profileIncomplete ? (
                                                                <p className="mt-2 rounded-xl border border-amber-200 bg-white/80 px-3 py-2 text-sm font-semibold text-amber-800">
                                                                    Perfil ERP de terminal incompleto. Los documentos pueden quedar pendientes hasta preparar la terminal.
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                        <div className="flex flex-col gap-2 sm:flex-row">
                                                            {profileIncomplete ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handlePrepareErpProfile(terminal)}
                                                                    disabled={isReadinessSubmitting}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 transition-colors disabled:opacity-60"
                                                                >
                                                                    {isReadinessSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                                                                    Preparar perfil ERP
                                                                </button>
                                                            ) : null}
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleRetryErpReadiness(terminal)}
                                                                disabled={isReadinessSubmitting}
                                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-current bg-white/80 px-4 py-2 text-sm font-bold shadow-sm hover:bg-white transition-colors disabled:opacity-60"
                                                            >
                                                                {isReadinessSubmitting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                                                Reintentar preparacion ERP
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">ERP tenant</p>
                                                            <p className="mt-1 font-mono break-all">{erpTenantId || 'No vinculado'}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Tenant</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(tenantReady, 'OK', 'Faltante')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Compania</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(companyReady, 'OK', 'Faltante')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Sucursal</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(storeReady, 'OK', 'Faltante')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Terminal ERP</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(terminalReady, 'OK', 'Faltante')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Terminal profile</p>
                                                            <p className="mt-1 font-bold uppercase">{profileStatus}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Perfil</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(profileReady, 'OK', 'DRAFT / faltante')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Impuestos</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(taxesReady, 'OK', 'Faltante')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Metodos de pago</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(paymentMethodsReady, 'OK', 'Faltante')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Almacenes</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(warehousesReady, 'OK', 'Faltante')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Secuencias</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(documentSeriesReady, 'Disponibles', 'Faltantes')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Articulos</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(itemsReady, 'Disponibles', 'Vacio / faltante')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 md:col-span-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Ultimo evento sync</p>
                                                            <p className="mt-1">
                                                                {lastSyncAt ? formatDateTime(lastSyncAt) : 'N/D'}
                                                                {lastSyncType ? <span className="font-mono"> · {lastSyncType}</span> : null}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {erpReadiness?.checked_at ? (
                                                        <p className="mt-3 text-xs opacity-75">
                                                            Ultima validacion ERP: {formatDateTime(erpReadiness.checked_at)}
                                                        </p>
                                                    ) : null}
                                                </div>
                                                ) : null}

                                                {activeTerminalTab === 'sync' ? (
                                                    <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                            <div>
                                                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Centro de Sincronizacion</p>
                                                                <p className="mt-1 text-sm text-slate-600">
                                                                    Pendientes de esta terminal, con reparacion guiada cuando el ERP reporte ERP_CONTEXT_MISSING.
                                                                </p>
                                                                {syncPending.message ? (
                                                                    <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{syncPending.message}</p>
                                                                ) : null}
                                                                {profileIncomplete ? (
                                                                    <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                                                                        Terminal sin perfil ERP listo. No se permite reintento masivo hasta preparar el perfil.
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                            <div className="flex flex-col gap-2 sm:flex-row">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void loadTerminalSyncPending(tenant.id, terminal)}
                                                                    disabled={isSyncLoading}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60"
                                                                >
                                                                    {isSyncLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                                                    Actualizar pendientes
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleRetryTerminalPending(terminal)}
                                                                    disabled={profileIncomplete || syncBulkSubmitting || repairableSyncCount === 0}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    {syncBulkSubmitting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                                                    Reintentar pendientes de esta terminal
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Documentos pendientes</p>
                                                                <p className="mt-1 text-2xl font-black text-slate-800">{syncPending.summary.pending}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Reparables</p>
                                                                <p className="mt-1 text-2xl font-black text-amber-800">{repairableSyncCount}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">Error funcional</p>
                                                                <p className="mt-1 text-2xl font-black text-red-800">{functionalSyncErrorCount}</p>
                                                            </div>
                                                        </div>

                                                        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                                                            <table className="min-w-full divide-y divide-slate-100 text-sm">
                                                                <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                                                    <tr>
                                                                        <th className="px-4 py-3">Documento</th>
                                                                        <th className="px-4 py-3">Fecha</th>
                                                                        <th className="px-4 py-3">Causa</th>
                                                                        <th className="px-4 py-3">Estado</th>
                                                                        <th className="px-4 py-3 text-right">Accion</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 bg-white">
                                                                    {syncPending.documents.length ? syncPending.documents.map((document, index) => {
                                                                        const documentId = getSyncDocumentId(document);
                                                                        const documentKey = documentId || `${getSyncDocumentFolio(document)}-${index}`;
                                                                        const errorCode = getSyncDocumentErrorCode(document);
                                                                        const repairable = isRepairableSyncDocument(document, erpReadiness);
                                                                        const submittingDocument = syncRetrySubmittingKey === `${terminalKey}-${documentId}`;
                                                                        return (
                                                                            <tr key={documentKey}>
                                                                                <td className="px-4 py-3 font-mono font-bold text-slate-700">{getSyncDocumentFolio(document)}</td>
                                                                                <td className="px-4 py-3 text-slate-500">{formatDateTime(getSyncDocumentCreatedAt(document))}</td>
                                                                                <td className="px-4 py-3">
                                                                                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${
                                                                                        repairable ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                                                                                    }`}>
                                                                                        {repairable ? 'Terminal sin perfil ERP listo' : errorCode || 'Pendiente'}
                                                                                    </span>
                                                                                    {document.message ? <p className="mt-1 text-xs text-slate-500">{document.message}</p> : null}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-slate-600">{document.status || 'Pendiente'}</td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    {repairable ? (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => void handlePrepareAndRetryDocument(terminal, document)}
                                                                                            disabled={submittingDocument || !documentId}
                                                                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition-colors disabled:opacity-60"
                                                                                        >
                                                                                            {submittingDocument ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                                                                            Preparar terminal y reenviar
                                                                                        </button>
                                                                                    ) : (
                                                                                        <span className="text-xs text-slate-400">Sin accion</span>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    }) : (
                                                                        <tr>
                                                                            <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-slate-400">
                                                                                {isSyncLoading ? 'Cargando pendientes...' : 'No hay documentos pendientes reportados.'}
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                ) : null}

                                                {activeTerminalTab === 'fiscal' && isFiscalEligibleTenant(tenant) ? (
                                                    <div className={`mx-5 mt-5 rounded-2xl border px-4 py-4 ${fiscalStatusClasses}`}>
                                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                            <div>
                                                                <p className="text-xs font-bold uppercase tracking-wider">Configuracion fiscal</p>
                                                                <p className="mt-1 text-sm font-bold">{fiscalDebug.fiscalReadiness}</p>
                                                                <p className="mt-1 text-xs opacity-80">
                                                                    Solo lectura. La configuracion fiscal se mantiene y corrige en ERP.
                                                                </p>
                                                                {fiscalDebug.isMissing || fiscalDebug.errorCode === 'FISCAL_CONFIG_MISSING' ? (
                                                                    <p className="mt-2 text-sm font-semibold">
                                                                        FISCAL_CONFIG_MISSING: revisa donde busco ERP, que encontro y que falta antes de escalar a soporte.
                                                                    </p>
                                                                ) : null}
                                                                {fiscalDebug.message ? (
                                                                    <p className="mt-1 text-sm">{fiscalDebug.message}</p>
                                                                ) : null}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => void loadTerminalFiscalReadiness(tenant.id, terminal)}
                                                                disabled={isFiscalLoading}
                                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-current bg-white/80 px-4 py-2 text-sm font-bold shadow-sm hover:bg-white transition-colors disabled:opacity-60"
                                                            >
                                                                {isFiscalLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                                                Verificar mapping fiscal
                                                            </button>
                                                        </div>

                                                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">fiscalReadiness</p>
                                                                <p className="mt-1 font-bold">{fiscalDebug.fiscalReadiness}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">matchedStrategy</p>
                                                                <p className="mt-1 font-mono text-xs break-all">{fiscalDebug.matchedStrategy || 'N/D'}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">documentSeriesFound</p>
                                                                <p className="mt-1 font-bold">{getCheckLabel(fiscalDebug.documentSeriesFound, 'Si', 'No')}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">fiscalRangesFound</p>
                                                                <p className="mt-1 font-bold">{getCheckLabel(fiscalDebug.fiscalRangesFound, 'Si', 'No')}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">fiscalSequencesFound</p>
                                                                <p className="mt-1 font-bold">{getCheckLabel(fiscalDebug.fiscalSequencesFound, 'Si', 'No')}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">terminalFiscalConfigFound</p>
                                                                <p className="mt-1 font-bold">{getCheckLabel(fiscalDebug.terminalFiscalConfigFound, 'Si', 'No')}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 md:col-span-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">missing</p>
                                                                <p className="mt-1 break-words text-xs">{fiscalDebug.missing.length ? fiscalDebug.missing.join(' · ') : 'N/D'}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 md:col-span-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Donde busco (ERP)</p>
                                                                <p className="mt-1 break-words text-xs">{fiscalDebug.searchedIn.length ? fiscalDebug.searchedIn.join(' → ') : 'N/D'}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 md:col-span-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Que encontro</p>
                                                                <p className="mt-1 break-words text-xs">{fiscalDebug.found.length ? fiscalDebug.found.join(' · ') : 'N/D'}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 md:col-span-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Scopes disponibles (sucursal / company / tenant)</p>
                                                                <p className="mt-1 break-words text-xs">{fiscalDebug.scopeHints.length ? fiscalDebug.scopeHints.join(' · ') : 'N/D'}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Ultima validacion</p>
                                                                <p className="mt-1">{formatDateTime(fiscalDebug.checkedAt)}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : null}

                                                {activeTerminalTab === 'summary' && isLocalPosTenant(tenant) ? (
                                                    <div className={`mx-5 mt-5 rounded-2xl border px-4 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${
                                                        isExplicitOfflinePosTenant(tenant)
                                                            ? 'border-slate-200 bg-slate-50'
                                                            : 'border-amber-200 bg-amber-50'
                                                    }`}>
                                                        <div>
                                                            <p className={`text-xs font-bold uppercase tracking-wider ${
                                                                isExplicitOfflinePosTenant(tenant) ? 'text-slate-600' : 'text-amber-700'
                                                            }`}>Recuperacion POS local</p>
                                                            <p className={`mt-1 text-sm ${
                                                                isExplicitOfflinePosTenant(tenant) ? 'text-slate-600' : 'text-amber-800'
                                                            }`}>
                                                                {isExplicitOfflinePosTenant(tenant)
                                                                    ? 'Modo offline explicito: la recuperacion cloud no esta disponible desde Cloud-Admin.'
                                                                    : 'Elige reemplazo de hardware o reconstruccion de BD local sin cambiar el dispositivo.'}
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-col gap-2 sm:flex-row">
                                                            <button
                                                                type="button"
                                                                disabled={isExplicitOfflinePosTenant(tenant)}
                                                                onClick={() => openRebuildModal(terminal)}
                                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-700 shadow-sm hover:bg-amber-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                <RefreshCcw size={16} />
                                                                Reconstruir base local
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={isExplicitOfflinePosTenant(tenant)}
                                                                onClick={() => openTakeoverModal(terminal)}
                                                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                <RefreshCcw size={16} />
                                                                Reemplazar tablet
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
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
