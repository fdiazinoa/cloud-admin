-- Keep the existing signature, ownership and grants. Tenant suspension is an access overlay,
-- never revoke devices or rewrite terminal is_active (reactivation preserves manual blocks).
CREATE OR REPLACE FUNCTION public.resolve_tenant_license(
    p_tenant_id UUID DEFAULT NULL,
    p_slug TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_device_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    status landlord.tenant_status,
    slug TEXT,
    max_pos_terminals INTEGER,
    max_erp_users INTEGER,
    active_pos_terminals INTEGER,
    device_license_allowed BOOLEAN,
    license_block_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
DECLARE
    v_tenant RECORD;
    v_limit INTEGER;
    v_active_units INTEGER;
    v_device_allowed BOOLEAN := TRUE;
    v_block_reason TEXT := NULL;
    v_uses_terminal_slots BOOLEAN := FALSE;
    v_uses_erp_catalog BOOLEAN := FALSE;
BEGIN
    SELECT
        t.id,
        t.status,
        t.slug::TEXT AS slug,
        GREATEST(COALESCE(t.max_pos_terminals, 1), 1) AS max_pos_terminals,
        COALESCE(t.max_erp_users, 1) AS max_erp_users,
        landlord.tenant_uses_terminal_slot_licensing(t.id) AS uses_terminal_slots,
        landlord.tenant_uses_erp_terminal_catalog_licensing(t.id) AS uses_erp_catalog
    INTO v_tenant
    FROM landlord.tenants AS t
    WHERE
        (p_tenant_id IS NOT NULL AND t.id = p_tenant_id)
        OR (p_tenant_id IS NULL AND p_slug IS NOT NULL AND t.slug = p_slug)
        OR (
            p_tenant_id IS NULL
            AND p_slug IS NULL
            AND p_email IS NOT NULL
            AND lower(t.email) = lower(p_email)
        )
    ORDER BY
        CASE
            WHEN p_tenant_id IS NOT NULL AND t.id = p_tenant_id THEN 0
            WHEN p_slug IS NOT NULL AND t.slug = p_slug THEN 1
            ELSE 2
        END
    LIMIT 1;

    IF v_tenant.id IS NULL THEN
        RETURN;
    END IF;

    v_limit := v_tenant.max_pos_terminals;
    v_uses_terminal_slots := v_tenant.uses_terminal_slots;
    v_uses_erp_catalog := v_tenant.uses_erp_catalog;

    SELECT seats.used_seats
    INTO v_active_units
    FROM landlord.count_tenant_pos_license_seats(v_tenant.id) AS seats;

    IF NOT v_uses_erp_catalog THEN
        PERFORM landlord.enforce_tenant_pos_license_limits(v_tenant.id);
        SELECT seats.used_seats
        INTO v_active_units
        FROM landlord.count_tenant_pos_license_seats(v_tenant.id) AS seats;
    END IF;

    RETURN QUERY
    SELECT
        v_tenant.id,
        v_tenant.status,
        v_tenant.slug,
        v_limit,
        v_tenant.max_erp_users,
        v_active_units,
        v_tenant.status <> 'SUSPENDED',
        CASE WHEN v_tenant.status = 'SUSPENDED' THEN 'TENANT_SUSPENDED' ELSE NULL END::TEXT;
END;
$$;

