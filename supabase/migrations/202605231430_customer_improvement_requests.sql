-- Customer-requested product improvements detected from HelpDesk conversations.

create table if not exists landlord.customer_improvement_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references landlord.support_tickets(id) on delete set null,
  tenant_id uuid references landlord.tenants(id) on delete set null,
  contact_id uuid references landlord.support_contacts(id) on delete set null,
  source text not null default 'HelpDesk',
  status text not null default 'Nueva'
    check (status in ('Nueva', 'En evaluacion', 'Aceptada', 'En desarrollo', 'Implementada', 'Rechazada')),
  priority text not null default 'Media'
    check (priority in ('Baja', 'Media', 'Alta', 'Critica')),
  title text not null,
  request_text text not null,
  ai_summary text,
  requested_capability text,
  affected_module text,
  customer_impact text,
  duplicate_group_key text,
  ai_confidence numeric check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  detected_by_ai boolean not null default true,
  decision_notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

drop trigger if exists update_customer_improvement_requests_updated_at on landlord.customer_improvement_requests;
create trigger update_customer_improvement_requests_updated_at
  before update on landlord.customer_improvement_requests
  for each row
  execute function landlord.update_support_updated_at_column();

create index if not exists customer_improvement_requests_status_idx
  on landlord.customer_improvement_requests (status, created_at desc);

create index if not exists customer_improvement_requests_tenant_id_idx
  on landlord.customer_improvement_requests (tenant_id);

create index if not exists customer_improvement_requests_ticket_id_idx
  on landlord.customer_improvement_requests (ticket_id);

create index if not exists customer_improvement_requests_duplicate_group_key_idx
  on landlord.customer_improvement_requests (duplicate_group_key)
  where duplicate_group_key is not null;

create unique index if not exists customer_improvement_requests_ticket_duplicate_uidx
  on landlord.customer_improvement_requests (ticket_id, duplicate_group_key);

alter table landlord.customer_improvement_requests enable row level security;
