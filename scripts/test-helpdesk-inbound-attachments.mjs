import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [inbound, messages, commandCenter, migration, workflow] = await Promise.all([
    read('supabase/functions/process-inbound-email/index.ts'),
    read('supabase/functions/get-support-messages/index.ts'),
    read('src/pages/SupportCommandCenter.tsx'),
    read('supabase/migrations/20260810153000_expand_helpdesk_attachment_types.sql'),
    read('.github/workflows/deploy-supabase-functions.yml'),
]);

for (const contract of [
    'attachments?: ResendInboundAttachment[]',
    'storeInboundEmailAttachments',
    '/attachments/${encodeURIComponent(attachment.id)}',
    '.upload(path, fileBytes',
    "source: 'resend_inbound'",
    "status: 'stored'",
    'MAX_INBOUND_ATTACHMENT_BYTES',
    'MAX_INBOUND_ATTACHMENTS_TOTAL_BYTES',
    'sanitizeInboundAttachmentName',
]) {
    assert.ok(inbound.includes(contract), `Inbound attachment contract missing: ${contract}`);
}

assert.equal((inbound.match(/attachments: inboundAttachments/g) || []).length, 2, 'New and threaded inbound messages must persist attachments');
assert.ok(inbound.includes("'application/pdf'"), 'Inbound processor must accept PDF files');
assert.ok(inbound.includes("'text/plain'"), 'Inbound processor must accept text logs');
assert.equal(inbound.includes('download_url: downloadUrl'), false, 'Temporary Resend download URLs must never be persisted');
assert.ok(messages.includes('ALLOWED_ATTACHMENT_MIME_TYPES'), 'Message reader must sign supported document attachments');
assert.ok(messages.includes("'application/pdf'"), 'Message reader must sign PDF attachments');
assert.ok(commandCenter.includes("attachment.error || 'Archivo no disponible'"), 'Command Center must explain unavailable attachments');

for (const migrationContract of [
    "'helpdesk-attachments'",
    '10485760',
    "'application/pdf'",
    "'text/plain'",
    "'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
]) {
    assert.ok(migration.includes(migrationContract), `Attachment bucket migration missing: ${migrationContract}`);
}

assert.match(workflow, /functions deploy process-inbound-email[^\n]*--no-verify-jwt/, 'Inbound processor must remain in the deployment workflow');

console.log('HelpDesk inbound attachment contracts: OK');
