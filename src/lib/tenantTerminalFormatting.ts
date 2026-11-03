import type {
    TerminalAuthAttempt,
    TerminalSyncDocument,
    TenantTerminalErpReadiness,
    TenantTerminalSnapshot,
} from '../types';

export const getTakeoverSelectionKey = (terminalId: string, registryId?: string | null) => (
    registryId ? `registry:${registryId}` : `terminal:${terminalId}`
);
export const getTerminalKey = (terminal: TenantTerminalSnapshot) => `${terminal.id}-${terminal.registry?.id || 'catalog'}`;

export const getAttemptTime = (attempt: TerminalAuthAttempt) => attempt.attempted_at || attempt.created_at || null;
export const getDeviceRequestStatusLabel = (attempt: TerminalAuthAttempt) => {
    const status = (attempt.resolution_status || attempt.status || 'PENDING').toUpperCase();
    if (status === 'PENDING') return 'PENDIENTE';
    if (status === 'APPROVED' || status === 'RESOLVED') return 'APROBADA';
    if (status === 'REJECTED') return 'RECHAZADA';
    if (status === 'EXPIRED' || status === 'IGNORED') return 'EXPIRADA';
    return status;
};
export const getAuthStatusLabel = (status: string) => {
    switch (status) {
        case 'AUTHORIZED': return 'Autorizado';
        case 'DEVICE_MISMATCH': return 'Device rechazado';
        case 'TAKEOVER_PENDING': return 'Takeover pendiente';
        case 'TAKEOVER_COMPLETED': return 'Takeover completado';
        case 'REAUTH_COMPLETED': return 'Reauth completado';
        case 'OLD_DEVICE_REVOKED': return 'Equipo revocado';
        case 'TOKEN_ROTATION_REQUIRED': return 'Rotacion requerida';
        case 'ERP_AUTH_ERROR': return 'Error auth ERP';
        case 'ERP_REPAIR_PENDING': return 'Reparacion ERP pendiente';
        case 'ERP_REPAIR_FAILED': return 'Reparacion ERP fallida';
        case 'WAITING_ERP_CONFIRMATION': return 'Esperando confirmacion ERP';
        case 'BOUND_AUTH_MISMATCH': return 'Bound auth mismatch';
        case 'LICENSE_EXCEEDED': return 'Sin licencia POS';
        default: return status || 'N/D';
    }
};

