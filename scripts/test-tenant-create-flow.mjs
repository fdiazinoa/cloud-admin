import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const flow = readFileSync('src/components/tenants/TenantCreateFlow.tsx', 'utf8');
const page = readFileSync('src/pages/Tenants.tsx', 'utf8');

// El alta vive en el panel central (propuesta "ficha de cliente"), sin modal.
assert.doesNotMatch(flow, /fixed inset-0/, 'El alta de tenant no debe usar overlay de modal');
assert.match(flow, /Empresa y acceso[\s\S]*Productos[\s\S]*Confirmar/, 'El alta debe guiarse en tres pasos');
assert.match(flow, /<TenantProductsEditor/, 'El alta debe reutilizar el editor de productos inline');
assert.match(flow, /<TenantProductSummary products=\{form\.products\} \/>/, 'La revisión debe mostrar el resumen de productos');
assert.match(flow, /onSubmit\(form\)/, 'La confirmación debe delegar el aprovisionamiento en la página');

// Campos obligatorios del aprovisionamiento.
for (const label of ['Nombre comercial', 'Identificador técnico', 'Email de acceso', 'Persona de contacto', 'Mail de contacto', 'Ciudad']) {
    assert.ok(flow.includes(label), `El alta debe pedir ${label}`);
}
assert.match(flow, /buildTenantSlug\(name\)/, 'El identificador técnico debe derivarse del nombre');
assert.match(flow, /Distribuidor que captó[\s\S]*Distribuidor que da servicio/, 'El alta debe permitir asignar distribuidores');

// La página conserva el contrato de aprovisionamiento.
assert.match(page, /tenantService\.createTenant\(/, 'La página debe crear el tenant vía tenantService');
assert.match(page, /updateTenantTaxId\(tenantId, form\.taxId\)/, 'El RNC opcional debe persistirse tras crear');
assert.match(page, /setProvisionedCredentials\(\{ email: form\.email\.trim\(\)\.toLowerCase\(\), tempPassword \}\)/, 'Debe exponer credenciales temporales');
assert.match(page, /plan: 'TRIAL'/, 'El alta debe seguir creando el tenant en plan TRIAL');

console.log('tenant create flow checks passed');
