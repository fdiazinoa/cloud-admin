import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [page, service, api, migration, app, layout, config, workflow] = await Promise.all([
    read('src/pages/KnowledgeCenter.tsx'),
    read('src/lib/knowledgeService.ts'),
    read('supabase/functions/knowledge-api/index.ts'),
    read('supabase/migrations/20260804183903_internal_knowledge_center.sql'),
    read('src/App.tsx'),
    read('src/components/Layout.tsx'),
    read('supabase/config.toml'),
    read('.github/workflows/deploy-supabase-functions.yml'),
]);

for (const product of ['msmall', 'clicpos', 'erp', 'cloud-admin']) {
    assert.ok(migration.includes(product), `Migration is missing product ${product}`);
    assert.ok(page.includes(product), `Knowledge UI is missing product ${product}`);
}
for (const action of ['list', 'create_link', 'create_upload_url', 'publish_upload', 'archive']) {
    assert.match(api, new RegExp(`action === '${action}'`), `Knowledge API is missing ${action}`);
}
for (const securityContract of ['requireHelpdeskActor', "eq('is_active', true)", 'createSignedUrl', 'createSignedUploadUrl']) {
    assert.ok(api.includes(securityContract), `Knowledge API is missing ${securityContract}`);
}
assert.ok(migration.includes('alter table landlord.knowledge_resources enable row level security'), 'Knowledge resources must use RLS');
assert.ok(migration.includes("'knowledge-center'"), 'Private knowledge storage bucket is missing');
assert.ok(service.includes('uploadToSignedUrl'), 'Knowledge upload must use a signed URL');
assert.ok(app.includes('path="conocimiento"'), 'Knowledge route is missing');
assert.ok(layout.includes('Manuales y videos'), 'Knowledge navigation item is missing');
assert.match(config, /\[functions\.knowledge-api\][\s\S]*?verify_jwt = true/, 'Knowledge API must verify JWT');
assert.ok(workflow.includes('functions deploy knowledge-api'), 'Knowledge API deployment is missing');

console.log('Knowledge Center contracts: OK');
