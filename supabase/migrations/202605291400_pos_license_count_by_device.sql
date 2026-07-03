BEGIN;

-- Límite de terminales contratadas = equipos POS (device_id), no terminal_id compartido entre cajas.

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
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id is required';
    END IF;

    SELECT GREATEST(COALESCE(t.max_pos_terminals, 1), 1)
    INTO v_limit
    FROM landlord.tenants AS t
    WHERE t.id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'tenant not found';
    END IF;

    WITH device_rank AS (
        SELECT
            device_id,
            MIN(created_at) AS first_seen
        FROM landlord.tenant_server_registry
        WHERE tenant_id = p_tenant_id
          AND status = 'ONLINE'
          AND COALESCE(is_revoked, FALSE) = FALSE
        GROUP BY device_id
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

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'max_pos_terminals', v_limit,
        'license_unit', 'device_id',
        'allowed_registry_rows', v_allowed,
        'blocked_registry_rows', v_blocked
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
    v_active_devices INTEGER;
    v_device_allowed BOOLEAN := TRUE;
    v_block_reason TEXT := NULL;
    v_device_auth_status TEXT;
BEGIN
    v_device_id := NULLIF(BTRIM(COALESCE(p_device_id, '')), '');

    SELECT
        t.id,
        t.status,
        t.slug::TEXT AS slug,
        GREATEST(COALESCE(t.max_pos_terminals, 1), 1) AS max_pos_terminals,
        COALESCE(t.max_erp_users, 1) AS max_erp_users
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

    SELECT COUNT(DISTINCT registry.device_id)
    INTO v_active_devices
    FROM landlord.tenant_server_registry AS registry
    WHERE registry.tenant_id = v_tenant.id
      AND registry.status = 'ONLINE'
      AND COALESCE(registry.is_revoked, FALSE) = FALSE
      AND COALESCE(registry.auth_status, 'AUTHORIZED') <> 'LICENSE_EXCEEDED';

    IF v_device_id IS NOT NULL THEN
        SELECT registry.auth_status
        INTO v_device_auth_status
        FROM landlord.tenant_server_registry AS registry
        WHERE registry.tenant_id = v_tenant.id
          AND registry.device_id = v_device_id
        ORDER BY registry.last_seen_at DESC NULLS LAST
        LIMIT 1;

        IF COALESCE(v_device_auth_status, '') = 'LICENSE_EXCEEDED' THEN
            v_device_allowed := FALSE;
            v_block_reason := 'Sin licencias POS contratadas. Contrata mas terminales con tu distribuidor.';
        ELSIF v_device_auth_status IS NULL THEN
            v_device_allowed := v_active_devices < v_limit;
            IF NOT v_device_allowed THEN
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
        v_active_devices,
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
    v_active_devices INTEGER;
    v_device_exists BOOLEAN;
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
        GREATEST(COALESCE(t.max_pos_terminals, 1), 1) AS max_pos_terminals
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

    SELECT EXISTS (
        SELECT 1
        FROM landlord.tenant_server_registry AS registry
        WHERE registry.tenant_id = v_tenant.id
          AND registry.device_id = p_device_id
    ) INTO v_device_exists;

    IF NOT v_device_exists THEN
        SELECT COUNT(DISTINCT registry.device_id)
        INTO v_active_devices
        FROM landlord.tenant_server_registry AS registry
        WHERE registry.tenant_id = v_tenant.id
          AND registry.status = 'ONLINE'
          AND COALESCE(registry.is_revoked, FALSE) = FALSE
          AND COALESCE(registry.auth_status, 'AUTHORIZED') <> 'LICENSE_EXCEEDED';

        IF v_active_devices >= v_limit THEN
            RAISE EXCEPTION
                'POS_LICENSE_LIMIT_EXCEEDED: sin licencias POS contratadas (%/% equipos). Contrata mas terminales.',
                v_active_devices,
                v_limit
                USING ERRCODE = 'P0001';
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

COMMIT;
