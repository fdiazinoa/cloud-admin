begin;

create table if not exists landlord.support_ticket_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null,
  ticket_number text,
  subject text not null,
  external_sender_email text,
  deletion_reason text not null,
  deleted_by uuid references landlord.cloud_admin_users(id) on delete set null,
  outcome text not null default 'pending'
    check (outcome in ('pending', 'deleted', 'failed')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz
);

create index if not exists support_ticket_deletion_audit_deleted_by_idx
  on landlord.support_ticket_deletion_audit (deleted_by)
  where deleted_by is not null;

create index if not exists support_ticket_deletion_audit_requested_at_idx
  on landlord.support_ticket_deletion_audit (requested_at desc);

alter table landlord.support_ticket_deletion_audit enable row level security;

-- Destructive actions are only exposed through the authenticated HelpDesk Edge
-- Function. The audit trail must never be directly writable from the browser.
revoke all on landlord.support_ticket_deletion_audit from anon, authenticated;

commit;
