import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [api, auth, service, component, inbound, migration] = await Promise.all([
    read('supabase/functions/helpdesk-api/index.ts'),
    read('supabase/functions/_shared/helpdesk-auth.ts'),
    read('src/lib/helpdeskService.ts'),
    read('src/pages/SupportCommandCenter.tsx'),
    read('supabase/functions/process-inbound-email/index.ts'),
    read('supabase/migrations/20260814120000_helpdesk_spam_delete_audit.sql'),
]);

for (const action of ['mark_spam', 'restore_spam', 'delete_tickets']) {
    assert.match(api, new RegExp(`action === '${action}'`), `Missing secure HelpDesk action: ${action}`);
}
assert.match(api, /hasHelpdeskPermission\(actor\.permissions, 'support_manage'\)/, 'Destructive actions must require support_manage');
assert.match(auth, /support_manage: 'support'/, 'Legacy support profiles must retain HelpDesk management access');
assert.match(auth, /typeof permissions\[permission\] === 'boolean'\) return false/, 'Explicit granular permission denials must override the legacy fallback');
assert.match(api, /assertHelpdeskTicketAccess\(supabase, actor, ticketIds\)/, 'Spam and delete actions must enforce department access');
assert.match(api, /support_ticket_deletion_audit/, 'Ticket deletion must create an audit record');
assert.match(api, /\.from\('support_tickets'\)\s*\.delete\(\)/, 'Ticket deletion must run through the secure API');
assert.match(api, /storage\.from\('helpdesk-attachments'\)\.remove/, 'Ticket deletion must clean stored attachments');
assert.match(api, /path\.startsWith\(`\$\{ticketId\}\/`\).*path\.startsWith\(`outbound\/\$\{ticketId\}\/`\)/, 'Attachment cleanup must stay scoped to the deleted ticket');

for (const serviceMethod of ['markHelpdeskTicketsAsSpam', 'restoreHelpdeskSpamTickets', 'deleteHelpdeskTickets']) {
    assert.ok(service.includes(serviceMethod), `HelpDesk service is missing ${serviceMethod}`);
}
for (const uiContract of ['Bandeja activa', 'Marcar como spam', 'Restaurar: no es spam', 'Eliminar ticket', 'Eliminar permanentemente']) {
    assert.ok(component.includes(uiContract), `HelpDesk UI is missing: ${uiContract}`);
}
assert.match(component, /mailboxFilter === 'spam'/, 'Spam must be separated from the active inbox');
assert.match(component, /deleteReason\.trim\(\)\.length < 3/, 'Permanent deletion must require a reason');
assert.match(inbound, /assignment_status === 'spam'/, 'Spam threads must not trigger HelpDesk automation');
assert.match(inbound, /reason: 'ticket_marked_as_spam'/, 'Ignored spam replies must report the policy reason');

assert.match(migration, /enable row level security/, 'Deletion audit must enable RLS');
assert.match(migration, /revoke all on landlord\.support_ticket_deletion_audit from anon, authenticated/, 'Deletion audit must be private');
assert.match(migration, /outcome in \('pending', 'deleted', 'failed'\)/, 'Deletion audit must track completion state');

console.log('HelpDesk spam and deletion contracts: OK');
