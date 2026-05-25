import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Power, Edit3, Loader2, X, Boxes, Monitor, Wifi, WifiOff, Activity, Server, Check, AlertCircle } from 'lucide-react';
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
    const [provisionedCredentials, setProvisionedCredentials] = useState<{
        email: string;
        tempPassword: string;
    } | null>(null);

    const [isAddApkModalOpen, setIsAddApkModalOpen] = useState(false);
    const [isAddApkSubmitting, setIsAddApkSubmitting] = useState(false);
    const [addApkFormData, setAddApkFormData] = useState({
        deviceId: '',
        terminalId: '',
        terminalName: '',
        hostname: '',
        protocol: 'http',
        port: 3001,
        localIp: '',
        isPrimary: true,
        appVersion: '1.0.0',
        appVersionCode: 1,
    });

    const handleAddApk = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTenantForTerminals) return;
        if (!addApkFormData.deviceId.trim()) {
            alert('El ID de dispositivo es requerido.');
            return;
        }
        if (!addApkFormData.terminalId.trim()) {
            alert('El ID de terminal es requerido o puedes seleccionar uno.');
            return;
        }
        if (!addApkFormData.localIp.trim()) {
            alert('La IP local es requerida.');
            return;
        }

        setIsAddApkSubmitting(true);
        try {
            const payload = {
                tenantId: selectedTenantForTerminals.id,
                deviceId: addApkFormData.deviceId.trim(),
                terminalId: addApkFormData.terminalId.trim(),
                terminalName: addApkFormData.terminalName.trim() || undefined,
                hostname: addApkFormData.hostname.trim() || undefined,
                protocol: addApkFormData.protocol,
                port: Number(addApkFormData.port),
                localIp: addApkFormData.localIp.trim(),
                isPrimary: addApkFormData.isPrimary,
                appVersion: addApkFormData.appVersion.trim() || undefined,
                appVersionCode: Number(addApkFormData.appVersionCode) || undefined,
            };

            await tenantService.registerTenantServerEndpoint(payload);
            
            setAddApkFormData({
                deviceId: '',
                terminalId: '',
                terminalName: '',
                hostname: '',
                protocol: 'http',
                port: 3001,
                localIp: '',
                isPrimary: true,
                appVersion: '1.0.0',
                appVersionCode: 1,
            });
            setIsAddApkModalOpen(false);
            
            setIsTerminalModalLoading(true);
            const data = await tenantService.getTenantTerminalOverview(selectedTenantForTerminals.id);
            setTenantTerminals(data);
        } catch (err: unknown) {
            console.error('Error registering APK:', err);
            alert('Error al registrar la APK POS: ' + getErrorMessage(err));
        } finally {
            setIsAddApkSubmitting(false);
        }
    };

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

    const toggleTenantStatus = async (tenant: Tenant) => {
        const isCurrentlyActive = tenant.status === 'ACTIVE' || tenant.status === 'TRIAL';
        const newStatusLabel = isCurrentlyActive ? 'SUSPENDER' : 'REACTIVAR';

        if (!confirm(`¿Estás seguro que deseas ${newStatusLabel} esta empresa?`)) return;

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
                                        <button
                                            onClick={() => toggleTenantStatus(tenant)}
                                            className={`p-2 rounded-lg transition-colors ${tenant.status === 'ACTIVE' ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                            title={tenant.status === 'ACTIVE' ? 'Forzar Suspensión' : 'Reactivar'}
                                        >
                                            <Power size={18} />
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
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
                                    <Monitor className="text-violet-600" size={24} />
                                    Terminales Activas & APK POS
                                </h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    {selectedTenantForTerminals.name} · {selectedTenantForTerminals.email}
                                </p>
                                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{selectedTenantForTerminals.id}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddApkModalOpen(true)}
                                    className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors shadow-sm focus:ring-4 focus:ring-violet-100 animate-in fade-in"
                                >
                                    <Plus size={16} />
                                    Nuevo
                                </button>
                                <button 
                                    type="button" 
                                    onClick={closeTerminalModal} 
                                    className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Unified Metric Cards Dashboard */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* CARD 1: Catálogo y Licencias */}
                                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm flex flex-col justify-between">
                                    <div className="flex justify-between items-start">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Licencias POS</p>
                                        <Monitor size={16} className="text-slate-400" />
                                    </div>
                                    <div className="mt-2 flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-slate-800">{tenantTerminals.length}</span>
                                        {typeof selectedTenantForTerminals.max_pos_terminals === 'number' && (
                                            <span className="text-xs font-semibold text-slate-400 font-sans">
                                                / {selectedTenantForTerminals.max_pos_terminals} permitidas
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-2 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all ${
                                                tenantTerminals.length > (selectedTenantForTerminals.max_pos_terminals ?? 9999) 
                                                    ? 'bg-red-500' 
                                                    : tenantTerminals.length === selectedTenantForTerminals.max_pos_terminals 
                                                        ? 'bg-amber-500' 
                                                        : 'bg-violet-500'
                                            }`}
                                            style={{ 
                                                width: `${Math.min(100, (tenantTerminals.length / (selectedTenantForTerminals.max_pos_terminals || 1)) * 100)}%` 
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* CARD 2: Endpoints Publicados / Conectados */}
                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 shadow-sm flex flex-col justify-between">
                                    <div className="flex justify-between items-start">
                                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Endpoints Online</p>
                                        <Wifi size={16} className="text-emerald-500" />
                                    </div>
                                    <div className="mt-2 flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-emerald-800">{onlineTerminalCount}</span>
                                        <span className="text-xs text-slate-400 font-semibold">
                                            de {publishedEndpointCount} registrados
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-emerald-600 mt-2 font-medium">
                                        {publishedEndpointCount - onlineTerminalCount} offline o sin reporte
                                    </p>
                                </div>

                                {/* CARD 3: Servidores Master */}
                                <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-4 shadow-sm flex flex-col justify-between">
                                    <div className="flex justify-between items-start">
                                        <p className="text-xs font-bold uppercase tracking-wider text-violet-600">Servidores Master</p>
                                        <Boxes size={16} className="text-violet-500" />
                                    </div>
                                    <div className="mt-2 flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-violet-800">{masterTerminalCount}</span>
                                        <span className="text-xs text-slate-400 font-semibold">
                                            en red local
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-violet-600 mt-2 font-medium">
                                        Coordinan sincronización local
                                    </p>
                                </div>

                                {/* CARD 4: Control de Versión APK */}
                                <div className={`rounded-2xl border p-4 shadow-sm flex flex-col justify-between ${
                                    outOfVersionCount > 0 
                                        ? 'border-amber-100 bg-amber-50/30' 
                                        : 'border-slate-100 bg-slate-50/50'
                                }`}>
                                    <div className="flex justify-between items-start">
                                        <p className={`text-xs font-bold uppercase tracking-wider ${outOfVersionCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                            Control de Versión
                                        </p>
                                        <Activity size={16} className={outOfVersionCount > 0 ? 'text-amber-500' : 'text-slate-400'} />
                                    </div>
                                    <div className="mt-2">
                                        {outOfVersionCount > 0 ? (
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-2xl font-black text-amber-700">{outOfVersionCount}</span>
                                                <span className="text-xs text-amber-600 font-bold">Desfasados</span>
                                            </div>
                                        ) : (
                                            <span className="text-lg font-black text-slate-700">Actualizados</span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-2 font-medium truncate">
                                        {referenceVersionCandidate ? `Ref: v${referenceVersionCandidate.label.replace('APK v', '')}` : 'Sin versión reportada'}
                                    </p>
                                </div>
                            </div>

                            {/* TIP / Info Box */}
                            <div className="rounded-2xl border border-blue-100 bg-blue-50/40 px-4 py-3 text-xs text-blue-800 leading-relaxed flex items-start gap-2.5">
                                <span className="bg-blue-100 text-blue-800 rounded-lg p-1 px-2 font-bold shrink-0 mt-0.5">INFO</span>
                                <div>
                                    <p className="font-semibold text-blue-900">
                                        Esta vista asocia el catálogo de terminales autorizadas del tenant con los endpoints publicados por las APKs en sitio.
                                    </p>
                                    <p className="mt-1">
                                        Las terminales que operan como <span className="font-bold">Server Master</span> permiten enlazar otras cajas cliente localmente.
                                        Usa la <span className="font-bold">IP LAN recomendada</span> o el <span className="font-bold">Endpoint publicado</span> para configurar las cajas clientes de este establecimiento.
                                    </p>
                                </div>
                            </div>

                            {isTerminalModalLoading ? (
                                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 px-6 py-12 text-center text-slate-500 flex items-center justify-center gap-3">
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
                                            <div key={`${terminal.id}`} className="rounded-3xl border border-slate-150 bg-white shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200">
                                                <div className="bg-slate-50/40 border-b border-slate-100 p-5 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`rounded-2xl p-3 shrink-0 ${isOnline ? 'bg-emerald-100 text-emerald-700 animate-pulse-slow' : 'bg-slate-100 text-slate-500'}`}>
                                                            {isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-3 flex-wrap">
                                                                <h4 className="font-black text-slate-800 text-lg leading-snug">{terminal.name}</h4>
                                                                <span className={`font-bold text-xs px-2.5 py-1 rounded-lg ${
                                                                    (terminal.registries || []).length > 1 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                                                }`}>
                                                                    {terminal.registries?.length || 0} Registro(s)
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs text-slate-400 font-mono">
                                                                    ID: {terminal.terminal_id || terminal.id || 'N/D'}
                                                                </span>
                                                                {terminal.device_token && (
                                                                    <span className="text-xs text-slate-400 font-mono border-l pl-2 border-slate-200">
                                                                        Token: {terminal.device_token}
                                                                    </span>
                                                                )}
                                                            </div>
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

                                                <div className="p-5 bg-slate-50/20">
                                                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Dispositivos y Activaciones Registrados</h5>
                                                    
                                                    {(!terminal.registries || terminal.registries.length === 0) ? (
                                                        <div className="text-center py-6 px-4 bg-slate-50/30 border border-slate-100 border-dashed rounded-xl text-slate-400 text-xs">
                                                            Aún no hay reportes de activaciones para este dispositivo. Se registrarán automáticamente cuando el APK POS se inicie y se conecte a la nube.
                                                        </div>
                                                    ) : (
                                                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                                                            <table className="w-full text-left text-sm whitespace-nowrap">
                                                                <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-100 bg-slate-50">
                                                                    <tr>
                                                                        <th className="px-4 py-3 font-bold">Estado</th>
                                                                        <th className="px-4 py-3 font-bold">Dispositivo / Modelo</th>
                                                                        <th className="px-4 py-3 font-bold">Red / Endpoint</th>
                                                                        <th className="px-4 py-3 font-bold">Versión APK</th>
                                                                        <th className="px-4 py-3 font-bold text-right">Último Reporte</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100">
                                                                    {terminal.registries.map((reg, idx) => {
                                                                        const mockTerminal = { ...terminal, registry: reg };
                                                                        const rStatusLabel = getRegistryStatusLabel(mockTerminal);
                                                                        const rIsOnline = rStatusLabel === 'ONLINE';
                                                                        const rVersionKey = getApkVersionKey(mockTerminal);
                                                                        const rIsOutOfVersion = Boolean(referenceVersionKey && rVersionKey && rVersionKey !== referenceVersionKey);
                                                                        const prefLanIp = getPreferredLanIp(mockTerminal);
                                                                        
                                                                        return (
                                                                            <tr key={reg.id || idx} className={`hover:bg-slate-50/50 transition-colors ${rIsOutOfVersion ? 'bg-amber-50/10' : ''}`}>
                                                                                <td className="px-4 py-3 align-top">
                                                                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 w-min ${
                                                                                        rIsOnline 
                                                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                                                                            : 'bg-slate-50 text-slate-500 border border-slate-200'
                                                                                    }`}>
                                                                                        <span className={`h-1.5 w-1.5 rounded-full ${rIsOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                                                                        {rStatusLabel}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top">
                                                                                    <div className="flex flex-col">
                                                                                        <span className="font-mono font-bold text-slate-700 text-[11px] mb-0.5">{reg.device_id || terminal.device_token || 'N/D'}</span>
                                                                                        <span className="text-[10px] text-slate-500 font-medium">{reg.hostname || 'N/D'}</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top">
                                                                                    <div className="flex flex-col">
                                                                                        <span className="font-mono text-emerald-700 font-bold text-[11px] mb-0.5">{prefLanIp}</span>
                                                                                        {reg.endpoint_url && (
                                                                                            <span className="text-[10px] text-slate-400 font-mono" title="Endpoint">
                                                                                                {reg.endpoint_url}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top">
                                                                                    <div className="flex flex-col items-start gap-1">
                                                                                        <span className="font-mono text-slate-700 text-[11px] font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                                                                                            {formatApkVersion(mockTerminal).replace('APK ', '')}
                                                                                        </span>
                                                                                        {rIsOutOfVersion && (
                                                                                            <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-black uppercase tracking-wide">
                                                                                                Desfasado
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top text-right">
                                                                                    <div className="flex flex-col items-end">
                                                                                        <span className="text-[10px] text-slate-500 font-medium mb-0.5">{formatDateTime(reg.last_seen_at)}</span>
                                                                                        <span className={`font-bold text-[10px] px-2.5 py-0.5 rounded-full ${
                                                                                            reg.is_primary 
                                                                                                ? 'bg-violet-100 text-violet-700 border border-violet-200' 
                                                                                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                                                                                        }`}>
                                                                                            {getRoleLabel(mockTerminal)}
                                                                                        </span>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isAddApkModalOpen && selectedTenantForTerminals && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                                <Server className="text-violet-600" size={20} />
                                Registrar APK POS
                            </h3>
                            <button 
                                type="button" 
                                onClick={() => setIsAddApkModalOpen(false)} 
                                className="text-slate-400 hover:text-slate-700 transition-colors p-1.5 hover:bg-slate-100 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleAddApk} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Terminal de Catálogo <span className="text-red-500">*</span></label>
                                <div className="flex gap-2">
                                    {addApkFormData.terminalId === '_NEW_' ? (
                                        <div className="relative w-full">
                                            <input
                                                required
                                                type="text"
                                                placeholder="Ingresa ID de terminal (ej. TERM-001)"
                                                onChange={e => setAddApkFormData({ ...addApkFormData, terminalId: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-sm text-slate-800"
                                            />
                                        </div>
                                    ) : (
                                        <select
                                            required
                                            value={addApkFormData.terminalId}
                                            onChange={e => {
                                                if (e.target.value === '_NEW_') {
                                                    setAddApkFormData({ ...addApkFormData, terminalId: '_NEW_' });
                                                } else {
                                                    const term = tenantTerminals.find(t => t.id === e.target.value);
                                                    setAddApkFormData({ 
                                                        ...addApkFormData, 
                                                        terminalId: e.target.value,
                                                        terminalName: term ? term.name : ''
                                                    });
                                                }
                                            }}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-sm text-slate-800 font-medium"
                                        >
                                            <option value="">-- Selecciona del catálogo --</option>
                                            {tenantTerminals.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.name} ({t.id.slice(0, 8)})
                                                </option>
                                            ))}
                                            <option value="_NEW_">+ Crear Nueva Terminal Personalizada</option>
                                        </select>
                                    )}
                                    {addApkFormData.terminalId === '_NEW_' && (
                                        <button 
                                            type="button"
                                            onClick={() => setAddApkFormData({ ...addApkFormData, terminalId: '' })}
                                            className="px-3 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl transition-colors text-xs font-semibold shrink-0"
                                        >
                                            Volver
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">ID de Dispositivo (Device ID) <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    type="text"
                                    placeholder="Ej. android-uuid-device-01"
                                    value={addApkFormData.deviceId}
                                    onChange={e => setAddApkFormData({ ...addApkFormData, deviceId: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-sm text-slate-800"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre Terminal</label>
                                    <input
                                        type="text"
                                        placeholder="Ej. Caja Principal"
                                        value={addApkFormData.terminalName}
                                        onChange={e => setAddApkFormData({ ...addApkFormData, terminalName: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-sm text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Hostname</label>
                                    <input
                                        type="text"
                                        placeholder="Ej. sunmi-v2-pro"
                                        value={addApkFormData.hostname}
                                        onChange={e => setAddApkFormData({ ...addApkFormData, hostname: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-sm text-slate-800"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">IP Local (LAN IP) <span className="text-red-500">*</span></label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="Ej. 192.168.1.100"
                                        value={addApkFormData.localIp}
                                        onChange={e => setAddApkFormData({ ...addApkFormData, localIp: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-sm text-slate-800 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Puerto</label>
                                    <input
                                        type="number"
                                        placeholder="3001"
                                        value={addApkFormData.port}
                                        onChange={e => setAddApkFormData({ ...addApkFormData, port: Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-sm text-slate-800"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Versión APK</label>
                                    <input
                                        type="text"
                                        placeholder="1.0.0"
                                        value={addApkFormData.appVersion}
                                        onChange={e => setAddApkFormData({ ...addApkFormData, appVersion: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-sm text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Código Versión</label>
                                    <input
                                        type="number"
                                        placeholder="1"
                                        value={addApkFormData.appVersionCode}
                                        onChange={e => setAddApkFormData({ ...addApkFormData, appVersionCode: Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-sm text-slate-800"
                                    />
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-slate-700">Servidor Master (Primary)</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Define este dispositivo como central local</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAddApkFormData({ ...addApkFormData, isPrimary: !addApkFormData.isPrimary })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 ${addApkFormData.isPrimary ? 'bg-violet-600' : 'bg-slate-300'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${addApkFormData.isPrimary ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className="pt-2 flex justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => setIsAddApkModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 text-sm font-bold transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isAddApkSubmitting}
                                    className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:bg-violet-400 disabled:cursor-not-allowed"
                                >
                                    {isAddApkSubmitting ? (
                                        <><Loader2 size={16} className="animate-spin" /> Guardando...</>
                                    ) : 'Registrar'}
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
