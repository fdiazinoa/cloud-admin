BEGIN;

-- Phase 1 is safe to apply before touching POS or ERP clients.
-- It closes the landlord.subscriptions advisor finding and prepares
-- RPCs so external clients can stop querying landlord.tenants directly.

ALTER TABLE IF EXISTS landlord.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_tenant_status(p_tenant_id UUID)
RETURNS TABLE (
    id UUID,
    status landlord.tenant_status,
    slug TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
    SELECT t.id, t.status, t.slug::TEXT
    FROM landlord.tenants AS t
    WHERE t.id = p_tenant_id
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_tenant_license(
    p_tenant_id UUID DEFAULT NULL,
    p_slug TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    status landlord.tenant_status,
    slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, landlord
AS $$
BEGIN
    RETURN QUERY
    SELECT t.id, t.status, t.slug::TEXT
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
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_tenant_license(UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_tenant_status(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_license(UUID, TEXT, TEXT) TO anon, authenticated;

COMMIT;
