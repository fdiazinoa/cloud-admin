import React, {
    useEffect,
    useRef,
    useState,
} from 'react';
import type {
    Tenant,
    TerminalAuthAttempt,
    TerminalFiscalReadiness,
    TerminalSyncDocument,
    TerminalSyncPendingResult,
    TenantTerminalErpReadiness,
    TenantTerminalSnapshot,
} from '../types';
import {
    tenantService,
    type TerminalDeviceAuditEntry,
    type TenantPosLicenseSeats,
    type TerminalReconciliationResult,
} from '../lib/tenantService';
import {
    getLatestAvailablePosApkRelease,
    type PosApkReleaseReference,
} from '../lib/posApkReleases';
import {
    CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE,
    getAttemptDeviceId,
    getErpTerminalUuid,
    getTerminalAuthorizedDeviceId,
    getTerminalPosReportedDeviceId,
    hasCanonicalErpBinding,
    isPendingDeviceUnauthorizedAttempt,
} from '../lib/terminalIdentity';
import {
    getTakeoverSelectionKey,
    getTerminalKey,
    isErpProfileIncomplete,
    getSyncDocumentId,
    isRepairableSyncDocument,
    getErpReadinessStatus,
} from '../lib/tenantTerminalFormatting';
import {
    isExplicitOfflinePosTenant,
    isCloudRecoverableLocalPosTenant,
    isFiscalEligibleTenant,
} from '../lib/tenantSemantics';
import {
    getErrorMessage,
} from '../lib/errorMessage';

export type TerminalTabKey = 'summary' | 'devices' | 'erp' | 'sync' | 'fiscal' | 'attempts';
export type TerminalRequestFilter = 'ALL' | 'PENDING';

export type ReconciliationDraft = {
    erpTerminalUuid: string;
    targetTerminalName: string;
    storeId: string;
    authorizedDeviceId: string;
    reason: string;
    adminConfirmed: boolean;
    correlationId: string;
    serverPreview: TerminalReconciliationResult | null;
};

type UseTenantTerminalConsoleParams = {
    tenant: Tenant;
    canReauthorizeTerminals: boolean;
    /** Lets the page keep its tenant list in sync after terminal-side mutations. */
    onTenantsLoaded?: (tenants: Tenant[]) => void;
    /** Lets the page replace the selected tenant with a freshly loaded row. */
    onSelectTenant?: (tenant: Tenant) => void;
};

