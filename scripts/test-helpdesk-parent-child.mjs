import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [component, service, api, migration] = await Promise.all([
    read('src/pages/SupportCommandCenter.tsx'),
    read('src/lib/helpdeskService.ts'),
    read('supabase/functions/helpdesk-api/index.ts'),
    read('supabase/migrations/20261016000001_helpdesk_parent_child_tickets.sql'),
]);

assert.ok(migration.includes('parent_ticket_id'), 'Migration must add parent_ticket_id');
assert.ok(migration.includes('references landlord.support_tickets'), 'Migration must self-reference support_tickets');

for (const action of ['link_parent', 'unlink_parent', 'split_ticket']) {
    assert.match(api, new RegExp(`action === '${action}'`), `Backend is missing action ${action}`);
}
assert.ok(api.includes('parent_ticket:support_tickets!support_tickets_parent_ticket_id_fkey'), 'Backend must select the parent ticket relation');
assert.ok(api.includes('parent_ticket_id'), 'Backend must expose parent_ticket_id');

for (const fn of ['linkHelpdeskTicketParent', 'unlinkHelpdeskTicketParent', 'splitHelpdeskTicket']) {
    assert.ok(service.includes(fn), `Service is missing ${fn}`);
}
for (const label of ['Cuenta', 'Relación', 'Dividir ticket', 'Vincular a ticket padre']) {
    assert.ok(component.includes(label), `UI is missing '${label}'`);
}

console.log('HelpDesk parent/child & split contracts: OK');
