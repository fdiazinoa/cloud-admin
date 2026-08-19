import assert from 'node:assert/strict';
import {
    getHelpdeskCompanyName,
    getHelpdeskLastActivityAt,
    sortHelpdeskTickets,
    UNKNOWN_HELPDESK_COMPANY,
} from '../src/lib/helpdeskTicketOrganization.ts';

const tickets = [
    {
        id: 'ticket-1',
        ticket_number: 105,
        tenant_name: 'Sucursal Centro',
        contact: { company_name: 'Café Central' },
        priority: 'Media',
        created_at: '2026-08-17T10:00:00.000Z',
        updated_at: '2026-08-18T10:00:00.000Z',
    },
    {
        id: 'ticket-2',
        ticket_number: 166,
        tenant_name: 'Marscand',
        contact: null,
        priority: 'Critica',
        created_at: '2026-08-19T09:00:00.000Z',
        updated_at: '2026-08-19T09:15:00.000Z',
    },
    {
        id: 'ticket-3',
        ticket_number: null,
        tenant_name: 'Sin tenant asignado',
        contact: null,
        priority: 'Alta',
        created_at: '2026-08-16T08:00:00.000Z',
        updated_at: null,
    },
];

assert.equal(getHelpdeskCompanyName(tickets[0]), 'Café Central', 'Contact company should take precedence over the establishment');
assert.equal(getHelpdeskCompanyName(tickets[1]), 'Marscand', 'Establishment should be the company fallback');
assert.equal(getHelpdeskCompanyName(tickets[2]), UNKNOWN_HELPDESK_COMPANY, 'Unassigned tickets need an explicit company fallback');
assert.equal(getHelpdeskLastActivityAt(tickets[0], '2026-08-19T12:00:00.000Z'), '2026-08-19T12:00:00.000Z', 'Message preview should represent the latest visible activity');

const previewActivity = new Map([
    ['ticket-1', '2026-08-20T10:00:00.000Z'],
]);
const idsFor = (sortKey) => sortHelpdeskTickets(tickets, sortKey, (ticketId) => previewActivity.get(ticketId)).map((ticket) => ticket.id);

assert.deepEqual(idsFor('activity_desc'), ['ticket-1', 'ticket-2', 'ticket-3']);
assert.deepEqual(idsFor('ticket_desc'), ['ticket-2', 'ticket-1', 'ticket-3']);
assert.deepEqual(idsFor('ticket_asc'), ['ticket-1', 'ticket-2', 'ticket-3']);
assert.deepEqual(idsFor('created_desc'), ['ticket-2', 'ticket-1', 'ticket-3']);
assert.deepEqual(idsFor('created_asc'), ['ticket-3', 'ticket-1', 'ticket-2']);
assert.deepEqual(idsFor('company_asc'), ['ticket-1', 'ticket-2', 'ticket-3']);
assert.deepEqual(idsFor('company_desc'), ['ticket-2', 'ticket-1', 'ticket-3']);
assert.deepEqual(idsFor('priority_desc'), ['ticket-2', 'ticket-3', 'ticket-1']);

console.log('HelpDesk ticket organization contracts: OK');