export const useTenantTerminalConsole = ({
    tenant,
    canReauthorizeTerminals,
    onTenantsLoaded,
    onSelectTenant,
}: UseTenantTerminalConsoleParams) => {
    const selectedTenantForTerminals = tenant;

    const [tenantTerminals, setTenantTerminals] = useState<TenantTerminalSnapshot[]>([]);
    const [terminalSearchTerm, setTerminalSearchTerm] = useState('');
    const [terminalStoreFilter, setTerminalStoreFilter] = useState('ALL');
    const [terminalRequestFilter, setTerminalRequestFilter] = useState<TerminalRequestFilter>('ALL');
    const [terminalTabs, setTerminalTabs] = useState<Record<string, TerminalTabKey>>({});
    const [latestPosApkRelease, setLatestPosApkRelease] = useState<PosApkReleaseReference | null>(null);
    const [terminalAdvancedOpen, setTerminalAdvancedOpen] = useState<Record<string, boolean>>({});
    const [isTerminalModalLoading, setIsTerminalModalLoading] = useState(false);
    const [takeoverTerminal, setTakeoverTerminal] = useState<TenantTerminalSnapshot | null>(null);
    const [isTakeoverModalOpen, setIsTakeoverModalOpen] = useState(false);
    const [isTakeoverSubmitting, setIsTakeoverSubmitting] = useState(false);
    const [rebuildTerminal, setRebuildTerminal] = useState<TenantTerminalSnapshot | null>(null);
    const [isRebuildModalOpen, setIsRebuildModalOpen] = useState(false);
    const [isRebuildSubmitting, setIsRebuildSubmitting] = useState(false);
    const [erpReadinessSubmittingKey, setErpReadinessSubmittingKey] = useState<string | null>(null);
    const [authAttemptsByTerminal, setAuthAttemptsByTerminal] = useState<Record<string, TerminalAuthAttempt[]>>({});
    const [authAttemptsErrorByTerminal, setAuthAttemptsErrorByTerminal] = useState<Record<string, string>>({});
    const [deviceAuditByTerminal, setDeviceAuditByTerminal] = useState<Record<string, TerminalDeviceAuditEntry[]>>({});
    const [authAttemptsLoadingKey, setAuthAttemptsLoadingKey] = useState<string | null>(null);
    const [deviceActionSubmittingKey, setDeviceActionSubmittingKey] = useState<string | null>(null);
    const deviceActionInFlightRef = useRef(false);
    const [manualDeviceIds, setManualDeviceIds] = useState<Record<string, string>>({});
    const [reconciliationDrafts, setReconciliationDrafts] = useState<Record<string, ReconciliationDraft>>({});
    const [reconciliationSubmittingKey, setReconciliationSubmittingKey] = useState<string | null>(null);
    const [posLicenseSeats, setPosLicenseSeats] = useState<TenantPosLicenseSeats | null>(null);
    const [fiscalReadinessByTerminal, setFiscalReadinessByTerminal] = useState<Record<string, TerminalFiscalReadiness>>({});
    const [fiscalReadinessLoadingKey, setFiscalReadinessLoadingKey] = useState<string | null>(null);
    const [syncPendingByTerminal, setSyncPendingByTerminal] = useState<Record<string, TerminalSyncPendingResult>>({});
    const [syncPendingLoadingKey, setSyncPendingLoadingKey] = useState<string | null>(null);
    const [syncRetrySubmittingKey, setSyncRetrySubmittingKey] = useState<string | null>(null);

    const [takeoverFormData, setTakeoverFormData] = useState({
        terminalId: '',
        registryId: '',
        newDeviceId: '',
        deviceName: '',
        reason: '',
        confirmTakeover: false,
    });
    const [rebuildFormData, setRebuildFormData] = useState({
        reason: '',
        confirmRebuild: false,
    });


    useEffect(() => {
        let cancelled = false;

        const loadConsole = async () => {
            setIsTerminalModalLoading(true);
            try {
                try {
                    await tenantService.enforceTenantPosLicenseLimits(tenant.id);
                } catch (enforceErr) {
                    console.warn('POS license enforcement skipped or failed:', enforceErr);
                }

                const [data, availableRelease, seats] = await Promise.all([
                    tenantService.getTenantTerminalOverview(tenant.id),
                    getLatestAvailablePosApkRelease().catch((releaseError) => {
                        console.warn('Latest POS APK release unavailable while loading terminals:', releaseError);
                        return null;
                    }),
                    tenantService.getTenantPosLicenseSeats(tenant.id).catch(() => null),
                ]);
                if (cancelled) return;
                setTenantTerminals(data);
                setPosLicenseSeats(seats);
                setLatestPosApkRelease(availableRelease);
                if (canReauthorizeTerminals) {
                    await Promise.all(data
                        .filter((terminal) => hasCanonicalErpBinding(terminal))
                        .map((terminal) => loadTerminalAuthAttempts(tenant.id, terminal)));
                }
            } catch (err) {
                if (cancelled) return;
                console.error('Error fetching tenant terminals:', err);
                alert('No se pudieron cargar las terminales de este tenant.');
            } finally {
                if (!cancelled) setIsTerminalModalLoading(false);
            }
        };

        void loadConsole();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenant.id, canReauthorizeTerminals]);

    const terminalRequiresCanonicalErp = () => isFiscalEligibleTenant(selectedTenantForTerminals);
    const isCanonicalTerminalActionBlocked = (terminal: TenantTerminalSnapshot) => (
        terminalRequiresCanonicalErp() && !hasCanonicalErpBinding(terminal)
    );
    const getTerminalTakeoverId = (terminal: TenantTerminalSnapshot) => {
        const canonicalErpTerminalId = getErpTerminalUuid(terminal);
        if (canonicalErpTerminalId) return canonicalErpTerminalId;
        if (terminalRequiresCanonicalErp()) return '';
        return terminal.registry?.terminal_id?.trim()
            || terminal.terminal_id?.trim()
            || terminal.catalog_terminal_id?.trim()
            || terminal.id
            || '';
    };

    const getTakeoverOptions = () => tenantTerminals.flatMap((terminal) => {
        const registries = terminal.registries?.length
            ? terminal.registries
            : terminal.registry
                ? [terminal.registry]
                : [];

        if (registries.length === 0) {
            const terminalId = getTerminalTakeoverId(terminal);
            return [{
                key: getTakeoverSelectionKey(terminalId),
                terminal,
                terminalId,
                registryId: '',
                label: `${terminal.name} · ${terminalId || 'Sin ID'} · ${terminal.device_token || 'N/D'}`,
            }];
        }

        return registries.map((registry) => {
            const terminalId = getTerminalTakeoverId(terminal) || registry.terminal_id || '';
            const deviceId = registry.current_device_id || registry.device_id || terminal.device_token || 'N/D';
            return {
                key: getTakeoverSelectionKey(terminalId, registry.id),
                terminal: { ...terminal, registry },
                terminalId,
                registryId: registry.id || '',
                label: `${terminal.name} · Terminal ${terminalId || 'Sin ID'} · ${deviceId}`,
            };
        });
    });

    const getFiscalReadiness = (terminal: TenantTerminalSnapshot) => (
        fiscalReadinessByTerminal[getTerminalKey(terminal)]
        || terminal.registry?.fiscal_readiness
        || null
    );

    const openTakeoverModal = (terminal: TenantTerminalSnapshot) => {
        if (isCanonicalTerminalActionBlocked(terminal)) {
            alert(CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE);
            return;
        }
        setTakeoverTerminal(terminal);
        setTakeoverFormData({
            terminalId: getTerminalTakeoverId(terminal),
            registryId: terminal.registry?.id || '',
            newDeviceId: '',
            deviceName: terminal.name || '',
            reason: '',
            confirmTakeover: false,
        });
        setIsTakeoverModalOpen(true);
    };

    const closeTakeoverModal = () => {
        setIsTakeoverModalOpen(false);
        setTakeoverTerminal(null);
        setTakeoverFormData({
            terminalId: '',
            registryId: '',
            newDeviceId: '',
            deviceName: '',
            reason: '',
            confirmTakeover: false,
        });
    };

    const openRebuildModal = (terminal: TenantTerminalSnapshot) => {
        if (isCanonicalTerminalActionBlocked(terminal)) {
            alert(CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE);
            return;
        }
        setRebuildTerminal(terminal);
        setRebuildFormData({
            reason: '',
            confirmRebuild: false,
        });
        setIsRebuildModalOpen(true);
    };

    const closeRebuildModal = () => {
        setIsRebuildModalOpen(false);
        setRebuildTerminal(null);
        setRebuildFormData({
            reason: '',
            confirmRebuild: false,
        });
    };

    const getTerminalOperationalDeviceId = (terminal: TenantTerminalSnapshot) => (
        getTerminalPosReportedDeviceId(terminal)
        || getTerminalAuthorizedDeviceId(terminal)
        || terminal.device_token
        || ''
    );

    const requestErpReadinessForTerminal = async (
        terminal: TenantTerminalSnapshot,
        options?: { deviceId?: string; terminalName?: string; silent?: boolean },
    ) => {
        if (!selectedTenantForTerminals) return null;

        const terminalId = getTerminalTakeoverId(terminal);
        const deviceId = options?.deviceId || getTerminalOperationalDeviceId(terminal);

        if (!terminalId || !deviceId) {
            if (!options?.silent) {
                alert('Esta terminal necesita terminal_id y device_id antes de preparar el contexto ERP.');
            }
            return null;
        }

        const result = await tenantService.requestTerminalErpReadiness({
            tenantId: selectedTenantForTerminals.id,
            terminalId,
            registryId: terminal.registry?.id || null,
            deviceId,
            terminalName: options?.terminalName || terminal.name,
        });

        const data = await tenantService.getTenantTerminalOverview(selectedTenantForTerminals.id);
        setTenantTerminals(data);
        return result;
    };

    const handleRetryErpReadiness = async (terminal: TenantTerminalSnapshot) => {
        const key = getTerminalKey(terminal);
        setErpReadinessSubmittingKey(key);

        try {
            const result = await requestErpReadinessForTerminal(terminal);
            alert(result?.message || (result?.status === 'ready'
                ? 'Contexto ERP listo para operar.'
                : 'POS vinculado, pero el contexto ERP aun no esta listo.'));
        } catch (err: unknown) {
            console.error('Error requesting POS ERP readiness:', err);
            alert(getErrorMessage(err));
        } finally {
            setErpReadinessSubmittingKey(null);
        }
    };

    const handlePrepareErpProfile = async (terminal: TenantTerminalSnapshot) => {
        if (!selectedTenantForTerminals) return null;
        const terminalId = getTerminalTakeoverId(terminal);
        if (!terminalId) {
            alert('Esta terminal necesita terminal_id para preparar el perfil ERP.');
            return null;
        }

        const key = getTerminalKey(terminal);
        setErpReadinessSubmittingKey(key);
        try {
            const result = await tenantService.requestTerminalErpProfilePrepare({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                registryId: terminal.registry?.id || null,
                deviceId: getTerminalOperationalDeviceId(terminal) || null,
                terminalName: terminal.name,
            });
            await refreshTerminalModalData();
            void loadTerminalSyncPending(selectedTenantForTerminals.id, terminal);
            alert(result.message || (result.status === 'ready' ? 'Perfil ERP preparado correctamente.' : 'Perfil ERP solicitado, pero aun no esta listo.'));
            return result;
        } catch (err: unknown) {
            console.error('Error preparing ERP profile:', err);
            alert(getErrorMessage(err));
            return null;
        } finally {
            setErpReadinessSubmittingKey(null);
        }
    };

    const handlePrepareAndRetryDocument = async (terminal: TenantTerminalSnapshot, document: TerminalSyncDocument) => {
        if (!selectedTenantForTerminals) return;
        const terminalId = getTerminalTakeoverId(terminal);
        const documentId = getSyncDocumentId(document);
        if (!terminalId || !documentId) {
            alert('No se pudo identificar la terminal o el documento pendiente.');
            return;
        }

        const key = `${getTerminalKey(terminal)}-${documentId}`;
        setSyncRetrySubmittingKey(key);
        try {
            const readiness = terminal.registry?.erp_readiness || document.readiness || null;
            if (isErpProfileIncomplete(readiness)) {
                const prepareResult = await tenantService.requestTerminalErpProfilePrepare({
                    tenantId: selectedTenantForTerminals.id,
                    terminalId,
                    registryId: terminal.registry?.id || null,
                    deviceId: getTerminalOperationalDeviceId(terminal) || null,
                    terminalName: terminal.name,
                });
                const preparedReadiness = prepareResult.erp_readiness || prepareResult as TenantTerminalErpReadiness;
                if (isErpProfileIncomplete(preparedReadiness) || prepareResult.status === 'error') {
                    alert(prepareResult.message || 'El perfil ERP sigue incompleto. No se reintentara el documento.');
                    await refreshTerminalModalData();
                    return;
                }
            }

            const result = await tenantService.retryTerminalSyncPending({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                documentId,
            });
            await refreshTerminalModalData();
            await loadTerminalSyncPending(selectedTenantForTerminals.id, terminal);
            alert(result.message || 'Documento reenviado correctamente.');
        } catch (err: unknown) {
            console.error('Error preparing and retrying document:', err);
            alert(getErrorMessage(err));
        } finally {
            setSyncRetrySubmittingKey(null);
        }
    };

    const handleRetryTerminalPending = async (terminal: TenantTerminalSnapshot) => {
        if (!selectedTenantForTerminals) return;
        const terminalId = getTerminalTakeoverId(terminal);
        if (!terminalId) {
            alert('Esta terminal necesita terminal_id para reintentar pendientes.');
            return;
        }

        if (isErpProfileIncomplete(terminal.registry?.erp_readiness || null)) {
            alert('No se permite reintento masivo mientras el perfil ERP siga incompleto.');
            return;
        }

        const key = getTerminalKey(terminal);
        const pending = syncPendingByTerminal[key];
        const documentIds = (pending?.documents || [])
            .filter((document) => isRepairableSyncDocument(document, terminal.registry?.erp_readiness || null))
            .map(getSyncDocumentId)
            .filter(Boolean);

        if (!documentIds.length) {
            alert('No hay documentos reparables para esta terminal.');
            return;
        }

        setSyncRetrySubmittingKey(`${key}-bulk`);
        try {
            const result = await tenantService.retryTerminalSyncPending({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                documentIds,
            });
            await refreshTerminalModalData();
            await loadTerminalSyncPending(selectedTenantForTerminals.id, terminal);
            alert(result.message || 'Pendientes reenviados correctamente.');
        } catch (err: unknown) {
            console.error('Error retrying terminal pending documents:', err);
            alert(getErrorMessage(err));
        } finally {
            setSyncRetrySubmittingKey(null);
        }
    };

    const loadTerminalAuthAttempts = async (tenantId: string, terminal: TenantTerminalSnapshot) => {
        const key = getTerminalKey(terminal);
        const terminalId = getTerminalTakeoverId(terminal);
        if (!terminalId) return;

        setAuthAttemptsLoadingKey(key);
        setAuthAttemptsErrorByTerminal((current) => ({ ...current, [key]: '' }));
        try {
            const [attempts, audit] = await Promise.all([
                tenantService.getTerminalAuthAttempts(tenantId, terminalId),
                tenantService.getTerminalDeviceAudit(tenantId, terminalId).catch((auditError) => {
                    console.warn('Error fetching terminal device audit:', auditError);
                    return [];
                }),
            ]);
            setAuthAttemptsByTerminal((current) => ({
                ...current,
                [key]: attempts,
            }));
            setAuthAttemptsErrorByTerminal((current) => ({ ...current, [key]: '' }));
            setDeviceAuditByTerminal((current) => ({
                ...current,
                [key]: audit,
            }));
        } catch (err) {
            console.warn('Error fetching terminal auth attempts:', err);
            setAuthAttemptsErrorByTerminal((current) => ({
                ...current,
                [key]: getErrorMessage(err),
            }));
            setAuthAttemptsByTerminal((current) => ({
                ...current,
                [key]: [],
            }));
            setDeviceAuditByTerminal((current) => ({ ...current, [key]: [] }));
        } finally {
            setAuthAttemptsLoadingKey((current) => current === key ? null : current);
        }
    };

    const handleEnforcePosLicenseLimits = async () => {
        if (!selectedTenantForTerminals) return;
        try {
            await tenantService.enforceTenantPosLicenseLimits(selectedTenantForTerminals.id);
            await refreshTerminalModalData();
            alert('Limite de licencias POS aplicado. Los equipos excedentes quedaron marcados como sin licencia.');
        } catch (err: unknown) {
            console.error('Error enforcing POS license limits:', err);
            alert(getErrorMessage(err));
        }
    };

    const refreshTerminalModalData = async () => {
        if (!selectedTenantForTerminals) return;
        try {
            await tenantService.enforceTenantPosLicenseLimits(selectedTenantForTerminals.id);
        } catch (enforceErr) {
            console.warn('POS license enforcement skipped or failed:', enforceErr);
        }
        const [data, seats] = await Promise.all([
            tenantService.getTenantTerminalOverview(selectedTenantForTerminals.id),
            tenantService.getTenantPosLicenseSeats(selectedTenantForTerminals.id).catch(() => null),
        ]);
        setTenantTerminals(data);
        setPosLicenseSeats(seats);
    };

    const updateReconciliationDraft = (
        terminalKey: string,
        draft: ReconciliationDraft,
        changes: Partial<ReconciliationDraft>,
    ) => {
        setReconciliationDrafts((current) => ({
            ...current,
            [terminalKey]: {
                ...draft,
                ...changes,
                serverPreview: 'serverPreview' in changes ? changes.serverPreview ?? null : null,
            },
        }));
    };

    const handleTerminalReconciliation = async (
        terminal: TenantTerminalSnapshot,
        draft: ReconciliationDraft,
        mode: 'DRY_RUN' | 'EXECUTE' | 'ROLLBACK',
    ) => {
        if (!selectedTenantForTerminals || !terminal.registry?.id) return;
        const key = getTerminalKey(terminal);
        const correlationId = draft.correlationId || crypto.randomUUID();
        setReconciliationSubmittingKey(key);
        try {
            const result = await tenantService.requestTerminalReconciliation({
                mode,
                tenantId: selectedTenantForTerminals.id,
                sourceRegistryId: terminal.registry.id,
                targetErpTerminalId: draft.erpTerminalUuid,
                targetStoreId: draft.storeId,
                authorizedDeviceId: draft.authorizedDeviceId,
                reason: draft.reason,
                correlationId,
                expectedPlanHash: mode === 'EXECUTE' ? draft.serverPreview?.plan_hash : null,
                adminConfirmed: draft.adminConfirmed,
            });
            setReconciliationDrafts((current) => ({
                ...current,
                [key]: { ...draft, correlationId, serverPreview: result },
            }));
            if (mode === 'EXECUTE') {
                alert(result.idempotent_replay
                    ? 'La reconciliación ya había sido aplicada; no se repitieron escrituras.'
                    : 'Reconciliación completada. El POS puede pulsar “Reintentar autorización”.');
                await refreshTerminalModalData();
            } else if (mode === 'ROLLBACK') {
                alert('Rollback completado; se restauraron únicamente el vínculo y los estados de devices.');
                await refreshTerminalModalData();
            }
        } catch (error) {
            console.error('Error reconciling terminal identity:', error);
            alert(getErrorMessage(error));
        } finally {
            setReconciliationSubmittingKey(null);
        }
    };

    const loadTerminalSyncPending = async (tenantId: string, terminal: TenantTerminalSnapshot) => {
        const key = getTerminalKey(terminal);
        const terminalId = getTerminalTakeoverId(terminal);
        if (!terminalId) return;

        setSyncPendingLoadingKey(key);
        try {
            const result = await tenantService.getTerminalSyncPending({ tenantId, terminalId });
            setSyncPendingByTerminal((current) => ({
                ...current,
                [key]: result,
            }));
        } catch (err) {
            console.warn('Error fetching terminal sync pending:', err);
            setSyncPendingByTerminal((current) => ({
                ...current,
                [key]: {
                    status: 'error',
                    documents: [],
                    summary: { pending: 0, repairable: 0, functionalErrors: 0 },
                    message: getErrorMessage(err),
                },
            }));
        } finally {
            setSyncPendingLoadingKey((current) => current === key ? null : current);
        }
    };

    const loadTerminalFiscalReadiness = async (tenantId: string, terminal: TenantTerminalSnapshot) => {
        const key = getTerminalKey(terminal);
        const terminalId = getTerminalTakeoverId(terminal);
        if (!terminalId) return;

        setFiscalReadinessLoadingKey(key);
        try {
            const readiness = await tenantService.getTerminalFiscalDebug({
                tenantId,
                terminalId,
                registryId: terminal.registry?.id || null,
            });
            setFiscalReadinessByTerminal((current) => ({
                ...current,
                [key]: readiness,
            }));
        } catch (err) {
            console.warn('Error fetching terminal fiscal readiness:', err);
            setFiscalReadinessByTerminal((current) => ({
                ...current,
                [key]: {
                    status: 'ERROR',
                    message: getErrorMessage(err),
                    checked_at: new Date().toISOString(),
                },
            }));
        } finally {
            setFiscalReadinessLoadingKey((current) => current === key ? null : current);
        }
    };

    const handleAuthorizeDeviceForTerminal = async (
        terminal: TenantTerminalSnapshot,
        requestedDeviceIdInput: string,
        authorizedDeviceIdInput?: string | null,
        request?: TerminalAuthAttempt | null,
    ) => {
        if (!selectedTenantForTerminals) return;
        if (!canReauthorizeTerminals) {
            alert('No tienes permiso para reautorizar dispositivos de terminales.');
            return;
        }
        if (deviceActionInFlightRef.current) {
            alert('Ya existe una autorización de terminal en curso. Espera a que finalice y se recargue el estado canónico.');
            return;
        }
        if (isCanonicalTerminalActionBlocked(terminal)) {
            alert(CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE);
            return;
        }

        const requestedDeviceId = requestedDeviceIdInput.trim();
        const terminalId = getTerminalTakeoverId(terminal);
        if (!terminalId || !requestedDeviceId) {
            alert('DEVICE_ID_REQUIRED: esta terminal necesita terminal_id y device_id del POS autorizado para autorizar.');
            return;
        }

        const requiresErpConfirmation = selectedTenantForTerminals.contracted_product === 'POS_ERP';
        const authorizedDeviceId = authorizedDeviceIdInput || getTerminalAuthorizedDeviceId(terminal) || 'N/D';
        const confirmed = confirm(
            `Terminal a transferir: ${terminal.name} / ${terminalId}\n`
            + `Dispositivo actualmente autorizado: ${authorizedDeviceId}\n`
            + `Nuevo dispositivo: ${requestedDeviceId}\n\n`
            + 'El dispositivo anterior será bloqueado y todas sus credenciales/tokens serán revocados. '
            + (requiresErpConfirmation
                ? 'El ERP debe confirmar explícitamente el takeover y la rotación; de lo contrario Cloud Admin no mostrará éxito. '
                : '')
            + '\n\n¿Confirmas esta reautorización?',
        );
        if (!confirmed) return;

        const key = `${getTerminalKey(terminal)}-TAKEOVER-${requestedDeviceId}`;
        const operationId = crypto.randomUUID();
        deviceActionInFlightRef.current = true;
        setDeviceActionSubmittingKey(key);
        try {
            const result = await tenantService.requestTerminalDeviceAction({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                catalogTerminalId: terminal.catalog_terminal_id,
                storeId: terminal.erp_store_id,
                registryId: terminal.registry?.id || null,
                terminalName: terminal.name,
                deviceName: request?.device_name
                    || (typeof request?.metadata?.device_name === 'string' ? request.metadata.device_name : null),
                deviceId: requestedDeviceId,
                requestId: request?.id || null,
                expectedAuthorizedDeviceId: authorizedDeviceId !== 'N/D' ? authorizedDeviceId : null,
                action: 'TAKEOVER',
                reason: 'CLOUD_ADMIN_TERMINAL_REAUTHORIZATION',
                idempotencyKey: operationId,
            });
            const canonicalData = await tenantService.getTenantTerminalOverview(selectedTenantForTerminals.id);
            const canonicalTerminal = canonicalData.find((item) => getTerminalTakeoverId(item) === terminalId);
            const canonicalAuthorizedDevice = canonicalTerminal ? getTerminalAuthorizedDeviceId(canonicalTerminal) : null;
            if (!canonicalTerminal || canonicalAuthorizedDevice !== requestedDeviceId) {
                throw new Error(
                    `ERP_CANONICAL_STATE_MISMATCH: el ERP/overview reporta ${canonicalAuthorizedDevice || 'N/D'} como autorizado; se esperaba ${requestedDeviceId}.`,
                );
            }
            setTenantTerminals(canonicalData);
            setAuthAttemptsByTerminal((current) => ({ ...current, [getTerminalKey(terminal)]: [] }));
            setDeviceAuditByTerminal((current) => ({ ...current, [getTerminalKey(terminal)]: [] }));
            await loadTerminalAuthAttempts(selectedTenantForTerminals.id, canonicalTerminal);
            alert(`${result.message || 'Device autorizado. Reintenta conexion desde el POS.'}\n\nOperación: ${result.operation_id || operationId}`);
        } catch (err: unknown) {
            console.error('Error authorizing terminal device:', err);
            alert(getErrorMessage(err));
        } finally {
            deviceActionInFlightRef.current = false;
            setDeviceActionSubmittingKey(null);
        }
    };

    const handleAuthorizeDeviceForManualInput = async (terminal: TenantTerminalSnapshot, deviceId: string) => {
        await handleAuthorizeDeviceForTerminal(terminal, deviceId, getTerminalAuthorizedDeviceId(terminal));
    };

    const handleReauthorizeAttempt = async (terminal: TenantTerminalSnapshot, attempt: TerminalAuthAttempt) => {
        const requestedDeviceId = getAttemptDeviceId(attempt);
        if (!requestedDeviceId) {
            alert('El intento rechazado no tiene terminal o device_id suficiente para reautorizar.');
            return;
        }
        if (!attempt.id) {
            alert('El ERP no devolvió un identificador canónico para esta solicitud. No se puede aprobar de forma segura.');
            return;
        }
        await handleAuthorizeDeviceForTerminal(
            terminal,
            requestedDeviceId,
            attempt.authorized_device_id || getTerminalAuthorizedDeviceId(terminal),
            attempt,
        );
    };

    const handleRejectDeviceRequest = async (terminal: TenantTerminalSnapshot, attempt: TerminalAuthAttempt) => {
        if (!selectedTenantForTerminals || !attempt.id) return;
        if (!canReauthorizeTerminals) {
            alert('No tienes permiso para rechazar solicitudes de dispositivos.');
            return;
        }
        if (deviceActionInFlightRef.current) {
            alert('Ya existe una operación de terminal en curso. Espera a que finalice.');
            return;
        }
        const terminalId = getTerminalTakeoverId(terminal);
        const requestedDeviceId = getAttemptDeviceId(attempt);
        if (!terminalId || !requestedDeviceId) return;
        if (!confirm(`¿Rechazar la solicitud de ${requestedDeviceId} para ${terminal.name}? El dispositivo seguirá sin autorización.`)) return;

        const key = `${getTerminalKey(terminal)}-REJECT-${attempt.id}`;
        deviceActionInFlightRef.current = true;
        setDeviceActionSubmittingKey(key);
        try {
            await tenantService.rejectTerminalDeviceRequest({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                requestId: attempt.id,
                requestedDeviceId,
            });
            await loadTerminalAuthAttempts(selectedTenantForTerminals.id, terminal);
            alert('Solicitud de dispositivo rechazada por el ERP.');
        } catch (err: unknown) {
            console.error('Error rejecting terminal device request:', err);
            alert(getErrorMessage(err));
        } finally {
            deviceActionInFlightRef.current = false;
            setDeviceActionSubmittingKey(null);
        }
    };

    const handleRepairErpDeviceMapping = async (terminal: TenantTerminalSnapshot) => {
        if (!selectedTenantForTerminals) return;
        if (isCanonicalTerminalActionBlocked(terminal)) {
            alert(CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE);
            return;
        }
        const terminalId = getTerminalTakeoverId(terminal);
        const deviceId = getTerminalAuthorizedDeviceId(terminal);
        if (!terminalId || !deviceId) {
            alert('DEVICE_ID_REQUIRED: esta terminal necesita terminal_id y device_id autorizado actual para reparar el enlace ERP.');
            return;
        }

        const key = `${getTerminalKey(terminal)}-REPAIR-ERP`;
        setDeviceActionSubmittingKey(key);
        try {
            const result = await tenantService.requestTerminalDeviceAction({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                catalogTerminalId: terminal.catalog_terminal_id,
                storeId: terminal.erp_store_id,
                registryId: terminal.registry?.id || null,
                terminalName: terminal.name,
                deviceId,
                action: 'TAKEOVER',
                reason: 'ERP_DEVICE_MAPPING_REPAIR',
            });
            alert(result.message || 'Terminal revalidada correctamente en Cloud y ERP. El POS debe reintentar conexion.');
            await refreshTerminalModalData();
        } catch (err: unknown) {
            console.error('Error repairing ERP terminal device mapping:', err);
            alert(getErrorMessage(err));
        } finally {
            setDeviceActionSubmittingKey(null);
        }
    };

    const handleSyncAuthorizedDevice = async (terminal: TenantTerminalSnapshot) => {
        if (!selectedTenantForTerminals) return;
        const terminalId = getTerminalTakeoverId(terminal);
        const deviceId = terminal.registry?.device_id?.trim() || getTerminalAuthorizedDeviceId(terminal);
        if (!terminalId || !deviceId) {
            alert('DEVICE_ID_REQUIRED: esta terminal necesita terminal_id y device_id en el registro para sincronizar autorizacion.');
            return;
        }

        const confirmed = confirm(
            `Se persistira ${deviceId} como device autorizado en Cloud-Admin para ${terminal.name}. `
            + 'El POS puede reintentar conexion sin rotar credenciales. ¿Deseas continuar?',
        );
        if (!confirmed) return;

        const key = `${getTerminalKey(terminal)}-SYNC-AUTH`;
        setDeviceActionSubmittingKey(key);
        try {
            const result = await tenantService.requestTerminalDeviceAction({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                catalogTerminalId: terminal.catalog_terminal_id,
                storeId: terminal.erp_store_id,
                registryId: terminal.registry?.id || null,
                terminalName: terminal.name,
                deviceId,
                action: 'SYNC_AUTHORIZED_DEVICE',
                reason: 'REGISTRY_DEVICE_SYNC',
            });
            alert(result.message || 'Device autorizado sincronizado en Cloud-Admin.');
            await refreshTerminalModalData();
        } catch (err: unknown) {
            console.error('Error syncing authorized device:', err);
            alert(getErrorMessage(err));
        } finally {
            setDeviceActionSubmittingKey(null);
        }
    };

    const handleReleasePosOnlyProvisioningBlock = async () => {
        if (!selectedTenantForTerminals) return;
        if (selectedTenantForTerminals.contracted_product !== 'POS_ONLY') {
            alert('Esta accion solo aplica a tenants POS_ONLY.');
            return;
        }
        if (selectedTenantForTerminals.lifecycle_status !== 'BLOCKED') {
            alert('El tenant no tiene lifecycle BLOCKED.');
            return;
        }

        const confirmed = confirm(
            'Se quitara lifecycle BLOCKED dejado por un readiness ERP fallido. '
            + 'El POS deberia dejar de mostrar acceso suspendido si dependia de ese campo. ¿Deseas continuar?',
        );
        if (!confirmed) return;

        try {
            await tenantService.releasePosOnlyProvisioningBlock(selectedTenantForTerminals.id);
            alert('Bloqueo de aprovisionamiento liberado para POS_ONLY.');
            const data = await tenantService.getTenants();
            onTenantsLoaded?.(data || []);
            const refreshed = (data || []).find((row) => row.id === selectedTenantForTerminals.id);
            if (refreshed) onSelectTenant?.(refreshed);
            await refreshTerminalModalData();
        } catch (err: unknown) {
            console.error('Error releasing POS_ONLY provisioning block:', err);
            alert(getErrorMessage(err));
        }
    };

    const handleRotateTerminalCredentials = async (terminal: TenantTerminalSnapshot) => {
        if (!selectedTenantForTerminals) return;
        if (isCanonicalTerminalActionBlocked(terminal)) {
            alert(CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE);
            return;
        }
        const terminalId = getTerminalTakeoverId(terminal);
        const deviceId = getTerminalAuthorizedDeviceId(terminal);
        if (!terminalId || !deviceId) {
            alert('DEVICE_ID_REQUIRED: esta terminal necesita terminal_id y device_id autorizado actual para rotar credenciales.');
            return;
        }

        const confirmed = confirm(`Se invalidara el token anterior de ${deviceId}. El POS debera reautenticarse para recibir un nuevo syncToken. ¿Deseas continuar?`);
        if (!confirmed) return;

        const key = `${getTerminalKey(terminal)}-ROTATE`;
        setDeviceActionSubmittingKey(key);
        try {
            const result = await tenantService.requestTerminalDeviceAction({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                catalogTerminalId: terminal.catalog_terminal_id,
                storeId: terminal.erp_store_id,
                registryId: terminal.registry?.id || null,
                terminalName: terminal.name,
                deviceId,
                action: 'ROTATE_TOKEN',
                reason: 'TOKEN_ROTATION_REQUIRED',
            });
            alert(result.message || 'Credenciales rotadas correctamente. El POS debe reintentar autenticacion.');
            await refreshTerminalModalData();
        } catch (err: unknown) {
            console.error('Error rotating terminal credentials:', err);
            alert(getErrorMessage(err));
        } finally {
            setDeviceActionSubmittingKey(null);
        }
    };

    const handleReleaseTerminalLicenseSlot = async (
        terminal: TenantTerminalSnapshot,
        registryId: string,
        deviceId: string,
    ) => {
        if (!selectedTenantForTerminals) return;

        const isPosOnlySlots = selectedTenantForTerminals.contracted_product === 'POS_ONLY';
        const confirmed = confirm(
            isPosOnlySlots
                ? `Se liberara la caja completa "${terminal.name}" (todos los equipos de esa caja). `
                    + 'En POS_ONLY cada licencia es una caja distinta (Caja 1, Caja 2, ...). '
                    + 'Luego active el nuevo Android reutilizando el mismo nombre de caja o creando otra caja libre. ¿Deseas continuar?'
                : `Se liberara el cupo de licencia usado por ${deviceId} (${terminal.name}). `
                    + 'Ese registro quedara OFFLINE/revocado y otro Android con un device_id nuevo podra tomar la licencia. ¿Deseas continuar?',
        );
        if (!confirmed) return;

        const key = `${getTerminalKey(terminal)}-RELEASE-${deviceId}`;
        setDeviceActionSubmittingKey(key);
        try {
            const result = await tenantService.releaseTerminalLicenseSlot({
                tenantId: selectedTenantForTerminals.id,
                registryId,
                deviceId,
            });
            alert(result.message);
            await refreshTerminalModalData();
        } catch (err: unknown) {
            console.error('Error releasing terminal license slot:', err);
            alert(getErrorMessage(err));
        } finally {
            setDeviceActionSubmittingKey(null);
        }
    };

    const handleRevokePreviousDevice = async (terminal: TenantTerminalSnapshot, deviceId: string) => {
        if (!selectedTenantForTerminals) return;
        if (isCanonicalTerminalActionBlocked(terminal)) {
            alert(CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE);
            return;
        }
        const terminalId = getTerminalTakeoverId(terminal);
        if (!terminalId || !deviceId) return;

        const confirmed = confirm(`Se marcara ${deviceId} como equipo revocado para ${terminal.name}. No se borrara data operacional. ¿Deseas continuar?`);
        if (!confirmed) return;

        const key = `${getTerminalKey(terminal)}-REVOKE-${deviceId}`;
        setDeviceActionSubmittingKey(key);
        try {
            const result = await tenantService.requestTerminalDeviceAction({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                catalogTerminalId: terminal.catalog_terminal_id,
                storeId: terminal.erp_store_id,
                registryId: terminal.registry?.id || null,
                terminalName: terminal.name,
                deviceId,
                action: 'REVOKE_DEVICE',
                reason: 'MANUAL_REVOKE_DEVICE',
            });
            alert(result.message || 'Equipo anterior marcado como revocado.');
            await refreshTerminalModalData();
        } catch (err: unknown) {
            console.error('Error revoking terminal device:', err);
            alert(getErrorMessage(err));
        } finally {
            setDeviceActionSubmittingKey(null);
        }
    };

    const handleClearTerminalDevices = async (terminal: TenantTerminalSnapshot) => {
        if (!selectedTenantForTerminals) return;
        if (isCanonicalTerminalActionBlocked(terminal)) {
            alert(CANONICAL_ERP_IDENTITY_REQUIRED_MESSAGE);
            return;
        }
        const terminalId = getTerminalTakeoverId(terminal);
        if (!terminalId) {
            alert('Esta terminal necesita terminal_id para limpiar devices.');
            return;
        }

        const confirmation = prompt(
            `Esta accion eliminara solo autorizaciones de devices de ${terminal.name} (${terminalId}). `
            + 'No borra ventas, maestros, secuencias ni configuracion fiscal. Escribe LIMPIAR para confirmar.',
        );
        if (confirmation !== 'LIMPIAR') return;

        const key = `${getTerminalKey(terminal)}-CLEAR-DEVICES`;
        setDeviceActionSubmittingKey(key);
        try {
            const result = await tenantService.requestTerminalDeviceAction({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                catalogTerminalId: terminal.catalog_terminal_id,
                storeId: terminal.erp_store_id,
                registryId: terminal.registry?.id || null,
                terminalName: terminal.name,
                action: 'CLEAR_TERMINAL_DEVICES',
                reason: 'LAB_DEVICE_BINDING_RESET',
            });
            const cleared = result.cleared_registry_count ?? 0;
            alert(result.message || `Devices limpiados. Registros eliminados: ${cleared}.`);
            await refreshTerminalModalData();
        } catch (err: unknown) {
            console.error('Error clearing terminal devices:', err);
            alert(getErrorMessage(err));
        } finally {
            setDeviceActionSubmittingKey(null);
        }
    };

    const handleTakeoverTerminalChange = (selectionKey: string) => {
        const selectedOption = getTakeoverOptions().find((option) => option.key === selectionKey) || null;
        setTakeoverTerminal(selectedOption?.terminal || null);
        setTakeoverFormData((current) => ({
            ...current,
            terminalId: selectedOption?.terminalId || '',
            registryId: selectedOption?.registryId || '',
            deviceName: selectedOption?.terminal?.name || current.deviceName,
        }));
    };

    const handleTerminalTakeover = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTenantForTerminals || !takeoverTerminal) return;

        if (!isCloudRecoverableLocalPosTenant(selectedTenantForTerminals)) {
            alert(isExplicitOfflinePosTenant(selectedTenantForTerminals)
                ? 'Este POS esta en modo offline/sin Cloud Staging. No tiene recuperacion cloud desde Cloud-Admin.'
                : 'La recuperacion de terminal solo aplica a POS configurado como local. POS + ERP mantiene el flujo actual.');
            return;
        }

        const newDeviceId = takeoverFormData.newDeviceId.trim();
        const reason = takeoverFormData.reason.trim();

        if (!takeoverFormData.terminalId || !newDeviceId || !reason) {
            alert('Selecciona terminal, indica el nuevo device_id y registra el motivo del cambio.');
            return;
        }

        if (!takeoverFormData.confirmTakeover) {
            alert('Confirma que la tablet anterior quedara revocada antes de ejecutar la recuperacion.');
            return;
        }

        setIsTakeoverSubmitting(true);
        try {
            const result = await tenantService.requestTerminalTakeover({
                tenantId: selectedTenantForTerminals.id,
                terminalId: takeoverFormData.terminalId,
                registryId: takeoverFormData.registryId || takeoverTerminal.registry?.id || null,
                newDeviceId,
                deviceName: takeoverFormData.deviceName.trim() || undefined,
                reason,
                confirmTakeover: takeoverFormData.confirmTakeover,
            });
            let readinessMessage = '';
            try {
                const readiness = await requestErpReadinessForTerminal(takeoverTerminal, {
                    deviceId: newDeviceId,
                    terminalName: takeoverFormData.deviceName.trim() || takeoverTerminal.name,
                    silent: true,
                });
                readinessMessage = readiness?.status === 'ready'
                    ? '\n\nContexto ERP listo para operar.'
                    : '\n\nPOS vinculado, pero el contexto ERP aun no esta listo.';
            } catch (readinessError) {
                console.warn('Terminal takeover completed but ERP readiness failed:', readinessError);
                readinessMessage = '\n\nLa terminal fue reasignada, pero no se pudo validar el contexto ERP.';
            }
            alert(`${result.message || 'Terminal reasignada correctamente. La tablet anterior fue revocada. Inicia sesion/autentica la nueva tablet para continuar.'}${readinessMessage}`);
            closeTakeoverModal();
            const data = await tenantService.getTenantTerminalOverview(selectedTenantForTerminals.id);
            setTenantTerminals(data);
        } catch (err: unknown) {
            console.error('Error requesting terminal takeover:', err);
            alert(getErrorMessage(err));
        } finally {
            setIsTakeoverSubmitting(false);
        }
    };

    const handleTerminalLocalRebuild = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTenantForTerminals || !rebuildTerminal) return;

        if (!isCloudRecoverableLocalPosTenant(selectedTenantForTerminals)) {
            alert(isExplicitOfflinePosTenant(selectedTenantForTerminals)
                ? 'Este POS esta en modo offline/sin Cloud Staging. No tiene reconstruccion cloud desde Cloud-Admin.'
                : 'La reconstruccion local solo aplica a POS configurado como local. POS + ERP mantiene el flujo actual.');
            return;
        }

        const terminalId = getTerminalTakeoverId(rebuildTerminal);
        const reason = rebuildFormData.reason.trim();
        const currentDeviceId = getTerminalOperationalDeviceId(rebuildTerminal);

        if (!terminalId || !reason) {
            alert('Selecciona una terminal y registra el motivo de la reconstruccion.');
            return;
        }

        if (!currentDeviceId) {
            alert('Esta terminal no tiene device_id autorizado para reconstruir la base local.');
            return;
        }

        if (!rebuildFormData.confirmRebuild) {
            alert('Confirma que se forzara un bootstrap completo sin revocar el dispositivo actual.');
            return;
        }

        setIsRebuildSubmitting(true);
        try {
            const result = await tenantService.requestTerminalLocalRebuild({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                registryId: rebuildTerminal.registry?.id || null,
                reason,
                confirmRebuild: rebuildFormData.confirmRebuild,
            });
            let readinessMessage = '';
            try {
                const readiness = await requestErpReadinessForTerminal(rebuildTerminal, { silent: true });
                readinessMessage = readiness?.status === 'ready'
                    ? '\n\nContexto ERP listo para operar.'
                    : '\n\nPOS vinculado, pero el contexto ERP aun no esta listo.';
            } catch (readinessError) {
                console.warn('Local rebuild completed but ERP readiness failed:', readinessError);
                readinessMessage = '\n\nLa reconstruccion fue preparada, pero no se pudo validar el contexto ERP.';
            }
            alert(`${result.message || 'Reconstruccion local preparada. El POS debera descargar nuevamente su estado desde el ERP sin cambiar de dispositivo.'}${readinessMessage}`);
            closeRebuildModal();
            const data = await tenantService.getTenantTerminalOverview(selectedTenantForTerminals.id);
            setTenantTerminals(data);
        } catch (err: unknown) {
            console.error('Error requesting terminal local rebuild:', err);
            alert(getErrorMessage(err));
        } finally {
            setIsRebuildSubmitting(false);
        }
    };

    const getRegistryStatusLabel = (terminal: TenantTerminalSnapshot) => {
        if (terminal.registry?.is_revoked || terminal.registry?.auth_status === 'OLD_DEVICE_REVOKED') return 'REVOCADA';
        const registryStatus = (terminal.registry?.status || '').toUpperCase();
        if (registryStatus === 'ONLINE') return 'ONLINE';
        if (registryStatus === 'OFFLINE') return 'OFFLINE';
        return terminal.is_active ? 'ACTIVA' : 'INACTIVA';
    };

    const getRegistryStatusClassName = (statusLabel: string) => {
        if (statusLabel === 'ONLINE') return 'bg-emerald-100 text-emerald-700';
        if (statusLabel === 'REVOCADA') return 'bg-rose-100 text-rose-700';
        return 'bg-slate-100 text-slate-500';
    };

    const getEffectiveApkVersion = (terminal: TenantTerminalSnapshot) => {
        const registryDeviceId = (terminal.registry?.current_device_id || terminal.registry?.device_id || '').trim().toUpperCase();
        const erpDeviceId = (terminal.erp_current_device_id || '').trim().toUpperCase();
        const canUseErpVersion = Boolean(terminal.erp_app_version || terminal.erp_app_version_code)
            && (!registryDeviceId || !erpDeviceId || registryDeviceId === erpDeviceId);

        if (canUseErpVersion) {
            return {
                version: terminal.erp_app_version?.trim() || '',
                versionCode: terminal.erp_app_version_code ?? null,
                source: 'ERP',
            };
        }

        return {
            version: terminal.registry?.app_version?.trim() || '',
            versionCode: terminal.registry?.app_version_code ?? null,
            source: 'Cloud-Admin',
        };
    };

    const getApkVersionKey = (terminal: TenantTerminalSnapshot) => {
        const apkVersion = getEffectiveApkVersion(terminal);
        const version = apkVersion.version;
        const versionCode = apkVersion.versionCode ? String(apkVersion.versionCode) : '';
        if (!version && !versionCode) return '';
        return `${version}::${versionCode}`;
    };

    const formatApkVersion = (terminal: TenantTerminalSnapshot) => {
        const { version, versionCode } = getEffectiveApkVersion(terminal);
        if (!version && !versionCode) return 'N/D';
        if (version && versionCode) return `APK v${version} (${versionCode})`;
        if (version) return `APK v${version}`;
        return `Build ${versionCode}`;
    };

    const getApkVersionSourceLabel = (terminal: TenantTerminalSnapshot) => {
        const apkVersion = getEffectiveApkVersion(terminal);
        if (!apkVersion.version && !apkVersion.versionCode) return '';
        return apkVersion.source;
    };

    const referenceVersionCandidate = (() => {
        if (latestPosApkRelease) {
            return {
                key: `${latestPosApkRelease.version_name}::${latestPosApkRelease.version_code}`,
                label: `APK v${latestPosApkRelease.version_name} (${latestPosApkRelease.version_code})`,
                source: 'APK POS',
            };
        }

        const primary = tenantTerminals.find((terminal) => terminal.registry?.is_primary && getApkVersionKey(terminal));
        if (primary) {
            return {
                key: getApkVersionKey(primary),
                label: formatApkVersion(primary),
                source: primary.name,
            };
        }

        const versionCounter = new Map<string, { count: number; label: string; source: string }>();
        for (const terminal of tenantTerminals) {
            const key = getApkVersionKey(terminal);
            if (!key) continue;

            const current = versionCounter.get(key);
            versionCounter.set(key, {
                count: (current?.count || 0) + 1,
                label: current?.label || formatApkVersion(terminal),
                source: current?.source || terminal.name,
            });
        }

        const mostCommonVersion = Array.from(versionCounter.entries()).sort((a, b) => b[1].count - a[1].count)[0];
        return mostCommonVersion
            ? {
                key: mostCommonVersion[0],
                label: mostCommonVersion[1].label,
                source: mostCommonVersion[1].source,
            }
            : null;
    })();

    const referenceVersionKey = referenceVersionCandidate?.key || '';
    const registryTerminals = tenantTerminals.flatMap((terminal) => (
        terminal.registries?.length
            ? terminal.registries.map((registry) => ({ ...terminal, registry }))
            : [terminal]
    ));
    const outOfVersionCount = registryTerminals.filter((terminal) => {
        const terminalVersionKey = getApkVersionKey(terminal);
        return Boolean(referenceVersionKey && terminalVersionKey && terminalVersionKey !== referenceVersionKey);
    }).length;
    const missingVersionCount = registryTerminals.filter((terminal) => !getApkVersionKey(terminal)).length;

    const normalizeIp = (value?: string | null) => (value || '').trim();

    const parseEndpointHost = (value?: string | null) => {
        const rawValue = (value || '').trim();
        if (!rawValue) return null;

        try {
            const normalized = rawValue.includes('://') ? rawValue : `http://${rawValue}`;
            const parsed = new URL(normalized);
            return parsed.hostname || null;
        } catch {
            return null;
        }
    };

    const isIpv4 = (value: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(value);

    const isPrivateLanIp = (value: string) => {
        if (!isIpv4(value)) return false;
        if (value.startsWith('10.')) return true;
        if (value.startsWith('192.168.')) return true;

        const [firstOctet, secondOctet] = value.split('.').map((part) => Number(part));
        return firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31;
    };

    const isLikelyVirtualIp = (value: string) => {
        if (!isIpv4(value)) return false;

        return (
            value.startsWith('127.')
            || value.startsWith('169.254.')
            || value.startsWith('10.0.2.')
            || value.startsWith('10.0.3.')
            || value === '10.0.2.2'
            || value === '10.0.3.2'
            || value.startsWith('192.168.56.')
            || value.startsWith('192.168.58.')
            || value.startsWith('192.168.59.')
            || value.startsWith('192.168.122.')
            || value === '192.168.64.1'
        );
    };

    const getReportedIps = (terminal: TenantTerminalSnapshot) => {
        const endpointHost = parseEndpointHost(terminal.registry?.endpoint_url);
        return Array.from(
            new Set(
                [
                    terminal.registry?.local_ip,
                    ...(terminal.registry?.local_ips || []),
                    endpointHost,
                ]
                    .map((value) => normalizeIp(value))
                    .filter(Boolean)
            )
        );
    };

    const getLanIps = (terminal: TenantTerminalSnapshot) =>
        getReportedIps(terminal).filter((ip) => isPrivateLanIp(ip) && !isLikelyVirtualIp(ip));


    const getPreferredLanIp = (terminal: TenantTerminalSnapshot) => {
        const endpointHost = normalizeIp(parseEndpointHost(terminal.registry?.endpoint_url));
        if (endpointHost && getLanIps(terminal).includes(endpointHost)) return endpointHost;

        const primaryIp = normalizeIp(terminal.registry?.local_ip);
        if (primaryIp && getLanIps(terminal).includes(primaryIp)) return primaryIp;

        return getLanIps(terminal)[0] || primaryIp || endpointHost || 'N/D';
    };

    const onlineTerminalCount = registryTerminals.filter((terminal) => getRegistryStatusLabel(terminal) === 'ONLINE').length;
    const offlineTerminalCount = registryTerminals.filter((terminal) => getRegistryStatusLabel(terminal) === 'OFFLINE').length;
    const revokedTerminalCount = registryTerminals.filter((terminal) => getRegistryStatusLabel(terminal) === 'REVOCADA').length;
    const masterTerminalCount = registryTerminals.filter((terminal) => terminal.registry?.is_primary && getRegistryStatusLabel(terminal) === 'ONLINE').length;
    const clientTerminalCount = registryTerminals.filter((terminal) => !terminal.registry?.is_primary).length;
    const publishedEndpointCount = registryTerminals.filter((terminal) => Boolean(terminal.registry)).length;
    const terminalLicenseLimit = posLicenseSeats?.maxSeats ?? selectedTenantForTerminals?.max_pos_terminals;
    const activeLicensedTerminalCount = posLicenseSeats?.usedSeats ?? 0;
    const licenseCountUnit = posLicenseSeats?.licenseUnit === 'erp_terminal'
        ? 'terminales ERP'
        : posLicenseSeats?.licenseUnit === 'terminal_id'
            ? 'cajas'
            : 'equipos';
    const isTerminalLicenseOverLimit = typeof terminalLicenseLimit === 'number' && activeLicensedTerminalCount > terminalLicenseLimit;
    const hasFreeLicenseSlot = typeof terminalLicenseLimit === 'number' && activeLicensedTerminalCount < terminalLicenseLimit;
    const licenseExceededDeviceCount = registryTerminals.filter(
        (terminal) => (terminal.registry?.auth_status || '').toUpperCase() === 'LICENSE_EXCEEDED',
    ).length;
    const erpReadyTerminalCount = registryTerminals.filter((terminal) => getErpReadinessStatus(terminal) === 'ready').length;
    const terminalStoreOptions = Array.from(new Map(
        tenantTerminals.map((terminal) => {
            const storeKey = terminal.erp_store_id || 'UNASSIGNED';
            const storeLabel = terminal.erp_store_name || 'Sin sucursal vinculada';
            return [storeKey, storeLabel];
        }),
    ).entries()).sort((a, b) => a[1].localeCompare(b[1], 'es'));
    const normalizedTerminalSearch = terminalSearchTerm.trim().toLocaleLowerCase('es');
    const hasPendingDeviceRequest = (terminal: TenantTerminalSnapshot) => {
        const authorizedDeviceId = getTerminalAuthorizedDeviceId(terminal);
        return (authAttemptsByTerminal[getTerminalKey(terminal)] || []).some((attempt) => {
            const requestedDeviceId = getAttemptDeviceId(attempt);
            return isPendingDeviceUnauthorizedAttempt(attempt)
                && requestedDeviceId !== authorizedDeviceId;
        });
    };
    const pendingDeviceRequestTerminalCount = tenantTerminals.filter(hasPendingDeviceRequest).length;
    const visibleTenantTerminals = tenantTerminals
        .filter((terminal) => {
            const storeKey = terminal.erp_store_id || 'UNASSIGNED';
            if (terminalStoreFilter !== 'ALL' && terminalStoreFilter !== storeKey) return false;
            if (terminalRequestFilter === 'PENDING' && !hasPendingDeviceRequest(terminal)) return false;
            if (!normalizedTerminalSearch) return true;

            return [
                terminal.name,
                terminal.terminal_id,
                terminal.terminal_code,
                terminal.erp_store_name,
                terminal.registry?.device_id,
                terminal.registry?.current_device_id,
            ].some((value) => value?.toLocaleLowerCase('es').includes(normalizedTerminalSearch));
        })
        .sort((a, b) => {
            const storeComparison = (a.erp_store_name || 'Sin sucursal vinculada')
                .localeCompare(b.erp_store_name || 'Sin sucursal vinculada', 'es');
            return storeComparison || a.name.localeCompare(b.name, 'es');
        });

    return {
        // --- state ---
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

        // --- actions ---
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

        // --- derived values ---
        getRegistryStatusLabel,
        getRegistryStatusClassName,
        getApkVersionKey,
        formatApkVersion,
        getApkVersionSourceLabel,
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

        // --- setters used directly by the console ---
        setTerminalSearchTerm,
        setTerminalStoreFilter,
        setTerminalRequestFilter,
        setTerminalTabs,
        setTerminalAdvancedOpen,
        setManualDeviceIds,
        setTakeoverFormData,
        setRebuildFormData,
    };
};

export type TenantTerminalConsoleState = ReturnType<typeof useTenantTerminalConsole>;
