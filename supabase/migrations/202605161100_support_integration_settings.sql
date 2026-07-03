-- HelpDesk integration settings for Resend and AI providers.

create table if not exists landlord.support_integration_settings (
  id text primary key default 'helpdesk' check (id = 'helpdesk'),
  resend_inbound_email text not null default 'apoyotenico@mercasend.com',
  resend_from_name text not null default 'Cloud Admin Soporte',
  resend_from_email text not null default 'apoyotenico@mercasend.com',
  resend_webhook_event text not null default 'email.received',
  ai_provider text not null default 'openai'
    check (ai_provider in ('openai', 'anthropic', 'disabled')),
  ai_model text not null default 'gpt-4o-mini',
  ai_triage_enabled boolean not null default true,
  ai_sentiment_enabled boolean not null default true,
  ai_auto_drafts_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists landlord.support_integration_secrets (
  provider text primary key check (provider in ('resend', 'openai', 'anthropic')),
  secret_ciphertext text not null,
  secret_iv text not null,
  secret_last4 text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

insert into landlord.support_integration_settings (id)
values ('helpdesk')
on conflict (id) do nothing;

drop trigger if exists update_support_integration_settings_updated_at on landlord.support_integration_settings;
create trigger update_support_integration_settings_updated_at
  before update on landlord.support_integration_settings
  for each row
  execute function landlord.update_support_updated_at_column();

drop trigger if exists update_support_integration_secrets_updated_at on landlord.support_integration_secrets;
create trigger update_support_integration_secrets_updated_at
  before update on landlord.support_integration_secrets
  for each row
  execute function landlord.update_support_updated_at_column();

alter table landlord.support_integration_settings enable row level security;
alter table landlord.support_integration_secrets enable row level security;
