-- Notify the original HelpDesk ticket when a requested improvement is implemented.

create or replace function landlord.notify_customer_improvement_implemented()
returns trigger as $$
declare
  ticket_record record;
  ticket_label text;
  notification_message text;
begin
  if new.status <> 'Implementada' then
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.ticket_id is null then
    return new;
  end if;

  select id, ticket_number, subject
    into ticket_record
  from landlord.support_tickets
  where id = new.ticket_id;

  if not found then
    return new;
  end if;

  if exists (
    select 1
    from landlord.ticket_messages existing
    where existing.ticket_id = new.ticket_id
      and existing.attachments->>'channel' = 'customer_improvement'
      and existing.attachments->>'event' = 'customer_improvement_implemented'
      and existing.attachments->>'improvement_request_id' = new.id::text
  ) then
    return new;
  end if;

  ticket_label := '#' || coalesce(ticket_record.ticket_number::text, left(new.ticket_id::text, 8));
  notification_message := 'La mejora solicitada en el ticket ' || ticket_label || ' fue marcada como implementada. Ya esta disponible para validacion. Si necesitas ayuda adicional, puedes responder en este mismo ticket.';

  insert into landlord.ticket_messages (
    ticket_id,
    sender_type,
    message,
    attachments
  )
  values (
    new.ticket_id,
    'System',
    notification_message,
    jsonb_build_object(
      'channel', 'customer_improvement',
      'event', 'customer_improvement_implemented',
      'improvement_request_id', new.id,
      'ticket_id', new.ticket_id,
      'ticket_number', ticket_record.ticket_number,
      'ticket_label', ticket_label,
      'improvement_title', new.title,
      'implemented_at', timezone('utc'::text, now()),
      'notify_client', true,
      'notification', jsonb_build_object(
        'badge', true,
        'increment_unread', true,
        'play_sound', true,
        'sound', 'support-improvement-implemented',
        'title', 'Mejora implementada',
        'body', notification_message
      ),
      'client_alert', jsonb_build_object(
        'badge', true,
        'increment_unread', true
      )
    )
  );

  return new;
end;
$$ language plpgsql
set search_path = '';

drop trigger if exists notify_customer_improvement_implemented on landlord.customer_improvement_requests;
create trigger notify_customer_improvement_implemented
  after update of status on landlord.customer_improvement_requests
  for each row
  execute function landlord.notify_customer_improvement_implemented();
