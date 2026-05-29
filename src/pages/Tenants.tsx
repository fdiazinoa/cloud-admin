import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Power, Edit3, Loader2, X, Boxes, Monitor, Wifi, WifiOff, Trash2, RefreshCcw, KeyRound, ShieldCheck, Ban, CheckCircle2 } from 'lucide-react';
import type { Distributor, Tenant, TerminalAuthAttempt, TerminalFiscalReadiness, TenantTerminalErpReadiness, TenantTerminalSnapshot } from '../types';
import { tenantService } from '../lib/tenantService';
import { TenantProductsModal } from '../components/TenantProductsModal';
import { getPosApkReleases, type PosApkRelease } from '../lib/posApkReleases';
import {
    deriveProductsFromTenant,
    deriveTenantConfigFromProducts,
    deriveTenantSemanticsFromProducts,
    deriveTenantSemanticsFromTenant,
    getActiveProductLabels,
    getDefaultTenantProducts,
    getTenantTypeLabel,
    normalizeTenantProductSelection,
    type TenantSemanticConfig,
    type TenantProductSelection
} from '../lib/tenantProducts';
import {
    buildTerminalIdentitySummary,
    getAttemptDeviceId,
    getDeviceRoleClasses,
    getDeviceRoleLabel,
    getRegistryEndpointRole,
    getTerminalAuthStatus,
    getTerminalAuthorizedDeviceId,
    getTerminalPersistedAuthorizedDeviceId,
    getTerminalPosReportedDeviceId,
    isPendingDeviceUnauthorizedAttempt,
    summarizeTerminalFiscalDebug,
} from '../lib/terminalIdentity';

