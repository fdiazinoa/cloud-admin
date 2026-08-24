import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const inbound = await readFile(new URL('../supabase/functions/process-inbound-email/index.ts', import.meta.url), 'utf8');

for (const contract of [
    ".select('id, ticket_number')",
    ".eq('ticket_id', existingTicket.data.id)",
    'orphanedTicket = existingTicket.data',
    'if (orphanedTicket)',
    'repaired: true',
    'upsert: true',
    "status: 'processed', error_message: null",
    "supabase.from('support_tickets').delete().eq('id', ticketId)",
    'supabase.storage.from(HELPDESK_ATTACHMENTS_BUCKET).remove(storedPaths)',
]) {
    assert.ok(inbound.includes(contract), `Blank-ticket recovery contract missing: ${contract}`);
}

const duplicateGuard = inbound.indexOf('if (existingTicket.data?.id)');
const contentFetch = inbound.indexOf('const receivedEmail = inbound.email_id');
const recovery = inbound.indexOf('if (orphanedTicket)');
const threadedLookup = inbound.indexOf('const threadedTicket = await findThreadedTicket');

assert.ok(duplicateGuard >= 0 && duplicateGuard < contentFetch, 'Duplicate detection must happen before downloading email content');
assert.ok(contentFetch < recovery && recovery < threadedLookup, 'An orphaned ticket must be repaired before generic thread matching');

console.log('HelpDesk blank-ticket recovery contracts: OK');
