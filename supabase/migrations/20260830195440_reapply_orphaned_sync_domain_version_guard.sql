-- A later ERP migration added the pos_users domain and snapshot invalidation,
-- but restored an unchecked INSERT into erp_sync_domain_versions. During an
-- ERP tenant cascade, child DELETE triggers can therefore try to recreate a
-- version after the parent tenant is gone. Keep the newer behavior while
-- making the tenant row the source of the insert.
CREATE OR REPLACE FUNCTION public.erp_sync_touch_domain_version(
    p_tenant_id UUID,
    p_domain TEXT,
    p_terminal_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_touched_rows INTEGER;
BEGIN
    IF p_tenant_id IS NULL OR p_domain NOT IN (
        'catalog',
        'inventory',
        'prices',
        'fiscal',
        'terminal_config',
        'loyalty',
        'promotions',
        'purchase_orders',
        'transfers',
        'pos_users'
    ) THEN
        RETURN;
    END IF;

    INSERT INTO public.erp_sync_domain_versions (
        tenant_id,
        terminal_id,
        domain,
        version,
        current_hash,
        changed_at,
        updated_at
    )
    SELECT
        source_tenant.id,
        p_terminal_id,
        p_domain,
        1,
        NULL,
        now(),
        now()
    FROM public.erp_tenants AS source_tenant
    WHERE source_tenant.id = p_tenant_id
    ON CONFLICT (
        tenant_id,
        COALESCE(terminal_id, '00000000-0000-0000-0000-000000000000'::UUID),
        domain
    )
    DO UPDATE SET
        version = public.erp_sync_domain_versions.version + 1,
        current_hash = NULL,
        changed_at = now(),
        updated_at = now();

    GET DIAGNOSTICS v_touched_rows = ROW_COUNT;
    IF v_touched_rows = 0 THEN
        RETURN;
    END IF;

    IF to_regclass('public.erp_sync_snapshots') IS NOT NULL THEN
        EXECUTE $sql$
            UPDATE public.erp_sync_snapshots
            SET status = 'STALE', updated_at = now(), expires_at = now()
            WHERE tenant_id = $1
              AND ($2 IS NULL OR terminal_id = $2)
              AND snapshot_kind IN ('terminal_config', 'manifest')
        $sql$ USING p_tenant_id, p_terminal_id;
    END IF;
END;
$$;
