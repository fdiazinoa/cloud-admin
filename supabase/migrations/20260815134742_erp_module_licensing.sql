begin;

create table if not exists landlord.erp_module_catalog (
  code text primary key,
  name text not null,
  description text not null,
  category text not null,
  icon_key text not null,
  license_metric text not null default 'boolean'
    check (license_metric in ('boolean', 'users', 'employees', 'locations', 'connections', 'transactions', 'unlimited')),
  default_limit integer not null default 1 check (default_limit > 0),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  display_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists landlord.erp_module_dependencies (
  module_code text not null references landlord.erp_module_catalog(code) on delete cascade,
  required_module_code text not null references landlord.erp_module_catalog(code) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (module_code, required_module_code),
  check (module_code <> required_module_code)
);

create table if not exists landlord.tenant_erp_module_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references landlord.tenants(id) on delete cascade,
  module_code text not null references landlord.erp_module_catalog(code) on delete restrict,
  status text not null default 'inactive'
    check (status in ('active', 'inactive', 'suspended')),
  licensed_quantity integer not null default 1 check (licensed_quantity > 0),
  provisioning_status text not null default 'pending'
    check (provisioning_status in ('pending', 'provisioned', 'error')),
  provisioned_at timestamptz,
  last_error text,
  starts_at timestamptz,
  ends_at timestamptz,
  version bigint not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (tenant_id, module_code),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists landlord.tenant_erp_module_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references landlord.tenants(id) on delete cascade,
  module_code text not null references landlord.erp_module_catalog(code) on delete restrict,
  actor_admin_user_id uuid references landlord.cloud_admin_users(id) on delete set null,
  actor_email text,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists tenant_erp_module_entitlements_tenant_idx
  on landlord.tenant_erp_module_entitlements(tenant_id, status, provisioning_status);
create index if not exists tenant_erp_module_entitlements_module_idx
  on landlord.tenant_erp_module_entitlements(module_code);
create index if not exists tenant_erp_module_events_tenant_idx
  on landlord.tenant_erp_module_events(tenant_id, created_at desc);
create index if not exists tenant_erp_module_events_module_idx
  on landlord.tenant_erp_module_events(module_code);
create index if not exists tenant_erp_module_events_actor_idx
  on landlord.tenant_erp_module_events(actor_admin_user_id) where actor_admin_user_id is not null;
create index if not exists erp_module_dependencies_required_idx
  on landlord.erp_module_dependencies(required_module_code);

drop trigger if exists update_erp_module_catalog_updated_at on landlord.erp_module_catalog;
create trigger update_erp_module_catalog_updated_at
  before update on landlord.erp_module_catalog
  for each row execute function landlord.update_support_updated_at_column();

drop trigger if exists update_tenant_erp_module_entitlements_updated_at on landlord.tenant_erp_module_entitlements;
create trigger update_tenant_erp_module_entitlements_updated_at
  before update on landlord.tenant_erp_module_entitlements
  for each row execute function landlord.update_support_updated_at_column();

alter table landlord.erp_module_catalog enable row level security;
alter table landlord.erp_module_dependencies enable row level security;
alter table landlord.tenant_erp_module_entitlements enable row level security;
alter table landlord.tenant_erp_module_events enable row level security;

drop policy if exists "Deny public access to ERP module catalog" on landlord.erp_module_catalog;
create policy "Deny public access to ERP module catalog"
  on landlord.erp_module_catalog for all to public using (false) with check (false);
drop policy if exists "Deny public access to ERP module dependencies" on landlord.erp_module_dependencies;
create policy "Deny public access to ERP module dependencies"
  on landlord.erp_module_dependencies for all to public using (false) with check (false);
drop policy if exists "Deny public access to tenant ERP module entitlements" on landlord.tenant_erp_module_entitlements;
create policy "Deny public access to tenant ERP module entitlements"
  on landlord.tenant_erp_module_entitlements for all to public using (false) with check (false);
drop policy if exists "Deny public access to tenant ERP module events" on landlord.tenant_erp_module_events;
create policy "Deny public access to tenant ERP module events"
  on landlord.tenant_erp_module_events for all to public using (false) with check (false);

revoke all on landlord.erp_module_catalog from anon, authenticated;
revoke all on landlord.erp_module_dependencies from anon, authenticated;
revoke all on landlord.tenant_erp_module_entitlements from anon, authenticated;
revoke all on landlord.tenant_erp_module_events from anon, authenticated;
grant select on landlord.erp_module_catalog to service_role;
grant select on landlord.erp_module_dependencies to service_role;
grant select, insert, update on landlord.tenant_erp_module_entitlements to service_role;
grant insert on landlord.tenant_erp_module_events to service_role;

insert into landlord.erp_module_catalog
  (code, name, description, category, icon_key, license_metric, default_limit, is_featured, display_order)
values
  ('hr', 'RRHH', 'Expedientes, contratos, vacaciones y gestión del personal.', 'Administración', 'users', 'employees', 25, true, 10),
  ('payroll', 'Nómina', 'Cálculo de nómina, novedades, deducciones y comprobantes.', 'Administración', 'banknote', 'employees', 25, true, 20),
  ('accounting', 'Contabilidad', 'Catálogo de cuentas, asientos, cierres y estados financieros.', 'Finanzas', 'calculator', 'locations', 1, true, 30),
  ('shopify', 'Shopify', 'Sincronización de productos, inventario, clientes y pedidos.', 'Integraciones', 'shopping-bag', 'connections', 1, true, 40),
  ('uber', 'Uber', 'Integración de órdenes y conciliación por sucursal.', 'Integraciones', 'car', 'locations', 1, true, 50),
  ('advanced_inventory', 'Inventario avanzado', 'Almacenes múltiples, transferencias y reglas avanzadas de reposición.', 'Operaciones', 'warehouse', 'locations', 1, false, 60),
  ('developer_api', 'API y automatizaciones', 'Acceso controlado a integraciones y automatizaciones externas.', 'Integraciones', 'braces', 'transactions', 10000, false, 70)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    icon_key = excluded.icon_key,
    license_metric = excluded.license_metric,
    default_limit = excluded.default_limit,
    is_featured = excluded.is_featured,
    display_order = excluded.display_order,
    updated_at = timezone('utc'::text, now());

insert into landlord.erp_module_dependencies(module_code, required_module_code)
values ('payroll', 'hr')
on conflict do nothing;

update landlord.cloud_admin_profiles
set permissions = permissions || jsonb_build_object(
  'licenses_view', coalesce((permissions ->> 'tenants')::boolean, false) or coalesce((permissions ->> 'plans')::boolean, false),
  'licenses_manage', coalesce((permissions ->> 'plans')::boolean, false) and level >= 50
),
updated_at = timezone('utc'::text, now());

create or replace function landlord.get_tenant_erp_module_snapshot(p_tenant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'tenant_id', p_tenant_id,
    'version', coalesce(max(entitlement.version), 0),
    'modules', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'module_code', entitlement.module_code,
          'enabled', entitlement.status = 'active',
          'status', entitlement.status,
          'licensed_quantity', entitlement.licensed_quantity,
          'provisioning_status', entitlement.provisioning_status,
          'version', entitlement.version,
          'starts_at', entitlement.starts_at,
          'ends_at', entitlement.ends_at
        ) order by catalog.display_order, catalog.name
      ) filter (where entitlement.id is not null),
      '[]'::jsonb
    )
  )
  from landlord.tenant_erp_module_entitlements entitlement
  join landlord.erp_module_catalog catalog on catalog.code = entitlement.module_code
  where entitlement.tenant_id = p_tenant_id;
