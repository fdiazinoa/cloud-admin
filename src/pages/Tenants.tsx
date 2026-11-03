import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';
import type { CloudAdminPermissions, Distributor, Tenant } from '../types';
import { tenantService } from '../lib/tenantService';
import { hasCloudAdminPermission } from '../lib/cloudAdminPermissions';
import { getErrorMessage } from '../lib/errorMessage';
import { buildTenantSlug } from '../lib/tenantSlug';
import {
    deriveProductsFromTenant,
    deriveTenantConfigFromProducts,
    deriveTenantSemanticsFromProducts,
    normalizeTenantProductSelection,
    type TenantProductSelection,
} from '../lib/tenantProducts';
import { TenantMasterList } from '../components/tenants/TenantMasterList';
import { TenantDetail } from '../components/tenants/TenantDetail';
import { TenantCreateFlow } from '../components/tenants/TenantCreateFlow';
import { TenantProvisionedCredentialsBanner } from '../components/tenants/TenantProvisionedCredentialsBanner';
import type {
    TenantCreateFormData,
    TenantDetailTab,
    TenantFieldsDraft,
    TenantProvisionedCredentials,
    TenantStatusFilter,
} from '../components/tenants/types';

interface TenantsProps {
    permissions?: Partial<CloudAdminPermissions> | null;
}

const getCurrentProducts = (tenant: Tenant): TenantProductSelection => deriveProductsFromTenant(
    tenant.type,
    tenant.cloud_sync,
    tenant.max_pos_terminals,
    tenant.max_erp_users,
    {
        posVariant: tenant.pos_variant,
        offlineMode: tenant.offline_mode,
        explicitOffline: tenant.explicit_offline,
        cloudChannel: tenant.cloud_channel,
    },
);

const getFieldsFromTenant = (tenant: Tenant): TenantFieldsDraft => ({
    name: tenant.name || '',
    legalName: tenant.legal_name || '',
    taxId: tenant.tax_id || '',
    phone: tenant.phone || '',
    email: tenant.email || '',
    password: '',
});

const normalizeOptional = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
};

const isDetailTab = (value: string | null): value is TenantDetailTab => (
    value === 'resumen' || value === 'productos' || value === 'terminales' || value === 'modulos' || value === 'actividad'
);

