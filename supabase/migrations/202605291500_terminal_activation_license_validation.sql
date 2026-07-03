BEGIN;

CREATE OR REPLACE FUNCTION landlord.validate_terminal_activation_license(
    p_tenant_id UUID,
    p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
DECLARE
    v_device_id TEXT;
    v_limit INTEGER;
    v_used_seats INTEGER := 0;
    v_device_exists BOOLEAN := FALSE;
    v_tenant RECORD;
    v_reason TEXT := NULL;
    v_code TEXT := NULL;
    v_allowed BOOLEAN := TRUE;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id is required';
    END IF;

    v_device_id := NULLIF(BTRIM(COALESCE(p_device_id, '')), '');

    SELECT
        t.id,
        t.status,
        t.email,
        t.lifecycle_status,
        t.provisioning_status,
        GREATEST(COALESCE(t.max_pos_terminals, 1), 1) AS max_pos_terminals
    INTO v_tenant
    FROM landlord.tenants AS t
    WHERE t.id = p_tenant_id;

    IF v_tenant.id IS NULL THEN
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'reason', 'Tenant no encontrado.',
            'code', 'LICENSE_CHECK_FAILED',
            'used_seats', 0,
            'max_seats', 0
        );
    END IF;

    v_limit := v_tenant.max_pos_terminals;

    IF v_tenant.status = 'SUSPENDED' THEN
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'reason', 'El tenant esta suspendido. Contacte a su distribuidor.',
            'code', 'TENANT_SUSPENDED',
            'used_seats', 0,
            'max_seats', v_limit
        );
    END IF;

    IF COALESCE(v_tenant.lifecycle_status, '') = 'BLOCKED'
        OR COALESCE(v_tenant.provisioning_status, '') = 'BLOCKED' THEN
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'reason', 'La activacion POS esta bloqueada para este tenant. Contacte a su distribuidor.',
            'code', 'LICENSE_BLOCKED',
            'used_seats', 0,
            'max_seats', v_limit
        );
    END IF;

    PERFORM landlord.enforce_tenant_pos_license_limits(v_tenant.id);

    SELECT COUNT(DISTINCT registry.device_id)
    INTO v_used_seats
    FROM landlord.tenant_server_registry AS registry
    WHERE registry.tenant_id = v_tenant.id
      AND registry.status = 'ONLINE'
      AND COALESCE(registry.is_revoked, FALSE) = FALSE
      AND COALESCE(registry.auth_status, 'AUTHORIZED') <> 'LICENSE_EXCEEDED';

    IF v_device_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM landlord.tenant_server_registry AS registry
            WHERE registry.tenant_id = v_tenant.id
              AND registry.device_id = v_device_id
        ) INTO v_device_exists;
    END IF;

    IF NOT v_device_exists AND v_used_seats >= v_limit THEN
        v_allowed := FALSE;
        v_code := 'TERMINAL_LICENSE_LIMIT';
        v_reason := 'No tiene licencias de terminal disponibles para instalar este equipo. Contacte a su distribuidor para asignar o ampliar licencias.';
    END IF;

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'reason', v_reason,
        'code', v_code,
        'used_seats', v_used_seats,
        'max_seats', v_limit
    );
END;
$$;

DROP FUNCTION IF EXISTS public.check_terminal_license_availability(UUID, TEXT);

CREATE FUNCTION public.check_terminal_license_availability(
    p_tenant_id UUID,
    p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
    SELECT landlord.validate_terminal_activation_license(p_tenant_id, p_device_id);
$$;

DROP FUNCTION IF EXISTS public.validate_terminal_activation_license(UUID, TEXT);

CREATE FUNCTION public.validate_terminal_activation_license(
    p_tenant_id UUID,
    p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
    SELECT landlord.validate_terminal_activation_license(p_tenant_id, p_device_id);
$$;

REVOKE ALL ON FUNCTION landlord.validate_terminal_activation_license(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION landlord.validate_terminal_activation_license(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.check_terminal_license_availability(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_terminal_activation_license(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_terminal_license_availability(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_terminal_activation_license(UUID, TEXT) TO anon, authenticated, service_role;

COMMIT;
