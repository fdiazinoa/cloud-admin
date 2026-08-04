begin;

create table if not exists landlord.support_ticket_read_receipts (
  ticket_id uuid not null references landlord.support_tickets(id) on delete cascade,
  admin_user_id uuid not null references landlord.cloud_admin_users(id) on delete cascade,
  last_read_at timestamptz not null default timezone('utc'::text, now()),
  primary key (ticket_id, admin_user_id)
);

create index if not exists support_ticket_read_receipts_admin_user_id_idx
  on landlord.support_ticket_read_receipts (admin_user_id);

create index if not exists ticket_messages_client_ticket_created_idx
  on landlord.ticket_messages (ticket_id, created_at desc)
  where sender_type = 'Client';

alter table landlord.support_ticket_read_receipts enable row level security;

revoke all on landlord.support_ticket_read_receipts from anon, authenticated;
grant select, insert, update on landlord.support_ticket_read_receipts to service_role;

-- Existing tickets start as read for current agents so rollout does not create
-- a false backlog. Messages received after this migration become unread.
insert into landlord.support_ticket_read_receipts (ticket_id, admin_user_id, last_read_at)
select ticket.id, admin_user.id, timezone('utc'::text, now())
from landlord.support_tickets ticket
cross join landlord.cloud_admin_users admin_user
where admin_user.status = 'active'
on conflict (ticket_id, admin_user_id) do nothing;

create or replace function landlord.helpdesk_ticket_unread_states(
  p_ticket_ids uuid[],
  p_admin_user_id uuid
)
returns table (
  ticket_id uuid,
  last_customer_message_at timestamptz,
  last_read_at timestamptz,
  is_unread boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with requested_tickets as (
    select distinct requested.ticket_id
    from unnest(p_ticket_ids) as requested(ticket_id)
  ),
  last_customer_messages as (
    select
      message.ticket_id,
      max(message.created_at) as last_customer_message_at
    from landlord.ticket_messages message
    join requested_tickets requested on requested.ticket_id = message.ticket_id
    where message.sender_type = 'Client'
    group by message.ticket_id
  )
  select
    requested.ticket_id,
    customer_message.last_customer_message_at,
    receipt.last_read_at,
    coalesce(customer_message.last_customer_message_at > receipt.last_read_at, customer_message.last_customer_message_at is not null) as is_unread
  from requested_tickets requested
  left join last_customer_messages customer_message on customer_message.ticket_id = requested.ticket_id
  left join landlord.support_ticket_read_receipts receipt
    on receipt.ticket_id = requested.ticket_id
   and receipt.admin_user_id = p_admin_user_id;
$$;

revoke all on function landlord.helpdesk_ticket_unread_states(uuid[], uuid) from public;
grant execute on function landlord.helpdesk_ticket_unread_states(uuid[], uuid) to service_role;

-- Updating the ticket guarantees the existing realtime ticket subscription is
-- notified for both email and in-app customer messages.
create or replace function landlord.touch_support_ticket_on_customer_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_type = 'Client' then
    update landlord.support_tickets
    set updated_at = timezone('utc'::text, now())
    where id = new.ticket_id;
  end if;
  return new;
end;
$$;

revoke all on function landlord.touch_support_ticket_on_customer_message() from public;

drop trigger if exists touch_support_ticket_on_customer_message_trigger on landlord.ticket_messages;
create trigger touch_support_ticket_on_customer_message_trigger
after insert on landlord.ticket_messages
for each row
execute function landlord.touch_support_ticket_on_customer_message();

commit;
