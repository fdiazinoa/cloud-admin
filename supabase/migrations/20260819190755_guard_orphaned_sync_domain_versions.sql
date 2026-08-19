-- Tenant deletion cascades through ERP tables that publish sync-domain
-- invalidations. Guard both the trigger and the central writer so a child
-- DELETE cannot recreate a version after its ERP tenant has been removed.
CREATE OR REPLACE FUNCTION public.erp_sync_touch_domain_version(
    p_tenant_id UUID,
    p_domain TEXT,
    p_terminal_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
        'transfers'
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
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_sync_touch_domain_version_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    payload JSONB := COALESCE(to_jsonb(new), to_jsonb(old), '{}'::JSONB);
    v_tenant_id UUID;
    v_terminal_id UUID;
    v_store_id UUID;
    v_company_id UUID;
    v_old_metadata JSONB;
    v_new_metadata JSONB;
    v_old_terminal_stable JSONB;
    v_new_terminal_stable JSONB;
BEGIN
    IF tg_table_name = 'erp_tenants' AND tg_op = 'DELETE' THEN
        RETURN old;
    END IF;

    IF tg_op = 'UPDATE'
       AND (to_jsonb(new) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(old) - 'updated_at') THEN
        RETURN new;
    END IF;

    IF tg_table_name = 'erp_terminals' AND tg_op = 'UPDATE' THEN
        v_new_terminal_stable := (to_jsonb(new) - 'last_seen' - 'config' - 'updated_at')
            || jsonb_build_object(
                'config', COALESCE(to_jsonb(new)->'config', '{}'::JSONB) - 'runtime'
            );
        v_old_terminal_stable := (to_jsonb(old) - 'last_seen' - 'config' - 'updated_at')
            || jsonb_build_object(
                'config', COALESCE(to_jsonb(old)->'config', '{}'::JSONB) - 'runtime'
            );

        IF v_new_terminal_stable IS NOT DISTINCT FROM v_old_terminal_stable THEN
            RETURN new;
        END IF;
    END IF;

    IF tg_table_name = 'erp_business_partners' AND tg_op = 'UPDATE' THEN
        v_old_metadata := COALESCE(old.metadata, '{}'::JSONB)
            - 'loyaltyPoints' - 'loyaltyBalance' - 'loyaltyCards' - 'loyaltyLastSyncedAt';
        v_new_metadata := COALESCE(new.metadata, '{}'::JSONB)
            - 'loyaltyPoints' - 'loyaltyBalance' - 'loyaltyCards' - 'loyaltyLastSyncedAt';

        IF (to_jsonb(new) - 'metadata' - 'updated_at')
                IS NOT DISTINCT FROM (to_jsonb(old) - 'metadata' - 'updated_at')
           AND v_new_metadata IS NOT DISTINCT FROM v_old_metadata THEN
            RETURN new;
        END IF;
    END IF;

    v_tenant_id := NULLIF(payload->>'tenant_id', '')::UUID;
    v_terminal_id := NULLIF(payload->>'terminal_id', '')::UUID;
    IF tg_table_name = 'erp_terminals' THEN
        v_terminal_id := NULLIF(payload->>'id', '')::UUID;
    END IF;
    v_store_id := COALESCE(
        NULLIF(payload->>'store_id', '')::UUID,
        NULLIF(payload->>'mall_id', '')::UUID
    );
    v_company_id := NULLIF(payload->>'company_id', '')::UUID;

    IF v_tenant_id IS NULL AND v_store_id IS NOT NULL THEN
        SELECT tenant_id
        INTO v_tenant_id
        FROM public.erp_stores
        WHERE id = v_store_id;
    END IF;
    IF v_tenant_id IS NULL AND v_company_id IS NOT NULL THEN
        SELECT tenant_id
        INTO v_tenant_id
        FROM public.erp_companies
        WHERE id = v_company_id;
    END IF;
    IF v_tenant_id IS NULL AND tg_table_name = 'erp_tenants' THEN
        v_tenant_id := NULLIF(payload->>'id', '')::UUID;
    END IF;

    IF tg_op = 'DELETE'
       AND v_tenant_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM public.erp_tenants
           WHERE id = v_tenant_id
       ) THEN
        RETURN old;
    END IF;

    PERFORM public.erp_sync_touch_domain_version(v_tenant_id, tg_argv[0], NULL);
    RETURN COALESCE(new, old);
END;
$$;
