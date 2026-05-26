import assert from 'node:assert/strict';

function normalizeProducts(products) {
  const normalized = {
    pos: Boolean(products.pos),
    erp: Boolean(products.erp),
    backup: Boolean(products.backup),
    offlineMode: Boolean(products.offlineMode),
  };

  if (normalized.erp) {
    return { ...normalized, backup: true, offlineMode: false };
  }

  if (normalized.pos && normalized.offlineMode) {
    return { ...normalized, backup: false };
  }

  if (normalized.pos) {
    return { ...normalized, backup: true };
  }

  return { ...normalized, offlineMode: false };
}

function deriveSemantics(products) {
  const normalized = normalizeProducts(products);

  if (normalized.erp) {
    return {
      contractedProduct: 'POS_ERP',
      posVariant: 'POS_ERP',
      cloudChannel: 'ERP_ACTIVE',
      dataMaster: 'ERP',
      cloudSyncEnabled: true,
      erpCoreEnabled: true,
      erpUiEnabled: true,
      customerErpAccess: true,
      backupEnabled: true,
      lifecycleStatus: 'ERP_ACTIVE',
      provisioningStatus: 'ERP_ACTIVE_REQUIRED',
    };
  }

  if (normalized.pos && normalized.offlineMode) {
    return {
      contractedProduct: 'POS_ONLY',
      posVariant: 'POS_ONLY_OFFLINE',
      cloudChannel: 'NONE',
      dataMaster: 'POS',
      cloudSyncEnabled: false,
      erpCoreEnabled: false,
      erpUiEnabled: false,
      customerErpAccess: false,
      backupEnabled: false,
      lifecycleStatus: 'CLOUD_DISABLED',
      provisioningStatus: 'PENDING',
    };
  }

  if (normalized.pos) {
    return {
      contractedProduct: 'POS_ONLY',
      posVariant: 'POS_ONLY_STANDARD',
      cloudChannel: 'POS_CLOUD_STAGING',
      dataMaster: 'POS',
      cloudSyncEnabled: true,
      erpCoreEnabled: true,
      erpUiEnabled: false,
      customerErpAccess: false,
      backupEnabled: true,
      lifecycleStatus: 'CLOUD_STAGING',
      provisioningStatus: 'CLOUD_STAGING_REQUIRED',
    };
  }

  throw new Error('At least one product is required');
}

function migratePosOnlyNone(row) {
  const explicitOffline = row.offline_mode === true
    || row.explicit_offline === true
    || row.pos_variant === 'POS_ONLY_OFFLINE';

  if (row.contracted_product === 'POS_ONLY' && row.cloud_channel === 'NONE' && !explicitOffline) {
    return {
      ...row,
      pos_variant: 'POS_ONLY_STANDARD',
      cloud_channel: 'POS_CLOUD_STAGING',
      cloud_sync_enabled: true,
      erp_core_enabled: true,
      erp_ui_enabled: false,
      customer_erp_access: false,
      backup_enabled: true,
      data_master: 'POS',
      lifecycle_status: 'CLOUD_STAGING',
      provisioning_status: 'CLOUD_STAGING_REQUIRED',
    };
  }

  return row;
}

assert.deepEqual(deriveSemantics({ pos: true, erp: false, backup: false }), {
  contractedProduct: 'POS_ONLY',
  posVariant: 'POS_ONLY_STANDARD',
  cloudChannel: 'POS_CLOUD_STAGING',
  dataMaster: 'POS',
  cloudSyncEnabled: true,
  erpCoreEnabled: true,
  erpUiEnabled: false,
  customerErpAccess: false,
  backupEnabled: true,
  lifecycleStatus: 'CLOUD_STAGING',
  provisioningStatus: 'CLOUD_STAGING_REQUIRED',
});

assert.deepEqual(deriveSemantics({ pos: true, erp: false, backup: false, offlineMode: true }), {
  contractedProduct: 'POS_ONLY',
  posVariant: 'POS_ONLY_OFFLINE',
  cloudChannel: 'NONE',
  dataMaster: 'POS',
  cloudSyncEnabled: false,
  erpCoreEnabled: false,
  erpUiEnabled: false,
  customerErpAccess: false,
  backupEnabled: false,
  lifecycleStatus: 'CLOUD_DISABLED',
  provisioningStatus: 'PENDING',
});

assert.deepEqual(deriveSemantics({ pos: true, erp: true, backup: true }), {
  contractedProduct: 'POS_ERP',
  posVariant: 'POS_ERP',
  cloudChannel: 'ERP_ACTIVE',
  dataMaster: 'ERP',
  cloudSyncEnabled: true,
  erpCoreEnabled: true,
  erpUiEnabled: true,
  customerErpAccess: true,
  backupEnabled: true,
  lifecycleStatus: 'ERP_ACTIVE',
  provisioningStatus: 'ERP_ACTIVE_REQUIRED',
});

assert.equal(
  migratePosOnlyNone({
    contracted_product: 'POS_ONLY',
    cloud_channel: 'NONE',
    offline_mode: false,
    explicit_offline: false,
  }).cloud_channel,
  'POS_CLOUD_STAGING',
);

assert.equal(
  migratePosOnlyNone({
    contracted_product: 'POS_ONLY',
    cloud_channel: 'NONE',
    offline_mode: true,
    explicit_offline: true,
    pos_variant: 'POS_ONLY_OFFLINE',
  }).cloud_channel,
  'NONE',
);

console.log('tenant semantics checks passed');
