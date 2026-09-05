import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [page, service, api, migration, consolidation, app, layout, config, workflow, helpdeskApi, inboundEmail] = await Promise.all([
    read('src/pages/InternalRequests.tsx'),
    read('src/lib/internalRequestService.ts'),
    read('supabase/functions/internal-requests-api/index.ts'),
    read('supabase/migrations/20260804184329_internal_work_requests.sql'),
    read('supabase/migrations/20260905003216_consolidate_customer_improvements_into_requests.sql'),
    read('src/App.tsx'),
    read('src/components/Layout.tsx'),
    read('supabase/config.toml'),
    read('.github/workflows/deploy-supabase-functions.yml'),
    read('supabase/functions/helpdesk-api/index.ts'),
    read('supabase/functions/process-inbound-email/index.ts'),
]);

for (const field of ['request_type', 'product', 'priority', 'status', 'reported_by', 'assigned_to']) {
    assert.ok(migration.includes(field), `Internal requests migration is missing ${field}`);
}
for (const action of ['list', 'create', 'update']) {
    assert.match(api, new RegExp(`action === '${action}'`), `Internal requests API is missing ${action}`);
}
assert.ok(api.includes("action === 'list' ? 'internal_requests_view' : 'internal_requests_manage'"), 'Internal requests API must separate view and manage permissions');
assert.ok(service.includes("supabase.functions.invoke('internal-requests-api'"), 'Internal requests service must use the secure API');
for (const uiContract of ['Nueva solicitud', 'Gestión unificada', 'Por verificar', 'Responsable', 'De clientes', 'Detectadas por IA', 'Notas de decisión']) {
    assert.ok(page.includes(uiContract), `Internal requests UI is missing ${uiContract}`);
}
assert.match(page, /<table[\s\S]*?<thead[\s\S]*?<tbody/, 'Internal requests must render as a compact list table');
assert.ok(page.includes('role="dialog"'), 'Internal request creation must use a modal dialog');
assert.ok(page.includes('aria-label={`Estado de ${request.title}`}'), 'Status must remain editable from the list');
assert.ok(page.includes('aria-label={`Responsable de ${request.title}`}'), 'Assignee must remain editable from the list');
assert.ok(page.includes('aria-expanded={isExpanded}'), 'Each request must expose an accessible detail toggle');
assert.ok(page.includes('Descripción completa'), 'Expanded requests must label the full description');
assert.ok(page.includes('whitespace-pre-wrap break-words'), 'Expanded descriptions must preserve all content without truncation');
assert.ok(app.includes('path="solicitudes"'), 'Unified requests route is missing');
assert.ok(app.includes("canManage={allowed('internal_requests_manage')}"), 'Unified requests UI must receive manage permission');
assert.ok(app.includes('path="mejoras" element={<Navigate to="/solicitudes" replace />}'), 'Legacy improvements route must redirect');
assert.ok(app.includes('path="solicitudes-internas" element={<Navigate to="/solicitudes" replace />}'), 'Legacy internal requests route must redirect');
assert.ok(layout.includes("path: '/solicitudes', label: 'Solicitudes'"), 'Unified requests navigation is missing');
assert.ok(!layout.includes("path: '/mejoras'"), 'Redundant improvements navigation must be removed');
for (const field of ['origin', 'ticket_id', 'tenant_id', 'contact_id', 'affected_module', 'ai_summary', 'customer_impact', 'decision_notes', 'legacy_customer_improvement_id']) {
    assert.ok(consolidation.includes(field), `Consolidation migration is missing ${field}`);
}
assert.ok(consolidation.includes("when 'Aceptada' then 'approved'"), 'Accepted improvements must preserve their workflow state');
assert.ok(consolidation.includes('sync_legacy_customer_improvement_to_request'), 'Legacy writes need a temporary compatibility bridge');
assert.ok(consolidation.includes('notify_customer_request_completed'), 'Completed customer improvements must notify the linked ticket');
assert.ok(helpdeskApi.includes(".from('internal_work_requests')"), 'Manual HelpDesk improvements must use unified requests');
assert.ok(inboundEmail.includes(".from('internal_work_requests')"), 'AI/email improvements must use unified requests');
assert.ok(!helpdeskApi.includes(".from('customer_improvement_requests')"), 'HelpDesk must stop writing to the legacy improvement table');
assert.ok(!inboundEmail.includes(".from('customer_improvement_requests')"), 'Inbound email must stop writing to the legacy improvement table');
assert.match(config, /\[functions\.internal-requests-api\][\s\S]*?verify_jwt = true/, 'Internal requests API must verify JWT');
assert.ok(workflow.includes('functions deploy internal-requests-api'), 'Internal requests deployment is missing');

console.log('Internal requests contracts: OK');
