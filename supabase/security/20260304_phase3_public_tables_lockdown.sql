BEGIN;

-- Phase 3 closes the remaining Security Advisor errors for tables in `public`
-- that are exposed to PostgREST.
-- Apply this only after POS/ERP no longer require anonymous direct access.

DO $$
DECLARE
    tbl TEXT;
    policy_name TEXT;
    target_tables TEXT[] := ARRAY[
        'tenants',
        'terminals',
        'locales',
        'sync_inbox',
        'sync_outbox',
        'sync_dead_letter',
        'items',
        'erp_tenants',
        'erp_stores',
        'erp_terminals',
        'erp_sync_inbox',
        'erp_sync_outbox',
        'erp_sync_dead_letter',
        'stores'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables LOOP
        IF EXISTS (
            SELECT 1
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename = tbl
        ) THEN
            policy_name := format('Deny all to public on %s', tbl);

            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, tbl);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO PUBLIC USING (false) WITH CHECK (false)',
                policy_name,
                tbl
            );
        END IF;
    END LOOP;
END;
$$;

COMMIT;