$$;

create or replace function landlord.apply_tenant_erp_module_entitlements(
  p_tenant_id uuid,
  p_entitlements jsonb,
  p_actor_admin_user_id uuid default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_erp_enabled boolean;
  v_item jsonb;
  v_module_code text;
  v_enabled boolean;
  v_quantity integer;
  v_before landlord.tenant_erp_module_entitlements%rowtype;
  v_after landlord.tenant_erp_module_entitlements%rowtype;
  v_changed boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text, 0));

  if jsonb_typeof(p_entitlements) <> 'array' then
    raise exception 'MODULE_ENTITLEMENTS_ARRAY_REQUIRED';
  end if;

  select coalesce(t.erp_ui_enabled, t.type in ('full', 'erp_only'))
    into v_erp_enabled
  from landlord.tenants t
  where t.id = p_tenant_id;

  if not found then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entitlements) item
    left join landlord.erp_module_catalog catalog on catalog.code = item ->> 'module_code'
    where catalog.code is null or catalog.is_active is not true
  ) then
    raise exception 'UNKNOWN_OR_INACTIVE_ERP_MODULE';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_entitlements)
  ) <> (
    select count(distinct item ->> 'module_code') from jsonb_array_elements(p_entitlements) item
  ) then
    raise exception 'DUPLICATE_ERP_MODULE';
  end if;

  if not v_erp_enabled and exists (
    select 1 from jsonb_array_elements(p_entitlements) item where item ->> 'enabled' = 'true'
  ) then
    raise exception 'ERP_REQUIRED_FOR_MODULES';
  end if;

  if exists (
    select 1
    from landlord.erp_module_dependencies dependency
    join jsonb_array_elements(p_entitlements) selected
      on selected ->> 'module_code' = dependency.module_code
     and selected ->> 'enabled' = 'true'
    where not exists (
      select 1
      from jsonb_array_elements(p_entitlements) required
      where required ->> 'module_code' = dependency.required_module_code
        and required ->> 'enabled' = 'true'
    )
  ) then
    raise exception 'ERP_MODULE_DEPENDENCY_REQUIRED';
  end if;

  for v_item in select value from jsonb_array_elements(p_entitlements)
  loop
    v_module_code := v_item ->> 'module_code';
    v_enabled := v_item ->> 'enabled' = 'true';
    v_quantity := greatest(coalesce(nullif(v_item ->> 'licensed_quantity', '')::integer, 1), 1);

    select * into v_before
    from landlord.tenant_erp_module_entitlements entitlement
    where entitlement.tenant_id = p_tenant_id
      and entitlement.module_code = v_module_code;

    v_changed := not found
      or v_before.status is distinct from case when v_enabled then 'active' else 'inactive' end
      or v_before.licensed_quantity is distinct from v_quantity;

    insert into landlord.tenant_erp_module_entitlements (
      tenant_id, module_code, status, licensed_quantity, provisioning_status,
      provisioned_at, last_error, version
    ) values (
      p_tenant_id,
      v_module_code,
      case when v_enabled then 'active' else 'inactive' end,
      v_quantity,
      'pending',
      null,
      null,
      1
    )
    on conflict (tenant_id, module_code) do update
    set status = excluded.status,
        licensed_quantity = excluded.licensed_quantity,
        provisioning_status = case when v_changed then 'pending' else landlord.tenant_erp_module_entitlements.provisioning_status end,
        provisioned_at = case when v_changed then null else landlord.tenant_erp_module_entitlements.provisioned_at end,
        last_error = case when v_changed then null else landlord.tenant_erp_module_entitlements.last_error end,
        version = case when v_changed then landlord.tenant_erp_module_entitlements.version + 1 else landlord.tenant_erp_module_entitlements.version end
    returning * into v_after;

    if v_changed then
      insert into landlord.tenant_erp_module_events (
        tenant_id, module_code, actor_admin_user_id, actor_email, action, before_data, after_data
      ) values (
        p_tenant_id,
        v_module_code,
        p_actor_admin_user_id,
        nullif(trim(p_actor_email), ''),
        case when v_enabled then 'module.activate' else 'module.deactivate' end,
        case when v_before.id is null then null else to_jsonb(v_before) end,
        to_jsonb(v_after)
      );
    end if;
  end loop;

  return landlord.get_tenant_erp_module_snapshot(p_tenant_id);
