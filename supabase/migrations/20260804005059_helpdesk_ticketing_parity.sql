begin;

create schema if not exists private;

create or replace function private.cloud_admin_has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from landlord.cloud_admin_users admin_user
    join landlord.cloud_admin_profiles profile
      on profile.id = admin_user.profile_id
    where admin_user.auth_user_id = auth.uid()
      and admin_user.status = 'active'
      and profile.is_active
      and coalesce((profile.permissions ->> required_permission)::boolean, false)
  );
$$;

revoke all on function private.cloud_admin_has_permission(text) from public;
grant usage on schema private to authenticated;
grant execute on function private.cloud_admin_has_permission(text) to authenticated;

create table if not exists landlord.support_teams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists landlord.support_team_members (
  team_id uuid not null references landlord.support_teams(id) on delete cascade,
  admin_user_id uuid not null references landlord.cloud_admin_users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (team_id, admin_user_id)
);

alter table landlord.support_tickets
  add column if not exists assignee_id uuid references landlord.cloud_admin_users(id) on delete set null,
  add column if not exists team_id uuid references landlord.support_teams(id) on delete set null,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists merged_into_ticket_id uuid references landlord.support_tickets(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists last_response_at timestamptz,
  add column if not exists last_delivery_status text,
  add column if not exists last_delivery_error text,
  add column if not exists search_vector tsvector not null default ''::tsvector;

alter table landlord.ticket_messages
  add column if not exists visibility text not null default 'public',
  add column if not exists message_kind text not null default 'reply',
  add column if not exists delivery_status text,
  add column if not exists delivery_channel text,
  add column if not exists provider_message_id text,
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists delivery_error text,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists reply_to_message_id uuid references landlord.ticket_messages(id) on delete set null,
  add column if not exists cc text[] not null default '{}'::text[],
  add column if not exists bcc text[] not null default '{}'::text[],
  add column if not exists created_by uuid references landlord.cloud_admin_users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ticket_messages_visibility_check'
      and conrelid = 'landlord.ticket_messages'::regclass
  ) then
    alter table landlord.ticket_messages
      add constraint ticket_messages_visibility_check
      check (visibility in ('public', 'private')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_delivery_status_check'
      and conrelid = 'landlord.support_tickets'::regclass
  ) then
    alter table landlord.support_tickets
      add constraint support_tickets_delivery_status_check
      check (last_delivery_status is null or last_delivery_status in ('queued', 'sent', 'delivered', 'failed', 'bounced')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ticket_messages_delivery_status_check'
      and conrelid = 'landlord.ticket_messages'::regclass
  ) then
    alter table landlord.ticket_messages
      add constraint ticket_messages_delivery_status_check
      check (delivery_status is null or delivery_status in ('draft', 'internal', 'queued', 'sent', 'delivered', 'failed', 'bounced')) not valid;
  end if;
end $$;

create table if not exists landlord.support_reply_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  category text,
  shortcut text,
  is_active boolean not null default true,
  created_by uuid references landlord.cloud_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint support_reply_templates_name_key unique (name)
);

create table if not exists landlord.support_ticket_drafts (
  ticket_id uuid not null references landlord.support_tickets(id) on delete cascade,
  admin_user_id uuid not null references landlord.cloud_admin_users(id) on delete cascade,
  body text not null default '',
  mode text not null default 'reply',
  cc text[] not null default '{}'::text[],
  bcc text[] not null default '{}'::text[],
  forward_to text,
  attachments jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (ticket_id, admin_user_id),
  constraint support_ticket_drafts_mode_check check (mode in ('reply', 'reply_all', 'forward'))
);

create table if not exists landlord.support_ticket_presence (
  ticket_id uuid not null references landlord.support_tickets(id) on delete cascade,
  admin_user_id uuid not null references landlord.cloud_admin_users(id) on delete cascade,
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  primary key (ticket_id, admin_user_id)
);

create table if not exists landlord.support_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references landlord.support_tickets(id) on delete cascade,
  message_id uuid references landlord.ticket_messages(id) on delete cascade,
  attempted_by uuid references landlord.cloud_admin_users(id) on delete set null,
  provider text not null default 'resend',
  status text not null,
  provider_message_id text,
  error_message text,
  attempted_at timestamptz not null default timezone('utc'::text, now()),
  constraint support_delivery_attempts_status_check check (status in ('sent', 'failed', 'delivered', 'bounced'))
);

