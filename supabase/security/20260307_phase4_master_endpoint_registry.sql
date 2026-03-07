BEGIN;

-- Phase 4 adds a master-endpoint registry for APK server/client pairing.
-- It is safe to apply before phase 2/3 because access remains service-role only.

CREATE TABLE IF NOT EXISTS landlord.tenant_server_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES landlord.tenants(id) ON DELETE CASCADE,
    tenant_slug TEXT NOT NULL,
    tenant_email TEXT NOT NULL,
    device_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    terminal_name TEXT,
    hostname TEXT,
    protocol TEXT NOT NULL DEFAULT 'http',
    port INTEGER NOT NULL DEFAULT 3001,
    local_ip TEXT NOT NULL,
    local_ips TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    endpoint_url TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'ONLINE',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT tenant_server_registry_protocol_check CHECK (protocol IN ('http', 'https')),
    CONSTRAINT tenant_server_registry_status_check CHECK (status IN ('ONLINE', 'OFFLINE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_server_registry_tenant_device
    ON landlord.tenant_server_registry(tenant_id, device_id);

CREATE INDEX IF NOT EXISTS idx_tenant_server_registry_lookup
    ON landlord.tenant_server_registry(tenant_id, is_primary DESC, last_seen_at DESC);

ALTER TABLE landlord.tenant_server_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all to public on tenant_server_registry" ON landlord.tenant_server_registry;
CREATE POLICY "Deny all to public on tenant_server_registry"
ON landlord.tenant_server_registry
FOR ALL
TO PUBLIC
USING (false)
WITH CHECK (false);

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
    p_status TEXT DEFAULT 'ONLINE'
)
RETURNS TABLE (
    tenant_id UUID,
    tenant_slug TEXT,
    tenant_email TEXT,
    device_id TEXT,
    terminal_id TEXT,
    terminal_name TEXT,
    hostname TEXT,
    protocol TEXT,
    port INTEGER,
    local_ip TEXT,
    local_ips TEXT[],
    endpoint_url TEXT,
    is_primary BOOLEAN,
    last_seen_at TIMESTAMPTZ,
    status TEXT
)
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
        LOWER(t.email) AS email
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
        is_primary = EXCLUDED.is_primary,
        last_seen_at = EXCLUDED.last_seen_at,
        status = EXCLUDED.status,
        updated_at = timezone('utc', now())
    RETURNING
        tenant_server_registry.tenant_id,
        tenant_server_registry.tenant_slug,
        tenant_server_registry.tenant_email,
        tenant_server_registry.device_id,
        tenant_server_registry.terminal_id,
        tenant_server_registry.terminal_name,
        tenant_server_registry.hostname,
        tenant_server_registry.protocol,
        tenant_server_registry.port,
        tenant_server_registry.local_ip,
        tenant_server_registry.local_ips,
        tenant_server_registry.endpoint_url,
        tenant_server_registry.is_primary,
        tenant_server_registry.last_seen_at,
        tenant_server_registry.status;
END;
$$;

CREATE OR REPLACE FUNCTION landlord.upsert_tenant_server_endpoint(
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
    p_status TEXT DEFAULT 'ONLINE'
)
RETURNS TABLE (
    tenant_id UUID,
    tenant_slug TEXT,
    tenant_email TEXT,
    device_id TEXT,
    terminal_id TEXT,
    terminal_name TEXT,
    hostname TEXT,
    protocol TEXT,
    port INTEGER,
    local_ip TEXT,
    local_ips TEXT[],
    endpoint_url TEXT,
    is_primary BOOLEAN,
    last_seen_at TIMESTAMPTZ,
    status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
    SELECT *
    FROM landlord.register_tenant_server_endpoint(
        p_tenant_id,
        p_tenant_slug,
        p_tenant_email,
        p_device_id,
        p_terminal_id,
        p_terminal_name,
        p_hostname,
        p_protocol,
        p_port,
        p_local_ip,
        p_local_ips,
        p_endpoint_url,
        p_is_primary,
        p_last_seen_at,
        p_status
    );
$$;

CREATE OR REPLACE FUNCTION landlord.resolve_tenant_server_endpoint(
    p_tenant_id UUID DEFAULT NULL,
    p_tenant_slug TEXT DEFAULT NULL,
    p_tenant_email TEXT DEFAULT NULL
)
RETURNS TABLE (
    tenant_id UUID,
    tenant_slug TEXT,
    tenant_email TEXT,
    device_id TEXT,
    terminal_id TEXT,
    terminal_name TEXT,
    hostname TEXT,
    protocol TEXT,
    port INTEGER,
    local_ip TEXT,
    local_ips TEXT[],
    endpoint_url TEXT,
    is_primary BOOLEAN,
    last_seen_at TIMESTAMPTZ,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT t.id
    INTO v_tenant_id
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

    IF v_tenant_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        r.tenant_id,
        r.tenant_slug,
        r.tenant_email,
        r.device_id,
        r.terminal_id,
        r.terminal_name,
        r.hostname,
        r.protocol,
        r.port,
        r.local_ip,
        r.local_ips,
        r.endpoint_url,
        r.is_primary,
        r.last_seen_at,
        r.status
    FROM landlord.tenant_server_registry AS r
    WHERE r.tenant_id = v_tenant_id
      AND COALESCE(r.status, 'ONLINE') = 'ONLINE'
    ORDER BY r.is_primary DESC, r.last_seen_at DESC
    LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION landlord.get_tenant_server_endpoint(
    p_tenant_id UUID DEFAULT NULL,
    p_tenant_slug TEXT DEFAULT NULL,
    p_tenant_email TEXT DEFAULT NULL
)
RETURNS TABLE (
    tenant_id UUID,
    tenant_slug TEXT,
    tenant_email TEXT,
    device_id TEXT,
    terminal_id TEXT,
    terminal_name TEXT,
    hostname TEXT,
    protocol TEXT,
    port INTEGER,
    local_ip TEXT,
    local_ips TEXT[],
    endpoint_url TEXT,
    is_primary BOOLEAN,
    last_seen_at TIMESTAMPTZ,
    status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
    SELECT *
    FROM landlord.resolve_tenant_server_endpoint(
        p_tenant_id,
        p_tenant_slug,
        p_tenant_email
    );
$$;

REVOKE ALL ON FUNCTION landlord.register_tenant_server_endpoint(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[], TEXT, BOOLEAN, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION landlord.upsert_tenant_server_endpoint(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[], TEXT, BOOLEAN, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION landlord.resolve_tenant_server_endpoint(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION landlord.get_tenant_server_endpoint(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION landlord.register_tenant_server_endpoint(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[], TEXT, BOOLEAN, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION landlord.upsert_tenant_server_endpoint(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[], TEXT, BOOLEAN, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION landlord.resolve_tenant_server_endpoint(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION landlord.get_tenant_server_endpoint(UUID, TEXT, TEXT) TO service_role;

COMMIT;
