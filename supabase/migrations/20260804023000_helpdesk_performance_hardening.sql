begin;

create extension if not exists pg_trgm with schema extensions;

-- Keep the command-center bootstrap on the active queue and make message search indexable.
create index if not exists support_tickets_active_updated_idx
  on landlord.support_tickets (updated_at desc)
  where merged_into_ticket_id is null;

create index if not exists ticket_messages_message_trgm_idx
  on landlord.ticket_messages using gin (message extensions.gin_trgm_ops);

-- Index every HelpDesk foreign-key column used by joins, cascades, or cleanup jobs.
create index if not exists customer_improvement_requests_contact_id_idx
  on landlord.customer_improvement_requests (contact_id);
create index if not exists support_delivery_attempts_attempted_by_idx
  on landlord.support_delivery_attempts (attempted_by);
create index if not exists support_delivery_attempts_message_id_idx
  on landlord.support_delivery_attempts (message_id);
create index if not exists support_delivery_attempts_ticket_id_idx
  on landlord.support_delivery_attempts (ticket_id);
create index if not exists support_reply_templates_created_by_idx
  on landlord.support_reply_templates (created_by);
create index if not exists support_team_members_admin_user_id_idx
  on landlord.support_team_members (admin_user_id);
create index if not exists support_ticket_drafts_admin_user_id_idx
  on landlord.support_ticket_drafts (admin_user_id);
create index if not exists support_ticket_presence_admin_user_id_idx
  on landlord.support_ticket_presence (admin_user_id);
create index if not exists ticket_messages_created_by_idx
  on landlord.ticket_messages (created_by);
create index if not exists ticket_messages_reply_to_message_id_idx
  on landlord.ticket_messages (reply_to_message_id);

-- Return one preview per ticket instead of transferring every message to the Edge Function.
create or replace function landlord.helpdesk_latest_message_previews(p_ticket_ids uuid[])
returns table (
  ticket_id uuid,
  message text,
  sender_type text,
  visibility text,
  delivery_status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (ticket_message.ticket_id)
    ticket_message.ticket_id,
    ticket_message.message,
    ticket_message.sender_type::text,
    ticket_message.visibility,
    ticket_message.delivery_status,
    ticket_message.created_at
  from landlord.ticket_messages ticket_message
  where ticket_message.ticket_id = any (p_ticket_ids)
  order by ticket_message.ticket_id, ticket_message.created_at desc;
$$;

revoke all on function landlord.helpdesk_latest_message_previews(uuid[]) from public;
grant execute on function landlord.helpdesk_latest_message_previews(uuid[]) to service_role;

-- Cache auth.uid() once per statement so RLS does not re-evaluate it for every row.
drop policy if exists "Tenants can view their own tickets" on landlord.support_tickets;
create policy "Tenants can view their own tickets"
on landlord.support_tickets for select
to authenticated
using (tenant_id = (select auth.uid()));

drop policy if exists "Tenants can insert their own tickets" on landlord.support_tickets;
create policy "Tenants can insert their own tickets"
on landlord.support_tickets for insert
to authenticated
with check (tenant_id = (select auth.uid()));

drop policy if exists "Tenants can update their own tickets" on landlord.support_tickets;
create policy "Tenants can update their own tickets"
on landlord.support_tickets for update
to authenticated
using (tenant_id = (select auth.uid()))
with check (tenant_id = (select auth.uid()));

drop policy if exists "Tenants can view messages of their tickets" on landlord.ticket_messages;
create policy "Tenants can view messages of their tickets"
on landlord.ticket_messages for select
to authenticated
using (
  visibility = 'public'
  and exists (
    select 1
    from landlord.support_tickets ticket
    where ticket.id = ticket_messages.ticket_id
      and ticket.tenant_id = (select auth.uid())
  )
);

drop policy if exists "Tenants can insert messages to their tickets" on landlord.ticket_messages;
create policy "Tenants can insert messages to their tickets"
on landlord.ticket_messages for insert
to authenticated
with check (
  visibility = 'public'
  and sender_type = 'Client'
  and exists (
    select 1
    from landlord.support_tickets ticket
    where ticket.id = ticket_messages.ticket_id
      and ticket.tenant_id = (select auth.uid())
  )
);

commit;
