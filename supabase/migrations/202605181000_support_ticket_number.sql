-- Human-readable sequential ticket numbers for HelpDesk.

create sequence if not exists landlord.support_ticket_number_seq;

alter table landlord.support_tickets
  add column if not exists ticket_number bigint;

with ordered_tickets as (
  select
    id,
    row_number() over (order by created_at, id) as generated_ticket_number
  from landlord.support_tickets
  where ticket_number is null
)
update landlord.support_tickets as ticket
set ticket_number = ordered_tickets.generated_ticket_number
from ordered_tickets
where ticket.id = ordered_tickets.id;

select setval(
  'landlord.support_ticket_number_seq',
  greatest(
    coalesce((select max(ticket_number) from landlord.support_tickets), 0),
    0
  ),
  true
);

alter table landlord.support_tickets
  alter column ticket_number set default nextval('landlord.support_ticket_number_seq'),
  alter column ticket_number set not null;

create unique index if not exists support_tickets_ticket_number_uidx
  on landlord.support_tickets (ticket_number);