export const Tenants: React.FC<TenantsProps> = ({ permissions }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [distributors, setDistributors] = useState<Distributor[]>([]);
    const [loading, setLoading] = useState(true);
    const [distributorsLoading, setDistributorsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>('ALL');
    const [provisionedCredentials, setProvisionedCredentials] = useState<TenantProvisionedCredentials | null>(null);
    const [activeModuleCounts, setActiveModuleCounts] = useState<Record<string, number>>({});

    const [isCreating, setIsCreating] = useState(
        searchParams.get('create') === 'true' || searchParams.get('new') === 'true',
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [savingFields, setSavingFields] = useState(false);
    const [savingProducts, setSavingProducts] = useState(false);
    const [statusBusy, setStatusBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const canViewModules = hasCloudAdminPermission(permissions, 'licenses_view');
    const canManageModules = hasCloudAdminPermission(permissions, 'licenses_manage');

    const selectedTenantId = searchParams.get('tenant');
    const tabParam = searchParams.get('tab');
    const activeTab: TenantDetailTab = isDetailTab(tabParam) ? tabParam : 'resumen';

    const selectedTenant = useMemo(
        () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? null,
        [selectedTenantId, tenants],
    );

    const fetchTenants = useCallback(async () => {
        setLoading(true);
        try {
            const data = await tenantService.getTenants();
            setTenants(data || []);
        } catch (error) {
            console.error('Error fetching tenants:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchDistributors = useCallback(async () => {
        setDistributorsLoading(true);
        try {
            const data = await tenantService.getDistributors();
            setDistributors(data || []);
        } catch (error) {
            console.error('Error fetching distributors:', error);
        } finally {
            setDistributorsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchTenants();
        void fetchDistributors();
    }, [fetchDistributors, fetchTenants]);

    const updateParams = useCallback((changes: Record<string, string | null>) => {
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            for (const [key, value] of Object.entries(changes)) {
                if (value === null || value === '') next.delete(key);
                else next.set(key, value);
            }
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const selectTenant = (tenant: Tenant) => {
        setIsCreating(false);
        updateParams({ tenant: tenant.id, tab: null, create: null, new: null });
    };

    const changeTab = (tab: TenantDetailTab) => {
        updateParams({ tenant: selectedTenantId, tab: tab === 'resumen' ? null : tab });
    };

    const startCreate = () => {
        setIsCreating(true);
        updateParams({ create: null, new: null });
    };

    const cancelCreate = () => {
        setIsCreating(false);
        updateParams({ create: null, new: null });
    };

    const handleCreateTenant = async (form: TenantCreateFormData) => {
        setIsSubmitting(true);
        try {
            const slug = buildTenantSlug(form.slug || form.name);
            if (!slug) throw new Error('El identificador tecnico del tenant es requerido.');

            const products = normalizeTenantProductSelection(form.products);
            const productConfig = deriveTenantConfigFromProducts(products);
            const semanticConfig = deriveTenantSemanticsFromProducts(products);

            const { tenantId, tempPassword } = await tenantService.createTenant({
                name: form.name,
                slug,
                email: form.email,
                contactName: form.contactName,
                contactEmail: form.contactEmail,
                city: form.city,
                capturedByDistributorId: form.capturedByDistributorId || undefined,
                servicedByDistributorId: form.servicedByDistributorId || undefined,
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
                maxPosTerminals: products.pos_licenses,
                maxErpUsers: products.erp_users,
            });

            if (form.taxId.trim()) {
                await tenantService.updateTenantTaxId(tenantId, form.taxId);
            }

            setProvisionedCredentials({ email: form.email.trim().toLowerCase(), tempPassword });
            setIsCreating(false);
            await fetchTenants();
            updateParams({ tenant: tenantId, tab: null, create: null, new: null });
        } catch (error: unknown) {
            console.error('Error provisioning tenant:', error);
            alert('Error al aprovisionar el Tenant: ' + getErrorMessage(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    /** Un solo camino de escritura para campos y productos: el payload semántico se recalcula siempre. */
    const persistTenant = async (tenant: Tenant, fields: TenantFieldsDraft, products: TenantProductSelection) => {
        const productConfig = deriveTenantConfigFromProducts(products);
        const semanticConfig = deriveTenantSemanticsFromProducts(products);

        await tenantService.updateTenant(tenant.id, {
            name: fields.name.trim(),
            legal_name: normalizeOptional(fields.legalName),
            tax_id: normalizeOptional(fields.taxId),
            phone: normalizeOptional(fields.phone),
            type: productConfig.type,
            cloud_sync: productConfig.cloudSync,
            max_pos_terminals: products.pos_licenses,
            max_erp_users: products.erp_users,
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

        if (fields.email.trim().toLowerCase() !== tenant.email || fields.password.trim()) {
            await tenantService.updateTenantCredentials(tenant.id, {
                email: fields.email.trim().toLowerCase(),
                password: fields.password.trim() || undefined,
            });
        }
    };

    const handleSaveFields = async (draft: TenantFieldsDraft) => {
        if (!selectedTenant) return;
        setSavingFields(true);
        try {
            await persistTenant(selectedTenant, draft, normalizeTenantProductSelection(getCurrentProducts(selectedTenant)));
            await fetchTenants();
        } catch (error: unknown) {
            console.error('Error updating tenant:', error);
            alert('Error al actualizar el Tenant: ' + getErrorMessage(error));
        } finally {
            setSavingFields(false);
        }
    };

    const handleSaveProducts = async (products: TenantProductSelection) => {
        if (!selectedTenant) return;
        setSavingProducts(true);
        try {
            await persistTenant(selectedTenant, getFieldsFromTenant(selectedTenant), normalizeTenantProductSelection(products));
            await fetchTenants();
        } catch (error: unknown) {
            console.error('Error updating tenant products:', error);
            alert('Error al actualizar los productos: ' + getErrorMessage(error));
        } finally {
            setSavingProducts(false);
        }
    };

    const activateTrialTenant = async () => {
        if (!selectedTenant) return;
        if (!confirm(`¿Deseas activar la empresa "${selectedTenant.name}"?`)) return;

        setStatusBusy(true);
        try {
            await tenantService.reactivateTenant(selectedTenant.id);
            await fetchTenants();
        } catch (error) {
            console.error('Error activating tenant:', error);
            alert('Hubo un error al activar la empresa');
        } finally {
            setStatusBusy(false);
        }
    };

    const toggleTenantStatus = async () => {
        if (!selectedTenant) return;
        const isCurrentlyActive = selectedTenant.status === 'ACTIVE';
        const label = isCurrentlyActive ? 'SUSPENDER' : 'REACTIVAR';
        if (!confirm(`¿Estás seguro que deseas ${label} esta empresa?`)) return;

        setStatusBusy(true);
        try {
            if (isCurrentlyActive) await tenantService.suspendTenant(selectedTenant.id);
            else await tenantService.reactivateTenant(selectedTenant.id);
            await fetchTenants();
        } catch (error) {
            console.error('Error toggling status:', error);
            alert('Hubo un error al actualizar el estatus');
        } finally {
            setStatusBusy(false);
        }
    };

    const handleDeleteTenant = async () => {
        if (!selectedTenant) return;
        const tenant = selectedTenant;
        const confirmed = confirm(
            `Vas a eliminar definitivamente el tenant "${tenant.name}". Esta accion borra su registro, suscripcion, esquema de base de datos y usuario de acceso si existe. ¿Deseas continuar?`,
        );
        if (!confirmed) return;

        const typedName = prompt(`Para confirmar, escribe exactamente el nombre del tenant: ${tenant.name}`);
        if (typedName !== tenant.name) {
            alert('El nombre no coincide. No se elimino el tenant.');
            return;
        }

        setDeleting(true);
        try {
            await tenantService.deleteTenant(tenant);
            updateParams({ tenant: null, tab: null });
            await fetchTenants();
            alert(`Tenant "${tenant.name}" eliminado correctamente.`);
        } catch (error: unknown) {
            console.error('Error deleting tenant:', error);
            await fetchTenants();
            alert('Error al eliminar el Tenant: ' + getErrorMessage(error));
        } finally {
            setDeleting(false);
        }
    };

    const openConsole = () => {
        if (!selectedTenant) return;
        navigate(`/tenants/${encodeURIComponent(selectedTenant.id)}/terminales`);
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-100">
            {provisionedCredentials ? (
                <div className="shrink-0 px-4 pt-3 sm:px-6">
                    <TenantProvisionedCredentialsBanner
                        credentials={provisionedCredentials}
                        onDismiss={() => setProvisionedCredentials(null)}
                    />
                </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                <TenantMasterList
                    tenants={tenants}
                    loading={loading}
                    searchTerm={searchTerm}
                    onSearchTermChange={setSearchTerm}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    selectedTenantId={selectedTenantId}
                    onSelect={selectTenant}
                    onCreate={startCreate}
                />

                {isCreating ? (
                    <TenantCreateFlow
                        distributors={distributors}
                        distributorsLoading={distributorsLoading}
                        isSubmitting={isSubmitting}
                        onSubmit={handleCreateTenant}
                        onCancel={cancelCreate}
                    />
                ) : selectedTenant ? (
                    <TenantDetail
                        key={selectedTenant.id}
                        tenant={selectedTenant}
                        distributors={distributors}
                        tab={activeTab}
                        onTabChange={changeTab}
                        canViewModules={canViewModules}
                        canManageModules={canManageModules}
                        moduleCount={activeModuleCounts[selectedTenant.id] ?? null}
                        onModuleCountChange={(count) => setActiveModuleCounts((current) => ({ ...current, [selectedTenant.id]: count }))}
                        actions={{
                            onSaveFields: handleSaveFields,
                            onSaveProducts: handleSaveProducts,
                            onToggleStatus: toggleTenantStatus,
                            onActivateTrial: activateTrialTenant,
                            onDelete: handleDeleteTenant,
                            onOpenConsole: openConsole,
                        }}
                        savingFields={savingFields}
                        savingProducts={savingProducts}
                        statusBusy={statusBusy}
                        deleting={deleting}
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-6">
                        <div className="max-w-sm text-center">
                            {loading ? (
                                <div className="flex items-center justify-center gap-2 text-sm font-bold text-slate-500">
                                    <Loader2 className="animate-spin" size={18} /> Cargando tenants…
                                </div>
                            ) : (
                                <>
                                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm">
                                        <Building2 size={22} />
                                    </span>
                                    <h2 className="mt-3 text-lg font-black text-slate-800">Selecciona un tenant</h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                        {tenants.length === 0
                                            ? 'Todavía no hay tenants en la cartera. Crea el primero para aprovisionar su esquema y usuario de acceso.'
                                            : 'Elige una cuenta de la lista para ver su ficha, productos, terminales y actividad.'}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={startCreate}
                                        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-black text-white hover:bg-blue-700"
                                    >
                                        Nuevo tenant
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
