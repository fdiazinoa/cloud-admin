-- Preserve the existing licensing/registry implementation and put a small
-- canonical tenant resolver in front of it. Older POS_ERP installations can
-- carry the local ERP tenant UUID in p_tenant_id while still having the valid
-- Cloud Admin slug/email. The authorization check remains in the original
-- SECURITY DEFINER function and is evaluated against the resolved cloud tenant.

ALTER FUNCTION landlord.register_tenant_server_endpoint(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[],
    TEXT, BOOLEAN, TIMESTAMPTZ, TEXT, TEXT, BIGINT
)
RENAME TO register_tenant_server_endpoint_canonical;

CREATE FUNCTION landlord.register_tenant_server_endpoint(
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
    v_tenant_id UUID;
BEGIN
    SELECT tenant.id
    INTO v_tenant_id
    FROM landlord.tenants AS tenant
    WHERE
        (p_tenant_id IS NOT NULL AND tenant.id = p_tenant_id)
        OR (NULLIF(BTRIM(p_tenant_slug), '') IS NOT NULL AND tenant.slug = BTRIM(p_tenant_slug))
        OR (
            NULLIF(BTRIM(p_tenant_email), '') IS NOT NULL
            AND LOWER(tenant.email) = LOWER(BTRIM(p_tenant_email))
        )
    ORDER BY CASE
        WHEN p_tenant_id IS NOT NULL AND tenant.id = p_tenant_id THEN 0
        WHEN NULLIF(BTRIM(p_tenant_slug), '') IS NOT NULL AND tenant.slug = BTRIM(p_tenant_slug) THEN 1
        ELSE 2
    END
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY
    SELECT *
    FROM landlord.register_tenant_server_endpoint_canonical(
        v_tenant_id,
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
        p_status,
        p_app_version,
        p_app_version_code
    );
END;
$$;

REVOKE ALL ON FUNCTION landlord.register_tenant_server_endpoint_canonical(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[],
    TEXT, BOOLEAN, TIMESTAMPTZ, TEXT, TEXT, BIGINT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION landlord.register_tenant_server_endpoint_canonical(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[],
    TEXT, BOOLEAN, TIMESTAMPTZ, TEXT, TEXT, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION landlord.register_tenant_server_endpoint(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[],
    TEXT, BOOLEAN, TIMESTAMPTZ, TEXT, TEXT, BIGINT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION landlord.register_tenant_server_endpoint(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[],
    TEXT, BOOLEAN, TIMESTAMPTZ, TEXT, TEXT, BIGINT
) TO authenticated, service_role;
