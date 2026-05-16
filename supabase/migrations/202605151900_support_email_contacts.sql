-- HelpDesk omnicanal: contactos externos, tickets por email e insights de IA.

create schema if not exists landlord;

do $$
begin
  create type landlord.ticket_category as enum (
    'Ventas',
    'Inventario',
    'Fiscal',
    'Hardware',
    'Pagos',
    'Red',
    'Otros'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type landlord.ticket_priority as enum (
    'Baja',
    'Media',
    'Alta',
    'Critica'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type landlord.ticket_status as enum (
    'Abierto',
    'En_Proceso',
    'Resuelto',
    'Cerrado'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type landlord.message_sender_type as enum (
    'Admin',
    'Client',
    'System'
  );
exception
  when duplicate_object then null;
end $$;

alter type landlord.ticket_category add value if not exists 'Red';

do $$
begin
  if to_regtype('public.ticket_category') is not null then
    alter type public.ticket_category add value if not exists 'Red';
  end if;
end $$;

create table if not exists landlord.support_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  company_name text,
  phone text,
  source text not null default 'Email',
  tenant_id uuid references landlord.tenants(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists landlord.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references landlord.tenants(id) on delete cascade,
  contact_id uuid references landlord.support_contacts(id) on delete set null,
  category landlord.ticket_category not null default 'Otros',
  priority landlord.ticket_priority not null default 'Media',
  status landlord.ticket_status not null default 'Abierto',
  subject text not null,
  source text not null default 'POS',
  external_sender_email text,
  external_message_id text,
  assignment_status text not null default 'assigned'
    check (assignment_status in ('assigned', 'needs_assignment', 'needs_contact_review', 'spam')),
  tenant_match_confidence numeric check (tenant_match_confidence is null or (tenant_match_confidence >= 0 and tenant_match_confidence <= 1)),
  technical_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table if exists landlord.support_tickets
  alter column tenant_id drop not null;

alter table if exists landlord.support_tickets
  add column if not exists contact_id uuid references landlord.support_contacts(id) on delete set null,
  add column if not exists source text not null default 'POS',
  add column if not exists external_sender_email text,
  add column if not exists external_message_id text,
  add column if not exists assignment_status text not null default 'assigned',
  add column if not exists tenant_match_confidence numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_assignment_status_check'
      and conrelid = 'landlord.support_tickets'::regclass
  ) then
    alter table landlord.support_tickets
      add constraint support_tickets_assignment_status_check
      check (assignment_status in ('assigned', 'needs_assignment', 'needs_contact_review', 'spam')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_tenant_match_confidence_check'
      and conrelid = 'landlord.support_tickets'::regclass
  ) then
    alter table landlord.support_tickets
      add constraint support_tickets_tenant_match_confidence_check
      check (tenant_match_confidence is null or (tenant_match_confidence >= 0 and tenant_match_confidence <= 1)) not valid;
  end if;
end $$;

create table if not exists landlord.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references landlord.support_tickets(id) on delete cascade,
  sender_type landlord.message_sender_type not null,
  sender_id uuid,
  message text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists landlord.ai_ticket_insights (
  ticket_id uuid primary key references landlord.support_tickets(id) on delete cascade,
  sentiment text not null default 'neutral'
    check (sentiment in ('frustrated', 'neutral', 'positive')),
  sentiment_score numeric check (sentiment_score is null or (sentiment_score >= -1 and sentiment_score <= 1)),
  ai_category text,
  ai_priority text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  summary text,
  suggested_replies jsonb not null default '[]'::jsonb,
  similar_cluster_id uuid,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists landlord.raw_support_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'failed', 'ignored')),
  error_message text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  processed_at timestamptz
);

create or replace function landlord.update_support_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_support_tickets_updated_at on landlord.support_tickets;
create trigger update_support_tickets_updated_at
  before update on landlord.support_tickets
  for each row
  execute function landlord.update_support_updated_at_column();

drop trigger if exists update_support_contacts_updated_at on landlord.support_contacts;
create trigger update_support_contacts_updated_at
  before update on landlord.support_contacts
  for each row
  execute function landlord.update_support_updated_at_column();

drop trigger if exists update_ai_ticket_insights_updated_at on landlord.ai_ticket_insights;
create trigger update_ai_ticket_insights_updated_at
  before update on landlord.ai_ticket_insights
  for each row
  execute function landlord.update_support_updated_at_column();

create index if not exists support_contacts_email_idx on landlord.support_contacts (lower(email));
create index if not exists support_contacts_tenant_id_idx on landlord.support_contacts (tenant_id);
create index if not exists support_tickets_tenant_id_idx on landlord.support_tickets (tenant_id);
create index if not exists support_tickets_contact_id_idx on landlord.support_tickets (contact_id);
create index if not exists support_tickets_source_status_idx on landlord.support_tickets (source, status);
create unique index if not exists support_tickets_source_external_message_id_uidx
  on landlord.support_tickets (source, external_message_id)
  where external_message_id is not null;
create index if not exists ticket_messages_ticket_id_created_at_idx on landlord.ticket_messages (ticket_id, created_at);
create index if not exists raw_support_events_source_external_id_idx on landlord.raw_support_events (source, external_id);

alter table landlord.support_contacts enable row level security;
alter table landlord.support_tickets enable row level security;
alter table landlord.ticket_messages enable row level security;
alter table landlord.ai_ticket_insights enable row level security;
alter table landlord.raw_support_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'landlord'
      and tablename = 'support_tickets'
      and policyname = 'Tenants can view their own tickets'
  ) then
    create policy "Tenants can view their own tickets"
    on landlord.support_tickets for select
    using (tenant_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'landlord'
      and tablename = 'support_tickets'
      and policyname = 'Tenants can insert their own tickets'
  ) then
    create policy "Tenants can insert their own tickets"
    on landlord.support_tickets for insert
    with check (tenant_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'landlord'
      and tablename = 'support_tickets'
      and policyname = 'Tenants can update their own tickets'
  ) then
    create policy "Tenants can update their own tickets"
    on landlord.support_tickets for update
    using (tenant_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'landlord'
      and tablename = 'ticket_messages'
      and policyname = 'Tenants can view messages of their tickets'
  ) then
    create policy "Tenants can view messages of their tickets"
    on landlord.ticket_messages for select
    using (
      ticket_id in (
        select id from landlord.support_tickets where tenant_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'landlord'
      and tablename = 'ticket_messages'
      and policyname = 'Tenants can insert messages to their tickets'
  ) then
    create policy "Tenants can insert messages to their tickets"
    on landlord.ticket_messages for insert
    with check (
      ticket_id in (
        select id from landlord.support_tickets where tenant_id = auth.uid()
      )
      and sender_type = 'Client'
    );
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table landlord.support_contacts;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table landlord.support_tickets;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table landlord.ticket_messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table landlord.ai_ticket_insights;
exception
  when duplicate_object then null;
end $$;
