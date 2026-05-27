BEGIN;

ALTER TABLE landlord.tenant_server_registry
    ADD COLUMN IF NOT EXISTS authorized_device_id TEXT,
    ADD COLUMN IF NOT EXISTS last_rejected_device_id TEXT,
    ADD COLUMN IF NOT EXISTS auth_status TEXT NOT NULL DEFAULT 'AUTHORIZED',
    ADD COLUMN IF NOT EXISTS last_auth_error TEXT,
    ADD COLUMN IF NOT EXISTS last_auth_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS device_token_status TEXT,
    ADD COLUMN IF NOT EXISTS token_preview TEXT,
    ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE landlord.tenant_server_registry
    DROP CONSTRAINT IF EXISTS tenant_server_registry_auth_status_check;

ALTER TABLE landlord.tenant_server_registry
    ADD CONSTRAINT tenant_server_registry_auth_status_check CHECK (
        auth_status IN (
            'AUTHORIZED',
            'DEVICE_MISMATCH',
            'TAKEOVER_PENDING',
            'TAKEOVER_COMPLETED',
            'OLD_DEVICE_REVOKED',
            'TOKEN_ROTATION_REQUIRED',
            'ERP_AUTH_ERROR'
        )
    );

CREATE INDEX IF NOT EXISTS idx_tenant_server_registry_auth_lookup
    ON landlord.tenant_server_registry(tenant_id, terminal_id, auth_status, last_auth_attempt_at DESC);

CREATE TABLE IF NOT EXISTS landlord.terminal_device_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES landlord.tenants(id) ON DELETE CASCADE,
    terminal_id TEXT NOT NULL,
    terminal_name TEXT,
    old_device_id TEXT,
    new_device_id TEXT,
    action TEXT NOT NULL,
    performed_by TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    reason TEXT,
    result TEXT,
    erp_response_status INTEGER,
    erp_error_code TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT terminal_device_audit_action_check CHECK (
        action IN ('TAKEOVER', 'ROTATE_TOKEN', 'REVOKE_DEVICE')
    )
);

CREATE INDEX IF NOT EXISTS idx_terminal_device_audit_tenant_performed
    ON landlord.terminal_device_audit(tenant_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_terminal_device_audit_terminal
    ON landlord.terminal_device_audit(tenant_id, terminal_id, performed_at DESC);

ALTER TABLE landlord.terminal_device_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all to public on terminal_device_audit" ON landlord.terminal_device_audit;
CREATE POLICY "Deny all to public on terminal_device_audit"
ON landlord.terminal_device_audit
FOR ALL
TO PUBLIC
USING (false)
WITH CHECK (false);

COMMIT;
