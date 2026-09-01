import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [page, service, api, migration, app, layout, config, workflow] = await Promise.all([
    read('src/pages/InternalRequests.tsx'),
    read('src/lib/internalRequestService.ts'),
    read('supabase/functions/internal-requests-api/index.ts'),
    read('supabase/migrations/20260804184329_internal_work_requests.sql'),
    read('src/App.tsx'),
    read('src/components/Layout.tsx'),
    read('supabase/config.toml'),
    read('.github/workflows/deploy-supabase-functions.yml'),
]);

for (const field of ['request_type', 'product', 'priority', 'status', 'reported_by', 'assigned_to']) {
    assert.ok(migration.includes(field), `Internal requests migration is missing ${field}`);
}
for (const action of ['list', 'create', 'update']) {
    assert.match(api, new RegExp(`action === '${action}'`), `Internal requests API is missing ${action}`);
}
assert.ok(api.includes("requireHelpdeskActor(request, 'improvements')"), 'Internal requests API must require improvements permission');
assert.ok(service.includes("supabase.functions.invoke('internal-requests-api'"), 'Internal requests service must use the secure API');
for (const uiContract of ['Nueva solicitud', 'Problemas y mejoras detectadas', 'Por verificar', 'Responsable']) {
    assert.ok(page.includes(uiContract), `Internal requests UI is missing ${uiContract}`);
}
assert.match(page, /<table[\s\S]*?<thead[\s\S]*?<tbody/, 'Internal requests must render as a compact list table');
assert.ok(page.includes('role="dialog"'), 'Internal request creation must use a modal dialog');
assert.ok(page.includes('aria-label={`Estado de ${request.title}`}'), 'Status must remain editable from the list');
assert.ok(page.includes('aria-label={`Responsable de ${request.title}`}'), 'Assignee must remain editable from the list');
assert.ok(page.includes('aria-expanded={isExpanded}'), 'Each request must expose an accessible detail toggle');
assert.ok(page.includes('Descripción completa'), 'Expanded requests must label the full description');
assert.ok(page.includes('whitespace-pre-wrap break-words'), 'Expanded descriptions must preserve all content without truncation');
assert.ok(app.includes('path="solicitudes-internas"'), 'Internal requests route is missing');
assert.ok(layout.includes('Solicitudes internas'), 'Internal requests navigation is missing');
assert.match(config, /\[functions\.internal-requests-api\][\s\S]*?verify_jwt = true/, 'Internal requests API must verify JWT');
assert.ok(workflow.includes('functions deploy internal-requests-api'), 'Internal requests deployment is missing');

console.log('Internal requests contracts: OK');