end;
$$;

create or replace function landlord.acknowledge_tenant_erp_modules(
  p_tenant_id uuid,
  p_version bigint,
  p_success boolean,
  p_error text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update landlord.tenant_erp_module_entitlements
  set provisioning_status = case when p_success then 'provisioned' else 'error' end,
      provisioned_at = case when p_success then timezone('utc'::text, now()) else null end,
      last_error = case when p_success then null else left(coalesce(p_error, 'ERP_MODULE_PROVISIONING_FAILED'), 1000) end
  where tenant_id = p_tenant_id
    and version <= p_version
    and provisioning_status = 'pending';

  return landlord.get_tenant_erp_module_snapshot(p_tenant_id);
end;
$$;

create or replace function landlord.suspend_tenant_erp_modules_when_erp_disabled()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entitlement landlord.tenant_erp_module_entitlements%rowtype;
begin
  if coalesce(new.erp_ui_enabled, false) = false and coalesce(old.erp_ui_enabled, false) = true then
    for v_entitlement in
      update landlord.tenant_erp_module_entitlements
      set status = 'suspended',
          provisioning_status = 'pending',
          provisioned_at = null,
          last_error = 'ERP_DISABLED',
          version = version + 1
      where tenant_id = new.id and status = 'active'
      returning *
    loop
      insert into landlord.tenant_erp_module_events (
        tenant_id, module_code, action, after_data
      ) values (
        new.id, v_entitlement.module_code, 'module.suspend_erp_disabled', to_jsonb(v_entitlement)
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists suspend_tenant_erp_modules_when_erp_disabled on landlord.tenants;
create trigger suspend_tenant_erp_modules_when_erp_disabled
  after update of erp_ui_enabled on landlord.tenants
  for each row execute function landlord.suspend_tenant_erp_modules_when_erp_disabled();

revoke all on function landlord.apply_tenant_erp_module_entitlements(uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function landlord.get_tenant_erp_module_snapshot(uuid) from public, anon, authenticated;
revoke all on function landlord.acknowledge_tenant_erp_modules(uuid, bigint, boolean, text) from public, anon, authenticated;
revoke all on function landlord.suspend_tenant_erp_modules_when_erp_disabled() from public, anon, authenticated;
grant execute on function landlord.apply_tenant_erp_module_entitlements(uuid, jsonb, uuid, text) to service_role;
grant execute on function landlord.get_tenant_erp_module_snapshot(uuid) to service_role;
grant execute on function landlord.acknowledge_tenant_erp_modules(uuid, bigint, boolean, text) to service_role;

commit;