export const getAuthStatusClasses = (status: string) => {
    if (['AUTHORIZED', 'TAKEOVER_COMPLETED', 'REAUTH_COMPLETED'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (['DEVICE_MISMATCH', 'ERP_AUTH_ERROR', 'LICENSE_EXCEEDED', 'ERP_REPAIR_FAILED', 'BOUND_AUTH_MISMATCH'].includes(status)) {
        return 'border-red-200 bg-red-50 text-red-700';
    }
    if (['TAKEOVER_PENDING', 'TOKEN_ROTATION_REQUIRED', 'ERP_REPAIR_PENDING', 'WAITING_ERP_CONFIRMATION'].includes(status)) return 'border-amber-200 bg-amber-50 text-amber-700';
    if (status === 'OLD_DEVICE_REVOKED') return 'border-slate-200 bg-slate-100 text-slate-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
};

export const isDeviceIdentityAligned = (
    authorizedDeviceId: string,
    reportedDeviceId: string,
    erpDeviceId?: string,
    requireErpConfirmation = false,
) => {
    if (!authorizedDeviceId) return false;
    const posMatches = Boolean(reportedDeviceId && authorizedDeviceId === reportedDeviceId);
    const erpMatches = Boolean(erpDeviceId && erpDeviceId !== 'N/D' && authorizedDeviceId === erpDeviceId);
    return requireErpConfirmation ? posMatches && erpMatches : posMatches || erpMatches;
};

export const getEffectiveAuthStatus = (
    status: string,
    authorizedDeviceId: string,
    reportedDeviceId: string,
    erpDeviceId?: string,
    requireErpConfirmation = false,
) => {
    const normalized = status.toUpperCase();
    if (authorizedDeviceId && requireErpConfirmation) {
        if (normalized === 'TAKEOVER_COMPLETED') return 'WAITING_ERP_CONFIRMATION';
        if (!erpDeviceId || erpDeviceId === 'N/D') {
            return ['AUTHORIZED', 'REAUTH_COMPLETED'].includes(normalized)
                ? 'WAITING_ERP_CONFIRMATION'
                : normalized || 'ERP_REPAIR_PENDING';
        }
        if (authorizedDeviceId !== erpDeviceId) return 'BOUND_AUTH_MISMATCH';
        if (reportedDeviceId && reportedDeviceId !== authorizedDeviceId) return 'DEVICE_MISMATCH';
        if (normalized === 'REAUTH_COMPLETED') return 'REAUTH_COMPLETED';
    }
    if (
        isDeviceIdentityAligned(authorizedDeviceId, reportedDeviceId, erpDeviceId, requireErpConfirmation)
        && ['DEVICE_MISMATCH', 'TAKEOVER_PENDING', 'ERP_AUTH_ERROR'].includes(normalized)
    ) {
        return requireErpConfirmation ? 'REAUTH_COMPLETED' : 'AUTHORIZED';
    }
    return normalized || 'AUTHORIZED';
};
export const getFiscalStatusClasses = (status: string) => {
    if (status === 'READY') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'DEMO_READY') return 'border-blue-200 bg-blue-50 text-blue-700';
    if (status === 'ERROR') return 'border-red-200 bg-red-50 text-red-700';
    return 'border-amber-200 bg-amber-50 text-amber-800';
};

export const getReadinessValue = (readiness: TenantTerminalErpReadiness | null | undefined, keys: string[]) => {
    if (!readiness) return null;
    for (const key of keys) {
        const value = readiness[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number') return String(value);
    }
    return null;
};

export const getReadinessCheckValue = (readiness: TenantTerminalErpReadiness | null | undefined, keys: string[]) => {
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

export const getReadinessProfileStatus = (readiness: TenantTerminalErpReadiness | null | undefined) => (
    getReadinessValue(readiness, ['profileStatus', 'profile_status']) || ''
).toUpperCase();

export const isErpProfileIncomplete = (readiness: TenantTerminalErpReadiness | null | undefined) => {
    const profileStatus = getReadinessProfileStatus(readiness);
    const profileCheck = getReadinessCheckValue(readiness, ['profile']);
    return profileStatus === 'DRAFT' || profileCheck === false;
};

export const getSyncDocumentValue = (document: TerminalSyncDocument, keys: string[]) => {
    for (const key of keys) {
        const value = document[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number') return String(value);
    }
    return '';
};

export const getSyncDocumentId = (document: TerminalSyncDocument) => (
    getSyncDocumentValue(document, ['id', 'document_id', 'documentId', 'uuid'])
);

export const getSyncDocumentFolio = (document: TerminalSyncDocument) => (
    getSyncDocumentValue(document, ['folio', 'document_no', 'documentNo', 'sequence', 'ncf']) || 'Documento sin folio'
);

export const getSyncDocumentErrorCode = (document: TerminalSyncDocument) => (
    getSyncDocumentValue(document, ['error_code', 'errorCode', 'code']).toUpperCase()
);

export const getSyncDocumentCreatedAt = (document: TerminalSyncDocument) => (
    getSyncDocumentValue(document, ['created_at', 'createdAt', 'date', 'timestamp'])
);

export const isRepairableSyncDocument = (document: TerminalSyncDocument, fallbackReadiness?: TenantTerminalErpReadiness | null) => {
    const documentReadiness = document.readiness
        || (document.erp_readiness && typeof document.erp_readiness === 'object' ? document.erp_readiness as TenantTerminalErpReadiness : null);
    const readiness = documentReadiness || fallbackReadiness || null;
    return getSyncDocumentErrorCode(document) === 'ERP_CONTEXT_MISSING'
        && (isErpProfileIncomplete(readiness) || document.retryable === true);
};

export const getErpReadinessStatus = (terminal: TenantTerminalSnapshot) => (
    terminal.registry?.erp_readiness?.status?.toString().toLowerCase() || 'missing'
);

export const getReadinessBadgeClasses = (status: string) => {
    if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'pending') return 'border-blue-200 bg-blue-50 text-blue-700';
    if (status === 'missing_catalog') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (status === 'error') return 'border-red-200 bg-red-50 text-red-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
};

export const getReadinessLabel = (status: string) => {
    if (status === 'ready') return 'ERP listo';
    if (status === 'pending') return 'ERP pendiente';
    if (status === 'missing_catalog') return 'Catalogo faltante';
    if (status === 'error') return 'ERP con error';
    return 'ERP sin validar';
};

export const getOperationalStatusLabel = (status: string) => {
    if (status === 'OPERATIVE') return 'Operativa';
    if (status === 'ATTENTION') return 'Requiere atención';
    if (status === 'AUTH_REQUIRED') return 'Requiere autorización';
    if (status === 'OFFLINE') return 'Offline';
    return 'Pendiente de autorizacion';
};

export const getOperationalStatusClasses = (status: string) => {
    if (status === 'OPERATIVE') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'ATTENTION') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (status === 'AUTH_REQUIRED') return 'border-red-200 bg-red-50 text-red-700';
    if (status === 'OFFLINE') return 'border-slate-200 bg-slate-100 text-slate-600';
    return 'border-blue-200 bg-blue-50 text-blue-700';
};

export const getCheckLabel = (value: boolean | null, readyLabel: string, missingLabel: string) => {
    if (value === true) return readyLabel;
    if (value === false) return missingLabel;
    return 'N/D';
};

// --- Estado de registro y versión APK de una terminal ---
export const getRegistryStatusLabel = (terminal: TenantTerminalSnapshot, tenantStatus?: string) => {
    if (tenantStatus === 'SUSPENDED') return 'SUSPENDIDA';
    if (terminal.registry?.is_revoked || terminal.registry?.auth_status === 'OLD_DEVICE_REVOKED') return 'REVOCADA';
    const registryStatus = (terminal.registry?.status || '').toUpperCase();
    if (registryStatus === 'ONLINE') return 'ONLINE';
    if (registryStatus === 'OFFLINE') return 'OFFLINE';
    return terminal.is_active ? 'ACTIVA' : 'INACTIVA';
};

export const getRegistryStatusClassName = (statusLabel: string) => {
    if (statusLabel === 'ONLINE') return 'bg-emerald-100 text-emerald-700';
    if (statusLabel === 'SUSPENDIDA') return 'bg-red-100 text-red-700';
    if (statusLabel === 'REVOCADA') return 'bg-rose-100 text-rose-700';
    return 'bg-slate-100 text-slate-500';
};

export const getEffectiveApkVersion = (terminal: TenantTerminalSnapshot) => {
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

export const getApkVersionKey = (terminal: TenantTerminalSnapshot) => {
    const apkVersion = getEffectiveApkVersion(terminal);
    const version = apkVersion.version;
    const versionCode = apkVersion.versionCode ? String(apkVersion.versionCode) : '';
    if (!version && !versionCode) return '';
    return `${version}::${versionCode}`;
};

export const formatApkVersion = (terminal: TenantTerminalSnapshot) => {
    const { version, versionCode } = getEffectiveApkVersion(terminal);
    if (!version && !versionCode) return 'N/D';
    if (version && versionCode) return `APK v${version} (${versionCode})`;
    if (version) return `APK v${version}`;
    return `Build ${versionCode}`;
};

export const getApkVersionSourceLabel = (terminal: TenantTerminalSnapshot) => {
    const apkVersion = getEffectiveApkVersion(terminal);
    if (!apkVersion.version && !apkVersion.versionCode) return '';
    return apkVersion.source;
};

