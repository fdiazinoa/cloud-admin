BEGIN;

-- POS_ONLY: 1 licencia = 1 terminal (Caja 1, Caja 2, ...). Reinstalar el mismo terminal
-- con otro device_id no consume licencias extra. Nombres de caja unicos por tenant.

CREATE OR REPLACE FUNCTION landlord.normalize_terminal_label(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(
        lower(regexp_replace(btrim(COALESCE(p_text, '')), '\s+', ' ', 'g')),
        ''
    );
$$;

CREATE OR REPLACE FUNCTION landlord.tenant_uses_terminal_slot_licensing(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, landlord
AS $$
    SELECT COALESCE(t.contracted_product, '') = 'POS_ONLY'
        OR COALESCE(t.type::TEXT, '') = 'pos_only'
    FROM landlord.tenants AS t
    WHERE t.id = p_tenant_id;
$$;

CREATE OR REPLACE FUNCTION landlord.count_tenant_pos_license_seats(p_tenant_id UUID)
RETURNS TABLE (
    used_seats INTEGER,
    max_seats INTEGER,
    license_unit TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, landlord
AS $$
DECLARE
    v_limit INTEGER;
    v_used INTEGER := 0;
    v_terminal_slots BOOLEAN := FALSE;
BEGIN
    SELECT
        GREATEST(COALESCE(t.max_pos_terminals, 1), 1),
        landlord.tenant_uses_terminal_slot_licensing(t.id)
    INTO v_limit, v_terminal_slots
    FROM landlord.tenants AS t
    WHERE t.id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 0, 0, 'unknown'::TEXT;
        RETURN;
    END IF;

    IF v_terminal_slots THEN
        SELECT COUNT(DISTINCT registry.terminal_id)::INTEGER
        INTO v_used
        FROM landlord.tenant_server_registry AS registry
        WHERE registry.tenant_id = p_tenant_id
          AND registry.status = 'ONLINE'
          AND COALESCE(registry.is_revoked, FALSE) = FALSE
          AND registry.auth_status = 'AUTHORIZED'
          AND NULLIF(BTRIM(registry.terminal_id), '') IS NOT NULL;
    ELSE
        SELECT COUNT(DISTINCT registry.device_id)::INTEGER
        INTO v_used
        FROM landlord.tenant_server_registry AS registry
        WHERE registry.tenant_id = p_tenant_id
          AND registry.status = 'ONLINE'
          AND COALESCE(registry.is_revoked, FALSE) = FALSE
          AND registry.auth_status = 'AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT
        v_used,
        v_limit,
        CASE WHEN v_terminal_slots THEN 'terminal_id' ELSE 'device_id' END;
END;
$$;

CREATE OR REPLACE FUNCTION landlord.enforce_tenant_pos_license_limits(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
DECLARE
    v_limit INTEGER;
    v_blocked INTEGER := 0;
    v_allowed INTEGER := 0;
    v_terminal_slots BOOLEAN := FALSE;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id is required';
    END IF;

    SELECT
        GREATEST(COALESCE(t.max_pos_terminals, 1), 1),
        landlord.tenant_uses_terminal_slot_licensing(t.id)
    INTO v_limit, v_terminal_slots
    FROM landlord.tenants AS t
    WHERE t.id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'tenant not found';
    END IF;

    IF v_terminal_slots THEN
        WITH terminal_rank AS (
            SELECT
                registry.terminal_id,
                MIN(registry.created_at) AS first_seen
            FROM landlord.tenant_server_registry AS registry
            WHERE registry.tenant_id = p_tenant_id
              AND registry.status = 'ONLINE'
              AND COALESCE(registry.is_revoked, FALSE) = FALSE
              AND NULLIF(BTRIM(registry.terminal_id), '') IS NOT NULL
            GROUP BY registry.terminal_id
        ),
        ranked AS (
            SELECT
                terminal_id,
                ROW_NUMBER() OVER (ORDER BY first_seen ASC, terminal_id ASC) AS slot_rank
            FROM terminal_rank
        ),
        updated AS (
            UPDATE landlord.tenant_server_registry AS registry
            SET
                auth_status = CASE
                    WHEN ranked.slot_rank <= v_limit THEN 'AUTHORIZED'
                    ELSE 'LICENSE_EXCEEDED'
                END,
                last_auth_error = CASE
                    WHEN ranked.slot_rank <= v_limit THEN NULL
                    ELSE 'Sin licencias POS contratadas. Contrata mas terminales con tu distribuidor.'
                END,
                requires_pos_reauth = ranked.slot_rank > v_limit,
                updated_at = timezone('utc', now())
            FROM ranked
            WHERE registry.tenant_id = p_tenant_id
              AND registry.terminal_id = ranked.terminal_id
              AND registry.status = 'ONLINE'
              AND COALESCE(registry.is_revoked, FALSE) = FALSE
            RETURNING
                CASE WHEN ranked.slot_rank <= v_limit THEN 1 ELSE 0 END AS allowed_flag,
                CASE WHEN ranked.slot_rank > v_limit THEN 1 ELSE 0 END AS blocked_flag
        )
        SELECT
            COALESCE(SUM(allowed_flag), 0),
            COALESCE(SUM(blocked_flag), 0)
        INTO v_allowed, v_blocked
        FROM updated;
    ELSE
        WITH device_rank AS (
            SELECT
                registry.device_id,
                MIN(registry.created_at) AS first_seen
            FROM landlord.tenant_server_registry AS registry
            WHERE registry.tenant_id = p_tenant_id
              AND registry.status = 'ONLINE'
              AND COALESCE(registry.is_revoked, FALSE) = FALSE
            GROUP BY registry.device_id
        ),
        ranked AS (
            SELECT
                device_id,
                ROW_NUMBER() OVER (ORDER BY first_seen ASC, device_id ASC) AS slot_rank
            FROM device_rank
        ),
        updated AS (
            UPDATE landlord.tenant_server_registry AS registry
            SET
                auth_status = CASE
                    WHEN ranked.slot_rank <= v_limit THEN 'AUTHORIZED'
                    ELSE 'LICENSE_EXCEEDED'
                END,
                last_auth_error = CASE
                    WHEN ranked.slot_rank <= v_limit THEN NULL
                    ELSE 'Sin licencias POS contratadas. Contrata mas terminales con tu distribuidor.'
                END,
                requires_pos_reauth = ranked.slot_rank > v_limit,
                updated_at = timezone('utc', now())
            FROM ranked
            WHERE registry.tenant_id = p_tenant_id
              AND registry.device_id = ranked.device_id
              AND registry.status = 'ONLINE'
              AND COALESCE(registry.is_revoked, FALSE) = FALSE
            RETURNING
                CASE WHEN ranked.slot_rank <= v_limit THEN 1 ELSE 0 END AS allowed_flag,
                CASE WHEN ranked.slot_rank > v_limit THEN 1 ELSE 0 END AS blocked_flag
        )
        SELECT
            COALESCE(SUM(allowed_flag), 0),
            COALESCE(SUM(blocked_flag), 0)
        INTO v_allowed, v_blocked
        FROM updated;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'max_pos_terminals', v_limit,
        'license_unit', CASE WHEN v_terminal_slots THEN 'terminal_id' ELSE 'device_id' END,
        'allowed_registry_rows', v_allowed,
        'blocked_registry_rows', v_blocked
    );
END;
$$;

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
    v_license_unit TEXT := 'device_id';
    v_device_exists BOOLEAN := FALSE;
    v_terminal_exists BOOLEAN := FALSE;
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
        ) INTO v_device_exists;

        IF v_tenant.uses_terminal_slots THEN
            SELECT EXISTS (
                SELECT 1
                FROM landlord.tenant_server_registry AS registry
                WHERE registry.tenant_id = v_tenant.id
                  AND registry.device_id = v_device_id
                  AND registry.auth_status = 'AUTHORIZED'
                  AND registry.status = 'ONLINE'
                  AND COALESCE(registry.is_revoked, FALSE) = FALSE
                  AND NULLIF(BTRIM(registry.terminal_id), '') IS NOT NULL
            ) INTO v_terminal_exists;
        END IF;
    END IF;

    IF NOT v_device_exists AND NOT v_terminal_exists AND v_used_seats >= v_limit THEN
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
    v_device_id TEXT;
    v_limit INTEGER;
    v_active_units INTEGER;
    v_device_allowed BOOLEAN := TRUE;
    v_block_reason TEXT := NULL;
    v_device_auth_status TEXT;
    v_uses_terminal_slots BOOLEAN := FALSE;
    v_device_exists BOOLEAN := FALSE;
    v_terminal_exists BOOLEAN := FALSE;
BEGIN
    v_device_id := NULLIF(BTRIM(COALESCE(p_device_id, '')), '');

    SELECT
        t.id,
        t.status,
        t.slug::TEXT AS slug,
        GREATEST(COALESCE(t.max_pos_terminals, 1), 1) AS max_pos_terminals,
        COALESCE(t.max_erp_users, 1) AS max_erp_users,
        landlord.tenant_uses_terminal_slot_licensing(t.id) AS uses_terminal_slots
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

    PERFORM landlord.enforce_tenant_pos_license_limits(v_tenant.id);

    v_limit := v_tenant.max_pos_terminals;
    v_uses_terminal_slots := v_tenant.uses_terminal_slots;

    SELECT seats.used_seats
    INTO v_active_units
    FROM landlord.count_tenant_pos_license_seats(v_tenant.id) AS seats;

    IF v_device_id IS NOT NULL THEN
        SELECT registry.auth_status
        INTO v_device_auth_status
        FROM landlord.tenant_server_registry AS registry
        WHERE registry.tenant_id = v_tenant.id
          AND registry.device_id = v_device_id
        ORDER BY registry.last_seen_at DESC NULLS LAST
        LIMIT 1;

        SELECT EXISTS (
            SELECT 1
            FROM landlord.tenant_server_registry AS registry
            WHERE registry.tenant_id = v_tenant.id
              AND registry.device_id = v_device_id
        ) INTO v_device_exists;

        IF v_uses_terminal_slots THEN
            SELECT EXISTS (
                SELECT 1
                FROM landlord.tenant_server_registry AS registry
                WHERE registry.tenant_id = v_tenant.id
                  AND registry.device_id = v_device_id
                  AND registry.auth_status = 'AUTHORIZED'
                  AND registry.status = 'ONLINE'
                  AND COALESCE(registry.is_revoked, FALSE) = FALSE
                  AND NULLIF(BTRIM(registry.terminal_id), '') IS NOT NULL
            ) INTO v_terminal_exists;
        END IF;

        IF COALESCE(v_device_auth_status, '') = 'LICENSE_EXCEEDED' THEN
            v_device_allowed := FALSE;
            v_block_reason := 'Sin licencias POS contratadas. Contrata mas terminales con tu distribuidor.';
        ELSIF NOT v_device_exists AND NOT v_terminal_exists AND v_active_units >= v_limit THEN
            v_device_allowed := FALSE;
            IF v_uses_terminal_slots THEN
                v_block_reason := 'Sin licencias POS disponibles para otra caja. Cada licencia corresponde a una caja distinta.';
            ELSE
                v_block_reason := 'Sin licencias POS contratadas. Contrata mas terminales con tu distribuidor.';
            END IF;
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        v_tenant.id,
        v_tenant.status,
        v_tenant.slug,
        v_limit,
        v_tenant.max_erp_users,
        v_active_units,
        v_device_allowed,
        v_block_reason;
END;
$$;

CREATE OR REPLACE FUNCTION landlord.register_tenant_server_endpoint(
    p_tenant_id UUID DEFAULT NULL,
    p_tenant_slug TEXT DEFAULT NULL,
    p_tenant_email TEXT DEFAULT NULL,
    p_device_id TEXT DEFAULT NULL,
    p_terminal_id TEXT DEFAULT NULL,
    p_terminal_name TEXT DEFAULT NULL,
    p_hostname TEXT DEFAULT NULL,
    p_protocol TEXT DEFAULT 'http',
    p_port INTEGER DEFAULT 3001,
    p_local_ip TEXT DEFAULT NULL,
    p_local_ips TEXT[] DEFAULT ARRAY[]::TEXT[],
    p_endpoint_url TEXT DEFAULT NULL,
    p_is_primary BOOLEAN DEFAULT TRUE,
    p_last_seen_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    p_status TEXT DEFAULT 'ONLINE',
    p_app_version TEXT DEFAULT NULL,
    p_app_version_code BIGINT DEFAULT NULL
)
RETURNS SETOF landlord.tenant_server_registry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
DECLARE
    v_tenant RECORD;
    v_protocol TEXT;
    v_port INTEGER;
    v_local_ip TEXT;
    v_local_ips TEXT[];
    v_endpoint_url TEXT;
    v_status TEXT;
    v_last_seen_at TIMESTAMPTZ;
    v_limit INTEGER;
    v_used_seats INTEGER;
    v_device_exists BOOLEAN := FALSE;
    v_terminal_exists BOOLEAN := FALSE;
    v_uses_terminal_slots BOOLEAN := FALSE;
    v_normalized_terminal_name TEXT;
BEGIN
    IF NULLIF(BTRIM(COALESCE(p_device_id, '')), '') IS NULL THEN
        RAISE EXCEPTION 'device_id is required';
    END IF;

    IF NULLIF(BTRIM(COALESCE(p_terminal_id, '')), '') IS NULL THEN
        RAISE EXCEPTION 'terminal_id is required';
    END IF;

    SELECT
        t.id,
        t.slug::TEXT AS slug,
        LOWER(t.email) AS email,
        GREATEST(COALESCE(t.max_pos_terminals, 1), 1) AS max_pos_terminals,
        landlord.tenant_uses_terminal_slot_licensing(t.id) AS uses_terminal_slots
    INTO v_tenant
    FROM landlord.tenants AS t
    WHERE
        (p_tenant_id IS NOT NULL AND t.id = p_tenant_id)
        OR (p_tenant_id IS NULL AND p_tenant_slug IS NOT NULL AND t.slug = p_tenant_slug)
        OR (
            p_tenant_id IS NULL
            AND p_tenant_slug IS NULL
            AND p_tenant_email IS NOT NULL
            AND LOWER(t.email) = LOWER(p_tenant_email)
        )
    ORDER BY
        CASE
            WHEN p_tenant_id IS NOT NULL AND t.id = p_tenant_id THEN 0
            WHEN p_tenant_slug IS NOT NULL AND t.slug = p_tenant_slug THEN 1
            ELSE 2
        END
    LIMIT 1;

    IF v_tenant.id IS NULL THEN
        RAISE EXCEPTION 'tenant not found';
    END IF;

    IF COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') <> 'service_role' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'authenticated user required';
        END IF;

        IF COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'tenant_id',
            auth.jwt() -> 'app_metadata' ->> 'tenant_id',
            ''
        ) <> v_tenant.id::TEXT
        AND LOWER(COALESCE(
            auth.jwt() ->> 'email',
            auth.jwt() -> 'user_metadata' ->> 'email',
            auth.jwt() -> 'app_metadata' ->> 'email',
            ''
        )) <> v_tenant.email THEN
            RAISE EXCEPTION 'caller not authorized for tenant server registry';
        END IF;
    END IF;

    v_limit := v_tenant.max_pos_terminals;
    v_uses_terminal_slots := v_tenant.uses_terminal_slots;
    v_normalized_terminal_name := landlord.normalize_terminal_label(p_terminal_name);

    IF v_uses_terminal_slots AND v_normalized_terminal_name IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM landlord.tenant_server_registry AS registry
            WHERE registry.tenant_id = v_tenant.id
              AND landlord.normalize_terminal_label(registry.terminal_name) = v_normalized_terminal_name
              AND BTRIM(registry.terminal_id) <> BTRIM(p_terminal_id)
              AND registry.status = 'ONLINE'
              AND COALESCE(registry.is_revoked, FALSE) = FALSE
        ) THEN
            RAISE EXCEPTION
                'TERMINAL_NAME_ALREADY_EXISTS: ya existe otra caja con el nombre "%". Cada licencia POS_ONLY debe tener un nombre de caja unico.',
                BTRIM(p_terminal_name)
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM landlord.tenant_server_registry AS registry
        WHERE registry.tenant_id = v_tenant.id
          AND registry.device_id = p_device_id
    ) INTO v_device_exists;

    IF v_uses_terminal_slots THEN
        SELECT EXISTS (
            SELECT 1
            FROM landlord.tenant_server_registry AS registry
            WHERE registry.tenant_id = v_tenant.id
              AND BTRIM(registry.terminal_id) = BTRIM(p_terminal_id)
              AND registry.status = 'ONLINE'
              AND COALESCE(registry.is_revoked, FALSE) = FALSE
        ) INTO v_terminal_exists;
    END IF;

    IF NOT v_device_exists AND NOT v_terminal_exists THEN
        PERFORM landlord.enforce_tenant_pos_license_limits(v_tenant.id);

        SELECT seats.used_seats
        INTO v_used_seats
        FROM landlord.count_tenant_pos_license_seats(v_tenant.id) AS seats;

        IF v_used_seats >= v_limit THEN
            IF v_uses_terminal_slots THEN
                RAISE EXCEPTION
                    'POS_LICENSE_LIMIT_EXCEEDED: sin licencias POS para otra caja (%/% terminales). Cada licencia corresponde a una caja distinta.',
                    v_used_seats,
                    v_limit
                    USING ERRCODE = 'P0001';
            ELSE
                RAISE EXCEPTION
                    'POS_LICENSE_LIMIT_EXCEEDED: sin licencias POS contratadas (%/% equipos). Contrata mas terminales.',
                    v_used_seats,
                    v_limit
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END IF;

    v_protocol := LOWER(COALESCE(NULLIF(BTRIM(p_protocol), ''), 'http'));
    v_port := COALESCE(p_port, 3001);
    v_status := UPPER(COALESCE(NULLIF(BTRIM(p_status), ''), 'ONLINE'));
    v_last_seen_at := COALESCE(p_last_seen_at, timezone('utc', now()));

    v_local_ips := ARRAY(
        SELECT DISTINCT ip
        FROM UNNEST(
            COALESCE(p_local_ips, ARRAY[]::TEXT[])
            || ARRAY[NULLIF(BTRIM(COALESCE(p_local_ip, '')), '')]
        ) AS ip
        WHERE ip IS NOT NULL
        ORDER BY ip
    );

    v_local_ip := COALESCE(NULLIF(BTRIM(p_local_ip), ''), v_local_ips[1]);

    IF v_local_ip IS NULL THEN
        RAISE EXCEPTION 'local_ip is required';
    END IF;

    v_endpoint_url := COALESCE(
        NULLIF(BTRIM(p_endpoint_url), ''),
        FORMAT('%s://%s:%s', v_protocol, v_local_ip, v_port)
    );

    IF COALESCE(p_is_primary, TRUE) THEN
        UPDATE landlord.tenant_server_registry AS registry
        SET
            is_primary = FALSE,
            updated_at = timezone('utc', now())
        WHERE registry.tenant_id = v_tenant.id
          AND registry.device_id <> p_device_id
          AND registry.is_primary = TRUE;
    END IF;

    RETURN QUERY
    INSERT INTO landlord.tenant_server_registry (
        tenant_id,
        tenant_slug,
        tenant_email,
        device_id,
        terminal_id,
        terminal_name,
        hostname,
        protocol,
        port,
        local_ip,
        local_ips,
        endpoint_url,
        app_version,
        app_version_code,
        is_primary,
        last_seen_at,
        status,
        updated_at
    )
    VALUES (
        v_tenant.id,
        v_tenant.slug,
        v_tenant.email,
        p_device_id,
        p_terminal_id,
        NULLIF(BTRIM(p_terminal_name), ''),
        NULLIF(BTRIM(p_hostname), ''),
        v_protocol,
        v_port,
        v_local_ip,
        v_local_ips,
        v_endpoint_url,
        NULLIF(BTRIM(p_app_version), ''),
        p_app_version_code,
        COALESCE(p_is_primary, TRUE),
        v_last_seen_at,
        v_status,
        timezone('utc', now())
    )
    ON CONFLICT (tenant_id, device_id)
    DO UPDATE SET
        tenant_slug = EXCLUDED.tenant_slug,
        tenant_email = EXCLUDED.tenant_email,
        terminal_id = EXCLUDED.terminal_id,
        terminal_name = EXCLUDED.terminal_name,
        hostname = EXCLUDED.hostname,
        protocol = EXCLUDED.protocol,
        port = EXCLUDED.port,
        local_ip = EXCLUDED.local_ip,
        local_ips = EXCLUDED.local_ips,
        endpoint_url = EXCLUDED.endpoint_url,
        app_version = EXCLUDED.app_version,
        app_version_code = EXCLUDED.app_version_code,
        is_primary = EXCLUDED.is_primary,
        last_seen_at = EXCLUDED.last_seen_at,
        status = EXCLUDED.status,
        updated_at = timezone('utc', now())
    RETURNING *;

    PERFORM landlord.enforce_tenant_pos_license_limits(v_tenant.id);
END;
$$;

REVOKE ALL ON FUNCTION landlord.normalize_terminal_label(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION landlord.tenant_uses_terminal_slot_licensing(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION landlord.count_tenant_pos_license_seats(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION landlord.normalize_terminal_label(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION landlord.tenant_uses_terminal_slot_licensing(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION landlord.count_tenant_pos_license_seats(UUID) TO service_role;

COMMIT;
