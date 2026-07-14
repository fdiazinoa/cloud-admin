import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tenantResolver = readFileSync('api/lib/resolve-landlord-tenant.ts', 'utf8');
const tenantAuthMetadata = readFileSync('src/lib/tenantAuthMetadata.ts', 'utf8');

assert.match(
    tenantResolver,
    /getAppMetadataTenantId[\s\S]*app_metadata[\s\S]*cloud_admin_tenant_id/,
    'resolver must authorize landlord tenant from app_metadata/cloud_admin_tenant_id, not user_metadata tenant_id',
);

assert.match(
    tenantResolver,
    /getUserMetadataErpTenantId[\s\S]*metadata\?\.erp_tenant_id[\s\S]*metadata\?\.tenant_id/,
    'resolver may read user_metadata.tenant_id only as legacy ERP tenant metadata',
);

assert.match(
    tenantResolver,
    /erp tenant is not mapped to a landlord tenant/,
    'ERP tenant ids without config.cloudAdminTenantId must be rejected instead of falling back by email',
);

assert.match(
    tenantResolver,
    /resolved landlord tenant from erp_tenants cloudAdminTenantId/,
    'ERP tenant ids must resolve through the explicit cloudAdminTenantId mapping',
);

assert.doesNotMatch(
    tenantResolver,
    /resolved landlord tenant by user email after erp tenant match/,
    'resolver must not rescue an ERP tenant mismatch through user email fallback',
);

assert.match(
    tenantResolver,
    /Authenticated email is associated with multiple landlord tenants; explicit tenant mapping required/,
    'email-based fallback must reject ambiguous multi-tenant email matches',
);

assert.match(
    tenantResolver,
    /userEmail === normalizeEmail\(bodyEmail\)[\s\S]*normalizeEmail\(bodyEmail\) === normalizeEmail\(tenant\.email\)/,
    'body email must not authorize a tenant unless it matches both authenticated user and tenant email',
);

assert.match(
    tenantResolver,
    /user_metadata:[\s\S]*tenant_id: userTenantId[\s\S]*cloud_admin_tenant_id: landlordTenantId[\s\S]*erp_tenant_id/,
    'metadata repair must keep activation tenant_id separate from cloud_admin_tenant_id and erp_tenant_id',
);

assert.match(
    tenantResolver,
    /app_metadata:[\s\S]*tenant_id: landlordTenantId[\s\S]*cloud_admin_tenant_id: landlordTenantId[\s\S]*erp_tenant_id/,
    'app_metadata must keep the landlord tenant id as authoritative backend authorization metadata',
);

assert.match(
    tenantAuthMetadata,
    /const activationTenantId = erpTenantId \|\| tenantId/,
    'frontend metadata helper must preserve legacy activation tenant_id compatibility with ERP tenant ids',
);

console.log('activation tenant resolution static checks passed');
