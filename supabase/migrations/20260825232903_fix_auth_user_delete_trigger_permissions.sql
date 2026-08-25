BEGIN;

-- Deleting an Auth user cascades into public.erp_pos_users. Its statement-level
-- DELETE trigger resolves the affected tenant through ERP tables, but GoTrue
-- executes that cascade as supabase_auth_admin, which cannot read those tables.
-- Run only this trigger function with its postgres owner's privileges and keep
-- the existing empty search_path so every referenced object remains qualified.
ALTER FUNCTION public.erp_sync_touch_domain_version_delete_stmt()
    SECURITY DEFINER;

ALTER FUNCTION public.erp_sync_touch_domain_version_delete_stmt()
    SET search_path = '';

COMMIT;
