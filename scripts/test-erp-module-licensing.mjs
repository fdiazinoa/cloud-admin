import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cascadeErpModuleSelection } from '../src/lib/erpModuleLicensingRules.ts';

const dependencies = [{ module_code: 'payroll', required_module_code: 'hr' }];
const initial = {
    hr: { enabled: false, licensedQuantity: 25 },
    payroll: { enabled: false, licensedQuantity: 25 },
    accounting: { enabled: true, licensedQuantity: 1 },
};

const payrollEnabled = cascadeErpModuleSelection(initial, dependencies, 'payroll', true);
assert.equal(payrollEnabled.draft.payroll.enabled, true);
assert.equal(payrollEnabled.draft.hr.enabled, true, 'enabling Payroll must also enable HR');
assert.equal(payrollEnabled.draft.accounting.enabled, true);
assert.deepEqual(new Set(payrollEnabled.changedCodes), new Set(['payroll', 'hr']));

const hrDisabled = cascadeErpModuleSelection(payrollEnabled.draft, dependencies, 'hr', false);
assert.equal(hrDisabled.draft.hr.enabled, false);
assert.equal(hrDisabled.draft.payroll.enabled, false, 'disabling HR must also disable Payroll');

const [migration, edgeFunction, component, service, tenantsPage, app] = await Promise.all([
    readFile(new URL('../supabase/migrations/20260815134742_erp_module_licensing.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/module-licensing-api/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ErpModuleStoreModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/erpModuleLicensing.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Tenants.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
]);

for (const moduleCode of ['hr', 'payroll', 'accounting', 'shopify', 'uber']) {
    assert.match(migration, new RegExp(`\\('${moduleCode}'`), `catalog must seed ${moduleCode}`);
}
assert.match(migration, /values \('payroll', 'hr'\)/);
assert.match(migration, /alter table landlord\.tenant_erp_module_entitlements enable row level security/i);
assert.match(migration, /revoke all on landlord\.tenant_erp_module_entitlements from anon, authenticated/i);
assert.match(migration, /security invoker/g);
assert.doesNotMatch(migration, /security definer/i);
assert.match(migration, /licenses_view/);
assert.match(migration, /licenses_manage/);
assert.match(migration, /ERP_REQUIRED_FOR_MODULES/);
assert.match(migration, /ERP_MODULE_DEPENDENCY_REQUIRED/);
assert.match(migration, /acknowledge_tenant_erp_modules/);

assert.match(edgeFunction, /requireCloudAdminActor\(request, action === 'save' \? 'licenses_manage' : 'licenses_view'\)/);
assert.match(edgeFunction, /apply_tenant_erp_module_entitlements/);
assert.match(edgeFunction, /cloud_admin_audit_log/);
assert.doesNotMatch(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY.*Response|service_role.*json/i);

assert.match(component, /Módulos y licencias ERP/);
assert.match(component, /Pendiente ERP/);
assert.match(component, /cascadeErpModuleSelection/);
assert.match(service, /module-licensing-api/);
assert.match(tenantsPage, /Abrir módulos ERP/);
assert.match(tenantsPage, /canManageErpModules/);
assert.match(app, /<Tenants permissions=\{permissions\}/);

console.log('ERP module licensing regression: ok');
