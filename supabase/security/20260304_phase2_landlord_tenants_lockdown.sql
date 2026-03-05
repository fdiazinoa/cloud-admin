BEGIN;

-- Apply this only after POS stops reading landlord.tenants directly and
-- has moved to public.resolve_tenant_license() / public.get_tenant_status().

ALTER TABLE IF EXISTS landlord.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read of status field" ON landlord.tenants;
DROP POLICY IF EXISTS "Allow status read for anyone with ID" ON landlord.tenants;
DROP POLICY IF EXISTS "Deny all to public on tenants" ON landlord.tenants;

CREATE POLICY "Deny all to public on tenants"
ON landlord.tenants
FOR ALL
TO PUBLIC
USING (false)
WITH CHECK (false);

COMMIT;
