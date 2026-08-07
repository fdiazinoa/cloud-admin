begin;

alter table landlord.support_contacts
  add column if not exists has_retainership boolean not null default false,
  add column if not exists administrative_notes text,
  add column if not exists store_created_at date,
  add column if not exists service_started_at date,
  add column if not exists renewal_at date,
  add column if not exists last_suspended_at timestamptz;

create table if not exists landlord.customer_services (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references landlord.support_contacts(id) on delete cascade,
  tenant_id uuid references landlord.tenants(id) on delete set null,
  service_code text not null,
  service_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'active' check (status in ('planned', 'active', 'suspended', 'cancelled')),
  started_at date,
  renewal_at date,
  next_charge_at date,
  additional_charge numeric(12, 2) not null default 0 check (additional_charge >= 0),
  scheduled_action text check (scheduled_action is null or scheduled_action in ('charge', 'suspend', 'reactivate')),
  scheduled_action_at timestamptz,
  administrative_notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (contact_id, service_code)
);

create index if not exists customer_services_contact_idx
  on landlord.customer_services(contact_id, status, updated_at desc);
create index if not exists customer_services_scheduled_idx
  on landlord.customer_services(scheduled_action_at)
  where scheduled_action_at is not null and status <> 'cancelled';
create index if not exists support_contacts_company_idx
  on landlord.support_contacts(lower(company_name));

drop trigger if exists update_customer_services_updated_at on landlord.customer_services;
create trigger update_customer_services_updated_at
before update on landlord.customer_services
for each row execute function landlord.update_support_updated_at_column();

alter table landlord.customer_services enable row level security;
drop policy if exists "Deny public access to customer services" on landlord.customer_services;
create policy "Deny public access to customer services"
on landlord.customer_services
for all
to public
using (false)
with check (false);

revoke all on landlord.customer_services from anon, authenticated;
grant select, insert, update on landlord.customer_services to service_role;

commit;