export const Tenants: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [distributors, setDistributors] = useState<Distributor[]>([]);
    const [loading, setLoading] = useState(true);
    const [distributorsLoading, setDistributorsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isEditSubmitting, setIsEditSubmitting] = useState(false);
    const [isCreateProductsModalOpen, setIsCreateProductsModalOpen] = useState(false);
    const [isEditProductsModalOpen, setIsEditProductsModalOpen] = useState(false);
    const [createProductsModalVersion, setCreateProductsModalVersion] = useState(0);
    const [editProductsModalVersion, setEditProductsModalVersion] = useState(0);
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
    const [selectedTenantForTerminals, setSelectedTenantForTerminals] = useState<Tenant | null>(null);
    const [tenantTerminals, setTenantTerminals] = useState<TenantTerminalSnapshot[]>([]);
    const [latestPosApkRelease, setLatestPosApkRelease] = useState<PosApkRelease | null>(null);
    const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);
    const [isTerminalModalLoading, setIsTerminalModalLoading] = useState(false);
    const [takeoverTerminal, setTakeoverTerminal] = useState<TenantTerminalSnapshot | null>(null);
    const [isTakeoverModalOpen, setIsTakeoverModalOpen] = useState(false);
    const [isTakeoverSubmitting, setIsTakeoverSubmitting] = useState(false);
    const [rebuildTerminal, setRebuildTerminal] = useState<TenantTerminalSnapshot | null>(null);
    const [isRebuildModalOpen, setIsRebuildModalOpen] = useState(false);
    const [isRebuildSubmitting, setIsRebuildSubmitting] = useState(false);
    const [erpReadinessSubmittingKey, setErpReadinessSubmittingKey] = useState<string | null>(null);
    const [authAttemptsByTerminal, setAuthAttemptsByTerminal] = useState<Record<string, TerminalAuthAttempt[]>>({});
    const [authAttemptsLoadingKey, setAuthAttemptsLoadingKey] = useState<string | null>(null);
    const [deviceActionSubmittingKey, setDeviceActionSubmittingKey] = useState<string | null>(null);
    const [fiscalReadinessByTerminal, setFiscalReadinessByTerminal] = useState<Record<string, TerminalFiscalReadiness>>({});
    const [fiscalReadinessLoadingKey, setFiscalReadinessLoadingKey] = useState<string | null>(null);
    const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null);
    const [updatingStatusTenantId, setUpdatingStatusTenantId] = useState<string | null>(null);
    const [provisionedCredentials, setProvisionedCredentials] = useState<{
        email: string;
        tempPassword: string;
    } | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        taxId: '',
        contactName: '',
        contactEmail: '',
        city: '',
        capturedByDistributorId: '',
        servicedByDistributorId: '',
        products: getDefaultTenantProducts() as TenantProductSelection,
    });
    const [editFormData, setEditFormData] = useState({
        name: '',
        legalName: '',
        taxId: '',
        phone: '',
        email: '',
        password: '',
        products: getDefaultTenantProducts() as TenantProductSelection,
    });
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

    const getErrorMessage = (error: unknown) => {
        if (typeof error === 'string') return error;
        if (error instanceof Error) return error.message;
        if (
            typeof error === 'object'
            && error !== null
            && 'message' in error
            && typeof (error as { message?: unknown }).message === 'string'
        ) {
            return (error as { message: string }).message;
        }
        if (
            typeof error === 'object'
            && error !== null
            && 'error_description' in error
            && typeof (error as { error_description?: unknown }).error_description === 'string'
        ) {
            return (error as { error_description: string }).error_description;
        }
        return 'Error desconocido';
    };

    const [searchParams] = useSearchParams();

    useEffect(() => {
        void fetchTenants();
        void fetchDistributors();

        if (searchParams.get('create') === 'true') {
            setIsModalOpen(true);
            // Optional: clear the param so it doesn't re-open on refresh if desired, 
            // but usually it's fine. If we want to clear:
            // const newParams = new URLSearchParams(searchParams);
            // newParams.delete('create');
            // setSearchParams(newParams, { replace: true });
        }
    }, [searchParams]);

    const fetchTenants = async () => {
        setLoading(true);
        try {
            const data = await tenantService.getTenants();
            setTenants(data || []);
        } catch (err) {
            console.error('Error fetching tenants:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchDistributors = async () => {
        setDistributorsLoading(true);
        try {
            const data = await tenantService.getDistributors();
            setDistributors(data || []);
        } catch (err) {
            console.error('Error fetching distributors:', err);
        } finally {
            setDistributorsLoading(false);
        }
    };

    const filteredTenants = tenants.filter((tenant) => {
        const normalizedSearch = searchTerm.toLowerCase();
        return tenant.name.toLowerCase().includes(normalizedSearch)
            || (tenant.tax_id && tenant.tax_id.toLowerCase().includes(normalizedSearch))
            || (tenant.contact_name && tenant.contact_name.toLowerCase().includes(normalizedSearch))
            || (tenant.city && tenant.city.toLowerCase().includes(normalizedSearch));
    });

    const activateTrialTenant = async (tenant: Tenant) => {
        if (!confirm(`¿Deseas activar la empresa "${tenant.name}"?`)) return;

        setUpdatingStatusTenantId(tenant.id);
        try {
            await tenantService.reactivateTenant(tenant.id);
            await fetchTenants();
        } catch (err) {
            console.error('Error activating tenant:', err);
            alert('Hubo un error al activar la empresa');
        } finally {
            setUpdatingStatusTenantId(null);
        }
    };

    const toggleTenantStatus = async (tenant: Tenant) => {
        const isCurrentlyActive = tenant.status === 'ACTIVE';
        const newStatusLabel = isCurrentlyActive ? 'SUSPENDER' : 'REACTIVAR';

        if (!confirm(`¿Estás seguro que deseas ${newStatusLabel} esta empresa?`)) return;

        setUpdatingStatusTenantId(tenant.id);
        try {
            if (isCurrentlyActive) {
                await tenantService.suspendTenant(tenant.id);
            } else {
                await tenantService.reactivateTenant(tenant.id);
            }
            await fetchTenants();
        } catch (err) {
            console.error('Error toggling status:', err);
            alert('Hubo un error al actualizar el estatus');
        } finally {
            setUpdatingStatusTenantId(null);
        }
    };

    const handleDeleteTenant = async (tenant: Tenant) => {
        const confirmed = confirm(
            `Vas a eliminar definitivamente el tenant "${tenant.name}". Esta accion borra su registro, suscripcion, esquema de base de datos y usuario de acceso si existe. ¿Deseas continuar?`,
        );
        if (!confirmed) return;

        const typedName = prompt(`Para confirmar, escribe exactamente el nombre del tenant: ${tenant.name}`);
        if (typedName !== tenant.name) {
            alert('El nombre no coincide. No se elimino el tenant.');
            return;
        }

        setDeletingTenantId(tenant.id);
        try {
            await tenantService.deleteTenant(tenant);
            await fetchTenants();
            alert(`Tenant "${tenant.name}" eliminado correctamente.`);
        } catch (err: unknown) {
            console.error('Error deleting tenant:', err);
            await fetchTenants();
            alert('Error al eliminar el Tenant: ' + getErrorMessage(err));
        } finally {
            setDeletingTenantId(null);
        }
    };

    const closeCreateModal = () => {
        setIsModalOpen(false);
        setIsCreateProductsModalOpen(false);
    };

    const closeEditModal = () => {
        setIsEditModalOpen(false);
        setIsEditProductsModalOpen(false);
        setEditingTenant(null);
    };

    const openCreateProductsModal = () => {
        setCreateProductsModalVersion((current) => current + 1);
        setIsCreateProductsModalOpen(true);
    };

    const openEditProductsModal = () => {
        setEditProductsModalVersion((current) => current + 1);
        setIsEditProductsModalOpen(true);
    };

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const slug = formData.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const products = normalizeTenantProductSelection(formData.products);
            const productConfig = deriveTenantConfigFromProducts(products);
            const semanticConfig = deriveTenantSemanticsFromProducts(products);

            const { tenantId, tempPassword } = await tenantService.createTenant({
                name: formData.name,
                slug,
                email: formData.email,
                contactName: formData.contactName,
                contactEmail: formData.contactEmail,
                city: formData.city,
                capturedByDistributorId: formData.capturedByDistributorId || undefined,
                servicedByDistributorId: formData.servicedByDistributorId || undefined,
                plan: 'TRIAL',
                type: productConfig.type,
                cloudSync: productConfig.cloudSync,
                contractedProduct: semanticConfig.contractedProduct,
                posVariant: semanticConfig.posVariant,
                offlineMode: semanticConfig.offlineMode,
                explicitOffline: semanticConfig.explicitOffline,
                cloudDisabledReason: semanticConfig.cloudDisabledReason,
                posRuntime: semanticConfig.posRuntime,
                cloudChannel: semanticConfig.cloudChannel,
                dataMaster: semanticConfig.dataMaster,
                cloudSyncEnabled: semanticConfig.cloudSyncEnabled,
                erpCoreEnabled: semanticConfig.erpCoreEnabled,
                erpUiEnabled: semanticConfig.erpUiEnabled,
                customerErpAccess: semanticConfig.customerErpAccess,
                backupEnabled: semanticConfig.backupEnabled,
                lifecycleStatus: semanticConfig.lifecycleStatus,
                provisioningStatus: semanticConfig.provisioningStatus,
            });

            if (formData.taxId.trim()) {
                await tenantService.updateTenantTaxId(tenantId, formData.taxId);
            }

            setProvisionedCredentials({
                email: formData.email.trim().toLowerCase(),
                tempPassword,
            });

            setFormData({
                name: '',
                email: '',
                taxId: '',
                contactName: '',
                contactEmail: '',
                city: '',
                capturedByDistributorId: '',
                servicedByDistributorId: '',
                products: getDefaultTenantProducts(),
            });
            closeCreateModal();
            await fetchTenants();
        } catch (err: unknown) {
            console.error('Error provisioning tenant:', err);
            alert('Error al aprovisionar el Tenant: ' + getErrorMessage(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    const normalizeOptional = (value: string) => {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    };

    const openEditModal = (tenant: Tenant) => {
        setEditingTenant(tenant);
        setEditFormData({
            name: tenant.name || '',
            legalName: tenant.legal_name || '',
            taxId: tenant.tax_id || '',
            phone: tenant.phone || '',
            email: tenant.email || '',
            password: '',
            products: deriveProductsFromTenant(tenant.type, tenant.cloud_sync, tenant.max_pos_terminals, tenant.max_erp_users, {
                posVariant: tenant.pos_variant,
                offlineMode: tenant.offline_mode,
                explicitOffline: tenant.explicit_offline,
                cloudChannel: tenant.cloud_channel,
            }),
        });
        setIsEditModalOpen(true);
    };

    const openTerminalModal = async (tenant: Tenant) => {
        setSelectedTenantForTerminals(tenant);
        setTenantTerminals([]);
        setAuthAttemptsByTerminal({});
        setFiscalReadinessByTerminal({});
        setIsTerminalModalOpen(true);
        setIsTerminalModalLoading(true);

        try {
            try {
                await tenantService.enforceTenantPosLicenseLimits(tenant.id);
            } catch (enforceErr) {
                console.warn('POS license enforcement skipped or failed:', enforceErr);
            }

            const [data, releases] = await Promise.all([
                tenantService.getTenantTerminalOverview(tenant.id),
                getPosApkReleases(),
            ]);
            setTenantTerminals(data);
            setLatestPosApkRelease(releases.find((release) => release.is_latest) || releases[0] || null);
            void loadAuthAttemptsForTerminals(tenant.id, data);
            if (isFiscalEligibleTenant(tenant)) {
                void loadFiscalReadinessForTerminals(tenant.id, data);
            }
        } catch (err) {
            console.error('Error fetching tenant terminals:', err);
            alert('No se pudieron cargar las terminales de este tenant.');
        } finally {
            setIsTerminalModalLoading(false);
        }
    };

    const closeTerminalModal = () => {
        setIsTerminalModalOpen(false);
        setSelectedTenantForTerminals(null);
        setTenantTerminals([]);
        setAuthAttemptsByTerminal({});
        setFiscalReadinessByTerminal({});
        setLatestPosApkRelease(null);
        closeTakeoverModal();
        closeRebuildModal();
    };

    const getTenantSemantics = (tenant: Tenant): TenantSemanticConfig => {
        const fallback = deriveTenantSemanticsFromTenant(tenant.type, tenant.cloud_sync, tenant.max_pos_terminals, tenant.max_erp_users, {
            posVariant: tenant.pos_variant,
            offlineMode: tenant.offline_mode,
            explicitOffline: tenant.explicit_offline,
            cloudChannel: tenant.cloud_channel,
        });
        return {
            contractedProduct: tenant.contracted_product || fallback.contractedProduct,
            posVariant: tenant.pos_variant || fallback.posVariant,
            offlineMode: tenant.offline_mode ?? fallback.offlineMode,
            explicitOffline: tenant.explicit_offline ?? fallback.explicitOffline,
            cloudDisabledReason: tenant.cloud_disabled_reason ?? fallback.cloudDisabledReason,
            posRuntime: tenant.pos_runtime || fallback.posRuntime,
            cloudChannel: tenant.cloud_channel || fallback.cloudChannel,
            dataMaster: tenant.data_master || fallback.dataMaster,
            cloudSyncEnabled: tenant.cloud_sync_enabled ?? fallback.cloudSyncEnabled,
            erpCoreEnabled: tenant.erp_core_enabled ?? fallback.erpCoreEnabled,
            erpUiEnabled: tenant.erp_ui_enabled ?? fallback.erpUiEnabled,
            customerErpAccess: tenant.customer_erp_access ?? fallback.customerErpAccess,
            backupEnabled: tenant.backup_enabled ?? fallback.backupEnabled,
            lifecycleStatus: tenant.lifecycle_status || fallback.lifecycleStatus,
            provisioningStatus: tenant.provisioning_status || fallback.provisioningStatus,
        };
    };

    const isLocalPosTenant = (tenant?: Tenant | null) => {
        if (!tenant) return false;
        const semantics = getTenantSemantics(tenant);
        return semantics.contractedProduct === 'POS_ONLY' && semantics.posRuntime !== 'SLAVE';
    };

    const isExplicitOfflinePosTenant = (tenant?: Tenant | null) => {
        if (!tenant) return false;
        const semantics = getTenantSemantics(tenant);
        return semantics.contractedProduct === 'POS_ONLY'
            && (semantics.posVariant === 'POS_ONLY_OFFLINE' || semantics.offlineMode || semantics.cloudChannel === 'NONE');
    };

    const isCloudRecoverableLocalPosTenant = (tenant?: Tenant | null) => (
        isLocalPosTenant(tenant) && !isExplicitOfflinePosTenant(tenant)
    );

    const isFiscalEligibleTenant = (tenant?: Tenant | null) => {
        if (!tenant) return false;
        const semantics = getTenantSemantics(tenant);
        return semantics.contractedProduct === 'POS_ERP' || semantics.cloudChannel === 'ERP_ACTIVE';
    };

    const getTerminalTakeoverId = (terminal: TenantTerminalSnapshot) => terminal.terminal_id || terminal.id;

    const getTakeoverSelectionKey = (terminalId: string, registryId?: string | null) => (
        registryId ? `registry:${registryId}` : `terminal:${terminalId}`
    );

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
            const terminalId = registry.terminal_id || getTerminalTakeoverId(terminal);
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

    const getTerminalKey = (terminal: TenantTerminalSnapshot) => `${terminal.id}-${terminal.registry?.id || 'catalog'}`;

    const getAttemptTime = (attempt: TerminalAuthAttempt) => attempt.attempted_at || attempt.created_at || null;

    const getAuthStatusLabel = (status: string) => {
        switch (status) {
            case 'AUTHORIZED': return 'Autorizado';
            case 'DEVICE_MISMATCH': return 'Device rechazado';
            case 'TAKEOVER_PENDING': return 'Takeover pendiente';
            case 'TAKEOVER_COMPLETED': return 'Takeover completado';
            case 'OLD_DEVICE_REVOKED': return 'Equipo revocado';
            case 'TOKEN_ROTATION_REQUIRED': return 'Rotacion requerida';
            case 'ERP_AUTH_ERROR': return 'Error auth ERP';
            case 'LICENSE_EXCEEDED': return 'Sin licencia POS';
            default: return status || 'N/D';
        }
    };

    const getAuthStatusClasses = (status: string) => {
        if (status === 'AUTHORIZED' || status === 'TAKEOVER_COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
        if (status === 'DEVICE_MISMATCH' || status === 'ERP_AUTH_ERROR' || status === 'LICENSE_EXCEEDED') {
            return 'border-red-200 bg-red-50 text-red-700';
        }
        if (status === 'TAKEOVER_PENDING' || status === 'TOKEN_ROTATION_REQUIRED') return 'border-amber-200 bg-amber-50 text-amber-700';
        if (status === 'OLD_DEVICE_REVOKED') return 'border-slate-200 bg-slate-100 text-slate-700';
        return 'border-slate-200 bg-slate-50 text-slate-600';
    };

    const getFiscalReadiness = (terminal: TenantTerminalSnapshot) => (
        fiscalReadinessByTerminal[getTerminalKey(terminal)]
        || terminal.registry?.fiscal_readiness
        || null
    );

    const getFiscalStatusClasses = (status: string) => {
        if (status === 'READY') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
        if (status === 'DEMO_READY') return 'border-blue-200 bg-blue-50 text-blue-700';
        if (status === 'ERROR') return 'border-red-200 bg-red-50 text-red-700';
        return 'border-amber-200 bg-amber-50 text-amber-800';
    };

    const getReadinessValue = (readiness: TenantTerminalErpReadiness | null | undefined, keys: string[]) => {
        if (!readiness) return null;
        for (const key of keys) {
            const value = readiness[key];
            if (typeof value === 'string' && value.trim()) return value.trim();
            if (typeof value === 'number') return String(value);
        }
        return null;
    };

    const getReadinessCheckValue = (readiness: TenantTerminalErpReadiness | null | undefined, keys: string[]) => {
        const checks = readiness?.checks;
        if (!checks || typeof checks !== 'object') return null;

        for (const key of keys) {
            const value = checks[key];
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value > 0;
            if (typeof value === 'string') {
                const normalized = value.trim().toLowerCase();
                if (['true', 'ready', 'active', 'available', 'ok', 'yes'].includes(normalized)) return true;
                if (['false', 'missing', 'draft', 'empty', 'no'].includes(normalized)) return false;
            }
            if (value && typeof value === 'object') {
                const record = value as Record<string, unknown>;
                const ready = record.ready ?? record.exists ?? record.available ?? record.enabled;
                if (typeof ready === 'boolean') return ready;
                const count = record.count ?? record.total;
                if (typeof count === 'number') return count > 0;
            }
        }

        return null;
    };

    const getErpReadinessStatus = (terminal: TenantTerminalSnapshot) => (
        terminal.registry?.erp_readiness?.status?.toString().toLowerCase() || 'missing'
    );

    const getReadinessBadgeClasses = (status: string) => {
        if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
        if (status === 'pending') return 'border-blue-200 bg-blue-50 text-blue-700';
        if (status === 'missing_catalog') return 'border-amber-200 bg-amber-50 text-amber-700';
        if (status === 'error') return 'border-red-200 bg-red-50 text-red-700';
        return 'border-slate-200 bg-slate-50 text-slate-600';
    };

    const getReadinessLabel = (status: string) => {
        if (status === 'ready') return 'ERP listo';
        if (status === 'pending') return 'ERP pendiente';
        if (status === 'missing_catalog') return 'Catalogo faltante';
        if (status === 'error') return 'ERP con error';
        return 'ERP sin validar';
    };

    const getCheckLabel = (value: boolean | null, readyLabel: string, missingLabel: string) => {
        if (value === true) return readyLabel;
        if (value === false) return missingLabel;
        return 'N/D';
    };

    const openTakeoverModal = (terminal: TenantTerminalSnapshot) => {
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

    const loadTerminalAuthAttempts = async (tenantId: string, terminal: TenantTerminalSnapshot) => {
        const key = getTerminalKey(terminal);
        const terminalId = getTerminalTakeoverId(terminal);
        if (!terminalId) return;

        setAuthAttemptsLoadingKey(key);
        try {
            const attempts = await tenantService.getTerminalAuthAttempts(tenantId, terminalId);
            setAuthAttemptsByTerminal((current) => ({
                ...current,
                [key]: attempts,
            }));
        } catch (err) {
            console.warn('Error fetching terminal auth attempts:', err);
            setAuthAttemptsByTerminal((current) => ({
                ...current,
                [key]: [],
            }));
        } finally {
            setAuthAttemptsLoadingKey((current) => current === key ? null : current);
        }
    };

    const loadAuthAttemptsForTerminals = async (tenantId: string, terminals: TenantTerminalSnapshot[]) => {
        for (const terminal of terminals) {
            void loadTerminalAuthAttempts(tenantId, terminal);
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
        const data = await tenantService.getTenantTerminalOverview(selectedTenantForTerminals.id);
        setTenantTerminals(data);
        void loadAuthAttemptsForTerminals(selectedTenantForTerminals.id, data);
        if (isFiscalEligibleTenant(selectedTenantForTerminals)) {
            void loadFiscalReadinessForTerminals(selectedTenantForTerminals.id, data);
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

    const loadFiscalReadinessForTerminals = async (tenantId: string, terminals: TenantTerminalSnapshot[]) => {
        for (const terminal of terminals) {
            void loadTerminalFiscalReadiness(tenantId, terminal);
        }
    };

    const handleReauthorizeAttempt = async (terminal: TenantTerminalSnapshot, attempt: TerminalAuthAttempt) => {
        if (!selectedTenantForTerminals) return;

        const requestedDeviceId = getAttemptDeviceId(attempt);
        const terminalId = getTerminalTakeoverId(terminal);
        if (!terminalId || !requestedDeviceId) {
            alert('El intento rechazado no tiene terminal o device_id suficiente para reautorizar.');
            return;
        }

        const authorizedDeviceId = getTerminalAuthorizedDeviceId(terminal) || attempt.authorized_device_id || 'N/D';
        const confirmed = confirm(
            `Esta accion autorizara el equipo ${requestedDeviceId} para usar ${terminal.name} / ${terminalId}. `
            + `El equipo anterior (${authorizedDeviceId}) dejara de poder sincronizar como esta terminal. `
            + 'No se borraran ventas, productos ni datos operativos.',
        );
        if (!confirmed) return;

        const pairingCode = attempt.pairing_required
            ? prompt('Codigo de vinculacion')
            : null;
        if (attempt.pairing_required && !pairingCode?.trim()) {
            alert('El codigo de vinculacion es requerido para reautorizar este equipo.');
            return;
        }

        const key = `${getTerminalKey(terminal)}-TAKEOVER-${requestedDeviceId}`;
        setDeviceActionSubmittingKey(key);
        try {
            const result = await tenantService.requestTerminalDeviceAction({
                tenantId: selectedTenantForTerminals.id,
                terminalId,
                registryId: terminal.registry?.id || null,
                terminalName: terminal.name,
                deviceId: requestedDeviceId,
                action: 'TAKEOVER',
                reason: 'DEVICE_REINSTALL_OR_REPLACEMENT',
                pairingCode: pairingCode?.trim() || null,
            });
            alert(result.message || 'Terminal reautorizada correctamente. El POS debe reintentar autenticacion para recibir un nuevo syncToken.');
            await refreshTerminalModalData();
        } catch (err: unknown) {
            console.error('Error reauthorizing terminal device:', err);
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
            alert('Esta terminal necesita terminal_id y device_id en el registro para sincronizar autorizacion.');
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
            setTenants(data || []);
            const refreshed = (data || []).find((row) => row.id === selectedTenantForTerminals.id);
            if (refreshed) setSelectedTenantForTerminals(refreshed);
            await refreshTerminalModalData();
        } catch (err: unknown) {
            console.error('Error releasing POS_ONLY provisioning block:', err);
            alert(getErrorMessage(err));
        }
    };

    const handleRotateTerminalCredentials = async (terminal: TenantTerminalSnapshot) => {
        if (!selectedTenantForTerminals) return;
        const terminalId = getTerminalTakeoverId(terminal);
        const deviceId = getTerminalAuthorizedDeviceId(terminal);
        if (!terminalId || !deviceId) {
            alert('Esta terminal necesita terminal_id y device_id autorizado para rotar credenciales.');
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

    const handleRevokePreviousDevice = async (terminal: TenantTerminalSnapshot, deviceId: string) => {
        if (!selectedTenantForTerminals) return;
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

    const handleUpdateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTenant) return;

        setIsEditSubmitting(true);
        try {
            const products = normalizeTenantProductSelection(editFormData.products);
            const productConfig = deriveTenantConfigFromProducts(products);
            const semanticConfig = deriveTenantSemanticsFromProducts(products);

            await tenantService.updateTenant(editingTenant.id, {
                name: editFormData.name.trim(),
                legal_name: normalizeOptional(editFormData.legalName),
                tax_id: normalizeOptional(editFormData.taxId),
                phone: normalizeOptional(editFormData.phone),
                type: productConfig.type,
                cloud_sync: productConfig.cloudSync,
                max_pos_terminals: editFormData.products.pos_licenses,
                max_erp_users: editFormData.products.erp_users,
                contracted_product: semanticConfig.contractedProduct,
                pos_variant: semanticConfig.posVariant,
                offline_mode: semanticConfig.offlineMode,
                explicit_offline: semanticConfig.explicitOffline,
                cloud_disabled_reason: semanticConfig.cloudDisabledReason,
                pos_runtime: semanticConfig.posRuntime,
                cloud_channel: semanticConfig.cloudChannel,
                data_master: semanticConfig.dataMaster,
                cloud_sync_enabled: semanticConfig.cloudSyncEnabled,
                erp_core_enabled: semanticConfig.erpCoreEnabled,
                erp_ui_enabled: semanticConfig.erpUiEnabled,
                customer_erp_access: semanticConfig.customerErpAccess,
                backup_enabled: semanticConfig.backupEnabled,
                lifecycle_status: semanticConfig.lifecycleStatus,
                provisioning_status: semanticConfig.provisioningStatus,
            });

            if (editFormData.email.trim().toLowerCase() !== editingTenant.email || editFormData.password.trim()) {
                await tenantService.updateTenantCredentials(editingTenant.id, {
                    email: editFormData.email.trim().toLowerCase(),
                    password: editFormData.password.trim() || undefined,
                });
            }

            closeEditModal();
            await fetchTenants();
        } catch (err: unknown) {
            console.error('Error updating tenant:', err);
            alert('Error al actualizar el Tenant: ' + getErrorMessage(err));
        } finally {
            setIsEditSubmitting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE': return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase transition-colors">Activo</span>;
            case 'SUSPENDED': return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase transition-colors">Suspendido</span>;
            case 'TRIAL': return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold uppercase transition-colors">Prueba</span>;
            default: return null;
        }
    };

    const renderProductSummary = (products: TenantProductSelection) => {
        const normalizedProducts = normalizeTenantProductSelection(products);
        const labels = getActiveProductLabels(normalizedProducts);
        const semantics = deriveTenantSemanticsFromProducts(normalizedProducts);
        let solutionLabel = 'Selecciona productos';

        try {
            solutionLabel = getTenantTypeLabel(deriveTenantConfigFromProducts(products).type);
        } catch {
            solutionLabel = 'Selecciona al menos un producto principal';
        }

        return (
            <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    {labels.map((label) => (
                        <span key={label} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-black uppercase tracking-wide border border-blue-100">
                            {label}
                        </span>
                    ))}
                </div>
                <p className="text-xs text-slate-500">
                    Solucion base: <span className="font-bold text-slate-700">{solutionLabel}</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                        Contrato: <span className="font-black text-slate-800">{semantics.contractedProduct}</span>
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                        Variante POS: <span className="font-black text-slate-800">{semantics.posVariant}</span>
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                        Canal cloud: <span className="font-black text-slate-800">{semantics.cloudChannel}</span>
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                        Fuente datos: <span className="font-black text-slate-800">{semantics.dataMaster}</span>
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                        ERP cliente: <span className="font-black text-slate-800">{semantics.customerErpAccess ? 'SI' : 'NO'}</span>
                    </span>
                </div>
                {semantics.contractedProduct === 'POS_ONLY' && semantics.cloudChannel === 'POS_CLOUD_STAGING' ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                        POS_ONLY SaaS: incluye Cloud Staging, respaldo, recuperacion y core interno. El cliente no ve ERP.
                    </div>
                ) : null}
                {semantics.posVariant === 'POS_ONLY_OFFLINE' ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        POS Offline explicito: no tendra respaldo cloud, recuperacion SaaS ni preparacion automatica para ERP.
                    </div>
                ) : null}
            </div>
        );
    };
    const formatDateTime = (value?: string | null) => {
        if (!value) return 'N/D';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'N/D';
        return parsed.toLocaleString('es-DO');
    };

    const renderTenantSemanticsGrid = (tenant: Tenant) => {
        const semantics = getTenantSemantics(tenant);
        const fields = [
            ['Producto contratado', semantics.contractedProduct],
            ['Variante POS', semantics.posVariant],
            ['Runtime POS', semantics.posRuntime],
            ['Canal cloud', semantics.cloudChannel],
            ['Fuente de datos', semantics.dataMaster],
            ['Cloud Sync', semantics.cloudSyncEnabled ? 'ACTIVO' : 'INACTIVO'],
            ['ERP Core interno', semantics.erpCoreEnabled ? 'PREPARADO' : 'NO PREPARADO'],
            ['Acceso ERP cliente', semantics.customerErpAccess ? 'SI' : 'NO'],
            ['ERP UI', semantics.erpUiEnabled ? 'SI' : 'NO'],
            ['Modo offline', semantics.offlineMode ? 'SI' : 'NO'],
            ['Lifecycle', semantics.lifecycleStatus],
            ['Provisioning', semantics.provisioningStatus],
            ['Ultimo sync recibido', formatDateTime(tenant.last_sync_received_at)],
            ['Ultimo backup', formatDateTime(tenant.last_backup_at)],
            ['Listo activar ERP', tenant.ready_for_erp_activation ? 'SI' : 'NO'],
            ['Eventos pendientes', String(tenant.pending_events_count ?? 0)],
            ['Eventos bloqueados', String(tenant.blocked_events_count ?? 0)],
        ];

        return (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <div className="flex flex-col gap-1 mb-4">
                    <p className="text-sm font-black text-slate-800">Semantica comercial y tecnica</p>
                    <p className="text-xs text-slate-500">
                        El contrato controla acceso ERP; el canal cloud controla sincronizacion, staging y recuperacion.
                    </p>
                </div>
                {semantics.contractedProduct === 'POS_ONLY' && semantics.cloudChannel === 'NONE' ? (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                        Este POS esta en modo offline/sin Cloud Staging. No tendra respaldo cloud, recuperacion SaaS ni preparacion automatica para activar ERP.
                    </div>
                ) : null}
                {semantics.contractedProduct === 'POS_ONLY' && semantics.cloudChannel === 'POS_CLOUD_STAGING' ? (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                        POS_ONLY SaaS correcto: opera local con SQLite, sincroniza al cloud/core para respaldo y staging, y mantiene ERP visible apagado para el cliente.
                    </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {fields.map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                            <p className="mt-1 text-sm font-bold text-slate-800 break-words">{value}</p>
                        </div>
                    ))}
                </div>
            </div>
        );
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

    const getApkVersionKey = (terminal: TenantTerminalSnapshot) => {
        const version = terminal.registry?.app_version?.trim() || '';
        const versionCode = terminal.registry?.app_version_code ? String(terminal.registry.app_version_code) : '';
        if (!version && !versionCode) return '';
        return `${version}::${versionCode}`;
    };

    const formatApkVersion = (terminal: TenantTerminalSnapshot) => {
        const version = terminal.registry?.app_version?.trim() || '';
        const versionCode = terminal.registry?.app_version_code;
        if (!version && !versionCode) return 'N/D';
        if (version && versionCode) return `APK v${version} (${versionCode})`;
        if (version) return `APK v${version}`;
        return `Build ${versionCode}`;
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
    const terminalLicenseLimit = selectedTenantForTerminals?.max_pos_terminals;
    const activeLicensedTerminalIds = new Set(
        registryTerminals
            .filter((terminal) => {
                if (getRegistryStatusLabel(terminal) !== 'ONLINE') return false;
                if ((terminal.registry?.auth_status || '').toUpperCase() === 'LICENSE_EXCEEDED') return false;
                return Boolean(terminal.registry?.terminal_id || terminal.terminal_id);
            })
            .map((terminal) => (terminal.registry?.terminal_id || terminal.terminal_id || '').trim())
            .filter(Boolean),
    );
    const activeLicensedTerminalCount = activeLicensedTerminalIds.size;
    const isTerminalLicenseOverLimit = typeof terminalLicenseLimit === 'number' && activeLicensedTerminalCount > terminalLicenseLimit;
    const licenseExceededDeviceCount = registryTerminals.filter(
        (terminal) => (terminal.registry?.auth_status || '').toUpperCase() === 'LICENSE_EXCEEDED',
    ).length;
    const erpReadyTerminalCount = registryTerminals.filter((terminal) => getErpReadinessStatus(terminal) === 'ready').length;
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">Gestión de Tenants</h2>
                    <p className="text-slate-500 text-sm">Administra las cuentas de clientes y empresas suscritas.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors focus:ring-4 focus:ring-blue-100"
                >
                    <Plus size={20} />
                    Nuevo Tenant
                </button>
            </div>

            {provisionedCredentials && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-800">Credenciales temporales</h3>
                            <p className="mt-1 text-sm text-emerald-700">
                                Entrega estas credenciales por un canal seguro y fuerza el cambio de contrasena en el primer acceso.
                            </p>
                            <p className="mt-3 text-sm text-slate-700">
                                <span className="font-bold">Email:</span> {provisionedCredentials.email}
                            </p>
                            <p className="text-sm text-slate-700">
                                <span className="font-bold">Clave temporal:</span> {provisionedCredentials.tempPassword}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setProvisionedCredentials(null)}
                            className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                            Ocultar
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="relative w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, RNC, contacto o ciudad..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                        />
                    </div>
                    <div className="flex gap-2 text-sm text-slate-600 font-medium items-center">
                        {loading ? <Loader2 className="animate-spin text-blue-500" size={16} /> : null}
                        <span>Total: {filteredTenants.length}</span>
                    </div>
                </div>

                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Empresa / ID</th>
                            <th className="px-6 py-4">RNC / Cédula</th>
                            <th className="px-6 py-4">Contacto</th>
                            <th className="px-6 py-4 text-center">Estado</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredTenants.length === 0 && !loading && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">No se encontraron tenants.</td>
                            </tr>
                        )}
                        {filteredTenants.map((tenant) => {
                            const semantics = getTenantSemantics(tenant);
                            return (
                            <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-slate-800">{tenant.name}</div>
                                    <div className="text-xs text-slate-400 font-mono mt-0.5">{tenant.id}</div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {getActiveProductLabels(deriveProductsFromTenant(tenant.type, tenant.cloud_sync, tenant.max_pos_terminals, tenant.max_erp_users, {
                                            posVariant: tenant.pos_variant,
                                            offlineMode: tenant.offline_mode,
                                            explicitOffline: tenant.explicit_offline,
                                            cloudChannel: tenant.cloud_channel,
                                        })).map((label) => (
                                            <span key={label} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wide">
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-wide">
                                            {semantics.contractedProduct}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-black uppercase tracking-wide">
                                            {semantics.cloudChannel}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wide">
                                            ERP cliente: {semantics.customerErpAccess ? 'SI' : 'NO'}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-mono text-slate-600">{tenant.tax_id || 'N/A'}</td>
                                <td className="px-6 py-4">
                                    <div className="font-semibold text-slate-700">{tenant.contact_name || 'Sin persona de contacto'}</div>
                                    <div className="text-xs text-slate-500">{tenant.contact_email || tenant.email}</div>
                                    <div className="text-xs text-slate-400">{tenant.city || 'Ciudad no definida'}</div>
                                </td>
                                <td className="px-6 py-4 text-center">{getStatusBadge(tenant.status)}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void openTerminalModal(tenant)}
                                            className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                            title="Ver terminales"
                                        >
                                            <Monitor size={18} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openEditModal(tenant)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Editar"
                                        >
                                            <Edit3 size={18} />
                                        </button>
                                        {tenant.status === 'TRIAL' ? (
                                            <button
                                                type="button"
                                                onClick={() => void activateTrialTenant(tenant)}
                                                disabled={updatingStatusTenantId === tenant.id}
                                                className="p-2 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                title="Activar empresa"
                                            >
                                                {updatingStatusTenantId === tenant.id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => toggleTenantStatus(tenant)}
                                                disabled={updatingStatusTenantId === tenant.id}
                                                className={`p-2 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${tenant.status === 'ACTIVE' ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                                title={tenant.status === 'ACTIVE' ? 'Forzar Suspensión' : 'Reactivar'}
                                            >
                                                {updatingStatusTenantId === tenant.id ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => void handleDeleteTenant(tenant)}
                                            disabled={deletingTenantId === tenant.id}
                                            className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                            title="Eliminar tenant"
                                        >
                                            {deletingTenantId === tenant.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-black text-lg text-slate-800">Aprovisionar Nueva Empresa</h3>
                            <button onClick={closeCreateModal} className="text-slate-400 hover:text-slate-700 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateTenant} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Comercial <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    placeholder="Ej. Supermercado El Sol"
                                />
                                <p className="text-xs text-slate-500 mt-1">El nombre se usará para generar el slug del esquema de base de datos.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">RNC / Cédula</label>
                                    <input
                                        type="text"
                                        value={formData.taxId}
                                        onChange={e => setFormData({ ...formData, taxId: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="Opcional"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Email de Acceso <span className="text-red-500">*</span></label>
                                    <input
                                        required
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="admin@empresa.com"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Persona de Contacto <span className="text-red-500">*</span></label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.contactName}
                                        onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="Nombre y apellido"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Mail de Contacto <span className="text-red-500">*</span></label>
                                    <input
                                        required
                                        type="email"
                                        value={formData.contactEmail}
                                        onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="contacto@empresa.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Ciudad <span className="text-red-500">*</span></label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.city}
                                        onChange={e => setFormData({ ...formData, city: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="Santo Domingo"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">
                                        Distribuidor que Captó
                                        {distributorsLoading ? ' (cargando...)' : ''}
                                    </label>
                                    <select
                                        value={formData.capturedByDistributorId}
                                        onChange={e => setFormData({ ...formData, capturedByDistributorId: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    >
                                        <option value="">Sin asignar</option>
                                        {distributors.map((distributor) => (
                                            <option key={distributor.id} value={distributor.id}>
                                                {distributor.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">
                                        Distribuidor que da Servicio
                                        {distributorsLoading ? ' (cargando...)' : ''}
                                    </label>
                                    <select
                                        value={formData.servicedByDistributorId}
                                        onChange={e => setFormData({ ...formData, servicedByDistributorId: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    >
                                        <option value="">Sin asignar</option>
                                        {distributors.map((distributor) => (
                                            <option key={distributor.id} value={distributor.id}>
                                                {distributor.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {distributors.length === 0 && !distributorsLoading && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    No hay distribuidores activos. Puedes crear tenants sin asignación y completar este dato después.
                                </p>
                            )}

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-black text-slate-800">Productos Activos</p>
                                        <p className="text-xs text-slate-500 mt-1">Define la combinación inicial de productos y addons para este tenant.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={openCreateProductsModal}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:border-blue-200 hover:text-blue-700 transition-colors"
                                    >
                                        <Boxes size={16} />
                                        Gestionar Productos
                                    </button>
                                </div>
                                <div className="mt-4">
                                    {renderProductSummary(formData.products)}
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={closeCreateModal}
                                    className="flex-1 px-4 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-sm transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <><Loader2 size={18} className="animate-spin" /> Creando Esquema...</> : 'Confirmar Registro'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isTerminalModalOpen && selectedTenantForTerminals && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <h3 className="font-black text-lg text-slate-800">Terminales Activas del Tenant</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    {selectedTenantForTerminals.name} · {selectedTenantForTerminals.email}
                                </p>
                                <p className="text-xs text-slate-400 font-mono mt-1">{selectedTenantForTerminals.id}</p>
                            </div>
                            <button type="button" onClick={closeTerminalModal} className="text-slate-400 hover:text-slate-700 transition-colors">
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
                                            {terminalLicenseLimit ?? 1} terminal(es) POS, pero hay {activeLicensedTerminalCount} activa(s)
                                            {licenseExceededDeviceCount > 0
                                                ? ` y ${licenseExceededDeviceCount} equipo(s) marcado(s) sin licencia.`
                                                : '.'}
                                            {' '}El POS adicional debe recibir bloqueo hasta contratar mas licencias.
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
                                        {tenantTerminals.length} grupo(s) listados · {publishedEndpointCount} registro(s)
                                    </p>
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

                            {renderTenantSemanticsGrid(selectedTenantForTerminals)}

                            {isTerminalModalLoading ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-500 flex items-center justify-center gap-3">
                                    <Loader2 className="animate-spin text-violet-500" size={20} />
                                    Cargando terminales...
                                </div>
                            ) : tenantTerminals.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-500">
                                    No hay terminales ni endpoints reportados para este tenant.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-6">
                                    {tenantTerminals.map((terminal) => {
                                        const hasOnlineRegistry = (terminal.registries || []).some((reg) => (
                                            getRegistryStatusLabel({ ...terminal, registry: reg }) === 'ONLINE'
                                        ));
                                        const erpReadiness = terminal.registry?.erp_readiness || null;
                                        const erpReadinessStatus = getErpReadinessStatus(terminal);
                                        const erpTenantId = getReadinessValue(erpReadiness, ['erpTenantId', 'erp_tenant_id']);
                                        const profileStatus = getReadinessValue(erpReadiness, ['profileStatus', 'profile_status']) || (erpReadinessStatus === 'ready' ? 'READY' : 'MISSING');
                                        const catalogReady = getReadinessCheckValue(erpReadiness, ['catalog', 'catalogReady', 'catalog_ready', 'items', 'itemsReady', 'items_ready']);
                                        const seriesReady = getReadinessCheckValue(erpReadiness, ['documentSeries', 'document_series', 'series', 'sequences', 'sequencesReady', 'sequences_ready']);
                                        const lastSyncAt = getReadinessValue(erpReadiness, ['lastSyncEventAt', 'last_sync_event_at', 'lastSyncAt', 'last_sync_at']);
                                        const lastSyncType = getReadinessValue(erpReadiness, ['lastSyncEventType', 'last_sync_event_type', 'lastSyncStatus', 'last_sync_status']);
                                        const isReadinessSubmitting = erpReadinessSubmittingKey === getTerminalKey(terminal);
                                        const terminalKey = getTerminalKey(terminal);
                                        const authAttempts = authAttemptsByTerminal[terminalKey] || [];
                                        const authStatus = getTerminalAuthStatus(terminal, authAttempts);
                                        const authStatusClasses = getAuthStatusClasses(authStatus);
                                        const identity = buildTerminalIdentitySummary(terminal, authAttempts);
                                        const authorizedDeviceId = identity.authorizedDeviceId !== 'N/D' ? identity.authorizedDeviceId : '';
                                        const lastRejectedDeviceId = identity.lastRejectedDeviceId !== 'N/D' ? identity.lastRejectedDeviceId : '';
                                        const lastAuthAttempt = authAttempts[0] || null;
                                        const lastAuthAttemptAt = terminal.registry?.last_auth_attempt_at || (lastAuthAttempt ? getAttemptTime(lastAuthAttempt) : null);
                                        const lastAuthError = terminal.registry?.last_auth_error || lastAuthAttempt?.reason || lastAuthAttempt?.message || '';
                                        const isAuthAttemptsLoading = authAttemptsLoadingKey === terminalKey;
                                        const rotateSubmittingKey = `${terminalKey}-ROTATE`;
                                        const syncAuthSubmittingKey = `${terminalKey}-SYNC-AUTH`;
                                        const persistedAuthorizedDeviceId = getTerminalPersistedAuthorizedDeviceId(terminal);
                                        const needsAuthorizedDeviceSync = Boolean(
                                            terminal.registry?.device_id?.trim()
                                            && !persistedAuthorizedDeviceId,
                                        );
                                        const posOnlyProvisioningBlocked = selectedTenantForTerminals.contracted_product === 'POS_ONLY'
                                            && selectedTenantForTerminals.lifecycle_status === 'BLOCKED';
                                        const revokeDeviceId = terminal.registry?.previous_device_id || lastRejectedDeviceId;
                                        const revokeSubmittingKey = revokeDeviceId ? `${terminalKey}-REVOKE-${revokeDeviceId}` : '';
                                        const fiscalReadiness = getFiscalReadiness(terminal);
                                        const fiscalDebug = summarizeTerminalFiscalDebug(fiscalReadiness);
                                        const fiscalStatus = fiscalDebug.fiscalReadiness;
                                        const fiscalStatusClasses = getFiscalStatusClasses(fiscalStatus);
                                        const isFiscalLoading = fiscalReadinessLoadingKey === terminalKey;

                                        return (
                                            <div key={`${terminal.id}`} className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
                                                <div className="bg-slate-50 border-b border-slate-100 p-5 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`rounded-2xl p-3 ${hasOnlineRegistry ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                                            {hasOnlineRegistry ? <Wifi size={20} /> : <WifiOff size={20} />}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-3">
                                                                <h4 className="font-black text-slate-800 text-lg">{terminal.name}</h4>
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
                                                        <span className={`px-3 py-1 rounded-full border text-[11px] font-bold uppercase ${getReadinessBadgeClasses(erpReadinessStatus)}`}>
                                                            {getReadinessLabel(erpReadinessStatus)}
                                                        </span>
                                                        <span className={`px-3 py-1 rounded-full border text-[11px] font-bold uppercase ${authStatusClasses}`}>
                                                            {getAuthStatusLabel(authStatus)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="p-5 space-y-5">
                                                    <div className={`rounded-2xl border px-4 py-4 ${authStatusClasses}`}>
                                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                            <div>
                                                                <p className="text-xs font-bold uppercase tracking-wider">Identidad y autorizacion</p>
                                                                <p className="mt-1 text-sm font-bold">{getAuthStatusLabel(authStatus)}</p>
                                                                <p className="mt-1 text-xs opacity-80">
                                                                    Cloud-Admin muestra autorizacion, heartbeat del POS y device actual reportado por ERP por separado.
                                                                </p>
                                                            </div>
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
                                                                {needsAuthorizedDeviceSync ? (
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
                                                                    onClick={() => void loadTerminalAuthAttempts(selectedTenantForTerminals.id, terminal)}
                                                                    disabled={isAuthAttemptsLoading}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-current bg-white/80 px-4 py-2 text-sm font-bold shadow-sm hover:bg-white transition-colors disabled:opacity-60"
                                                                >
                                                                    {isAuthAttemptsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                                                    Actualizar intentos
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleRotateTerminalCredentials(terminal)}
                                                                    disabled={!authorizedDeviceId || deviceActionSubmittingKey === rotateSubmittingKey}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    {deviceActionSubmittingKey === rotateSubmittingKey ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                                                                    Rotar credenciales
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {identity.mismatchWarning ? (
                                                            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-3 text-sm font-semibold text-red-800">
                                                                {identity.mismatchWarning}
                                                            </div>
                                                        ) : null}

                                                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Terminal ERP UUID</p>
                                                                <p className="mt-1 font-mono break-all text-xs">{identity.erpTerminalUuid}</p>
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
                                                                <p className="mt-1 font-bold uppercase">{getAuthStatusLabel(authStatus)}</p>
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
                                                                <p className="mt-1 font-mono break-all">{identity.erpCurrentDeviceId}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Ultimo device rechazado</p>
                                                                <p className="mt-1 font-mono break-all">{identity.lastRejectedDeviceId}</p>
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
                                                                <p className="mt-1 font-bold break-words">{lastAuthError || 'N/D'}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Ultimo intento</p>
                                                                <p className="mt-1">{formatDateTime(lastAuthAttemptAt)}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Dispositivos registrados y roles</h5>
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
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-50">
                                                                    {identity.deviceRows.length === 0 ? (
                                                                        <tr>
                                                                            <td colSpan={6} className="px-4 py-6 text-center text-slate-500 text-sm">
                                                                                Sin devices reportados para esta terminal.
                                                                            </td>
                                                                        </tr>
                                                                    ) : identity.deviceRows.map((deviceRow, deviceIndex) => {
                                                                        const registry = (terminal.registries || []).find((reg) => reg.id === deviceRow.registryId) || terminal.registry;
                                                                        const mockTerminal = registry ? { ...terminal, registry } : terminal;
                                                                        const rStatusLabel = registry ? getRegistryStatusLabel(mockTerminal) : 'N/D';
                                                                        const rVersionKey = getApkVersionKey(mockTerminal);
                                                                        const rIsOutOfVersion = Boolean(referenceVersionKey && rVersionKey && rVersionKey !== referenceVersionKey);
                                                                        const prefLanIp = registry ? getPreferredLanIp(mockTerminal) : 'N/D';
                                                                        const endpointRole = getRegistryEndpointRole(registry);

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
                                                                                            <span className="font-mono text-slate-700 text-[11px]">v {formatApkVersion(mockTerminal)}</span>
                                                                                            {rIsOutOfVersion ? <span className="text-[10px] text-amber-600 font-bold">Desfasado</span> : null}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="text-[10px] text-slate-400">N/D</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top text-right">
                                                                                    <p className="text-[10px] text-slate-500">{formatDateTime(deviceRow.lastSeenAt)}</p>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={`mx-5 rounded-2xl border px-4 py-4 ${authStatusClasses}`}>
                                                    <p className="text-xs font-bold uppercase tracking-wider">Intentos de conexion rechazados</p>
                                                    <div className="mt-3 rounded-xl border border-white/60 bg-white/70 overflow-hidden">
                                                        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/60">
                                                            <p className="text-xs font-bold uppercase tracking-wider">Intentos de conexion rechazados</p>
                                                            {isAuthAttemptsLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                                                        </div>
                                                        {authAttempts.length === 0 ? (
                                                            <div className="px-3 py-4 text-sm opacity-75">
                                                                No hay intentos rechazados reportados por ERP para esta terminal.
                                                            </div>
                                                        ) : (
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-left text-xs">
                                                                    <thead className="bg-white/80 uppercase tracking-wider opacity-70">
                                                                        <tr>
                                                                            <th className="px-3 py-2">Device solicitado</th>
                                                                            <th className="px-3 py-2">Autorizado</th>
                                                                            <th className="px-3 py-2">Motivo</th>
                                                                            <th className="px-3 py-2">Fecha</th>
                                                                            <th className="px-3 py-2">Estado</th>
                                                                            <th className="px-3 py-2 text-right">Accion</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-white/70">
                                                                        {authAttempts.map((attempt, attemptIndex) => {
                                                                            const requestedDeviceId = getAttemptDeviceId(attempt);
                                                                            const attemptStatus = attempt.resolution_status || attempt.status || 'PENDING';
                                                                            const canReauthorize = isPendingDeviceUnauthorizedAttempt(attempt);
                                                                            const reauthorizeKey = `${terminalKey}-TAKEOVER-${requestedDeviceId}`;
                                                                            return (
                                                                                <tr key={attempt.id || `${requestedDeviceId}-${attemptIndex}`}>
                                                                                    <td className="px-3 py-2 font-mono font-bold">{requestedDeviceId || 'N/D'}</td>
                                                                                    <td className="px-3 py-2 font-mono">{attempt.authorized_device_id || authorizedDeviceId || 'N/D'}</td>
                                                                                    <td className="px-3 py-2">{attempt.reason || attempt.message || 'N/D'}</td>
                                                                                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(getAttemptTime(attempt))}</td>
                                                                                    <td className="px-3 py-2 font-bold uppercase">{attemptStatus}</td>
                                                                                    <td className="px-3 py-2 text-right">
                                                                                        {canReauthorize ? (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => void handleReauthorizeAttempt(terminal, attempt)}
                                                                                                disabled={deviceActionSubmittingKey === reauthorizeKey}
                                                                                                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-60"
                                                                                            >
                                                                                                {deviceActionSubmittingKey === reauthorizeKey ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                                                                                Reautorizar
                                                                                            </button>
                                                                                        ) : (
                                                                                            <span className="text-slate-400">Sin accion</span>
                                                                                        )}
                                                                                    </td>
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
                                                                disabled={deviceActionSubmittingKey === revokeSubmittingKey}
                                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-60"
                                                            >
                                                                {deviceActionSubmittingKey === revokeSubmittingKey ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                                                                Revocar equipo anterior
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <div className={`mt-5 rounded-2xl border px-4 py-4 ${getReadinessBadgeClasses(erpReadinessStatus)}`}>
                                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                        <div>
                                                            <p className="text-xs font-bold uppercase tracking-wider">Preparacion ERP</p>
                                                            <p className="mt-1 text-sm font-bold">{getReadinessLabel(erpReadinessStatus)}</p>
                                                            {erpReadinessStatus !== 'ready' ? (
                                                                <p className="mt-1 text-sm">
                                                                    POS vinculado, pero el contexto ERP aun no esta listo.
                                                                </p>
                                                            ) : null}
                                                        </div>
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

                                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">ERP tenant</p>
                                                            <p className="mt-1 font-mono break-all">{erpTenantId || 'No vinculado'}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Terminal profile</p>
                                                            <p className="mt-1 font-bold uppercase">{profileStatus}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Catalogo</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(catalogReady, 'Disponible', 'Vacio / faltante')}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Secuencias</p>
                                                            <p className="mt-1 font-bold">{getCheckLabel(seriesReady, 'Disponibles', 'Faltantes')}</p>
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

                                                {isFiscalEligibleTenant(selectedTenantForTerminals) ? (
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
                                                                onClick={() => void loadTerminalFiscalReadiness(selectedTenantForTerminals.id, terminal)}
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

                                                {isLocalPosTenant(selectedTenantForTerminals) ? (
                                                    <div className={`mt-5 rounded-2xl border px-4 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${
                                                        isExplicitOfflinePosTenant(selectedTenantForTerminals)
                                                            ? 'border-slate-200 bg-slate-50'
                                                            : 'border-amber-200 bg-amber-50'
                                                    }`}>
                                                        <div>
                                                            <p className={`text-xs font-bold uppercase tracking-wider ${
                                                                isExplicitOfflinePosTenant(selectedTenantForTerminals) ? 'text-slate-600' : 'text-amber-700'
                                                            }`}>Recuperacion POS local</p>
                                                            <p className={`mt-1 text-sm ${
                                                                isExplicitOfflinePosTenant(selectedTenantForTerminals) ? 'text-slate-600' : 'text-amber-800'
                                                            }`}>
                                                                {isExplicitOfflinePosTenant(selectedTenantForTerminals)
                                                                    ? 'Modo offline explicito: la recuperacion cloud no esta disponible desde Cloud-Admin.'
                                                                    : 'Elige reemplazo de hardware o reconstruccion de BD local sin cambiar el dispositivo.'}
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-col gap-2 sm:flex-row">
                                                            <button
                                                                type="button"
                                                                disabled={isExplicitOfflinePosTenant(selectedTenantForTerminals)}
                                                                onClick={() => openRebuildModal(terminal)}
                                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-700 shadow-sm hover:bg-amber-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                <RefreshCcw size={16} />
                                                                Reconstruir base local
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={isExplicitOfflinePosTenant(selectedTenantForTerminals)}
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
            )}

            {isRebuildModalOpen && selectedTenantForTerminals && rebuildTerminal && (
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
                            <button type="button" onClick={closeRebuildModal} className="text-slate-400 hover:text-slate-700 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleTerminalLocalRebuild} className="p-6 space-y-5">
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
                                    <p className="mt-1 font-bold text-slate-800">{rebuildTerminal.name}</p>
                                    <p className="mt-1 text-xs font-mono text-slate-500">{getTerminalTakeoverId(rebuildTerminal) || 'N/D'}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Device actual</p>
                                    <p className="mt-1 font-mono text-slate-700 break-all">{getTerminalOperationalDeviceId(rebuildTerminal) || 'N/D'}</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Motivo de la reconstruccion <span className="text-red-500">*</span></label>
                                <textarea
                                    required
                                    value={rebuildFormData.reason}
                                    onChange={e => setRebuildFormData({ ...rebuildFormData, reason: e.target.value })}
                                    className="w-full min-h-[96px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 resize-y"
                                    placeholder="Ej. BD local corrupta, reinstalacion del POS en la misma tablet o reparacion de datos locales."
                                />
                            </div>

                            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={rebuildFormData.confirmRebuild}
                                    onChange={e => setRebuildFormData({ ...rebuildFormData, confirmRebuild: e.target.checked })}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span>
                                    Confirmo que es la misma tablet y deseo forzar un bootstrap completo sin revocar el dispositivo actual.
                                </span>
                            </label>

                            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-slate-100 pt-5">
                                <button
                                    type="button"
                                    onClick={closeRebuildModal}
                                    className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isRebuildSubmitting}
                                    className="px-5 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    {isRebuildSubmitting ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
                                    Preparar reconstruccion
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isTakeoverModalOpen && selectedTenantForTerminals && takeoverTerminal && (
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
                            <button type="button" onClick={closeTakeoverModal} className="text-slate-400 hover:text-slate-700 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleTerminalTakeover} className="p-6 space-y-5">
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
                                    value={getTakeoverSelectionKey(takeoverFormData.terminalId, takeoverFormData.registryId)}
                                    onChange={e => handleTakeoverTerminalChange(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-slate-800"
                                >
                                    {getTakeoverOptions().map((option) => (
                                        <option key={option.key} value={option.key}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-2 text-xs text-slate-500">
                                    Device POS reportado: <span className="font-mono">{getTerminalPosReportedDeviceId(takeoverTerminal) || 'N/D'}</span>
                                    {' · '}
                                    Autorizado: <span className="font-mono">{getTerminalAuthorizedDeviceId(takeoverTerminal) || 'N/D'}</span>
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Nuevo device_id <span className="text-red-500">*</span></label>
                                    <input
                                        required
                                        type="text"
                                        value={takeoverFormData.newDeviceId}
                                        onChange={e => setTakeoverFormData({ ...takeoverFormData, newDeviceId: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-slate-800 font-mono"
                                        placeholder="nuevo-device-id"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Nombre de dispositivo</label>
                                    <input
                                        type="text"
                                        value={takeoverFormData.deviceName}
                                        onChange={e => setTakeoverFormData({ ...takeoverFormData, deviceName: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="Tablet Caja 1"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Motivo del cambio <span className="text-red-500">*</span></label>
                                <textarea
                                    required
                                    value={takeoverFormData.reason}
                                    onChange={e => setTakeoverFormData({ ...takeoverFormData, reason: e.target.value })}
                                    className="w-full min-h-[96px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-slate-800 resize-y"
                                    placeholder="Ej. Tablet danada, perdida o reemplazo por garantia."
                                />
                            </div>

                            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={takeoverFormData.confirmTakeover}
                                    onChange={e => setTakeoverFormData({ ...takeoverFormData, confirmTakeover: e.target.checked })}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                />
                                <span>
                                    Confirmo que deseo revocar la tablet anterior y que la nueva tablet debera iniciar sesion/autenticarse de nuevo.
                                </span>
                            </label>

                            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-slate-100 pt-5">
                                <button
                                    type="button"
                                    onClick={closeTakeoverModal}
                                    className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isTakeoverSubmitting}
                                    className="px-5 py-3 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    {isTakeoverSubmitting ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
                                    Ejecutar recuperacion
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isEditModalOpen && editingTenant && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-black text-lg text-slate-800">Editar Empresa</h3>
                            <button type="button" onClick={closeEditModal} className="text-slate-400 hover:text-slate-700 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateTenant} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Comercial <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="text"
                                    value={editFormData.name}
                                    onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Razón Social</label>
                                <input
                                    type="text"
                                    value={editFormData.legalName}
                                    onChange={e => setEditFormData({ ...editFormData, legalName: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    placeholder="Opcional"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">RNC / Cédula</label>
                                    <input
                                        type="text"
                                        value={editFormData.taxId}
                                        onChange={e => setEditFormData({ ...editFormData, taxId: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="Opcional"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Teléfono</label>
                                    <input
                                        type="text"
                                        value={editFormData.phone}
                                        onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="Opcional"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Email de Acceso</label>
                                    <input
                                        type="email"
                                        value={editFormData.email}
                                        onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="admin@empresa.com"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-1">Sincroniza con Supabase Auth.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Nueva Contraseña</label>
                                    <input
                                        type="password"
                                        value={editFormData.password}
                                        onChange={e => setEditFormData({ ...editFormData, password: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                        placeholder="Dejar vacío para no cambiar"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-1">Fuerza el cambio en el próximo acceso.</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-black text-slate-800">Productos Activos</p>
                                        <p className="text-xs text-slate-500 mt-1">Activa o desactiva productos del tenant sin mezclarlo con los datos de empresa.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={openEditProductsModal}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:border-blue-200 hover:text-blue-700 transition-colors"
                                    >
                                        <Boxes size={16} />
                                        Gestionar Productos
                                    </button>
                                </div>
                                <div className="mt-4">
                                    {renderProductSummary(editFormData.products)}
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={closeEditModal}
                                    className="flex-1 px-4 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isEditSubmitting}
                                    className="flex-1 px-4 py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-sm transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                                >
                                    {isEditSubmitting ? <><Loader2 size={18} className="animate-spin" /> Guardando...</> : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <TenantProductsModal
                key={`create-products-${createProductsModalVersion}`}
                isOpen={isCreateProductsModalOpen}
                title="Productos Iniciales del Tenant"
                initialProducts={formData.products}
                onClose={() => setIsCreateProductsModalOpen(false)}
                onSave={(products) => {
                    setFormData((current) => ({ ...current, products: normalizeTenantProductSelection(products) }));
                    setIsCreateProductsModalOpen(false);
                }}
            />

            <TenantProductsModal
                key={`edit-products-${editingTenant?.id ?? 'none'}-${editProductsModalVersion}`}
                isOpen={isEditProductsModalOpen}
                title="Administrar Productos del Tenant"
                tenantName={editingTenant?.name}
                initialProducts={editFormData.products}
                onClose={() => setIsEditProductsModalOpen(false)}
                onSave={(products) => {
                    setEditFormData((current) => ({ ...current, products: normalizeTenantProductSelection(products) }));
                    setIsEditProductsModalOpen(false);
                }}
            />
        </div>
    );
};
