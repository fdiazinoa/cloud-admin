begin;

create table if not exists landlord.cloud_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_admin_user_id uuid references landlord.cloud_admin_users(id) on delete set null,
  actor_auth_user_id uuid,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_ip text,
  user_agent text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists cloud_admin_audit_log_created_idx
  on landlord.cloud_admin_audit_log(created_at desc);
create index if not exists cloud_admin_audit_log_actor_idx
  on landlord.cloud_admin_audit_log(actor_admin_user_id, created_at desc);
create index if not exists cloud_admin_audit_log_entity_idx
  on landlord.cloud_admin_audit_log(entity_type, entity_id, created_at desc);

alter table landlord.cloud_admin_audit_log enable row level security;
drop policy if exists "Deny all to public on cloud_admin_audit_log" on landlord.cloud_admin_audit_log;
create policy "Deny all to public on cloud_admin_audit_log"
on landlord.cloud_admin_audit_log
for all
to public
using (false)
with check (false);

revoke all on landlord.cloud_admin_audit_log from anon, authenticated;
grant select, insert on landlord.cloud_admin_audit_log to service_role;

update landlord.cloud_admin_profiles
set permissions = permissions || jsonb_build_object(
  'dashboard_view', permissions -> 'dashboard' = 'true'::jsonb,
  'tenants_view', permissions -> 'tenants' = 'true'::jsonb,
  'tenants_manage', permissions -> 'tenants' = 'true'::jsonb and level >= 50,
  'tenants_delete', permissions -> 'kill_switch' = 'true'::jsonb,
  'plans_view', permissions -> 'plans' = 'true'::jsonb,
  'plans_manage', permissions -> 'plans' = 'true'::jsonb and level >= 80,
  'support_view', permissions -> 'support' = 'true'::jsonb,
  'support_manage', permissions -> 'support' = 'true'::jsonb,
  'knowledge_view', permissions -> 'support' = 'true'::jsonb,
  'knowledge_manage', permissions -> 'support' = 'true'::jsonb and level >= 60,
  'calendar_view', permissions -> 'support' = 'true'::jsonb,
  'calendar_manage', permissions -> 'support' = 'true'::jsonb and level >= 60,
  'improvements_view', permissions -> 'improvements' = 'true'::jsonb,
  'improvements_manage', permissions -> 'improvements' = 'true'::jsonb,
  'internal_requests_view', permissions -> 'improvements' = 'true'::jsonb,
  'internal_requests_manage', permissions -> 'improvements' = 'true'::jsonb,
  'apk_view', permissions -> 'apk' = 'true'::jsonb,
  'apk_manage', permissions -> 'apk' = 'true'::jsonb and level >= 50,
  'observability_view', permissions -> 'observability' = 'true'::jsonb,
  'billing_view', permissions -> 'billing' = 'true'::jsonb,
  'billing_manage', permissions -> 'billing' = 'true'::jsonb and level >= 80,
  'settings_view', permissions -> 'settings' = 'true'::jsonb,
  'settings_manage', permissions -> 'settings' = 'true'::jsonb and level >= 80,
  'kill_switch_execute', permissions -> 'kill_switch' = 'true'::jsonb,
  'users_view', permissions -> 'users' = 'true'::jsonb,
  'users_manage', permissions -> 'users' = 'true'::jsonb,
  'profiles_manage', permissions -> 'users' = 'true'::jsonb,
  'audit_view', code in ('owner', 'supervisor')
),
updated_at = timezone('utc'::text, now());

insert into landlord.cloud_admin_profiles (code, name, description, level, permissions, is_system, is_active)
values (
  'supervisor',
  'Supervisor',
  'Supervisión operativa, usuarios de menor nivel y consulta del registro de auditoría.',
  90,
  '{"dashboard":true,"tenants":true,"plans":true,"support":true,"improvements":true,"apk":true,"observability":true,"terminal_recovery":true,"billing":true,"settings":false,"kill_switch":false,"users":true,"dashboard_view":true,"tenants_view":true,"tenants_manage":true,"tenants_delete":false,"plans_view":true,"plans_manage":true,"support_view":true,"support_manage":true,"knowledge_view":true,"knowledge_manage":true,"calendar_view":true,"calendar_manage":true,"improvements_view":true,"improvements_manage":true,"internal_requests_view":true,"internal_requests_manage":true,"apk_view":true,"apk_manage":true,"observability_view":true,"billing_view":true,"billing_manage":true,"settings_view":false,"settings_manage":false,"kill_switch_execute":false,"users_view":true,"users_manage":true,"profiles_manage":false,"audit_view":true}'::jsonb,
  true,
  true
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    level = excluded.level,
    permissions = landlord.cloud_admin_profiles.permissions || excluded.permissions,
    is_system = true,
    is_active = true,
    updated_at = timezone('utc'::text, now());

commit;
