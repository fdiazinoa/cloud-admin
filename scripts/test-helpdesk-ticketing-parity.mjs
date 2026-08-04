import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [component, service, api, deliveryWebhook, migration, optimizationMigration, unreadMigration, config, workflow] = await Promise.all([
    read('src/pages/SupportCommandCenter.tsx'),
    read('src/lib/helpdeskService.ts'),
    read('supabase/functions/helpdesk-api/index.ts'),
    read('supabase/functions/process-resend-delivery/index.ts'),
    read('supabase/migrations/20260804005059_helpdesk_ticketing_parity.sql'),
    read('supabase/migrations/20260804023000_helpdesk_performance_hardening.sql'),
    read('supabase/migrations/20260804133607_helpdesk_ticket_read_receipts.sql'),
    read('supabase/config.toml'),
    read('.github/workflows/deploy-supabase-functions.yml'),
]);

for (const forbidden of ['supabaseAdmin', 'VITE_SUPABASE_SERVICE_ROLE_KEY', 'supabaseServiceRoleKey']) {
    assert.equal(component.includes(forbidden), false, `HelpDesk component must not reference ${forbidden}`);
    assert.equal(service.includes(forbidden), false, `HelpDesk service must not reference ${forbidden}`);
}

for (const action of [
    'bootstrap',
    'update_ticket',
    'bulk_update',
    'add_note',
    'save_draft',
    'load_workspace',
    'heartbeat',
    'mark_read',
    'merge_tickets',
    'create_upload_urls',
]) {
    assert.match(api, new RegExp(`action === '${action}'`), `Missing secure action: ${action}`);
}

for (const capability of [
    'support_teams',
    'support_reply_templates',
    'support_ticket_drafts',
    'support_ticket_presence',
    'support_delivery_attempts',
    'search_vector',
    'cloud_admin_has_permission',
]) {
    assert.ok(migration.includes(capability), `Migration is missing ${capability}`);
}
for (const optimization of [
    'helpdesk_latest_message_previews',
    'support_tickets_active_updated_idx',
    'ticket_messages_message_trgm_idx',
    '(select auth.uid())',
]) {
    assert.ok(optimizationMigration.includes(optimization), `Optimization migration is missing ${optimization}`);
}
assert.ok(component.includes('support_tickets_incremental_secure'), 'HelpDesk must use incremental ticket refreshes');
assert.equal(component.includes("table: 'support_contacts'"), false, 'HelpDesk must not subscribe globally to support contacts');
assert.equal(component.includes("table: 'ai_ticket_insights'"), false, 'HelpDesk must not subscribe globally to AI insights');
assert.ok(api.includes("action === 'ticket_snapshot'"), 'HelpDesk API must expose point ticket refreshes');
for (const unreadContract of [
    'support_ticket_read_receipts',
    'helpdesk_ticket_unread_states',
    'ticket_messages_client_ticket_created_idx',
    'touch_support_ticket_on_customer_message_trigger',
]) {
    assert.ok(unreadMigration.includes(unreadContract), `Unread migration is missing ${unreadContract}`);
}
assert.ok(service.includes('markHelpdeskTicketRead'), 'HelpDesk service must expose mark-as-read');
assert.ok(component.includes('sin leer'), 'HelpDesk UI must show the unread count');
assert.ok(component.includes('Nuevo'), 'HelpDesk UI must highlight unread tickets');
assert.match(migration, /Tenants can view messages[\s\S]*?visibility = 'public'/, 'Private notes must be hidden from tenant message reads');
assert.match(migration, /Tenants can insert messages[\s\S]*?visibility = 'public'[\s\S]*?sender_type = 'Client'/, 'Tenant message inserts must remain public client messages');

for (const functionName of ['helpdesk-api', 'send-support-reply', 'get-support-messages', 'generate-support-draft', 'resolve-support-ticket']) {
    const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(config, new RegExp(`\\[functions\\.${escaped}\\][\\s\\S]*?verify_jwt = true`), `${functionName} must verify JWTs`);
    assert.match(workflow, new RegExp(`functions deploy ${escaped}(?![^\\n]*--no-verify-jwt)`), `${functionName} deployment must keep JWT verification`);
}
assert.match(config, /\[functions\.process-resend-delivery\][\s\S]*?verify_jwt = false/, 'Signed Resend webhook must accept external requests');
assert.match(workflow, /functions deploy process-resend-delivery[^\n]*--no-verify-jwt/, 'Resend delivery webhook deployment must disable platform JWT verification');
for (const deploymentContract of [
    'supabase/migrations/**',
    'SUPABASE_DB_PASSWORD',
    'supabase db push --linked',
    'Validate Resend webhook secret',
]) {
    assert.ok(workflow.includes(deploymentContract), `Production deployment is missing ${deploymentContract}`);
}
for (const contract of ['svix-id', 'svix-timestamp', 'svix-signature', 'constantTimeEqual', 'support_webhook_events', 'deliveryRanks']) {
    assert.ok(deliveryWebhook.includes(contract), `Delivery webhook is missing ${contract}`);
}

for (const uiFeature of ['Nota interna', 'Responder a todos', 'Fusionar duplicados', 'Plantilla…', 'Borrador guardado', 'Reintentar']) {
    assert.ok(component.includes(uiFeature), `HelpDesk UI is missing ${uiFeature}`);
}

console.log('HelpDesk ticketing parity contracts: OK');