create table if not exists landlord.support_webhook_events (
  webhook_id text primary key,
  event_type text not null,
  provider_message_id text,
  received_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function landlord.refresh_support_ticket_search_vector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_vector := to_tsvector(
    'simple',
    translate(
      lower(
        coalesce(new.subject, '') || ' ' ||
        coalesce(new.external_sender_email, '') || ' ' ||
        coalesce(new.ticket_number::text, '') || ' ' ||
        coalesce(array_to_string(new.tags, ' '), '')
      ),
      'áéíóúüñ',
      'aeiouun'
    )
  );
  return new;
end;
$$;

drop trigger if exists refresh_support_ticket_search_vector_trigger on landlord.support_tickets;
create trigger refresh_support_ticket_search_vector_trigger
before insert or update of subject, external_sender_email, ticket_number, tags
on landlord.support_tickets
for each row
execute function landlord.refresh_support_ticket_search_vector();

update landlord.support_tickets
set subject = subject
where search_vector = ''::tsvector;

create index if not exists support_tickets_search_idx
  on landlord.support_tickets using gin (search_vector);
create index if not exists support_tickets_assignee_status_idx
  on landlord.support_tickets (assignee_id, status, updated_at desc);
create index if not exists support_tickets_team_status_idx
  on landlord.support_tickets (team_id, status, updated_at desc);
create index if not exists support_tickets_tags_idx
  on landlord.support_tickets using gin (tags);
create index if not exists support_tickets_merged_idx
  on landlord.support_tickets (merged_into_ticket_id)
  where merged_into_ticket_id is not null;
create index if not exists ticket_messages_delivery_idx
  on landlord.ticket_messages (ticket_id, delivery_status, created_at desc);
create index if not exists support_ticket_presence_seen_idx
  on landlord.support_ticket_presence (ticket_id, last_seen_at desc);

drop trigger if exists update_support_teams_updated_at on landlord.support_teams;
create trigger update_support_teams_updated_at
before update on landlord.support_teams
for each row execute function landlord.update_support_updated_at_column();

drop trigger if exists update_support_reply_templates_updated_at on landlord.support_reply_templates;
create trigger update_support_reply_templates_updated_at
before update on landlord.support_reply_templates
for each row execute function landlord.update_support_updated_at_column();

alter table landlord.support_teams enable row level security;
alter table landlord.support_team_members enable row level security;
alter table landlord.support_reply_templates enable row level security;
alter table landlord.support_ticket_drafts enable row level security;
alter table landlord.support_ticket_presence enable row level security;
alter table landlord.support_delivery_attempts enable row level security;
alter table landlord.support_webhook_events enable row level security;

revoke all on landlord.support_teams from anon, authenticated;
revoke all on landlord.support_team_members from anon, authenticated;
revoke all on landlord.support_reply_templates from anon, authenticated;
revoke all on landlord.support_ticket_drafts from anon, authenticated;
revoke all on landlord.support_ticket_presence from anon, authenticated;
revoke all on landlord.support_delivery_attempts from anon, authenticated;
revoke all on landlord.support_webhook_events from anon, authenticated;

grant select on landlord.support_tickets to authenticated;
grant select on landlord.ticket_messages to authenticated;
grant select on landlord.support_contacts to authenticated;
grant select on landlord.ai_ticket_insights to authenticated;

drop policy if exists "Tenants can view messages of their tickets" on landlord.ticket_messages;
create policy "Tenants can view messages of their tickets"
on landlord.ticket_messages for select
to authenticated
using (
  visibility = 'public'
  and ticket_id in (
    select id from landlord.support_tickets where tenant_id = auth.uid()
  )
);

drop policy if exists "Tenants can insert messages to their tickets" on landlord.ticket_messages;
create policy "Tenants can insert messages to their tickets"
on landlord.ticket_messages for insert
to authenticated
with check (
  visibility = 'public'
  and sender_type = 'Client'
  and ticket_id in (
    select id from landlord.support_tickets where tenant_id = auth.uid()
  )
);

drop policy if exists "Cloud admins can view support tickets" on landlord.support_tickets;
create policy "Cloud admins can view support tickets"
on landlord.support_tickets for select
to authenticated
using ((select private.cloud_admin_has_permission('support')));

drop policy if exists "Cloud admins can view support messages" on landlord.ticket_messages;
create policy "Cloud admins can view support messages"
on landlord.ticket_messages for select
to authenticated
using ((select private.cloud_admin_has_permission('support')));

drop policy if exists "Cloud admins can view support contacts" on landlord.support_contacts;
create policy "Cloud admins can view support contacts"
on landlord.support_contacts for select
to authenticated
using ((select private.cloud_admin_has_permission('support')));

drop policy if exists "Cloud admins can view ticket insights" on landlord.ai_ticket_insights;
create policy "Cloud admins can view ticket insights"
on landlord.ai_ticket_insights for select
to authenticated
using ((select private.cloud_admin_has_permission('support')));

insert into landlord.support_teams (code, name, description)
values ('support', 'Soporte', 'Equipo principal de atención POS y ERP.')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    updated_at = timezone('utc'::text, now());

insert into landlord.support_reply_templates (name, category, shortcut, body)
values
  ('Solicitar evidencia', 'Diagnóstico', '/evidencia', 'Hola {{cliente}},\n\nPara continuar, por favor envíanos una captura del mensaje, el número de terminal y la hora aproximada en que ocurrió.\n\nQuedamos atentos.'),
  ('Confirmar revisión', 'Seguimiento', '/revision', 'Hola {{cliente}},\n\nRecibimos el caso y ya lo estamos revisando. Te actualizaremos por este mismo ticket tan pronto tengamos el resultado.\n\nGracias por tu paciencia.'),
  ('Solicitar sincronización', 'POS', '/sync', 'Hola {{cliente}},\n\nPor favor confirma que la terminal tiene conexión y ejecuta una sincronización. No reinstales la aplicación ni borres datos locales mientras revisamos la cola pendiente.\n\nIndícanos el resultado para continuar.')
on conflict (name) do update
set category = excluded.category,
    shortcut = excluded.shortcut,
    body = excluded.body,
    is_active = true,
    updated_at = timezone('utc'::text, now());

commit;
