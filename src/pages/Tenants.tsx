import React, { useEffect, useState } from 'react';
import { Search, Plus, Power, Edit3, Loader2, X, Monitor, Wifi, WifiOff, Server, AlertTriangle } from 'lucide-react';
import type { Distributor, Tenant, TenantTerminalSnapshot, TenantType } from '../types';
import { tenantService } from '../lib/tenantService';

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
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
    const [selectedTenantForTerminals, setSelectedTenantForTerminals] = useState<Tenant | null>(null);
    const [tenantTerminals, setTenantTerminals] = useState<TenantTerminalSnapshot[]>([]);
    const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);
    const [isTerminalModalLoading, setIsTerminalModalLoading] = useState(false);
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
        type: 'full' as TenantType,
        cloudSync: true,
    });
    const [editFormData, setEditFormData] = useState({
        name: '',
        legalName: '',
        taxId: '',
        phone: '',
        type: 'full' as TenantType,
        cloudSync: true,
    });

    const getErrorMessage = (error: unknown) => {
        if (typeof error === 'string') return error;
        if (error instanceof Error) return error.message;
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

    useEffect(() => {
        void fetchTenants();
        void fetchDistributors();
    }, []);

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

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const slug = formData.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

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
                type: formData.type,
                cloudSync: formData.cloudSync,
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
                type: 'full',
                cloudSync: true,
            });
            setIsModalOpen(false);
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
            type: tenant.type || 'full',
            cloudSync: tenant.cloud_sync ?? true,
        });
        setIsEditModalOpen(true);
    };

    const closeEditModal = () => {
        setIsEditModalOpen(false);
        setEditingTenant(null);
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

    const handleUpdateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTenant) return;

        setIsEditSubmitting(true);
        try {
            await tenantService.updateTenant(editingTenant.id, {
                name: editFormData.name.trim(),
                legal_name: normalizeOptional(editFormData.legalName),
                tax_id: normalizeOptional(editFormData.taxId),
                phone: normalizeOptional(editFormData.phone),
                type: editFormData.type,
                cloud_sync: editFormData.cloudSync,
            });
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

    const getDiscardedIps = (terminal: TenantTerminalSnapshot) =>
        getReportedIps(terminal).filter((ip) => !getLanIps(terminal).includes(ip));

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
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
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

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Tipo de Solución</label>
                                    <select
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value as TenantType })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    >
                                        <option value="full">MALL POS + Cloud ERP</option>
                                        <option value="pos_only">Solo MALL POS</option>
                                    </select>
                                </div>
                                <div className="flex items-center pt-7">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className="relative flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                checked={formData.cloudSync}
                                                onChange={e => setFormData({ ...formData, cloudSync: e.target.checked })}
                                                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-colors"
                                            />
                                        </div>
                                        <span className="text-sm font-bold text-slate-700 select-none group-hover:text-blue-700 transition-colors">Activar Respaldo Cloud</span>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
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
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Terminales listadas</p>
                                    <p className="mt-2 text-3xl font-black text-slate-800">{tenantTerminals.length}</p>
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
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    {tenantTerminals.map((terminal) => {
                                        const statusLabel = getRegistryStatusLabel(terminal);
                                        const isOnline = statusLabel === 'ONLINE';
                                        const terminalVersionKey = getApkVersionKey(terminal);
                                        const isOutOfVersion = Boolean(referenceVersionKey && terminalVersionKey && terminalVersionKey !== referenceVersionKey);
                                        const hasVersion = Boolean(terminalVersionKey);
                                        const lanIps = getLanIps(terminal);
                                        const discardedIps = getDiscardedIps(terminal);

                                        return (
                                            <div key={`${terminal.id}-${terminal.registry?.id || 'catalog'}`} className={`rounded-3xl border bg-white p-5 shadow-sm ${isOutOfVersion ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`rounded-2xl p-3 ${isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
                                                            </div>
                                                            <div>
                                                                <h4 className="font-black text-slate-800 truncate">{terminal.name}</h4>
                                                                <p className="text-xs text-slate-400 font-mono mt-0.5">
                                                                    Terminal ID: {terminal.terminal_id || 'N/D'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                            {statusLabel}
                                                        </span>
                                                        <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase ${
                                                            isOutOfVersion
                                                                ? 'bg-amber-100 text-amber-700'
                                                                : hasVersion
                                                                    ? 'bg-blue-100 text-blue-700'
                                                                    : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                            {isOutOfVersion ? 'Fuera de versión' : hasVersion ? 'Versión reportada' : 'Sin versión'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Device Token</p>
                                                        <p className="mt-1 text-slate-700 font-mono break-all">{terminal.device_token || terminal.registry?.device_id || 'N/D'}</p>
                                                    </div>
                                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Hostname</p>
                                                        <p className="mt-1 text-slate-700">{terminal.registry?.hostname || 'N/D'}</p>
                                                    </div>
                                                    <div className="rounded-2xl bg-emerald-50 px-4 py-3 border border-emerald-100">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">IP LAN recomendada</p>
                                                        <p className="mt-1 text-slate-700 font-mono">{getPreferredLanIp(terminal)}</p>
                                                    </div>
                                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Mask / Subred</p>
                                                        <p className="mt-1 text-slate-700">N/D</p>
                                                    </div>
                                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100 md:col-span-2">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">IPs LAN válidas</p>
                                                        <p className="mt-1 text-slate-700 font-mono break-all">
                                                            {lanIps.length ? lanIps.join(', ') : 'N/D'}
                                                        </p>
                                                    </div>
                                                    {discardedIps.length > 0 && (
                                                        <div className="rounded-2xl bg-amber-50 px-4 py-3 border border-amber-100 md:col-span-2">
                                                            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">IPs descartadas / virtuales</p>
                                                            <p className="mt-1 text-slate-700 font-mono break-all">
                                                                {discardedIps.join(', ')}
                                                            </p>
                                                        </div>
                                                    )}
                                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100 md:col-span-2">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Endpoint Publicado</p>
                                                        <p className="mt-1 text-slate-700 font-mono break-all">{terminal.registry?.endpoint_url || 'N/D'}</p>
                                                    </div>
                                                    <div className={`rounded-2xl px-4 py-3 border md:col-span-2 ${
                                                        isOutOfVersion
                                                            ? 'border-amber-200 bg-amber-50'
                                                            : 'border-slate-100 bg-slate-50'
                                                    }`}>
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Versión APK</p>
                                                                <p className="mt-1 text-slate-700 font-mono">{formatApkVersion(terminal)}</p>
                                                            </div>
                                                            {isOutOfVersion ? (
                                                                <div className="flex items-center gap-2 text-amber-700 text-xs font-bold uppercase">
                                                                    <AlertTriangle size={14} />
                                                                    Desfasada
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                        {isOutOfVersion && referenceVersionCandidate ? (
                                                            <p className="mt-2 text-xs text-amber-700">
                                                                Debe alinearse con <span className="font-bold">{referenceVersionCandidate.label}</span>.
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Rol</p>
                                                        <div className="mt-1 flex items-center gap-2 text-slate-700">
                                                            <Server size={14} className="text-violet-500" />
                                                            <span>{getRoleLabel(terminal)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Último Heartbeat</p>
                                                        <p className="mt-1 text-slate-700">{formatDateTime(terminal.registry?.last_seen_at)}</p>
                                                    </div>
                                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Último Check-in</p>
                                                        <p className="mt-1 text-slate-700">{formatDateTime(terminal.last_checkin_at)}</p>
                                                    </div>
                                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Creada</p>
                                                        <p className="mt-1 text-slate-700">{formatDateTime(terminal.created_at)}</p>
                                                    </div>
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

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Email de Contacto</label>
                                <input
                                    type="email"
                                    value={editingTenant.email}
                                    disabled
                                    className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
                                />
                                <p className="text-xs text-slate-500 mt-1">El email de acceso se mantiene fijo para no desincronizar autenticación.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Tipo de Solución</label>
                                    <select
                                        value={editFormData.type}
                                        onChange={e => setEditFormData({ ...editFormData, type: e.target.value as TenantType })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    >
                                        <option value="full">MALL POS + Cloud ERP</option>
                                        <option value="pos_only">Solo MALL POS</option>
                                    </select>
                                </div>
                                <div className="flex items-center pt-7">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={editFormData.cloudSync}
                                            onChange={e => setEditFormData({ ...editFormData, cloudSync: e.target.checked })}
                                            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-colors"
                                        />
                                        <span className="text-sm font-bold text-slate-700 select-none group-hover:text-blue-700 transition-colors">Activar Respaldo Cloud</span>
                                    </label>
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
        </div>
    );
};
