begin;

create table if not exists landlord.implementation_meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_type text not null default 'meeting'
    check (meeting_type in ('implementation', 'meeting', 'follow_up', 'training')),
  title text not null,
  context text not null,
  ai_summary text not null,
  ai_summary_source text not null default 'structured_fallback'
    check (ai_summary_source in ('openai', 'structured_fallback')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Santo_Domingo',
  customer_email text,
  attendee_emails text[] not null default '{}',
  support_user_ids uuid[] not null default '{}',
  reminder_minutes integer[] not null default '{1440,30}',
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'failed', 'cancelled', 'completed')),
  google_calendar_id text,
  google_event_id text,
  google_event_url text,
  last_error text,
  created_by uuid references landlord.cloud_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint implementation_meetings_time_check check (ends_at > starts_at)
);

create index if not exists implementation_meetings_starts_at_idx
  on landlord.implementation_meetings (starts_at desc);
create index if not exists implementation_meetings_status_starts_idx
  on landlord.implementation_meetings (status, starts_at)
  where status in ('pending', 'scheduled');
create index if not exists implementation_meetings_created_by_idx
  on landlord.implementation_meetings (created_by);

drop trigger if exists update_implementation_meetings_updated_at on landlord.implementation_meetings;
create trigger update_implementation_meetings_updated_at
before update on landlord.implementation_meetings
for each row execute function landlord.update_support_updated_at_column();

alter table landlord.implementation_meetings enable row level security;
revoke all on landlord.implementation_meetings from anon, authenticated;
grant select, insert, update, delete on landlord.implementation_meetings to service_role;

commit;
