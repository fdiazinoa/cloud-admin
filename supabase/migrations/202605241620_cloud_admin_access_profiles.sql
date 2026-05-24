begin;

create table if not exists landlord.cloud_admin_profiles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  level integer not null default 10 check (level >= 0 and level <= 100),
  permissions jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists landlord.cloud_admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null,
  full_name text not null,
  profile_id uuid references landlord.cloud_admin_profiles(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended')),
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists cloud_admin_users_email_uidx
  on landlord.cloud_admin_users (lower(email));

create index if not exists cloud_admin_users_profile_id_idx
  on landlord.cloud_admin_users(profile_id);

drop trigger if exists update_cloud_admin_profiles_updated_at on landlord.cloud_admin_profiles;
create trigger update_cloud_admin_profiles_updated_at
  before update on landlord.cloud_admin_profiles
  for each row
  execute function landlord.update_support_updated_at_column();

drop trigger if exists update_cloud_admin_users_updated_at on landlord.cloud_admin_users;
create trigger update_cloud_admin_users_updated_at
  before update on landlord.cloud_admin_users
  for each row
  execute function landlord.update_support_updated_at_column();

alter table landlord.cloud_admin_profiles enable row level security;
alter table landlord.cloud_admin_users enable row level security;

drop policy if exists "Deny all to public on cloud_admin_profiles" on landlord.cloud_admin_profiles;
create policy "Deny all to public on cloud_admin_profiles"
on landlord.cloud_admin_profiles
for all
to public
using (false)
with check (false);

drop policy if exists "Deny all to public on cloud_admin_users" on landlord.cloud_admin_users;
create policy "Deny all to public on cloud_admin_users"
on landlord.cloud_admin_users
for all
to public
using (false)
with check (false);

insert into landlord.cloud_admin_profiles (code, name, description, level, permissions, is_system)
values
  (
    'owner',
    'Propietario',
    'Control total del Cloud-Admin, usuarios, configuración, tenants y operaciones críticas.',
    100,
    '{"dashboard":true,"tenants":true,"plans":true,"support":true,"improvements":true,"apk":true,"terminal_recovery":true,"billing":true,"settings":true,"kill_switch":true,"users":true}'::jsonb,
    true
  ),
  (
    'admin',
    'Administrador',
    'Administración operativa sin cambios destructivos de seguridad.',
    80,
    '{"dashboard":true,"tenants":true,"plans":true,"support":true,"improvements":true,"apk":true,"terminal_recovery":true,"billing":true,"settings":true,"kill_switch":false,"users":false}'::jsonb,
    true
  ),
  (
    'support',
    'Soporte',
    'Gestión de HelpDesk, mejoras solicitadas y acciones técnicas supervisadas.',
    60,
    '{"dashboard":true,"tenants":true,"plans":false,"support":true,"improvements":true,"apk":true,"terminal_recovery":true,"billing":false,"settings":false,"kill_switch":false,"users":false}'::jsonb,
    true
  ),
  (
    'operations',
    'Operaciones',
    'Seguimiento operativo de tenants, licencias, APK y recuperación de terminales.',
    50,
    '{"dashboard":true,"tenants":true,"plans":true,"support":false,"improvements":false,"apk":true,"terminal_recovery":true,"billing":true,"settings":false,"kill_switch":false,"users":false}'::jsonb,
    true
  ),
  (
    'viewer',
    'Solo lectura',
    'Consulta de dashboard y estado operativo sin cambios.',
    20,
    '{"dashboard":true,"tenants":true,"plans":true,"support":true,"improvements":true,"apk":true,"terminal_recovery":false,"billing":true,"settings":false,"kill_switch":false,"users":false}'::jsonb,
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  level = excluded.level,
  permissions = excluded.permissions,
  is_system = true,
  is_active = true,
  updated_at = timezone('utc'::text, now());

commit;
