-- A cascading tenant delete removes ERP children after the parent row is gone.
-- Those child DELETE triggers must not recreate an orphaned domain version.
CREATE OR REPLACE FUNCTION public.erp_sync_touch_domain_version_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    payload jsonb := coalesce(to_jsonb(new), to_jsonb(old), '{}'::jsonb);
    v_tenant_id uuid;
    v_terminal_id uuid;
    v_store_id uuid;
    v_company_id uuid;
    v_old_metadata jsonb;
    v_new_metadata jsonb;
BEGIN
    IF tg_table_name = 'erp_business_partners' AND tg_op = 'UPDATE' THEN
        v_old_metadata := coalesce(old.metadata, '{}'::jsonb)
            - 'loyaltyPoints' - 'loyaltyBalance' - 'loyaltyCards' - 'loyaltyLastSyncedAt';
        v_new_metadata := coalesce(new.metadata, '{}'::jsonb)
            - 'loyaltyPoints' - 'loyaltyBalance' - 'loyaltyCards' - 'loyaltyLastSyncedAt';

        IF (to_jsonb(new) - 'metadata' - 'updated_at')
                IS NOT DISTINCT FROM (to_jsonb(old) - 'metadata' - 'updated_at')
           AND v_new_metadata IS NOT DISTINCT FROM v_old_metadata THEN
            RETURN new;
        END IF;
    END IF;

    v_tenant_id := nullif(payload->>'tenant_id', '')::uuid;
    v_terminal_id := nullif(payload->>'terminal_id', '')::uuid;
    IF tg_table_name = 'erp_terminals' THEN
        v_terminal_id := nullif(payload->>'id', '')::uuid;
    END IF;
    v_store_id := coalesce(nullif(payload->>'store_id', '')::uuid, nullif(payload->>'mall_id', '')::uuid);
    v_company_id := nullif(payload->>'company_id', '')::uuid;

    IF v_tenant_id IS NULL AND v_store_id IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id FROM public.erp_stores WHERE id = v_store_id;
    END IF;
    IF v_tenant_id IS NULL AND v_company_id IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id FROM public.erp_companies WHERE id = v_company_id;
    END IF;
    IF v_tenant_id IS NULL AND tg_table_name = 'erp_tenants' THEN
        v_tenant_id := nullif(payload->>'id', '')::uuid;
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

    PERFORM public.erp_sync_touch_domain_version(v_tenant_id, tg_argv[0], null);
    RETURN coalesce(new, old);
END;
$$;
