alter table landlord.support_tickets
  add column if not exists resolution_status text not null default 'open',
  add column if not exists resolved_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists customer_rating integer,
  add column if not exists customer_feedback text,
  add column if not exists resolution_feedback_token_hash text,
  add column if not exists resolution_feedback_requested_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_resolution_status_check'
      and conrelid = 'landlord.support_tickets'::regclass
  ) then
    alter table landlord.support_tickets
      add constraint support_tickets_resolution_status_check
      check (resolution_status in ('open', 'pending_customer_confirmation', 'closed', 'reopened')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_customer_rating_check'
      and conrelid = 'landlord.support_tickets'::regclass
  ) then
    alter table landlord.support_tickets
      add constraint support_tickets_customer_rating_check
      check (customer_rating is null or (customer_rating >= 1 and customer_rating <= 5)) not valid;
  end if;
end $$;

create index if not exists support_tickets_resolution_status_idx
  on landlord.support_tickets (resolution_status, status);

create index if not exists support_tickets_feedback_token_hash_idx
  on landlord.support_tickets (resolution_feedback_token_hash)
  where resolution_feedback_token_hash is not null;
