-- Item tombstones are useful for ordinary catalog deletions, but a tenant
-- cascade must not recreate a child row after its ERP tenant has disappeared.
-- Resolve the optional company through the same live tenant so company-level
-- cascades can still emit a tenant-scoped tombstone with a NULL company_id.
CREATE OR REPLACE FUNCTION public.erp_sync_capture_item_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF tg_op = 'DELETE' THEN
        INSERT INTO public.erp_sync_master_tombstones (
            tenant_id,
            company_id,
            collection,
            record_id,
            deleted_at
        )
        SELECT
            source_tenant.id,
            source_company.id,
            'items',
            old.id,
            now()
        FROM public.erp_tenants AS source_tenant
        LEFT JOIN public.erp_companies AS source_company
          ON source_company.id = old.company_id
         AND source_company.tenant_id = source_tenant.id
        WHERE source_tenant.id = old.tenant_id
        ON CONFLICT (tenant_id, collection, record_id)
        DO UPDATE SET
            company_id = excluded.company_id,
            deleted_at = excluded.deleted_at;

        RETURN old;
    END IF;

    DELETE FROM public.erp_sync_master_tombstones AS tombstone
    WHERE tombstone.tenant_id = new.tenant_id
      AND tombstone.collection = 'items'
      AND tombstone.record_id = new.id;

    RETURN new;
END;
$$;
