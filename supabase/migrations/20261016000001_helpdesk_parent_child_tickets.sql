-- Helpdesk: tickets padre/hijo (modelo Zoho Desk).
-- Permite vincular un ticket como hijo de otro (parent_ticket_id) y dividir
-- (split) un caso creando un ticket hijo. La fusión ya existente
-- (merged_into_ticket_id) no se modifica.

alter table if exists landlord.support_tickets
  add column if not exists parent_ticket_id uuid references landlord.support_tickets(id) on delete set null;

create index if not exists support_tickets_parent_ticket_id_idx
  on landlord.support_tickets (parent_ticket_id)
  where parent_ticket_id is not null;
