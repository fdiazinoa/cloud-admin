begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

alter table landlord.internal_work_requests
  add column if not exists origin text not null default 'internal',
  add column if not exists ticket_id uuid,
  add column if not exists tenant_id uuid,
  add column if not exists contact_id uuid,
  add column if not exists affected_module text,
  add column if not exists ai_summary text,
  add column if not exists requested_capability text,
  add column if not exists customer_impact text,
  add column if not exists duplicate_group_key text,
  add column if not exists ai_confidence numeric,
  add column if not exists detected_by_ai boolean not null default false,
  add column if not exists decision_notes text,
  add column if not exists legacy_customer_improvement_id uuid;

alter table landlord.internal_work_requests
  drop constraint if exists internal_work_requests_status_check;
alter table landlord.internal_work_requests
  add constraint internal_work_requests_status_check
  check (status in ('new', 'under_review', 'approved', 'in_progress', 'completed', 'rejected'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'internal_work_requests_origin_check'
      and conrelid = 'landlord.internal_work_requests'::regclass
  ) then
    alter table landlord.internal_work_requests
      add constraint internal_work_requests_origin_check
      check (origin in ('internal', 'email', 'erp', 'helpdesk_manual', 'helpdesk_automatic'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'internal_work_requests_ai_confidence_check'
      and conrelid = 'landlord.internal_work_requests'::regclass
  ) then
    alter table landlord.internal_work_requests
      add constraint internal_work_requests_ai_confidence_check
      check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'internal_work_requests_ticket_id_fkey'
      and conrelid = 'landlord.internal_work_requests'::regclass
  ) then
    alter table landlord.internal_work_requests
      add constraint internal_work_requests_ticket_id_fkey
      foreign key (ticket_id) references landlord.support_tickets(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'internal_work_requests_tenant_id_fkey'
      and conrelid = 'landlord.internal_work_requests'::regclass
  ) then
    alter table landlord.internal_work_requests
      add constraint internal_work_requests_tenant_id_fkey
      foreign key (tenant_id) references landlord.tenants(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'internal_work_requests_contact_id_fkey'
      and conrelid = 'landlord.internal_work_requests'::regclass
  ) then
    alter table landlord.internal_work_requests
      add constraint internal_work_requests_contact_id_fkey
      foreign key (contact_id) references landlord.support_contacts(id) on delete set null;
  end if;
end
$$;

create index if not exists internal_work_requests_ticket_id_idx
  on landlord.internal_work_requests (ticket_id);
create index if not exists internal_work_requests_tenant_id_idx
  on landlord.internal_work_requests (tenant_id);
create index if not exists internal_work_requests_contact_id_idx
  on landlord.internal_work_requests (contact_id);
create index if not exists internal_work_requests_origin_updated_idx
  on landlord.internal_work_requests (origin, updated_at desc);
create unique index if not exists internal_work_requests_legacy_improvement_uidx
  on landlord.internal_work_requests (legacy_customer_improvement_id);
create unique index if not exists internal_work_requests_ticket_duplicate_uidx
  on landlord.internal_work_requests (ticket_id, duplicate_group_key);

insert into landlord.internal_work_requests (
  request_type,
  product,
  priority,
  status,
  title,
  description,
  source_page,
  origin,
  ticket_id,
  tenant_id,
  contact_id,
  affected_module,
  ai_summary,
  requested_capability,
  customer_impact,
  duplicate_group_key,
  ai_confidence,
  detected_by_ai,
  decision_notes,
  legacy_customer_improvement_id,
  created_at,
  updated_at,
  completed_at
)
select
  'improvement',
  case
    when lower(coalesce(legacy.source, '')) = 'erp' then 'erp'
    when lower(coalesce(legacy.affected_module, '')) ~ '(pos|terminal|hardware|venta)' then 'clicpos'
    when lower(coalesce(legacy.affected_module, '')) ~ '(cloud|admin)' then 'cloud-admin'
    when legacy.affected_module is not null then 'erp'
    else 'general'
  end,
  legacy.priority,
  case legacy.status
    when 'Nueva' then 'new'
    when 'En evaluacion' then 'under_review'
    when 'Aceptada' then 'approved'
    when 'En desarrollo' then 'in_progress'
    when 'Implementada' then 'completed'
    when 'Rechazada' then 'rejected'
    else 'new'
  end,
  legacy.title,
  coalesce(nullif(legacy.request_text, ''), nullif(legacy.requested_capability, ''), legacy.title),
  case when legacy.ticket_id is not null then '/support' else null end,
  case lower(coalesce(legacy.source, ''))
    when 'email' then 'email'
    when 'erp' then 'erp'
    when 'helpdesk manual' then 'helpdesk_manual'
    else 'helpdesk_automatic'
  end,
  legacy.ticket_id,
  legacy.tenant_id,
  legacy.contact_id,
  legacy.affected_module,
  legacy.ai_summary,
  legacy.requested_capability,
  legacy.customer_impact,
  legacy.duplicate_group_key,
  legacy.ai_confidence,
  legacy.detected_by_ai,
  legacy.decision_notes,
  legacy.id,
  legacy.created_at,
  legacy.updated_at,
  case when legacy.status = 'Implementada' then legacy.updated_at else null end
from landlord.customer_improvement_requests legacy
on conflict (legacy_customer_improvement_id) do nothing;

create or replace function landlord.sync_legacy_customer_improvement_to_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update landlord.internal_work_requests
  set
    request_type = 'improvement',
    product = case
      when lower(coalesce(new.source, '')) = 'erp' then 'erp'
      when lower(coalesce(new.affected_module, '')) ~ '(pos|terminal|hardware|venta)' then 'clicpos'
      when lower(coalesce(new.affected_module, '')) ~ '(cloud|admin)' then 'cloud-admin'
      when new.affected_module is not null then 'erp'
      else 'general'
    end,
    priority = new.priority,
    status = case new.status
      when 'Nueva' then 'new'
      when 'En evaluacion' then 'under_review'
      when 'Aceptada' then 'approved'
      when 'En desarrollo' then 'in_progress'
      when 'Implementada' then 'completed'
      when 'Rechazada' then 'rejected'
      else 'new'
    end,
    title = new.title,
    description = coalesce(nullif(new.request_text, ''), nullif(new.requested_capability, ''), new.title),
    source_page = case when new.ticket_id is not null then '/support' else null end,
    origin = case lower(coalesce(new.source, ''))
      when 'email' then 'email'
      when 'erp' then 'erp'
      when 'helpdesk manual' then 'helpdesk_manual'
      else 'helpdesk_automatic'
    end,
    ticket_id = new.ticket_id,
    tenant_id = new.tenant_id,
    contact_id = new.contact_id,
    affected_module = new.affected_module,
    ai_summary = new.ai_summary,
    requested_capability = new.requested_capability,
    customer_impact = new.customer_impact,
    duplicate_group_key = new.duplicate_group_key,
    ai_confidence = new.ai_confidence,
    detected_by_ai = new.detected_by_ai,
    decision_notes = new.decision_notes,
    updated_at = new.updated_at,
    completed_at = case when new.status = 'Implementada' then new.updated_at else null end
  where legacy_customer_improvement_id = new.id;

  if found then
    return new;
  end if;

  insert into landlord.internal_work_requests (
    request_type, product, priority, status, title, description, source_page, origin,
    ticket_id, tenant_id, contact_id, affected_module, ai_summary, requested_capability,
    customer_impact, duplicate_group_key, ai_confidence, detected_by_ai, decision_notes,
    legacy_customer_improvement_id, created_at, updated_at, completed_at
  ) values (
    'improvement',
    case
      when lower(coalesce(new.source, '')) = 'erp' then 'erp'
      when lower(coalesce(new.affected_module, '')) ~ '(pos|terminal|hardware|venta)' then 'clicpos'
      when lower(coalesce(new.affected_module, '')) ~ '(cloud|admin)' then 'cloud-admin'
      when new.affected_module is not null then 'erp'
      else 'general'
    end,
    new.priority,
    case new.status
      when 'Nueva' then 'new'
      when 'En evaluacion' then 'under_review'
      when 'Aceptada' then 'approved'
      when 'En desarrollo' then 'in_progress'
      when 'Implementada' then 'completed'
      when 'Rechazada' then 'rejected'
      else 'new'
    end,
    new.title,
    coalesce(nullif(new.request_text, ''), nullif(new.requested_capability, ''), new.title),
    case when new.ticket_id is not null then '/support' else null end,
    case lower(coalesce(new.source, ''))
      when 'email' then 'email'
      when 'erp' then 'erp'
      when 'helpdesk manual' then 'helpdesk_manual'
      else 'helpdesk_automatic'
    end,
    new.ticket_id, new.tenant_id, new.contact_id, new.affected_module, new.ai_summary,
    new.requested_capability, new.customer_impact, new.duplicate_group_key,
    new.ai_confidence, new.detected_by_ai, new.decision_notes, new.id,
    new.created_at, new.updated_at,
    case when new.status = 'Implementada' then new.updated_at else null end
  )
  on conflict (ticket_id, duplicate_group_key) do update set
    legacy_customer_improvement_id = coalesce(
      landlord.internal_work_requests.legacy_customer_improvement_id,
      excluded.legacy_customer_improvement_id
    ),
    request_type = excluded.request_type,
    product = excluded.product,
    priority = excluded.priority,
    status = excluded.status,
    title = excluded.title,
    description = excluded.description,
    source_page = excluded.source_page,
    origin = excluded.origin,
    ticket_id = excluded.ticket_id,
    tenant_id = excluded.tenant_id,
    contact_id = excluded.contact_id,
    affected_module = excluded.affected_module,
    ai_summary = excluded.ai_summary,
    requested_capability = excluded.requested_capability,
    customer_impact = excluded.customer_impact,
    duplicate_group_key = excluded.duplicate_group_key,
    ai_confidence = excluded.ai_confidence,
    detected_by_ai = excluded.detected_by_ai,
    decision_notes = excluded.decision_notes,
    updated_at = excluded.updated_at,
    completed_at = excluded.completed_at;
  return new;
end;
$$;

drop trigger if exists sync_legacy_customer_improvement_to_request
  on landlord.customer_improvement_requests;
create trigger sync_legacy_customer_improvement_to_request
after insert or update on landlord.customer_improvement_requests
for each row execute function landlord.sync_legacy_customer_improvement_to_request();

create or replace function landlord.notify_customer_request_completed()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ticket_record record;
  ticket_label text;
  notification_message text;
begin
  if new.request_type <> 'improvement'
     or new.status <> 'completed'
     or old.status is not distinct from new.status
     or new.ticket_id is null then
    return new;
  end if;

  select id, ticket_number, subject into ticket_record
  from landlord.support_tickets
  where id = new.ticket_id;
  if not found then return new; end if;

  if exists (
    select 1 from landlord.ticket_messages existing
    where existing.ticket_id = new.ticket_id
      and existing.attachments->>'channel' = 'customer_improvement'
      and existing.attachments->>'event' in ('customer_improvement_implemented', 'customer_request_completed')
      and existing.attachments->>'improvement_request_id' in (
        new.id::text,
        coalesce(new.legacy_customer_improvement_id::text, new.id::text)
      )
  ) then
    return new;
  end if;

  ticket_label := '#' || coalesce(ticket_record.ticket_number::text, left(new.ticket_id::text, 8));
  notification_message := 'La mejora solicitada en el ticket ' || ticket_label || ' fue marcada como implementada. Ya esta disponible para validacion. Si necesitas ayuda adicional, puedes responder en este mismo ticket.';

  insert into landlord.ticket_messages (ticket_id, sender_type, message, attachments)
  values (
    new.ticket_id,
    'System',
    notification_message,
    jsonb_build_object(
      'channel', 'customer_improvement',
      'event', 'customer_request_completed',
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
      'client_alert', jsonb_build_object('badge', true, 'increment_unread', true)
    )
  );
  return new;
end;
$$;

drop trigger if exists notify_customer_request_completed on landlord.internal_work_requests;
create trigger notify_customer_request_completed
after update of status on landlord.internal_work_requests
for each row execute function landlord.notify_customer_request_completed();

update landlord.cloud_admin_profiles
set permissions = jsonb_set(
  jsonb_set(
    permissions,
    '{internal_requests_view}',
    to_jsonb(coalesce(permissions->'internal_requests_view' = 'true'::jsonb, false)
      or coalesce(permissions->'improvements_view' = 'true'::jsonb, false)
      or coalesce(permissions->'improvements' = 'true'::jsonb, false)),
    true
  ),
  '{internal_requests_manage}',
  to_jsonb(coalesce(permissions->'internal_requests_manage' = 'true'::jsonb, false)
    or coalesce(permissions->'improvements_manage' = 'true'::jsonb, false)
    or coalesce(permissions->'improvements' = 'true'::jsonb, false)),
  true
)
where permissions ?| array['improvements', 'improvements_view', 'improvements_manage'];

commit;
