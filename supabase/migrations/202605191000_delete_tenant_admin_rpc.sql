CREATE OR REPLACE FUNCTION landlord.delete_tenant(
    p_tenant_id UUID,
    p_confirm_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = landlord, public
AS $$
DECLARE
    v_tenant landlord.tenants%ROWTYPE;
    v_schema_name TEXT;
BEGIN
    SELECT *
    INTO v_tenant
    FROM landlord.tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant no encontrado'
            USING ERRCODE = 'P0002';
    END IF;

    IF COALESCE(p_confirm_name, '') <> v_tenant.name THEN
        RAISE EXCEPTION 'Confirmacion de tenant invalida'
            USING ERRCODE = '22023';
    END IF;

    v_schema_name := v_tenant.slug;

    DELETE FROM landlord.tenants
    WHERE id = p_tenant_id;

    IF v_schema_name IS NOT NULL
        AND v_schema_name <> ''
        AND v_schema_name NOT IN (
            'auth',
            'extensions',
            'graphql',
            'graphql_public',
            'landlord',
            'public',
            'realtime',
            'seed_template',
            'storage',
            'supabase_functions',
            'vault'
        )
    THEN
        EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_schema_name);
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION landlord.delete_tenant(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION landlord.delete_tenant(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION landlord.delete_tenant(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION landlord.delete_tenant(UUID, TEXT) TO service_role;
