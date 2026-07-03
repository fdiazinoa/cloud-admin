SELECT
    id,
    name,
    sync_mode,
    config,
    created_at
FROM public.erp_tenants
WHERE sync_mode IS NULL;
