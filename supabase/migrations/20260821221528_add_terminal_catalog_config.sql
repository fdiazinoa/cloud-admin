begin;

-- The reconciliation RPC persists only canonical identity metadata here.
-- Existing rows receive an empty object; no operational or fiscal data changes.
alter table public.terminals
  add column if not exists config jsonb not null default '{}'::jsonb;

comment on column public.terminals.config is
  'Non-secret terminal catalog metadata, including explicit ERP identity reconciliation bindings.';

commit;
