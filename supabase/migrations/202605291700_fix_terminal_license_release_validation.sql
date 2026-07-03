BEGIN;

DROP FUNCTION IF EXISTS landlord.validate_terminal_activation_license(UUID, TEXT);

-- Liberar cupo debe vaciar la caja (terminal_id) completa en POS_ONLY.
-- Validacion de activacion no debe contar filas OFFLINE/revocadas como cupo ocupado.

CREATE OR REPLACE FUNCTION landlord.validate_terminal_activation_license(
    p_tenant_id UUID,
    p_device_id TEXT DEFAULT NULL,
    p_terminal_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
DECLARE
    v_device_id TEXT;
    v_terminal_id TEXT;
    v_limit INTEGER;
    v_used_seats INTEGER := 0;
    v_license_unit TEXT := 'device_id';
    v_device_has_active_seat BOOLEAN := FALSE;
    v_terminal_has_active_seat BOOLEAN := FALSE;
    v_terminal_slot_empty BOOLEAN := FALSE;
    v_tenant RECORD;
    v_reason TEXT := NULL;
    v_code TEXT := NULL;
    v_allowed BOOLEAN := TRUE;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id is required';
    END IF;

    v_device_id := NULLIF(BTRIM(COALESCE(p_device_id, '')), '');
    v_terminal_id := NULLIF(BTRIM(COALESCE(p_terminal_id, '')), '');

    SELECT
        t.id,
        t.status,
        t.email,
        t.lifecycle_status,
        t.provisioning_status,
        GREATEST(COALESCE(t.max_pos_terminals, 1), 1) AS max_pos_terminals,
        landlord.tenant_uses_terminal_slot_licensing(t.id) AS uses_terminal_slots
    INTO v_tenant
    FROM landlord.tenants AS t
    WHERE t.id = p_tenant_id;

    IF v_tenant.id IS NULL THEN
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'reason', 'Tenant no encontrado.',
            'code', 'LICENSE_CHECK_FAILED',
            'used_seats', 0,
            'max_seats', 0,
            'license_unit', 'unknown'
        );
    END IF;

    v_limit := v_tenant.max_pos_terminals;
    v_license_unit := CASE WHEN v_tenant.uses_terminal_slots THEN 'terminal_id' ELSE 'device_id' END;

    IF v_tenant.status = 'SUSPENDED' THEN
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'reason', 'El tenant esta suspendido. Contacte a su distribuidor.',
            'code', 'TENANT_SUSPENDED',
            'used_seats', 0,
            'max_seats', v_limit,
            'license_unit', v_license_unit
        );
    END IF;

    IF COALESCE(v_tenant.lifecycle_status, '') = 'BLOCKED'
        OR COALESCE(v_tenant.provisioning_status, '') = 'BLOCKED' THEN
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'reason', 'La activacion POS esta bloqueada para este tenant. Contacte a su distribuidor.',
            'code', 'LICENSE_BLOCKED',
            'used_seats', 0,
            'max_seats', v_limit,
            'license_unit', v_license_unit
        );
    END IF;

    PERFORM landlord.enforce_tenant_pos_license_limits(v_tenant.id);

    SELECT seats.used_seats, seats.license_unit
    INTO v_used_seats, v_license_unit
    FROM landlord.count_tenant_pos_license_seats(v_tenant.id) AS seats;

    IF v_device_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM landlord.tenant_server_registry AS registry
            WHERE registry.tenant_id = v_tenant.id
              AND registry.device_id = v_device_id
              AND registry.status = 'ONLINE'
              AND COALESCE(registry.is_revoked, FALSE) = FALSE
              AND registry.auth_status IN ('AUTHORIZED', 'TAKEOVER_COMPLETED')
        ) INTO v_device_has_active_seat;

        IF v_tenant.uses_terminal_slots THEN
            SELECT EXISTS (
                SELECT 1
                FROM landlord.tenant_server_registry AS registry
                WHERE registry.tenant_id = v_tenant.id
                  AND registry.device_id = v_device_id
                  AND registry.status = 'ONLINE'
                  AND COALESCE(registry.is_revoked, FALSE) = FALSE
                  AND registry.auth_status IN ('AUTHORIZED', 'TAKEOVER_COMPLETED')
                  AND NULLIF(BTRIM(registry.terminal_id), '') IS NOT NULL
            ) INTO v_terminal_has_active_seat;
        END IF;
    END IF;

    IF v_tenant.uses_terminal_slots AND v_terminal_id IS NOT NULL THEN
        SELECT NOT EXISTS (
            SELECT 1
            FROM landlord.tenant_server_registry AS registry
            WHERE registry.tenant_id = v_tenant.id
              AND BTRIM(registry.terminal_id) = v_terminal_id
              AND registry.status = 'ONLINE'
              AND COALESCE(registry.is_revoked, FALSE) = FALSE
              AND registry.auth_status IN ('AUTHORIZED', 'TAKEOVER_COMPLETED')
        ) INTO v_terminal_slot_empty;
    END IF;

    IF NOT v_device_has_active_seat
        AND NOT v_terminal_has_active_seat
        AND NOT COALESCE(v_terminal_slot_empty, FALSE)
        AND v_used_seats >= v_limit THEN
        v_allowed := FALSE;
        v_code := 'TERMINAL_LICENSE_LIMIT';
        IF v_tenant.uses_terminal_slots THEN
            v_reason := 'No tiene licencias de terminal disponibles para registrar otra caja. Cada licencia corresponde a una caja distinta (Caja 1, Caja 2, ...). Contacte a su distribuidor para asignar o ampliar licencias.';
        ELSE
            v_reason := 'No tiene licencias de terminal disponibles para instalar este equipo. Contacte a su distribuidor para asignar o ampliar licencias.';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'reason', v_reason,
        'code', v_code,
        'used_seats', v_used_seats,
        'max_seats', v_limit,
        'license_unit', v_license_unit
    );
END;
$$;

GRANT EXECUTE ON FUNCTION landlord.validate_terminal_activation_license(UUID, TEXT, TEXT) TO service_role;

COMMIT;
