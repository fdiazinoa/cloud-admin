-- Enriched AI triage fields for HelpDesk email tickets.

alter table landlord.ai_ticket_insights
  add column if not exists next_best_action text,
  add column if not exists urgency_reason text,
  add column if not exists affected_module text,
  add column if not exists detected_contact_name text,
  add column if not exists detected_company text,
  add column if not exists detected_phone text,
  add column if not exists detected_identifiers jsonb not null default '{}'::jsonb,
  add column if not exists incident_fingerprint text,
  add column if not exists duplicate_signal boolean not null default false,
  add column if not exists ai_tags jsonb not null default '[]'::jsonb;

create index if not exists ai_ticket_insights_incident_fingerprint_idx
  on landlord.ai_ticket_insights (incident_fingerprint)
  where incident_fingerprint is not null;
