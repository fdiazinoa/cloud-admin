import React, {
    useEffect,
    useState,
} from 'react';
import {
    useSearchParams,
} from 'react-router-dom';
import type {
    CloudAdminPermissions,
    Distributor,
    Tenant,
} from '../types';
import {
    tenantService,
} from '../lib/tenantService';
import {
    ErpModuleStoreModal,
} from '../components/ErpModuleStoreModal';
import {
    TenantTerminalConsole,
} from '../components/tenants/TenantTerminalConsole';
import {
    TenantCreateModal,
} from '../components/tenants/TenantCreateModal';
import {
    TenantEditModal,
} from '../components/tenants/TenantEditModal';
import {
    TenantListPanel,
} from '../components/tenants/TenantListPanel';
import {
    TenantsPageHeader,
} from '../components/tenants/TenantsPageHeader';
import {
    TenantProvisionedCredentialsBanner,
} from '../components/tenants/TenantProvisionedCredentialsBanner';
import type {
    TenantCreateFormData,
    TenantEditFormData,
    TenantProvisionedCredentials,
} from '../components/tenants/types';
import {
    hasCloudAdminPermission,
} from '../lib/cloudAdminPermissions';
import {
    deriveProductsFromTenant,
    deriveTenantConfigFromProducts,
    deriveTenantSemanticsFromProducts,
    getDefaultTenantProducts,
    normalizeTenantProductSelection,
} from '../lib/tenantProducts';
import {
    getErrorMessage,
} from '../lib/errorMessage';
import {
    buildTenantSlug,
} from '../lib/tenantSlug';

export const Tenants: React.FC<{ permissions?: Partial<CloudAdminPermissions> | null }> = ({ permissions }) => {
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
    const [moduleStoreTenant, setModuleStoreTenant] = useState<Tenant | null>(null);
    const [activeModuleCounts, setActiveModuleCounts] = useState<Record<string, number>>({});
    const [selectedTenantForTerminals, setSelectedTenantForTerminals] = useState<Tenant | null>(null);
    const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null);
    const [updatingStatusTenantId, setUpdatingStatusTenantId] = useState<string | null>(null);
    const [provisionedCredentials, setProvisionedCredentials] = useState<TenantProvisionedCredentials | null>(null);

    const [formData, setFormData] = useState<TenantCreateFormData>({
        name: '',
        slug: '',
        email: '',
        taxId: '',
        contactName: '',
        contactEmail: '',
        city: '',
        capturedByDistributorId: '',
        servicedByDistributorId: '',
        products: getDefaultTenantProducts(),
    });
    const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
    const [editFormData, setEditFormData] = useState<TenantEditFormData>({
        name: '',
        legalName: '',
        taxId: '',
        phone: '',
        email: '',
        password: '',
        products: getDefaultTenantProducts(),
    });
    const canViewErpModules = hasCloudAdminPermission(permissions, 'licenses_view');
    const canManageErpModules = hasCloudAdminPermission(permissions, 'licenses_manage');
    const canReauthorizeTerminals = hasCloudAdminPermission(permissions, 'terminal_reauthorization');

    const [searchParams] = useSearchParams();

    useEffect(() => {
        void fetchTenants();
        void fetchDistributors();

        if (searchParams.get('create') === 'true') {
            setIsModalOpen(true);
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
    };

    const closeEditModal = () => {
        setIsEditModalOpen(false);
        setEditingTenant(null);
    };

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const slug = buildTenantSlug(formData.slug || formData.name);
            if (!slug) {
                throw new Error('El identificador tecnico del tenant es requerido.');
            }
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
                maxPosTerminals: products.pos_licenses,
                maxErpUsers: products.erp_users,
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
                slug: '',
                email: '',
                taxId: '',
                contactName: '',
                contactEmail: '',
                city: '',
                capturedByDistributorId: '',
                servicedByDistributorId: '',
                products: getDefaultTenantProducts(),
            });
            setIsSlugManuallyEdited(false);
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

    const openTerminalModal = (tenant: Tenant) => {
        setSelectedTenantForTerminals(tenant);
    };

    const closeTerminalModal = () => {
        setSelectedTenantForTerminals(null);
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

    return (
        <div className="space-y-6">
            <TenantsPageHeader onCreateTenant={() => setIsModalOpen(true)} />

            {provisionedCredentials ? (
                <TenantProvisionedCredentialsBanner
                    credentials={provisionedCredentials}
                    onDismiss={() => setProvisionedCredentials(null)}
                />
            ) : null}

            <TenantListPanel
                tenants={filteredTenants}
                loading={loading}
                searchTerm={searchTerm}
                onSearchTermChange={setSearchTerm}
                deletingTenantId={deletingTenantId}
                updatingStatusTenantId={updatingStatusTenantId}
                onOpenTerminals={openTerminalModal}
                onEdit={openEditModal}
                onActivateTrial={activateTrialTenant}
                onToggleStatus={toggleTenantStatus}
                onDelete={handleDeleteTenant}
            />

            {isModalOpen ? (
                <TenantCreateModal
                    isOpen={isModalOpen}
                    formData={formData}
                    setFormData={setFormData}
                    isSlugManuallyEdited={isSlugManuallyEdited}
                    setIsSlugManuallyEdited={setIsSlugManuallyEdited}
                    isSubmitting={isSubmitting}
                    distributors={distributors}
                    distributorsLoading={distributorsLoading}
                    onClose={closeCreateModal}
                    onSubmit={handleCreateTenant}
                />
            ) : null}

            {selectedTenantForTerminals ? (
                <TenantTerminalConsole
                    key={selectedTenantForTerminals.id}
                    tenant={selectedTenantForTerminals}
                    canReauthorizeTerminals={canReauthorizeTerminals}
                    onClose={closeTerminalModal}
                    onTenantsLoaded={setTenants}
                    onSelectTenant={setSelectedTenantForTerminals}
                />
            ) : null}

            {isEditModalOpen ? (
                <TenantEditModal
                    tenant={editingTenant}
                    formData={editFormData}
                    setFormData={setEditFormData}
                    isSubmitting={isEditSubmitting}
                    canViewErpModules={canViewErpModules}
                    activeModuleCounts={activeModuleCounts}
                    onClose={closeEditModal}
                    onSubmit={handleUpdateTenant}
                    onOpenModuleStore={setModuleStoreTenant}
                />
            ) : null}

            {moduleStoreTenant ? (
                <ErpModuleStoreModal
                    isOpen
                    tenantId={moduleStoreTenant.id}
                    tenantName={moduleStoreTenant.name}
                    canManage={canManageErpModules}
                    onClose={() => setModuleStoreTenant(null)}
                    onSaved={(activeModules) => setActiveModuleCounts((current) => ({
                        ...current,
                        [moduleStoreTenant.id]: activeModules,
                    }))}
                />
            ) : null}
        </div>
    );
};
