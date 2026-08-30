begin;

-- Preserve the existing semantic provisioning implementation behind an
-- internal name. The public RPC below adds license limits without duplicating
-- the tenant provisioning rules and keeps the tenant insert + limits update in
-- the same Postgres transaction.
alter function landlord.create_new_tenant(
    text,
    text,
    text,
    text,
    boolean,
    text,
    text,
    text,
    uuid,
    uuid,
    text,
    text,
    boolean,
    boolean,
    text,
    text,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    text,
    text
) rename to create_new_tenant_without_license_limits;

revoke all on function landlord.create_new_tenant_without_license_limits(
    text,
    text,
    text,
    text,
    boolean,
    text,
    text,
    text,
    uuid,
    uuid,
    text,
    text,
    boolean,
    boolean,
    text,
    text,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    text,
    text
) from public, anon, authenticated;

grant execute on function landlord.create_new_tenant_without_license_limits(
    text,
    text,
    text,
    text,
    boolean,
    text,
    text,
    text,
    uuid,
    uuid,
    text,
    text,
    boolean,
    boolean,
    text,
    text,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    text,
    text
) to service_role;

create function landlord.create_new_tenant(
    p_name text,
    p_slug text,
    p_email text,
    p_type text default 'full',
    p_cloud_sync boolean default true,
    p_contact_name text default null,
    p_contact_email text default null,
    p_city text default null,
    p_captured_by_distributor_id uuid default null,
    p_serviced_by_distributor_id uuid default null,
    p_contracted_product text default null,
    p_pos_variant text default null,
    p_offline_mode boolean default null,
    p_explicit_offline boolean default null,
    p_cloud_disabled_reason text default null,
    p_pos_runtime text default null,
    p_cloud_channel text default null,
    p_data_master text default null,
    p_cloud_sync_enabled boolean default null,
    p_erp_core_enabled boolean default null,
    p_erp_ui_enabled boolean default null,
    p_customer_erp_access boolean default null,
    p_backup_enabled boolean default null,
    p_lifecycle_status text default null,
    p_provisioning_status text default null,
    p_max_pos_terminals integer default 1,
    p_max_erp_users integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public, landlord
as $$
declare
    v_tenant_id uuid;
    v_max_pos_terminals integer := greatest(coalesce(p_max_pos_terminals, 1), 1);
    v_max_erp_users integer := greatest(coalesce(p_max_erp_users, 1), 1);
begin
    v_tenant_id := landlord.create_new_tenant_without_license_limits(
        p_name,
        p_slug,
        p_email,
        p_type,
        p_cloud_sync,
        p_contact_name,
        p_contact_email,
        p_city,
        p_captured_by_distributor_id,
        p_serviced_by_distributor_id,
        p_contracted_product,
        p_pos_variant,
        p_offline_mode,
        p_explicit_offline,
        p_cloud_disabled_reason,
        p_pos_runtime,
        p_cloud_channel,
        p_data_master,
        p_cloud_sync_enabled,
        p_erp_core_enabled,
        p_erp_ui_enabled,
        p_customer_erp_access,
        p_backup_enabled,
        p_lifecycle_status,
        p_provisioning_status
    );

    update landlord.tenants
    set
        max_pos_terminals = v_max_pos_terminals,
        max_erp_users = v_max_erp_users
    where id = v_tenant_id;

    if not found then
        raise exception 'No se pudo aplicar la configuración de licencias al tenant recién creado.';
    end if;

    return v_tenant_id;
end;
$$;

revoke all on function landlord.create_new_tenant(
    text,
    text,
    text,
    text,
    boolean,
    text,
    text,
    text,
    uuid,
    uuid,
    text,
    text,
    boolean,
    boolean,
    text,
    text,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    text,
    text,
    integer,
    integer
) from public, anon, authenticated;

grant execute on function landlord.create_new_tenant(
    text,
    text,
    text,
    text,
    boolean,
    text,
    text,
    text,
    uuid,
    uuid,
    text,
    text,
    boolean,
    boolean,
    text,
    text,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    text,
    text,
    integer,
    integer
) to service_role;

commit;
