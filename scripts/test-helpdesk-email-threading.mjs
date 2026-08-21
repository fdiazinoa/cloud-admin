import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    extractExternalThreadKey,
    extractThreadReferenceMessageIds,
    extractTicketNumberFromSubject,
    normalizeThreadSubject,
    selectFallbackThreadCandidate,
} from '../supabase/functions/_shared/helpdesk-threading.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [inbound, outbound, delivery, migration] = await Promise.all([
    read('supabase/functions/process-inbound-email/index.ts'),
    read('supabase/functions/send-support-reply/index.ts'),
    read('supabase/functions/process-resend-delivery/index.ts'),
    read('supabase/migrations/20260821145706_helpdesk_email_thread_message_ids.sql'),
]);

assert.equal(extractTicketNumberFromSubject('Re: [Ticket #198] Error fiscal'), 198);
assert.equal(extractTicketNumberFromSubject('Re: solicitud #198'), 198);
assert.equal(extractTicketNumberFromSubject('Re: [## 28616 ##] Inconveniente Azul'), null);
assert.deepEqual(
    extractThreadReferenceMessageIds({
        'In-Reply-To': '<reply@example.com>',
        References: '<root@example.com> <reply@example.com>',
    }),
    ['<reply@example.com>', '<root@example.com>'],
);
assert.equal(extractExternalThreadKey('Re:[## 28616 ##] Inconveniente Azul'), 'external:28616');
assert.equal(extractExternalThreadKey('Re: Phoenix [#DF-DO-2026-003433]'), 'external:df-do-2026-003433');
assert.equal(normalizeThreadSubject('RE: Re: [Ticket #45]  Impresora fiscal '), 'impresora fiscal');

const candidates = [
    {
        id: 'oldest',
        subject: 'Nota de crédito cliente El Mayol -URGENTE',
        external_sender_email: 'cliente@example.com',
        created_at: '2026-08-18T10:00:00Z',
    },
    {
        id: 'duplicate',
        subject: 'Re: Nota de crédito cliente El Mayol -URGENTE',
        external_sender_email: 'cliente@example.com',
        created_at: '2026-08-18T11:00:00Z',
    },
];

assert.equal(
    selectFallbackThreadCandidate(candidates, 'Re: Nota de crédito cliente El Mayol -URGENTE', 'cliente@example.com')?.id,
    'oldest',
    'same-sender replies must return to the oldest matching ticket',
);
assert.equal(
    selectFallbackThreadCandidate(candidates, 'Nota de crédito cliente El Mayol -URGENTE', 'cliente@example.com'),
    null,
    'a new email without reply markers must not be merged by subject alone',
);
assert.equal(
    selectFallbackThreadCandidate(candidates, 'Re: Nota de crédito cliente El Mayol -URGENTE', 'otro@example.com'),
    null,
    'generic subjects from another sender must not be merged',
);

const externalCandidates = [
    {
        id: 'external-root',
        subject: '[## 28616 ##] Inconveniente Azul',
        external_sender_email: 'support@desk.example',
        created_at: '2026-08-17T10:00:00Z',
    },
];
assert.equal(
    selectFallbackThreadCandidate(
        externalCandidates,
        'Re: [## 28616 ##] Inconveniente Azul',
        'customer@example.com',
    )?.id,
    'external-root',
    'an explicit external thread key must survive participant changes',
);

for (const contract of [
    'getInboundEmailContent',
    'extractThreadReferenceMessageIds(receivedEmail.headers)',
    ".in('email_message_id', params.referenceMessageIds)",
    'selectFallbackThreadCandidate',
    'email_message_id: inboundMessageId',
]) {
    assert.ok(inbound.includes(contract), `Inbound threading contract missing: ${contract}`);
}
assert.match(outbound, /select\('email_message_id'\)/, 'outbound replies must load the persisted RFC thread');
assert.match(outbound, /buildThreadHeaders\(supportTicket, storedThreadMessageIds\)/);
assert.match(delivery, /message_id\?: string/);
assert.match(delivery, /email_message_id: emailMessageId/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS email_message_id TEXT/);
assert.match(migration, /ticket_messages_email_message_id_uidx/);
assert.match(migration, /technical_context->>'resend_message_id'/);

console.log('HelpDesk email threading contracts: OK');
