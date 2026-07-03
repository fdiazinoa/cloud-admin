DO $$
BEGIN
    IF to_regclass('public.erp_tenants') IS NULL THEN
        RAISE NOTICE 'Skipping sync_mode migration because public.erp_tenants does not exist.';
        RETURN;
    END IF;

    ALTER TABLE public.erp_tenants
        ADD COLUMN IF NOT EXISTS sync_mode TEXT DEFAULT 'POS_LOCAL';

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'erp_tenants_sync_mode_check'
          AND conrelid = 'public.erp_tenants'::regclass
    ) THEN
        ALTER TABLE public.erp_tenants
            ADD CONSTRAINT erp_tenants_sync_mode_check
            CHECK (
                sync_mode IS NULL
                OR sync_mode IN ('POS_LOCAL', 'POS_ERP', 'POS_SLAVE')
            );
    END IF;
END $$;
