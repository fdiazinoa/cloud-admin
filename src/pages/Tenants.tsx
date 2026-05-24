import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Power, Edit3, Loader2, X, Boxes, Monitor, Wifi, WifiOff, Trash2, CheckCircle2, RefreshCcw } from 'lucide-react';
import type { Distributor, Tenant, TenantTerminalSnapshot } from '../types';
import { tenantService } from '../lib/tenantService';
import { TenantProductsModal } from '../components/TenantProductsModal';
import {
    deriveProductsFromTenant,
    deriveTenantConfigFromProducts,
    getActiveProductLabels,
    getDefaultTenantProducts,
    getTenantTypeLabel,
    type TenantProductSelection
} from '../lib/tenantProducts';

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
    const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);
    const [isTerminalModalLoading, setIsTerminalModalLoading] = useState(false);
    const [takeoverTerminal, setTakeoverTerminal] = useState<TenantTerminalSnapshot | null>(null);
    const [isTakeoverModalOpen, setIsTakeoverModalOpen] = useState(false);
    const [isTakeoverSubmitting, setIsTakeoverSubmitting] = useState(false);
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
        newDeviceId: '',
        deviceName: '',
        reason: '',
        confirmTakeover: false,
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
            const productConfig = deriveTenantConfigFromProducts(formData.products);

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
            products: deriveProductsFromTenant(tenant.type, tenant.cloud_sync, tenant.max_pos_terminals, tenant.max_erp_users),
        });
        setIsEditModalOpen(true);
    };

    const openTerminalModal = async (tenant: Tenant) => {
        setSelectedTenantForTerminals(tenant);
        setTenantTerminals([]);
        setIsTerminalModalOpen(true);
        setIsTerminalModalLoading(true);

        try {
            const data = await tenantService.getTenantTerminalOverview(tenant.id);
            setTenantTerminals(data);
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
        closeTakeoverModal();
    };

    const handleToggleTerminalStatus = async (terminalId: string, currentStatus: boolean) => {
        if (!selectedTenantForTerminals) return;
        
        if (terminalId.startsWith('orphan-') || !terminalId.includes('-')) {
            alert('No se puede cambiar el estado de una activación huérfana o sin terminal base.');
            return;
        }

        const newStatus = !currentStatus;
        try {
            await tenantService.toggleTerminalActiveStatus(terminalId, newStatus);
            setTenantTerminals(prev => 
                prev.map(t => t.id === terminalId ? { ...t, is_active: newStatus } : t)
            );
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : JSON.stringify(err);
            console.error('Error toggling terminal status:', err);
            alert(`Error al cambiar el estado de la terminal: ${errorMessage}`);
        }
    };

    const isLocalPosTenant = (tenant?: Tenant | null) => tenant?.type === 'pos_only' && tenant.cloud_sync === false;

    const getTerminalTakeoverId = (terminal: TenantTerminalSnapshot) => terminal.terminal_id || terminal.id;

    const getTerminalCurrentDeviceId = (terminal: TenantTerminalSnapshot) => (
        terminal.registry?.current_device_id
        || terminal.registry?.device_id
        || terminal.device_token
        || ''
    );

    const openTakeoverModal = (terminal: TenantTerminalSnapshot) => {
        setTakeoverTerminal(terminal);
        setTakeoverFormData({
            terminalId: getTerminalTakeoverId(terminal),
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
            newDeviceId: '',
            deviceName: '',
            reason: '',
            confirmTakeover: false,
        });
    };

    const handleTakeoverTerminalChange = (terminalId: string) => {
        const selectedTerminal = tenantTerminals.find((terminal) => getTerminalTakeoverId(terminal) === terminalId) || null;
        setTakeoverTerminal(selectedTerminal);
        setTakeoverFormData((current) => ({
            ...current,
            terminalId,
            deviceName: selectedTerminal?.name || current.deviceName,
        }));
    };

    const handleTerminalTakeover = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTenantForTerminals || !takeoverTerminal) return;

        if (!isLocalPosTenant(selectedTenantForTerminals)) {
            alert('La recuperacion de terminal solo aplica a POS configurado como local. POS + ERP mantiene el flujo actual.');
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
                registryId: takeoverTerminal.registry?.id || null,
                newDeviceId,
                deviceName: takeoverFormData.deviceName.trim() || undefined,
                reason,
                confirmTakeover: takeoverFormData.confirmTakeover,
            });
            alert(result.message || 'Terminal reasignada correctamente. La tablet anterior fue revocada. Inicia sesion/autentica la nueva tablet para continuar.');
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

    const handleUpdateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTenant) return;

        setIsEditSubmitting(true);
        try {
            const productConfig = deriveTenantConfigFromProducts(editFormData.products);

            await tenantService.updateTenant(editingTenant.id, {
                name: editFormData.name.trim(),
                legal_name: normalizeOptional(editFormData.legalName),
                tax_id: normalizeOptional(editFormData.taxId),
                phone: normalizeOptional(editFormData.phone),
                type: productConfig.type,
                cloud_sync: productConfig.cloudSync,
                max_pos_terminals: editFormData.products.pos_licenses,
                max_erp_users: editFormData.products.erp_users,
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
        const labels = getActiveProductLabels(products);
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
            </div>
        );
    };
    const formatDateTime = (value?: string | null) => {
        if (!value) return 'N/D';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'N/D';
        return parsed.toLocaleString('es-DO');
    };

    const getRegistryStatusLabel = (terminal: TenantTerminalSnapshot) => {
        const registryStatus = (terminal.registry?.status || '').toUpperCase();
        if (registryStatus === 'ONLINE') return 'ONLINE';
        if (registryStatus === 'OFFLINE') return 'OFFLINE';
        return terminal.is_active ? 'ACTIVA' : 'INACTIVA';
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
    const outOfVersionCount = tenantTerminals.filter((terminal) => {
        const terminalVersionKey = getApkVersionKey(terminal);
        return Boolean(referenceVersionKey && terminalVersionKey && terminalVersionKey !== referenceVersionKey);
    }).length;
    const missingVersionCount = tenantTerminals.filter((terminal) => !getApkVersionKey(terminal)).length;

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

    const getRoleLabel = (terminal: TenantTerminalSnapshot) => {
        if (terminal.registry?.is_primary) return 'Server Master';
        if (terminal.registry) return 'Cliente con endpoint';
        return 'Cliente / catálogo';
    };
    const onlineTerminalCount = tenantTerminals.filter((terminal) => getRegistryStatusLabel(terminal) === 'ONLINE').length;
    const offlineTerminalCount = tenantTerminals.filter((terminal) => getRegistryStatusLabel(terminal) === 'OFFLINE').length;
    const masterTerminalCount = tenantTerminals.filter((terminal) => terminal.registry?.is_primary).length;
    const clientTerminalCount = tenantTerminals.filter((terminal) => !terminal.registry?.is_primary).length;
    const publishedEndpointCount = tenantTerminals.filter((terminal) => Boolean(terminal.registry)).length;
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
                        {filteredTenants.map((tenant) => (
                            <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-slate-800">{tenant.name}</div>
                                    <div className="text-xs text-slate-400 font-mono mt-0.5">{tenant.id}</div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {getActiveProductLabels(deriveProductsFromTenant(tenant.type, tenant.cloud_sync)).map((label) => (
                                            <span key={label} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wide">
                                                {label}
                                            </span>
                                        ))}
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
                        ))}
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
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className={`rounded-2xl border px-4 py-4 ${tenantTerminals.length > (selectedTenantForTerminals.max_pos_terminals ?? 9999) ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                                    <p className={`text-xs font-bold uppercase tracking-wider ${tenantTerminals.length > (selectedTenantForTerminals.max_pos_terminals ?? 9999) ? 'text-red-700' : 'text-slate-500'}`}>Terminales listadas</p>
                                    <p className={`mt-2 text-3xl font-black ${tenantTerminals.length > (selectedTenantForTerminals.max_pos_terminals ?? 9999) ? 'text-red-700' : 'text-slate-800'}`}>
                                        {tenantTerminals.length}
                                        {typeof selectedTenantForTerminals.max_pos_terminals === 'number' && (
                                            <span className={`text-sm font-bold ml-2 ${tenantTerminals.length > selectedTenantForTerminals.max_pos_terminals ? 'text-red-500' : 'text-slate-400'}`}>
                                                / {selectedTenantForTerminals.max_pos_terminals} permitidas
                                            </span>
                                        )}
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
                                        ? <>Versión de referencia: <span className="font-bold">{referenceVersionCandidate.label}</span> reportada por <span className="font-bold">{referenceVersionCandidate.source}</span>.</>
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
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Offline / sin reporte</p>
                                    <p className="mt-2 text-3xl font-black text-slate-800">{Math.max(tenantTerminals.length - onlineTerminalCount, offlineTerminalCount)}</p>
                                </div>
                            </div>

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
                                        const statusLabel = getRegistryStatusLabel(terminal);
                                        const isOnline = statusLabel === 'ONLINE';
                                        
                                        return (
                                            <div key={`${terminal.id}`} className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
                                                <div className="bg-slate-50 border-b border-slate-100 p-5 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`rounded-2xl p-3 ${isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                                            {isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
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
                                                    <div>
                                                        <button 
                                                            onClick={() => handleToggleTerminalStatus(terminal.id!, terminal.is_active !== false)}
                                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 ${terminal.is_active !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                            title={terminal.is_active !== false ? 'Desactivar Terminal' : 'Activar Terminal'}
                                                        >
                                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${terminal.is_active !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="p-5 bg-slate-100/30">
                                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Dispositivos y Activaciones Registrados</h5>
                                                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                                            <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-100 bg-slate-50">
                                                                <tr>
                                                                    <th className="px-4 py-3 font-bold">Estado</th>
                                                                    <th className="px-4 py-3 font-bold">Device / Modelo</th>
                                                                    <th className="px-4 py-3 font-bold">Red / Endpoint</th>
                                                                    <th className="px-4 py-3 font-bold">Versión APK</th>
                                                                    <th className="px-4 py-3 font-bold text-right">Último Tick</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50">
                                                                {(terminal.registries || []).map((reg, idx) => {
                                                                    const mockTerminal = { ...terminal, registry: reg };
                                                                    const rStatusLabel = getRegistryStatusLabel(mockTerminal);
                                                                    const rIsOnline = rStatusLabel === 'ONLINE';
                                                                    const rVersionKey = getApkVersionKey(mockTerminal);
                                                                    const rIsOutOfVersion = Boolean(referenceVersionKey && rVersionKey && rVersionKey !== referenceVersionKey);
                                                                    const prefLanIp = getPreferredLanIp(mockTerminal);
                                                                    
                                                                    return (
                                                                        <tr key={reg.id || idx} className={`hover:bg-slate-50 transition-colors ${rIsOutOfVersion ? 'bg-amber-50/20' : ''}`}>
                                                                            <td className="px-4 py-3 align-top">
                                                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center justify-center w-min ${rIsOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                                    {rStatusLabel}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-4 py-3 align-top">
                                                                                <p className="font-mono font-bold text-slate-700 text-[11px] mb-0.5">{reg.device_id || terminal.device_token || 'N/D'}</p>
                                                                                <p className="text-[10px] text-slate-500">{reg.hostname || 'N/D'}</p>
                                                                            </td>
                                                                            <td className="px-4 py-3 align-top">
                                                                                <p className="font-mono text-emerald-700 font-bold text-[11px] mb-0.5">{prefLanIp}</p>
                                                                                {reg.endpoint_url && <p className="text-[10px] text-slate-400 font-mono" title="Endpoint">{reg.endpoint_url}</p>}
                                                                            </td>
                                                                            <td className="px-4 py-3 align-top">
                                                                                <div className="flex flex-col items-start gap-0.5">
                                                                                    <span className="font-mono text-slate-700 text-[11px]">v {formatApkVersion(mockTerminal)}</span>
                                                                                    {rIsOutOfVersion && <span className="text-[10px] text-amber-600 font-bold">Desfasado</span>}
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-4 py-3 align-top text-right">
                                                                                <p className="text-[10px] text-slate-500 mb-0.5">{formatDateTime(reg.last_seen_at)}</p>
                                                                                <p className="font-bold text-violet-600 text-[10px]">{getRoleLabel(mockTerminal)}</p>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>

                                                {isLocalPosTenant(selectedTenantForTerminals) ? (
                                                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                        <div>
                                                            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Recuperacion POS local</p>
                                                            <p className="mt-1 text-sm text-amber-800">
                                                                Reasigna esta terminal a una tablet nueva sin borrar ventas historicas.
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => openTakeoverModal(terminal)}
                                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 transition-colors"
                                                        >
                                                            <RefreshCcw size={16} />
                                                            Reemplazar tablet
                                                        </button>
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
                                    value={takeoverFormData.terminalId}
                                    onChange={e => handleTakeoverTerminalChange(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-slate-800"
                                >
                                    {tenantTerminals.map((terminal) => {
                                        const terminalId = getTerminalTakeoverId(terminal);
                                        return (
                                            <option key={`${terminal.id}-${terminal.registry?.id || 'catalog'}`} value={terminalId}>
                                                {terminal.name} · {terminalId || 'Sin ID'}
                                            </option>
                                        );
                                    })}
                                </select>
                                <p className="mt-2 text-xs text-slate-500">
                                    Dispositivo actual: <span className="font-mono">{getTerminalCurrentDeviceId(takeoverTerminal) || 'N/D'}</span>
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
                    setFormData((current) => ({ ...current, products }));
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
                    setEditFormData((current) => ({ ...current, products }));
                    setIsEditProductsModalOpen(false);
                }}
            />
        </div>
    );
};
