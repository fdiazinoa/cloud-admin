-- Governed HelpDesk AI autonomy. Autopilot is intentionally opt-in.

alter table landlord.support_integration_settings
  add column if not exists ai_autonomy_mode text not null default 'observe',
  add column if not exists ai_auto_reply_min_confidence numeric not null default 0.92,
  add column if not exists ai_auto_route_min_confidence numeric not null default 0.85,
  add column if not exists ai_auto_reply_clarifications boolean not null default true;

update landlord.support_integration_settings
set ai_model = 'gpt-4o-mini-2024-07-18'
where ai_model = 'gpt-4o-mini';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_integration_settings_ai_autonomy_mode_check'
      and conrelid = 'landlord.support_integration_settings'::regclass
  ) then
    alter table landlord.support_integration_settings
      add constraint support_integration_settings_ai_autonomy_mode_check
      check (ai_autonomy_mode in ('observe', 'copilot', 'autopilot'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'support_integration_settings_ai_auto_reply_confidence_check'
      and conrelid = 'landlord.support_integration_settings'::regclass
  ) then
    alter table landlord.support_integration_settings
      add constraint support_integration_settings_ai_auto_reply_confidence_check
      check (ai_auto_reply_min_confidence between 0.5 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'support_integration_settings_ai_auto_route_confidence_check'
      and conrelid = 'landlord.support_integration_settings'::regclass
  ) then
    alter table landlord.support_integration_settings
      add constraint support_integration_settings_ai_auto_route_confidence_check
      check (ai_auto_route_min_confidence between 0.5 and 1);
  end if;
end $$;

alter table landlord.ai_ticket_insights
  add column if not exists classification_confidence numeric,
  add column if not exists response_confidence numeric,
  add column if not exists autonomy_action text,
  add column if not exists autonomy_reasons jsonb not null default '[]'::jsonb,
  add column if not exists knowledge_sources jsonb not null default '[]'::jsonb,
  add column if not exists auto_reply_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_ticket_insights_classification_confidence_check'
      and conrelid = 'landlord.ai_ticket_insights'::regclass
  ) then
    alter table landlord.ai_ticket_insights
      add constraint ai_ticket_insights_classification_confidence_check
      check (classification_confidence is null or classification_confidence between 0 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_ticket_insights_response_confidence_check'
      and conrelid = 'landlord.ai_ticket_insights'::regclass
  ) then
    alter table landlord.ai_ticket_insights
      add constraint ai_ticket_insights_response_confidence_check
      check (response_confidence is null or response_confidence between 0 and 1);
  end if;
end $$;

create table if not exists landlord.ai_helpdesk_runs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references landlord.support_tickets(id) on delete cascade,
  inbound_message_id uuid references landlord.ticket_messages(id) on delete set null,
  response_message_id uuid references landlord.ticket_messages(id) on delete set null,
  trigger_event text not null check (trigger_event in ('new_ticket', 'thread_reply')),
  autonomy_mode text not null check (autonomy_mode in ('observe', 'copilot', 'autopilot')),
  model text not null,
  prompt_version text not null,
  policy_decision text not null check (policy_decision in ('observe', 'draft', 'auto_reply', 'acknowledge', 'escalate', 'failed')),
  classification_confidence numeric check (classification_confidence between 0 and 1),
  response_confidence numeric check (response_confidence between 0 and 1),
  classification jsonb not null default '{}'::jsonb,
  knowledge_sources jsonb not null default '[]'::jsonb,
  policy_reasons jsonb not null default '[]'::jsonb,
  proposed_response text,
  status text not null default 'completed' check (status in ('completed', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz
);

create index if not exists ai_helpdesk_runs_ticket_created_idx
  on landlord.ai_helpdesk_runs (ticket_id, created_at desc);

create index if not exists ai_helpdesk_runs_inbound_message_idx
  on landlord.ai_helpdesk_runs (inbound_message_id)
  where inbound_message_id is not null;

create index if not exists ai_helpdesk_runs_response_message_idx
  on landlord.ai_helpdesk_runs (response_message_id)
  where response_message_id is not null;

create index if not exists ai_helpdesk_runs_decision_created_idx
  on landlord.ai_helpdesk_runs (policy_decision, created_at desc);

alter table landlord.ai_helpdesk_runs enable row level security;

-- The audit log is intentionally service-role only. It is exposed through the
-- authorized HelpDesk Edge Function rather than directly through the Data API.
revoke all on landlord.ai_helpdesk_runs from anon, authenticated;
