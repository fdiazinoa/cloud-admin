-- Generate an ERP-renderable feedback request when a client closes a ticket from Clic ERP.

create or replace function landlord.handle_client_close_feedback_request()
returns trigger as $$
declare
  ticket_record record;
  feedback_token text;
  feedback_token_hash text;
  feedback_endpoint text := 'https://cdfdgxejnbznjxuokrrx.supabase.co/functions/v1/submit-support-feedback';
  feedback_request jsonb;
  notification_message text;
  requested_tenant_id text;
begin
  if new.sender_type::text <> 'Client' then
    return new;
  end if;

  if coalesce(new.attachments, '{}'::jsonb) #>> '{client_close_request,action}' <> 'client_close' then
    return new;
  end if;

  select id, ticket_number, tenant_id, status, resolution_status, resolution_feedback_token_hash
    into ticket_record
  from landlord.support_tickets
  where id = new.ticket_id;

  if not found then
    return new;
  end if;

  requested_tenant_id := coalesce(
    new.attachments #>> '{client_close_request,tenant_id}',
    new.attachments #>> '{client_close_request,requested_by,tenant_id}'
  );

  if requested_tenant_id is not null
     and ticket_record.tenant_id is not null
     and requested_tenant_id <> ticket_record.tenant_id::text then
    return new;
  end if;

  if ticket_record.resolution_status = 'pending_customer_confirmation'
     and ticket_record.resolution_feedback_token_hash is not null then
    return new;
  end if;

  if exists (
    select 1
    from landlord.ticket_messages existing
    where existing.ticket_id = new.ticket_id
      and existing.id <> new.id
      and existing.created_at >= new.created_at
      and coalesce(existing.attachments, '{}'::jsonb) ? 'feedback_request'
  ) then
    return new;
  end if;

  feedback_token := gen_random_uuid()::text || '-' || gen_random_uuid()::text;
  feedback_token_hash := encode(digest(feedback_token, 'sha256'), 'hex');

  update landlord.support_tickets
  set
    status = 'Resuelto'::ticket_status,
    resolution_status = 'pending_customer_confirmation',
    resolved_at = coalesce(resolved_at, timezone('utc'::text, now())),
    closed_at = null,
    reopened_at = null,
    customer_confirmed_at = null,
    customer_rating = null,
    customer_feedback = null,
    resolution_feedback_token_hash = feedback_token_hash,
    resolution_feedback_requested_at = timezone('utc'::text, now())
  where id = ticket_record.id;

  feedback_request := jsonb_build_object(
    'version', 1,
    'type', 'resolution_confirmation',
    'prompt', 'Gracias por confirmar el cierre. ¿Cómo valoras la atención recibida?',
    'close_label', 'Enviar valoración',
    'reopen_label', 'Necesito más ayuda',
    'rating_label', 'Valora la atención',
    'rating_scale', jsonb_build_array(1, 2, 3, 4, 5),
    'ui', jsonb_build_object(
      'component', 'resolution_feedback',
      'rating_style', 'amazon_stars',
      'rating_selection', 'single',
      'require_rating_for_close', true
    ),
    'endpoint', feedback_endpoint,
    'method', 'POST',
    'ticket_id', ticket_record.id,
    'ticket_number', ticket_record.ticket_number,
    'token', feedback_token,
    'close_action', jsonb_build_object(
      'action', 'close',
      'label', 'Enviar valoración'
    ),
    'actions', jsonb_build_object(
      'close', (
        select jsonb_agg(
          jsonb_build_object(
            'action', 'close',
            'rating', rating,
            'label', rating::text || ' estrella' || case when rating = 1 then '' else 's' end,
            'url', feedback_endpoint || '?ticket_id=' || ticket_record.id::text || '&token=' || feedback_token || '&action=close&rating=' || rating::text
          )
        )
        from generate_series(1, 5) as ratings(rating)
      ),
      'reopen', jsonb_build_object(
        'action', 'reopen',
        'label', 'Necesito más ayuda',
        'url', feedback_endpoint || '?ticket_id=' || ticket_record.id::text || '&token=' || feedback_token || '&action=reopen'
      )
    )
  );

  notification_message := 'Gracias por confirmar el cierre. ¿Cómo valoras la atención recibida?';

  insert into landlord.ticket_messages (
    ticket_id,
    sender_type,
    message,
    attachments
  )
  values (
    ticket_record.id,
    'Admin'::message_sender_type,
    notification_message,
    jsonb_build_object(
      'channel', 'resolution',
      'delivery_status', 'in_app',
      'event', 'client_close_feedback_requested',
      'message_kind', 'resolution_feedback_request',
      'notified_client', true,
      'notify_client', true,
      'requires_customer_action', true,
      'source', 'ERP',
      'client_close_message_id', new.id,
      'feedback_request', feedback_request,
      'notification', jsonb_build_object(
        'badge', true,
        'increment_unread', true,
        'play_sound', true,
        'sound', 'support-resolution-request',
        'title', 'Valora la atención recibida',
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
$$ language plpgsql;

drop trigger if exists handle_client_close_feedback_request on landlord.ticket_messages;
create trigger handle_client_close_feedback_request
  after insert on landlord.ticket_messages
  for each row
  execute function landlord.handle_client_close_feedback_request();
